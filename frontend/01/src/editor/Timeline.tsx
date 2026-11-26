import { useEffect, useRef, useState } from "react";
import {
  MAX_US,
  MIN_US,
  moveClip,
  removeClip,
  splitClip,
  totalUs,
} from "./edit";

import type { Clip, EditState, LocalSource } from "./types";
import { displaySeconds } from "./display";

// 1秒を96pxとして表示し、時間目盛りとクリップ幅を一致させる
const PX_PER_SECOND = 96;
const FRAME_COUNT = 7;

type Apply = (fn: (state: EditState) => EditState) => void;

type TimelineProps = {
  edit: EditState;
  selected: string | null;
  positionUs: number;
  blocked: boolean;
  apply: Apply;
  onSelect: (clipId: string, positionUs: number) => void;
  onSeek: (positionUs: number) => void;
};

// シーク操作が完了するか失敗するまで待ち、一定時間で打ち切る
function waitForVideo(
  video: HTMLVideoElement,
  eventName: "loadeddata" | "seeked",
  signal: AbortSignal,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const clear = () => {
      window.clearTimeout(timer);
      video.removeEventListener(eventName, ready);
      video.removeEventListener("error", failed);
      signal.removeEventListener("abort", aborted);
    };
    const ready = () => {
      clear();
      resolve();
    };
    const failed = () => {
      clear();
      reject(new Error("サムネイルを取得できません"));
    };
    const aborted = () => {
      clear();
      reject(new DOMException("中断", "AbortError"));
    };
    const timer = window.setTimeout(failed, 8000);
    video.addEventListener(eventName, ready, { once: true });
    video.addEventListener("error", failed, { once: true });
    signal.addEventListener("abort", aborted, { once: true });
    if (signal.aborted) aborted();
  });
}

// ファイルの映像をCanvasへ描画し、9:16に近い切り抜きサムネイルを生成する
function captureFrame(video: HTMLVideoElement, clip: Clip): string {
  const canvas = document.createElement("canvas");
  canvas.width = 72;
  canvas.height = 90;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("画像の取得に失敗しました");
  const width = video.videoWidth;
  const height = video.videoHeight;
  if (!width || !height) throw new Error("動画のサイズを確認できません");
  const scale = Math.max(canvas.width / width, canvas.height / height);
  const sourceWidth = Math.min(width, canvas.width / scale);
  const sourceHeight = Math.min(height, canvas.height / scale);
  const left = (width - sourceWidth) * (clip.cropX / 10000);
  const top = (height - sourceHeight) * (clip.cropY / 10000);
  context.drawImage(video, left, top, sourceWidth, sourceHeight, 0, 0, 72, 90);
  return canvas.toDataURL("image/jpeg", 0.64);
}

// クリップから複数のフレームを端末内で抽出してフィルム状に表示する
function ClipFrames({ clip, source }: { clip: Clip; source: LocalSource }) {
  const [frames, setFrames] = useState<string[]>([]);
  useEffect(() => {
    const controller = new AbortController();
    const video = document.createElement("video");
    video.muted = true;
    video.preload = "auto";
    video.playsInline = true;
    const create = async () => {
      try {
        const loaded = waitForVideo(video, "loadeddata", controller.signal);
        video.src = source.url;
        video.load();
        await loaded;
        const nextFrames: string[] = [];
        const duration = (clip.endUs - clip.startUs) / 1_000_000;
        const count = Math.max(
          1,
          Math.min(FRAME_COUNT, Math.ceil(duration / 0.8)),
        );
        const origin = Math.max(0, source.info.videoOriginUs) / 1_000_000;
        for (let i = 0; i < count; i++) {
          controller.signal.throwIfAborted();
          const offset = ((i + 0.5) / count) * duration;
          const target = Math.max(
            0,
            Math.min(
              video.duration - 0.04,
              origin + clip.startUs / 1_000_000 + offset,
            ),
          );
          if (Math.abs(video.currentTime - target) > 0.02) {
            const seeked = waitForVideo(video, "seeked", controller.signal);
            video.currentTime = target;
            await seeked;
          }
          nextFrames.push(captureFrame(video, clip));
        }
        if (!controller.signal.aborted) setFrames(nextFrames);
      } catch {
        // 動画のプレビューが可能でもサムネイル取得が失敗する環境では代替表示を維持する
      } finally {
        video.removeAttribute("src");
        video.load();
      }
    };
    void create();
    return () => controller.abort();
  }, [clip, source.url, source.info.videoOriginUs]);
  if (!frames.length)
    return (
      <div
        className="grid h-[67px] place-items-center bg-[repeating-linear-gradient(90deg,#303030_0px,#303030_47px,#242424_47px,#242424_50px)]"
        aria-hidden="true"
      >
        ▶
      </div>
    );
  return (
    <div
      className="flex h-[67px] w-full items-stretch overflow-hidden"
      aria-hidden="true"
    >
      {frames.map((frame, index) => (
        <img
          className="pointer-events-none h-[67px] min-w-0 flex-[1_1_0] object-cover"
          src={frame}
          key={index}
          alt=""
          draggable={false}
        />
      ))}
    </div>
  );
}

// 再生位置からクリップID・元動画内の分割時刻を求める
function clipAt(
  clips: readonly Clip[],
  positionUs: number,
): { clip: Clip; atUs: number } | null {
  let passed = 0;
  for (const clip of clips) {
    const duration = clip.endUs - clip.startUs;
    if (positionUs < passed + duration) {
      return { clip, atUs: clip.startUs + Math.max(0, positionUs - passed) };
    }
    passed += duration;
  }
  return null;
}

// Instagramリール風のフィルム型タイムラインとクリップ編集ボタンを表示する
export function Timeline({
  edit,
  selected,
  positionUs,
  blocked,
  apply,
  onSelect,
  onSeek,
}: TimelineProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const total = totalUs(edit.clips);
  const safePosition = Math.max(0, Math.min(total, positionUs));
  const canvasWidth = Math.max(
    450,
    Math.ceil((total / 1_000_000) * PX_PER_SECOND),
  );
  const tickCount = Math.ceil(canvasWidth / PX_PER_SECOND);
  const currentIndex = edit.clips.findIndex((clip) => clip.id === selected);
  const currentClip = currentIndex >= 0 ? edit.clips[currentIndex] : undefined;
  const atCursor = clipAt(edit.clips, safePosition);
  const canSplit =
    !blocked &&
    !!atCursor &&
    atCursor.atUs > atCursor.clip.startUs &&
    atCursor.atUs < atCursor.clip.endUs &&
    edit.clips.length < 3;

  // 再生位置が見えなくなったらタイムラインを水平にスクロールする
  useEffect(() => {
    const element = scrollRef.current;
    if (!element) return;
    const cursorX = (safePosition / 1_000_000) * PX_PER_SECOND;
    const margin = 36;
    if (cursorX < element.scrollLeft + margin) {
      element.scrollLeft = Math.max(0, cursorX - margin);
    } else if (cursorX > element.scrollLeft + element.clientWidth - margin) {
      element.scrollLeft = cursorX - element.clientWidth + margin;
    }
  }, [safePosition]);

  // 入力時刻をクリップ全体の範囲内に丸めてシークする
  const seekOnRuler = (value: number) =>
    onSeek(Math.max(0, Math.min(total, Math.round(value))));

  return (
    <section
      className="order-2 min-w-0 overflow-hidden rounded-xl border border-[#303030] bg-[#141414] md:order-3 md:col-span-2 md:rounded-2xl xl:order-4 xl:col-span-3"
      aria-label="編集タイムライン"
    >
      <div className="flex items-center justify-between gap-3 px-3 pt-[11px] pb-[7px] md:px-4 md:pt-[14px] md:pb-[10px]">
        <div>
          <span className="text-[10px] font-extrabold tracking-[.13em] text-[#929292] leading-[1.5]">
            TIMELINE
          </span>
          <h3 className="mt-[3px]! mb-0! text-sm! leading-[1.3] font-bold min-[360px]:text-base!">
            クリップ
          </h3>
        </div>
        <span className="shrink-0 whitespace-nowrap text-[11px] tabular-nums text-[#a9a9a9] min-[360px]:text-xs">
          <b className="font-bold text-white">{displaySeconds(safePosition)}</b>{" "}
          / {displaySeconds(total)} 秒
        </span>
      </div>

      {/* 時間目盛りとサムネイルを横スクロールで編集する */}
      <div
        className="max-w-full overflow-x-auto overscroll-x-contain px-3 pt-[6px] pb-4 [scrollbar-color:#434343_transparent] [scrollbar-width:thin] [touch-action:pan-x_pan-y] md:px-[17px]"
        ref={scrollRef}
      >
        <div className="relative min-h-[159px]" style={{ width: canvasWidth }}>
          <div
            className="relative h-[37px] border-b border-[#383838] bg-[repeating-linear-gradient(to_right,transparent_0px,transparent_47px,#494949_47px,#494949_48px)]"
            aria-hidden="true"
          >
            {Array.from({ length: tickCount + 1 }, (_, index) => (
              <div
                className="absolute top-0 h-[13px] w-px bg-[#818181]"
                key={index}
                style={{ left: index * PX_PER_SECOND }}
              >
                <span className="absolute top-[18px] left-1 whitespace-nowrap text-[10px] tabular-nums text-[#a6a6a6]">
                  {index % 3 === 0
                    ? `00:${String(index).padStart(2, "0")}`
                    : ""}
                </span>
              </div>
            ))}
          </div>
          {/* 透明なRange入力でマウス・タッチ・キーボードによる再生位置変更を受け取る */}
          <input
            type="range"
            className="absolute top-0 left-0 z-[4] m-0! h-[36px] cursor-crosshair opacity-0 focus-visible:opacity-15 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0095f6]"
            aria-label="タイムラインの再生位置"
            aria-valuetext={`${displaySeconds(safePosition)}秒`}
            style={{ width: Math.max(1, (total / 1_000_000) * PX_PER_SECOND) }}
            min="0"
            max={Math.max(total, 1)}
            step="10000"
            value={safePosition}
            disabled={blocked || total === 0}
            onChange={(event) => seekOnRuler(event.currentTarget.valueAsNumber)}
          />

          <div className="relative mt-[14px] flex h-[93px] items-stretch gap-px">
            {edit.clips.length > 0 ? (
              edit.clips.map((clip, index) => {
                const source = edit.sources.find(
                  (item) => item.localId === clip.sourceId,
                );
                if (!source) return null;
                const startUs = totalUs(edit.clips.slice(0, index));
                const durationUs = clip.endUs - clip.startUs;
                return (
                  <button
                    key={clip.id}
                    type="button"
                    className={`relative isolate min-w-0 shrink-0 overflow-hidden rounded-[4px]! border-2! border-[#404040]! bg-[#262626]! p-0! text-left! text-white! shadow-none! hover:enabled:border-[#999]! hover:enabled:bg-[#292929]! focus-visible:outline-2 focus-visible:outline-offset-[3px] focus-visible:outline-[#0095f6] disabled:opacity-[.38]! ${selected === clip.id ? "z-[2] border-[#f7d455]! bg-[#222]! text-white! shadow-[inset_0_0_0_1px_#f7d455]!" : ""}`}
                    style={{ width: (durationUs / 1_000_000) * PX_PER_SECOND }}
                    aria-label={`場面${index + 1}：${source.file.name}、${displaySeconds(durationUs)}秒`}
                    aria-pressed={selected === clip.id}
                    disabled={blocked}
                    onClick={() => onSelect(clip.id, startUs)}
                  >
                    {/* 選択中のクリップは黄色い縁とトリムハンドルを表示する */}
                    {selected === clip.id && (
                      <>
                        <span
                          className="pointer-events-none absolute top-0 z-[3] h-full w-2 bg-[#f7d455] after:absolute after:top-[32%] after:left-[3px] after:h-[28%] after:w-[2px] after:rounded-[5px] after:bg-[#403216] after:content-[''] left-0 rounded-l-sm"
                          aria-hidden="true"
                        />
                        <span
                          className="pointer-events-none absolute top-0 z-[3] h-full w-2 bg-[#f7d455] after:absolute after:top-[32%] after:left-[3px] after:h-[28%] after:w-[2px] after:rounded-[5px] after:bg-[#403216] after:content-[''] right-0 rounded-r-sm"
                          aria-hidden="true"
                        />
                      </>
                    )}
                    <ClipFrames
                      key={`${clip.id}:${clip.startUs}:${clip.endUs}:${clip.cropX}:${clip.cropY}`}
                      clip={clip}
                      source={source}
                    />
                    <span className="flex h-[22px] items-center justify-between gap-[6px] whitespace-nowrap bg-[#222] px-[6px] text-[10px] text-[#eaeaea]">
                      <span className="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap">
                        {source.file.name}
                      </span>
                      <b className="text-[10px] font-bold">
                        {displaySeconds(durationUs)}s
                      </b>
                    </span>
                  </button>
                );
              })
            ) : (
              <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed border-[#454545] bg-[#1d1d1d] p-3 text-xs text-[#aaa]">
                動画を追加すると、ここに場面が並びます。
              </div>
            )}
          </div>
          <div
            className="pointer-events-none absolute top-[-4px] z-[5] h-[160px] w-[2px] bg-white shadow-[0_0_4px_#000a]"
            style={{ left: (safePosition / 1_000_000) * PX_PER_SECOND }}
            aria-hidden="true"
          >
            <span className="absolute top-0 left-[-5px] h-[19px] w-3 rounded-[5px_5px_2px_2px] bg-white" />
          </div>
        </div>
      </div>

      {/* 使用できる編集操作だけを下部ツールバーに並べる */}
      <div
        className="flex max-w-full items-center gap-[6px] overflow-x-auto border-t border-[#303030] px-[9px] pt-2 pb-[5px] [scrollbar-color:#444_transparent] [scrollbar-width:thin] md:px-[14px] md:pt-[11px] md:pb-[7px]"
        role="toolbar"
        aria-label="動画の編集操作"
      >
        <button
          className="flex min-h-[56px] min-w-[63px] shrink-0 flex-col items-center justify-center gap-[3px] whitespace-nowrap rounded-[9px]! border-0! bg-transparent! px-[10px]! py-[6px]! text-[11px]! text-white! hover:enabled:bg-[#303030]! focus-visible:outline-2 focus-visible:outline-offset-[3px] focus-visible:outline-[#0095f6] disabled:opacity-[.38]!"
          type="button"
          disabled={!canSplit}
          onClick={() => {
            if (!atCursor) return;
            apply((state) =>
              splitClip(
                state,
                atCursor.clip.id,
                atCursor.atUs,
                crypto.randomUUID(),
              ),
            );
          }}
        >
          <span className="text-[21px] leading-[1.1]" aria-hidden="true">
            ✂
          </span>
          <span>分割</span>
        </button>
        <button
          className="flex min-h-[56px] min-w-[63px] shrink-0 flex-col items-center justify-center gap-[3px] whitespace-nowrap rounded-[9px]! border-0! bg-transparent! px-[10px]! py-[6px]! text-[11px]! text-white! hover:enabled:bg-[#303030]! focus-visible:outline-2 focus-visible:outline-offset-[3px] focus-visible:outline-[#0095f6] disabled:opacity-[.38]!"
          type="button"
          disabled={blocked || !currentClip}
          onClick={() => {
            if (currentClip)
              apply((state) => removeClip(state, currentClip.id));
          }}
        >
          <span className="text-[21px] leading-[1.1]" aria-hidden="true">
            ▤
          </span>
          <span>削除</span>
        </button>
        <span
          className="mx-[5px] h-[30px] w-px shrink-0 bg-[#444]"
          aria-hidden="true"
        />
        <button
          className="flex min-h-[56px] min-w-[63px] shrink-0 flex-col items-center justify-center gap-[3px] whitespace-nowrap rounded-[9px]! border-0! bg-transparent! px-[10px]! py-[6px]! text-[11px]! text-white! hover:enabled:bg-[#303030]! focus-visible:outline-2 focus-visible:outline-offset-[3px] focus-visible:outline-[#0095f6] disabled:opacity-[.38]!"
          type="button"
          disabled={blocked || currentIndex < 1}
          onClick={() => {
            if (currentClip)
              apply((state) =>
                moveClip(state, currentClip.id, currentIndex - 1),
              );
          }}
        >
          <span className="text-[21px] leading-[1.1]" aria-hidden="true">
            ←
          </span>
          <span>前へ</span>
        </button>
        <button
          className="flex min-h-[56px] min-w-[63px] shrink-0 flex-col items-center justify-center gap-[3px] whitespace-nowrap rounded-[9px]! border-0! bg-transparent! px-[10px]! py-[6px]! text-[11px]! text-white! hover:enabled:bg-[#303030]! focus-visible:outline-2 focus-visible:outline-offset-[3px] focus-visible:outline-[#0095f6] disabled:opacity-[.38]!"
          type="button"
          disabled={
            blocked || currentIndex < 0 || currentIndex >= edit.clips.length - 1
          }
          onClick={() => {
            if (currentClip)
              apply((state) =>
                moveClip(state, currentClip.id, currentIndex + 1),
              );
          }}
        >
          <span className="text-[21px] leading-[1.1]" aria-hidden="true">
            →
          </span>
          <span>後ろへ</span>
        </button>
        <span className="ml-auto whitespace-nowrap text-[11px] text-[#aaa]">
          {edit.clips.length} / 3 場面
        </span>
      </div>
      <p className="px-3 pb-[10px] text-[11px]! text-[#959595]! md:px-[17px] md:pb-3">
        目盛りで再生位置を動かし、クリップをタップして編集します。
      </p>
      {edit.clips.length > 0 && (total < MIN_US || total > MAX_US) && (
        <p className="mx-[15px]! mt-0! mb-3! rounded-lg bg-[#32271b] px-3 py-[9px] text-xs! text-[#ffd8a8]!">
          完成動画は合計1〜15秒にしてください。
        </p>
      )}
      {edit.clips.some(
        (clip) => clip.endUs - clip.startUs < 1_000_000 / 30,
      ) && (
        <p className="mx-[15px]! mt-0! mb-3! rounded-lg bg-[#32271b] px-3 py-[9px] text-xs! text-[#ffd8a8]!">
          1フレームより短い場面は映像が出ない場合があります。
        </p>
      )}
    </section>
  );
}
