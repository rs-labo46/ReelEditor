import type { FFmpeg } from "@ffmpeg/ffmpeg";
import type { MediaInfo } from "../editor/types";
import { MAX_BYTES } from "../editor/edit.ts";
import { withEngine } from "./engine";
import { inputOptions, readProbe, record } from "./metadata.ts";

//FFprobeを実行し、動画ファイルの形式や映像・音声情報を取得する
export async function probe(ff: FFmpeg, file: string): Promise<unknown> {
  //FFprobeの実行中にエラーが出力されたか記録する
  let loggedError = false;

  //FFmpegのログを監視してエラー出力の有無を確認する
  const log = ({ type, message }: { type: string; message: string }) => {
    if (type === "stderr" && message.trim()) loggedError = true;
  };

  //FFmpegのログ監視を開始する
  ff.on("log", log);

  try {
    //FFprobeで動画の映像・音声・ファイル情報をJSONへ書き出す
    const rc = await ff.ffprobe([
      "-v",
      "error",
      ...inputOptions,
      "-show_error",
      "-show_streams",
      "-show_format",
      "-of",
      "json",
      "-o",
      "probe.json",
      file,
    ]);

    //FFprobeの終了コードとエラーログを確認する
    if ((rc !== 0 && rc !== -1) || loggedError)
      throw new Error("動画の情報を読み取れませんでした");

    //FFprobeが生成したJSONファイルを文字列として読み込む
    const raw = await ff.readFile("probe.json", "utf8");

    //読み込みが終わった一時的なJSONファイルを削除する
    await ff.deleteFile("probe.json");

    //JSONが文字列であり、1MB以下に収まっているか確認する
    if (typeof raw !== "string" || raw.length > 1_048_576)
      throw new Error("動画の情報が大きすぎます");

    //JSON文字列をJavaScriptのデータへ変換する
    const result: unknown = JSON.parse(raw);

    //FFprobeの解析結果にエラー情報が含まれていないか確認する
    if (record(result).error !== undefined)
      throw new Error("動画の情報を読み取れませんでした");

    //取得した動画情報を呼び出し元へ返す
    return result;
  } finally {
    //処理終了後はFFmpegのログ監視を解除する
    ff.off("log", log);
  }
}

//ブラウザのvideo要素で動画を読み込めるか確認する
export async function checkPlayback(
  url: string,
  signal: AbortSignal,
): Promise<void> {
  //すでに中断されている場合は再生検査を開始しない
  signal.throwIfAborted();

  //動画の読み込み確認に使用するvideo要素を作成する
  const v = document.createElement("video");

  //動画データを事前に読み込む設定にする
  v.preload = "auto";

  //音声を出さずに動画の読み込みを確認する
  v.muted = true;

  //モバイルブラウザで画面内再生を許可する
  v.playsInline = true;

  try {
    //動画の読み込み成功・失敗・中断をPromiseで待つ
    await new Promise<void>((resolve, reject) => {
      //タイマーとイベント監視をすべて解除する
      const clean = () => {
        window.clearTimeout(timer);
        v.removeEventListener("loadeddata", ready);
        v.removeEventListener("error", failed);
        signal.removeEventListener("abort", abort);
      };

      //動画の再生データが読み込まれたら成功として終了する
      const ready = () => {
        clean();
        resolve();
      };

      //動画の読み込みに失敗したらエラーを返す
      const failed = () => {
        clean();
        reject(new Error("このブラウザーで動画を読み込めません"));
      };

      //中断の要求を受けたら読み込み待機を終了する
      const abort = () => {
        clean();
        reject(signal.reason);
      };

      //10秒以内に動画を読み込めなければ失敗とする
      const timer = window.setTimeout(failed, 10000);

      //動画の再生データが読み込まれたことを監視する
      v.addEventListener("loadeddata", ready, { once: true });

      //動画の読み込みエラーを監視する
      v.addEventListener("error", failed, { once: true });

      //AbortControllerからの中断の通知を監視する
      signal.addEventListener("abort", abort, { once: true });

      //video要素へ動画のURLを設定して読み込みを開始する
      v.src = url;
    });

    //動画の再生時間と映像の横幅が取得できているか確認する
    if (!Number.isFinite(v.duration) || v.duration <= 0 || !v.videoWidth)
      throw new Error("動画の表示時間を確認できません");
  } finally {
    //検査終了後はvideo要素から動画URLを取り除く
    v.removeAttribute("src");

    //video要素の読み込みを解除して不要なデータを解放する
    v.load();
  }
}

//端末から選択したMP4の形式・映像データ・ブラウザ再生を検証する
export async function probeLocalFile(
  file: File,
  signal: AbortSignal,
): Promise<MediaInfo> {
  //動画ファイルの容量が0バイトより大きく25MB以下か確認する
  if (file.size < 1 || file.size > MAX_BYTES)
    throw new Error("元動画は0バイトより大きく25MBまでです");

  //ファイル名の拡張子とMIMEタイプがMP4として許可されるか確認する
  if (
    !/\.mp4$/i.test(file.name) ||
    (file.type &&
      !["video/mp4", "application/octet-stream"].includes(file.type))
  ) {
    throw new Error("MP4ファイルを選択してください");
  }

  //FFmpegを最大90秒起動し、動画情報と冒頭の映像を検査する
  const info = await withEngine(signal, 90_000, async (ff) => {
    //選択した動画をFFmpegへ渡せるバイト配列に変換する
    const bytes = new Uint8Array(await file.arrayBuffer());

    //ファイル読み込み中に中断されていないか確認する
    signal.throwIfAborted();

    //FFmpeg内部の仮想ファイルシステムへMP4を書き込む
    await ff.writeFile("input.mp4", bytes);

    //FFprobeの結果を検証してMediaInfo型のデータを取得する
    const m = readProbe(await probe(ff, "input.mp4"), file.size);

    //映像フレームが実際に読み出されたかを記録する
    let frame = false;

    //FFmpegの進捗ログから1フレーム以上処理されたか確認する
    ff.on("log", ({ message }) => {
      if (/^frame=\s*[1-9]/.test(message)) frame = true;
    });

    //動画の冒頭1秒を読み出し、デコードできるか検査する
    const rc = await ff.exec([
      "-v",
      "error",
      "-xerror",
      "-threads",
      "1",
      ...inputOptions,
      "-progress",
      "pipe:1",
      "-i",
      "input.mp4",
      "-t",
      "1",
      "-map",
      "0:v:0",
      "-map",
      "0:a:0?",
      "-f",
      "null",
      "-",
    ]);

    //FFmpegが正常終了し、映像フレームを読み出せたか確認する
    if (rc !== 0 || !frame) throw new Error("動画の冒頭を読み出せませんでした");

    //検査済みの動画情報を返す
    return m;
  });

  //ブラウザ内で動画を読み込むための一時URLを作成する
  const url = URL.createObjectURL(file);

  try {
    //video要素で動画を読み込めるか確認する
    await checkPlayback(url, signal);

    //FFmpegとブラウザの検査を通過した動画情報を返す
    return info;
  } finally {
    //ブラウザでの検査終了後は一時URLを解放する
    URL.revokeObjectURL(url);
  }
}
