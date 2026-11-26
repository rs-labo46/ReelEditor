import { useEffect, useRef, useState } from "react";
import { totalUs } from "./edit.ts";

import type { Clip, EditState, LocalSource } from "./types";
import { displaySeconds } from "./display.ts";

//動画の再生位置を指定時刻へ移動し、成功・失敗・中断をPromiseで通知する
function seek(
  v: HTMLVideoElement,
  t: number,
  signal: AbortSignal,
): Promise<void> {
  //すでに中断済みなら再生位置の移動を開始しない
  signal.throwIfAborted();
  //再生位置の移動完了イベントを待つ非同期処理を作成する
  return new Promise((resolve, reject) => {
    //成功・失敗・中断後にタイマーとイベント監視を解除
    const clean = () => {
      window.clearTimeout(timer);
      v.removeEventListener("loadeddata", start);
      v.removeEventListener("seeked", ready);
      v.removeEventListener("error", fail);
      signal.removeEventListener("abort", stop);
    };
    //動画の移動が完了したらPromiseを成功させる
    const ready = () => {
      clean();
      resolve();
    };
    //動画の読込失敗や時間超過をエラーとして通知する
    const fail = () => {
      clean();
      reject(new Error("元動画の読み込みまたは再生に失敗しました"));
    };
    //キャンセルの通知を受けたらPromiseを中断する
    const stop = () => {
      clean();
      reject(signal.reason);
    };
    //動画が読込済みなら指定した再生時刻へ移動する
    const start = () => {
      if (Math.abs(v.currentTime - t) < 0.000001 && !v.seeking) {
        ready();
        return;
      }
      try {
        v.currentTime = t;
      } catch {
        fail();
      }
    };
    //8秒以内にシークが完了しなければ失敗にする
    const timer = window.setTimeout(fail, 8000);
    signal.addEventListener("abort", stop, { once: true });
    v.addEventListener("error", fail, { once: true });
    v.addEventListener("seeked", ready, { once: true });
    if (v.readyState >= 2) start();
    else v.addEventListener("loadeddata", start, { once: true });
  });
}
//元動画の映像開始時刻をマイクロ秒から秒へ変換する
const timeOrigin = (src: LocalSource) =>
  Math.max(0, src.info.videoOriginUs) / 1_000_000;
//動画要素に再生素材のURLと縦画面の切り抜き位置を設定する
function position(v: HTMLVideoElement, c: Clip, src: LocalSource) {
  if (v.getAttribute("src") !== src.url) v.src = src.url;
  v.style.objectPosition = `${c.cropX / 100}% ${c.cropY / 100}%`;
}
//前後の場面が同じ動画の連続区間・同じ切り抜き位置か調べる
function sameRun(prev: Clip | undefined, c: Clip | undefined): boolean {
  //9:16の動画画面と再生ボタン・再生時間を表示する
  return (
    !!prev &&
    !!c &&
    prev.sourceId === c.sourceId &&
    prev.endUs === c.startUs &&
    prev.cropX === c.cropX &&
    prev.cropY === c.cropY
  );
}
//指定場面の終了時刻まで再生を監視し、現在位置を画面へ報告する
function endOfScene(
  v: HTMLVideoElement,
  c: Clip,
  src: LocalSource,
  offset: number,
  signal: AbortSignal,
  report: (n: number) => void,
  hold: boolean,
): Promise<void> {
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    //画面更新と映像フレーム監視の予約IDを保持する
    let raf = 0,
      frame = 0;
    //場面終了時にフレーム監視とイベント監視を解除する
    const clean = () => {
      cancelAnimationFrame(raf);
      if (frame && "cancelVideoFrameCallback" in v)
        v.cancelVideoFrameCallback(frame);
      v.removeEventListener("error", fail);
      signal.removeEventListener("abort", stop);
    };
    //再生中断を通知して監視を終了する
    const stop = () => {
      clean();
      reject(signal.reason);
    };
    //再生エラーを通知して監視を終了する
    const fail = () => {
      clean();
      reject(new Error("試し再生を続けられませんでした"));
    };
    //終了済みの場面を二重に処理しないためのフラグを保持する
    let done = false;
    //再生時刻を編集タイムライン上の位置へ変換して終了判定する
    const sample = (mediaTime: number) => {
      if (done) return;
      //動画の現在位置を開始時刻基準のマイクロ秒へ変換する
      const n = Math.round((mediaTime - timeOrigin(src)) * 1_000_000);
      report(offset + Math.max(0, Math.min(c.endUs, n) - c.startUs));
      if (v.ended || n >= c.endUs) {
        done = true;
        if (!hold) v.pause();
        clean();
        resolve();
      }
    };
    //映像フレームの表示時刻を使って再生位置を追跡する
    const video = (_now: number, m: VideoFrameCallbackMetadata) => {
      sample(m.mediaTime);
      if (!done) frame = v.requestVideoFrameCallback(video);
    };
    //ブラウザのフレーム更新を使い再生時刻を補助的に追跡する
    const audio = () => {
      sample(v.currentTime);
      if (!done) raf = requestAnimationFrame(audio);
    };
    v.addEventListener("error", fail, { once: true });
    signal.addEventListener("abort", stop, { once: true });
    if ("requestVideoFrameCallback" in v)
      frame = v.requestVideoFrameCallback(video);
    audio();
  });
}

//プレビューで受け取る編集情報・選択場面・操作禁止状態を定義
type PreviewProps = {
  edit: EditState;
  selected: string | null;
  blocked: boolean;
  // 親のタイムラインで選択した再生位置と、操作ごとの識別番号
  seekTo?: { positionUs: number; requestId: number };
  // 再生位置を親のタイムラインへ報告する
  onProgress?: (positionUs: number) => void;
};

//編集内容や選択場面が変わったら再生コンポーネントを作り直して初期化
export function Preview(props: PreviewProps) {
  const { edit, selected, blocked, seekTo } = props;
  return (
    <PreviewPlayer
      key={`${edit.revision}:${selected ?? ""}:${blocked}:${seekTo?.requestId ?? 0}`}
      {...props}
    />
  );
}

//編集した動画を9:16で試し再生し、再生状態を表示する
function PreviewPlayer({
  edit,
  selected,
  blocked,
  seekTo,
  onProgress,
}: PreviewProps) {
  // 再生位置に対応する場面を検索する（最後尾を選んだ場合は最終場面を使う）
  const total = totalUs(edit.clips);
  const seekPosition = seekTo
    ? Math.max(0, Math.min(total, seekTo.positionUs))
    : null;
  let passed = 0;
  let indexFromSeek = -1;
  if (seekPosition !== null) {
    for (let index = 0; index < edit.clips.length; index++) {
      const clip = edit.clips[index];
      if (
        seekPosition < passed + clip.endUs - clip.startUs ||
        index === edit.clips.length - 1
      ) {
        indexFromSeek = index;
        break;
      }
      passed += clip.endUs - clip.startUs;
    }
  }
  const selectedIndex = edit.clips.findIndex((clip) => clip.id === selected);
  const initialIndex =
    indexFromSeek >= 0 ? indexFromSeek : Math.max(0, selectedIndex);
  const initialPosition =
    seekPosition ?? totalUs(edit.clips.slice(0, initialIndex));

  //場面切替時に交互に使う2つのvideo要素と中断処理を保持する
  const a = useRef<HTMLVideoElement>(null),
    b = useRef<HTMLVideoElement>(null),
    run = useRef<AbortController | null>(null);
  //現在の編集タイムライン上の再生位置を保持する
  const pos = useRef(initialPosition);
  //画面表示用の再生位置・メッセージ・再生中フラグを管理する
  const [shown, setShown] = useState(initialPosition),
    [message, setMessage] = useState("停止中"),
    [playing, setPlaying] = useState(false);
  //再生位置をRef・画面State・親のタイムラインへ反映する
  function update(n: number) {
    pos.current = n;
    setShown(n);
    onProgress?.(n);
  }
  //実行中の再生を中断し動画を停止して状態表示を更新する
  function stop(message: string) {
    run.current?.abort();
    run.current = null;
    a.current?.pause();
    b.current?.pause();
    setPlaying(false);
    setMessage(message);
  }
  //クリップまたは選択中の場面が変わったら先頭フレームを準備する
  useEffect(() => {
    //プレビューに使う2つのvideo要素を取得する
    const first = a.current,
      next = b.current;
    if (!first || !next) return;
    //指定時刻に対応するクリップを準備する
    const c = edit.clips[initialIndex];
    //選択中クリップが使用する元動画を探す
    const src = edit.sources.find((x) => x.localId === c?.sourceId);
    next.removeAttribute("src");
    next.load();
    next.style.visibility = "hidden";
    first.style.visibility = "hidden";
    if (!c || !src) {
      first.removeAttribute("src");
      first.load();
      return;
    }
    //表示準備のシーク処理を中断できるようにする
    const ready = new AbortController();
    position(first, c, src);
    // 正確な時刻を維持したまま、プレビューは場面終端の少し手前まで表示する
    const clipOffset = Math.max(
      0,
      Math.min(
        c.endUs - c.startUs - 1_000,
        initialPosition - totalUs(edit.clips.slice(0, initialIndex)),
      ),
    );
    void seek(
      first,
      timeOrigin(src) + (c.startUs + clipOffset) / 1_000_000,
      ready.signal,
    )
      .then(() => {
        if (!ready.signal.aborted && !run.current)
          first.style.visibility = "visible";
      })
      .catch(() => {});
    return () => {
      ready.abort();
      run.current?.abort();
      first.pause();
      next.pause();
    };
  }, [edit.clips, edit.sources, initialIndex, initialPosition]);
  //タブが非表示になったときは再生を一時停止する
  useEffect(() => {
    //ブラウザのタブ非表示を検出し再生を止める
    const hide = () => {
      if (document.hidden && run.current) stop("一時停止");
    };
    document.addEventListener("visibilitychange", hide);
    return () => document.removeEventListener("visibilitychange", hide);
  }, []);

  //停止位置から、または先頭からすべてのクリップを順に再生する
  async function play(reset: boolean) {
    //再生用video要素を取得する
    const first = a.current,
      second = b.current;
    if (!first || !second || blocked || !total) return;
    stop("読み込み中");
    //今回の再生処理専用の中断ControllerとSignalを作る
    const attempt = new AbortController(),
      signal = attempt.signal;
    run.current = attempt;
    setPlaying(true);
    //再生済みの合計時間と開始するクリップ番号を管理する
    let passed = 0,
      at = 0;
    //先頭から再生するか現在位置から再開するか決める
    let rest = reset || pos.current >= total ? 0 : pos.current;
    //再生開始位置がどのクリップにあるかを計算する
    for (const c of edit.clips) {
      //このクリップの再生時間をマイクロ秒で計算する
      const duration = c.endUs - c.startUs;
      if (rest < duration) break;
      passed += duration;
      rest -= duration;
      at++;
    }
    //現在のvideo要素と次のvideo要素を使い分ける
    let v = first,
      next = second,
      previous: Clip | undefined;
    //次のクリップのシーク準備が完了するPromiseを保持する
    let preloaded: Promise<void> | undefined;
    try {
      //再生開始クリップから最後まで順番に処理する
      for (; at < edit.clips.length; at++) {
        signal.throwIfAborted();
        //現在のクリップと次に再生するクリップを取得する
        const c = edit.clips[at],
          following = edit.clips[at + 1];
        //現在のクリップが参照する元動画を取得する
        const src = edit.sources.find((x) => x.localId === c?.sourceId);
        if (!c || !src) throw new Error("場面の元動画を取得できません");
        //前のクリップからシークなしで連続再生できるか調べる
        const contiguous = sameRun(previous, c);
        if (!contiguous) {
          setMessage("読み込み中");
          v.style.visibility = "hidden";
          next.style.visibility = "hidden";
          position(v, c, src);
          if (preloaded) await preloaded;
          await seek(
            v,
            timeOrigin(src) + (c.startUs + rest) / 1_000_000,
            signal,
          );
          preloaded = undefined;
        }
        rest = 0;
        signal.throwIfAborted();
        next.style.visibility = "hidden";
        v.style.visibility = "visible";
        //次のクリップへ同じvideo要素で連続再生できるか調べる
        const hold = sameRun(c, following);
        //次のクリップに必要な元動画を取得する
        const nsrc = edit.sources.find(
          (x) => x.localId === following?.sourceId,
        );
        //次の場面が連続区間でなければ別のvideo要素で先読みする
        if (following && nsrc && !hold) {
          position(next, following, nsrc);
          preloaded = seek(
            next,
            timeOrigin(nsrc) + following.startUs / 1_000_000,
            signal,
          ).catch(() => {});
        }
        if (!contiguous) await v.play();
        signal.throwIfAborted();
        setMessage("再生中");
        //現在の場面の終了時刻まで再生して進捗を更新する
        await endOfScene(v, c, src, passed, signal, update, hold);
        passed += c.endUs - c.startUs;
        previous = c;
        //連続再生できない場合は停止し2つのvideo要素の役割を交換する
        if (!hold) {
          v.pause();
          [v, next] = [next, v];
        }
      }
      update(total);
      setMessage("再生が終わりました");
    } catch (e) {
      if (!signal.aborted)
        setMessage(e instanceof Error ? e.message : "試し再生に失敗しました");
    } finally {
      //今回の再生が有効な場合だけ再生状態を終了処理する
      if (run.current === attempt) {
        v.pause();
        next.pause();
        run.current = null;
        setPlaying(false);
      }
      attempt.abort();
    }
  }

  return (
    <section
      className="w-full min-w-0 rounded-xl border border-[#303030] bg-[#101010] px-[11px] py-[10px] md:rounded-2xl md:px-4 md:py-[14px]"
      aria-label="縦画面の試し再生"
    >
      <div className="flex items-center justify-between pb-[7px] md:pb-[10px]">
        <span className="text-[10px] font-extrabold tracking-[.13em] text-[#929292] leading-[1.5]">
          PREVIEW
        </span>
        <span className="rounded-full border border-[#3d3d3d] px-[10px] py-1 text-[10px] font-bold text-[#ddd]">
          9:16
        </span>
      </div>
      {/* 2つの動画要素を重ね、クリップ切り替え時の画面更新を抑える */}
      <div className="flex min-h-0 items-center justify-center overflow-hidden rounded-xl bg-[#050505] py-[6px] md:py-2">
        <div className="relative isolate aspect-[9/16] w-[min(72vw,260px,26.5dvh)] overflow-hidden rounded-[7px] bg-black md:w-[min(100%,245px)] xl:w-[min(100%,272px)]">
          {edit.clips.length === 0 && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-[linear-gradient(160deg,#262626,#050505_72%)] p-[17px] text-center text-[#e6e6e6]">
              <span
                className="grid size-[54px] place-items-center rounded-2xl border border-[#494949] text-[30px]"
                aria-hidden="true"
              >
                ▣
              </span>
              <strong className="text-sm font-bold">動画を選択</strong>
              <small className="text-[11px]! leading-[1.6] text-[#aaa]!">
                9:16のプレビューがここに表示されます
              </small>
            </div>
          )}
          <video
            className="absolute inset-0 h-full w-full object-cover"
            ref={a}
            playsInline
            preload="auto"
            aria-label="プレビュー映像"
          />
          <video
            className="absolute inset-0 h-full w-full object-cover"
            ref={b}
            playsInline
            preload="auto"
            aria-hidden="true"
          />
        </div>
      </div>
      {/* 再生・一時停止・先頭から再生する操作は画面幅を問わず押せるサイズにする */}
      <div className="mt-[9px] grid grid-cols-[minmax(85px,105px)_minmax(0,1fr)_42px] items-center gap-[5px] min-[360px]:gap-[10px] md:mt-3">
        <button
          type="button"
          className="inline-flex min-h-[44px] items-center justify-center gap-[7px] rounded-full! border-0! bg-white! px-1! py-[9px]! text-[11px]! font-extrabold! text-[#0b0b0b]! hover:enabled:bg-[#eee]! focus-visible:outline-2 focus-visible:outline-offset-[3px] focus-visible:outline-[#0095f6] disabled:opacity-[.38]! min-[360px]:text-xs!"
          disabled={blocked || !total}
          onClick={() => {
            if (playing) stop("一時停止");
            else void play(false);
          }}
          aria-label={playing ? "一時停止" : "再生"}
        >
          <span className="text-xs" aria-hidden="true">
            {playing ? "Ⅱ" : "▶"}
          </span>
          {playing ? "一時停止" : "再生"}
        </button>
        <div
          className="flex min-w-0 flex-col items-center whitespace-nowrap text-[11px] tabular-nums text-[#f5f5f5] min-[360px]:text-xs"
          role="status"
          aria-live="polite"
        >
          <span>
            {displaySeconds(shown)} / {displaySeconds(total)} 秒
          </span>
          <small className="text-[10px]! text-[#a8a8a8]!">{message}</small>
        </div>
        <button
          type="button"
          className="min-h-[44px] rounded-full! border! border-[#363636]! bg-[#202020]! p-0! text-[23px]! text-white! hover:enabled:bg-[#303030]! focus-visible:outline-2 focus-visible:outline-offset-[3px] focus-visible:outline-[#0095f6] disabled:opacity-[.38]!"
          disabled={blocked || !total || playing}
          onClick={() => void play(true)}
          aria-label="最初から再生"
        >
          ↺
        </button>
      </div>
    </section>
  );
}
