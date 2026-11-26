import { useState } from "react";
import {
  addClip,
  cropRect,
  removeLocalSource,
  seconds,
  setCrop,
  splitClip,
  totalUs,
  toUs,
  trimClip,
} from "./edit.ts";

import type { Clip, EditState, LocalSource } from "./types";
import { Preview } from "./Preview";
import { displaySeconds } from "./display.ts";
import { Timeline } from "./Timeline.tsx";

// 編集処理を受け取り、検証済みの編集状態をZustandへ反映する関数
type Apply = (fn: (s: EditState) => EditState) => void;

// 選択中の場面の切り出し・分割・縦画面位置調整をまとめる
function Fields({
  clip,
  source,
  apply,
  blocked,
}: {
  clip: Clip;
  source: LocalSource;
  apply: Apply;
  blocked: boolean;
}) {
  // 元動画の正確な切り出し時刻をフォームで編集する
  const [start, setStart] = useState(seconds(clip.startUs));
  const [end, setEnd] = useState(seconds(clip.endUs));
  const [split, setSplit] = useState(
    seconds(Math.round((clip.startUs + clip.endUs) / 2)),
  );
  const info = source.info;
  // 表示位置を変更できる方向を判定する
  const rect = cropRect(
    info.width,
    info.height,
    info.rotation,
    info.sampleAspectRatio.num / info.sampleAspectRatio.den,
    clip.cropX,
    clip.cropY,
  );

  return (
    <div className="min-w-0 md:grid md:grid-cols-3 md:gap-5 xl:block">
      <section
        className="border-b border-[#303030] py-[14px] last:border-0 md:py-[18px] md:last:border-b xl:border-b"
        aria-labelledby="ig-trim-heading"
      >
        <div className="flex items-center justify-between gap-[10px]">
          <h3 className="m-0! text-[13px]! font-bold!" id="ig-trim-heading">
            切り出し
          </h3>
          <small className="whitespace-nowrap text-[11px]! font-bold text-[#a8a8a8]!">
            元動画 {displaySeconds(info.durationUs)}秒
          </small>
        </div>
        <p className="mt-[5px]! mb-[11px]! text-[11px]! leading-[1.6]! text-[#999]!">
          残したい区間の開始・終了を指定します。
        </p>
        <form
          className="grid gap-[10px]"
          onSubmit={(event) => {
            event.preventDefault();
            apply((state) => trimClip(state, clip.id, toUs(start), toUs(end)));
          }}
        >
          <div className="grid grid-cols-2 gap-[9px]">
            <label className="relative grid! min-w-0 gap-[6px] text-[11px]! text-[#c4c4c4]!">
              開始（秒）
              <input
                className="w-full! min-w-0! rounded-[9px]! border! border-[#414141]! bg-[#222]! p-[10px]! text-base! text-white! focus-visible:outline-2 focus-visible:outline-offset-[3px] focus-visible:outline-[#0095f6]"
                value={start}
                onChange={(event) => setStart(event.target.value)}
                inputMode="decimal"
                disabled={blocked}
                required
              />
            </label>
            <label className="relative grid! min-w-0 gap-[6px] text-[11px]! text-[#c4c4c4]!">
              終了（秒）
              <input
                className="w-full! min-w-0! rounded-[9px]! border! border-[#414141]! bg-[#222]! p-[10px]! text-base! text-white! focus-visible:outline-2 focus-visible:outline-offset-[3px] focus-visible:outline-[#0095f6]"
                value={end}
                onChange={(event) => setEnd(event.target.value)}
                inputMode="decimal"
                disabled={blocked}
                required
              />
            </label>
          </div>
          <button
            className="min-h-[44px] w-full! rounded-[11px]! border-0! bg-[#0095f6]! px-[10px]! py-2! text-xs! font-extrabold! text-white! hover:enabled:bg-[#168eec]! focus-visible:outline-2 focus-visible:outline-offset-[3px] focus-visible:outline-[#0095f6] disabled:opacity-[.38]!"
            type="submit"
            disabled={blocked}
          >
            切り出しを適用
          </button>
        </form>
      </section>
      <section
        className="border-b border-[#303030] py-[14px] last:border-0 md:py-[18px] md:last:border-b xl:border-b"
        aria-labelledby="ig-crop-heading"
      >
        <div className="flex items-center justify-between gap-[10px]">
          <h3 className="m-0! text-[13px]! font-bold!" id="ig-crop-heading">
            縦画面に合わせる
          </h3>
          <small className="whitespace-nowrap text-[11px]! font-bold text-[#a8a8a8]!">
            9:16
          </small>
        </div>
        <p className="mt-[5px]! mb-[11px]! text-[11px]! leading-[1.6]! text-[#999]!">
          プレビューで見える範囲を調整します。
        </p>
        <div className="grid gap-[14px]">
          <label className="relative grid! min-w-0 gap-[6px] text-[11px]! text-[#c4c4c4]!">
            左右の位置{" "}
            <span className="absolute top-0 right-0 text-[#aaa]">
              {Math.round(clip.cropX / 100)}%
            </span>
            <input
              className="mt-[5px] w-full! accent-[#0095f6]!"
              type="range"
              min="0"
              max="10000"
              step="1"
              value={clip.cropX}
              disabled={blocked || rect.fullW === 720}
              onChange={(event) =>
                apply((state) =>
                  setCrop(
                    state,
                    clip.id,
                    event.target.valueAsNumber,
                    clip.cropY,
                  ),
                )
              }
            />
          </label>
          <label className="relative grid! min-w-0 gap-[6px] text-[11px]! text-[#c4c4c4]!">
            上下の位置{" "}
            <span className="absolute top-0 right-0 text-[#aaa]">
              {Math.round(clip.cropY / 100)}%
            </span>
            <input
              className="mt-[5px] w-full! accent-[#0095f6]!"
              type="range"
              min="0"
              max="10000"
              step="1"
              value={clip.cropY}
              disabled={blocked || rect.fullH === 1280}
              onChange={(event) =>
                apply((state) =>
                  setCrop(
                    state,
                    clip.id,
                    clip.cropX,
                    event.target.valueAsNumber,
                  ),
                )
              }
            />
          </label>
        </div>
        {rect.scale > 1 && (
          <small className="mt-[9px] block text-[11px]! text-[#aaa]!">
            拡大するため、画質が低下する場合があります。
          </small>
        )}
      </section>
      <section
        className="border-b border-[#303030] py-[14px] last:border-0 md:py-[18px] md:last:border-b xl:border-b"
        aria-labelledby="ig-split-heading"
      >
        <div className="flex items-center justify-between gap-[10px]">
          <h3 className="m-0! text-[13px]! font-bold!" id="ig-split-heading">
            時間を指定して分割
          </h3>
        </div>
        <p className="mt-[5px]! mb-[11px]! text-[11px]! leading-[1.6]! text-[#999]!">
          タイムライン上の分割ボタンからも操作できます。
        </p>
        <form
          className="grid gap-[10px]"
          onSubmit={(event) => {
            event.preventDefault();
            apply((state) =>
              splitClip(state, clip.id, toUs(split), crypto.randomUUID()),
            );
          }}
        >
          <label className="relative grid! min-w-0 gap-[6px] text-[11px]! text-[#c4c4c4]!">
            分割位置（秒）
            <input
              className="w-full! min-w-0! rounded-[9px]! border! border-[#414141]! bg-[#222]! p-[10px]! text-base! text-white! focus-visible:outline-2 focus-visible:outline-offset-[3px] focus-visible:outline-[#0095f6]"
              value={split}
              onChange={(event) => setSplit(event.target.value)}
              inputMode="decimal"
              disabled={blocked}
              required
            />
          </label>
          <button
            className="min-h-[44px] w-full! rounded-[11px]! border! border-[#444]! bg-[#303030]! px-[10px]! py-2! text-xs! text-white! hover:enabled:bg-[#414141]! focus-visible:outline-2 focus-visible:outline-offset-[3px] focus-visible:outline-[#0095f6] disabled:opacity-[.38]!"
            type="submit"
            disabled={blocked}
          >
            この位置で分割
          </button>
        </form>
      </section>
    </div>
  );
}

// 端末内の素材・9:16プレビュー・タイムライン・編集設定をまとめて表示する
export function Editor({
  edit,
  apply,
  files,
  blocked,
}: {
  edit: EditState;
  apply: Apply;
  files: (files: File[]) => void;
  blocked: boolean;
}) {
  // タイムラインで選択したクリップのIDを保持する
  const [chosen, setChosen] = useState<string | null>(null);
  const selected = edit.clips.some((clip) => clip.id === chosen)
    ? chosen
    : (edit.clips[0]?.id ?? null);
  const current = edit.clips.find((clip) => clip.id === selected);
  const currentSource = edit.sources.find(
    (source) => source.localId === current?.sourceId,
  );
  const total = totalUs(edit.clips);

  // シーク操作のたびにrequestIdを増やしてPreviewへ反映する
  const [seekTo, setSeekTo] = useState({ positionUs: 0, requestId: 0 });
  const [playheadUs, setPlayheadUs] = useState(0);
  const seekPreview = (positionUs: number) => {
    setPlayheadUs(positionUs);
    setSeekTo((prev) => ({ positionUs, requestId: prev.requestId + 1 }));
  };
  const chooseClip = (clipId: string, positionUs: number) => {
    setChosen(clipId);
    seekPreview(positionUs);
  };

  return (
    <section
      className="box-border w-full min-w-0 overflow-clip rounded-[14px] border border-[#222] bg-[#080808] px-[9px] pt-[11px] pb-[calc(16px+env(safe-area-inset-bottom))] text-[#f9f9f9] sm:rounded-[18px] sm:p-[clamp(12px,2vw,26px)] xl:rounded-[22px] [&_*]:box-border"
      aria-label="リール動画の編集ワークスペース"
    >
      <header className="mb-[12px] flex items-center justify-between gap-3 px-[5px] pt-[3px] md:mb-0 md:px-1 md:pt-0 md:pb-[18px]">
        <div>
          <span className="text-[10px] font-extrabold tracking-[.13em] text-[#929292] leading-[1.5]">
            REEL EDITOR · 9:16
          </span>
          <h2 className="my-[2px]! text-[19px]! font-extrabold! tracking-[-.025em] min-[360px]:text-[21px]! lg:text-[26px]!">
            リールを編集
          </h2>
          <p className="m-0! hidden text-xs! text-[#a8a8a8]! md:block">
            クリップを選んで、短い動画を仕上げましょう。
          </p>
        </div>
        <span
          className="shrink-0 whitespace-nowrap rounded-full border border-[#3d3d3d] bg-[#252525] px-2 py-[5px] text-[10px] text-[#d6d6d6] md:px-[11px] md:py-[7px] md:text-[11px]"
          aria-label="編集内容は未保存"
        >
          ● 未保存
        </span>
      </header>

      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] items-start gap-[10px] md:grid-cols-[minmax(190px,.85fr)_minmax(0,1.15fr)] md:gap-[14px] xl:grid-cols-[minmax(205px,245px)_minmax(0,1fr)_minmax(245px,300px)]">
        {/* 素材はユーザーの端末内に保持し、ゲストではBackendへ送らない */}
        <aside
          className="order-3 min-w-0 rounded-xl border border-[#303030] bg-[#141414] p-[14px] md:order-1 md:min-h-0 md:rounded-2xl md:p-4 xl:min-h-[340px]"
          aria-label="動画素材"
        >
          <div className="flex items-center justify-between gap-[10px]">
            <h3 className="m-0! text-base! font-extrabold!">動画素材</h3>
            <span className="shrink-0 whitespace-nowrap text-[11px] font-bold text-[#a8a8a8]">
              {edit.sources.length} / 3
            </span>
          </div>
          <p className="mt-[7px]! mb-[10px]! text-xs! text-[#a8a8a8]! md:mb-[14px]!">
            端末内のMP4を追加できます。
          </p>
          <label
            className={`group flex! min-h-[65px] cursor-pointer! flex-wrap items-center justify-start gap-3 rounded-[14px] border! border-dashed! border-[#535353]! bg-[#202020]! px-3 py-[10px] text-left! text-white! focus-within:outline-2 focus-within:outline-offset-[3px] focus-within:outline-[#0095f6] hover:border-[#aaa]! hover:bg-[#262626]! md:min-h-[88px] md:justify-center md:px-3 md:py-[15px] ${blocked || edit.sources.length >= 3 ? "pointer-events-none cursor-not-allowed! opacity-50" : ""}`}
          >
            <span
              className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-white text-[22px] font-medium text-[#111] md:h-[38px] md:w-[38px] md:text-[26px]"
              aria-hidden="true"
            >
              ＋
            </span>
            <span className="grid min-w-0 gap-[3px]">
              <strong className="text-[13px] font-bold">動画を追加</strong>
              <small className="whitespace-normal text-[10px]! font-medium text-[#bababa]!">
                MP4 · 最大25MB / 60秒
              </small>
            </span>
            <input
              className="sr-only"
              type="file"
              multiple
              accept=".mp4,video/mp4"
              disabled={blocked || edit.sources.length >= 3}
              aria-label="端末から動画を選択"
              onChange={(event) => {
                const chosenFiles = Array.from(event.currentTarget.files ?? []);
                event.currentTarget.value = "";
                if (chosenFiles.length) files(chosenFiles);
              }}
            />
          </label>

          {edit.sources.length > 0 ? (
            <ul className="mt-[14px]! grid list-none gap-0 p-0! md:gap-[10px]">
              {edit.sources.map((source, index) => (
                <li
                  className="grid grid-cols-[34px_minmax(0,1fr)] gap-[10px] border-t border-[#2a2a2a] py-3"
                  key={source.localId}
                >
                  <span
                    className="grid size-[34px] place-items-center rounded-[10px] bg-[#303030] text-[11px] font-bold text-[#e7e7e7]"
                    aria-hidden="true"
                  >
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <div className="grid min-w-0 gap-[5px]">
                    <strong
                      className="overflow-hidden text-ellipsis whitespace-nowrap text-xs font-bold"
                      title={source.file.name}
                    >
                      {source.file.name}
                    </strong>
                    <small className="text-[11px]! text-[#a8a8a8]!">
                      {displaySeconds(source.info.durationUs)}秒 ·{" "}
                      {source.info.hasAudio ? "音声あり" : "音声なし"}
                    </small>
                    <div className="mt-[3px] flex flex-wrap gap-[7px]">
                      <button
                        className="min-h-[44px] rounded-[11px]! border! border-[#484848]! bg-[#303030]! px-[10px]! py-2! text-[11px]! text-white! hover:enabled:bg-[#414141]! focus-visible:outline-2 focus-visible:outline-offset-[3px] focus-visible:outline-[#0095f6] disabled:opacity-[.38]!"
                        type="button"
                        disabled={blocked || edit.clips.length >= 3}
                        onClick={() => {
                          const id = crypto.randomUUID();
                          apply((state) => addClip(state, source.localId, id));
                          chooseClip(id, total);
                        }}
                      >
                        ＋ 場面に追加
                      </button>
                      <button
                        type="button"
                        className="min-h-[44px] rounded-[11px]! border! border-transparent! bg-transparent! px-[10px]! py-2! text-[11px]! text-[#bbb]! hover:enabled:bg-[#303030]! focus-visible:outline-2 focus-visible:outline-offset-[3px] focus-visible:outline-[#0095f6] disabled:opacity-[.38]!"
                        disabled={blocked}
                        onClick={() => {
                          if (
                            edit.clips.some(
                              (clip) => clip.sourceId === source.localId,
                            ) &&
                            !window.confirm(
                              "この動画を使う場面も編集から外しますか？",
                            )
                          )
                            return;
                          apply((state) =>
                            removeLocalSource(state, source.localId),
                          );
                        }}
                      >
                        外す
                      </button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-1 py-6 text-center text-xs! text-[#828282]!">
              追加した素材はここに表示されます。
            </p>
          )}
        </aside>

        {/* 縦動画を中心に配置し、再生位置をタイムラインと同期する */}
        <div className="order-1 min-w-0 md:order-2">
          <Preview
            edit={edit}
            selected={selected}
            blocked={blocked}
            seekTo={seekTo}
            onProgress={setPlayheadUs}
          />
        </div>

        {/* サムネイル・時間目盛り・再生位置・分割などの編集操作 */}
        <Timeline
          edit={edit}
          selected={selected}
          positionUs={Math.max(0, Math.min(total, playheadUs))}
          blocked={blocked}
          apply={apply}
          onSelect={chooseClip}
          onSeek={seekPreview}
        />

        {/* 選択中の場面のみ調整できる設定パネル */}
        <aside
          className="order-4 min-w-0 rounded-xl border border-[#303030] bg-[#141414] p-[14px] md:col-span-2 md:rounded-2xl md:p-4 xl:order-3 xl:col-span-1 xl:min-h-[340px]"
          aria-label="選択中の場面の編集設定"
        >
          <div className="flex items-center justify-between gap-[10px]">
            <h3 className="m-0! text-base! font-extrabold!">クリップ編集</h3>
            <span className="shrink-0 whitespace-nowrap text-[11px] font-bold text-[#a8a8a8]">
              {current
                ? `${edit.clips.findIndex((clip) => clip.id === current.id) + 1} / ${edit.clips.length}`
                : "未選択"}
            </span>
          </div>
          {current && currentSource ? (
            <>
              <div className="mt-[15px] flex items-center gap-[10px] rounded-xl bg-[#232323] px-[10px] py-[11px]">
                <span
                  className="w-8 shrink-0 text-center text-xl text-white"
                  aria-hidden="true"
                >
                  ▣
                </span>
                <div className="grid min-w-0 gap-[3px]">
                  <strong className="text-xs font-bold">
                    選択中のクリップ
                  </strong>
                  <small className="overflow-hidden text-ellipsis whitespace-nowrap text-[11px]! text-[#aaa]!">
                    {currentSource.file.name}
                  </small>
                </div>
              </div>
              <Fields
                key={`${current.id}/${current.startUs}/${current.endUs}`}
                clip={current}
                source={currentSource}
                apply={apply}
                blocked={blocked}
              />
            </>
          ) : (
            <div className="grid min-h-[260px] justify-items-center content-center gap-[9px] p-[14px] text-center">
              <span
                className="grid size-[46px] place-items-center rounded-full border border-[#414141] text-[21px] text-[#ccc]"
                aria-hidden="true"
              >
                ▣
              </span>
              <strong className="text-sm font-bold">クリップを選択</strong>
              <p className="text-xs! leading-[1.7]! text-[#999]!">
                動画を追加し、タイムラインの場面を選ぶと編集できます。
              </p>
            </div>
          )}
        </aside>
      </div>
    </section>
  );
}
