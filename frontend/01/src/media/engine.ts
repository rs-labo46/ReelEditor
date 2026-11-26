import { FFmpeg } from "@ffmpeg/ffmpeg";
import coreURL from "@ffmpeg/core?url";
import wasmURL from "@ffmpeg/core/wasm?url";

//FFmpegを起動し、中断や制限時間を監視しながら動画処理を実行する
export async function withEngine<T>(
  signal: AbortSignal, //処理の中断を通知する
  maxMs: number, //処理を許可する最大時間（ミリ秒）
  task: (ff: FFmpeg) => Promise<T>, //FFmpegを使用して実行する処理
): Promise<T> {
  //すでに中断されている場合は処理を開始しない
  signal.throwIfAborted();

  //動画処理に使用するFFmpegのインスタンスを作成する
  const ff = new FFmpeg();

  //中断やタイムアウト時にPromiseを失敗させる関数を保持する
  let rejectStop: (err: Error) => void = () => {};

  //中断やタイムアウトが発生するまで待機するPromiseを作成する
  const stop = new Promise<never>((_, reject) => {
    //外部からstopを失敗させられるようにrejectを保存
    rejectStop = reject;
  });

  //中断されたときにPromiseを失敗させ、FFmpegを終了する
  const cancel = () => {
    //中断を表すAbortErrorを発生させる
    rejectStop(new DOMException("処理を中止しました", "AbortError"));

    //実行中のFFmpegを終了する
    ff.terminate();
  };

  //指定時間を超えた場合に動画処理を強制終了する
  const timeout = window.setTimeout(() => {
    //制限時間超過のエラーを発生させる
    rejectStop(new Error("動画の処理が制限時間を超えました"));

    //時間超過したFFmpegを終了する
    ff.terminate();
  }, maxMs);

  //AbortControllerから中断通知を受け取れるようにする
  signal.addEventListener("abort", cancel, { once: true });

  try {
    //動画処理と中断監視を同時に開始し、先に完了した結果を採用
    return await Promise.race([
      stop,

      //FFmpegの読み込みと動画処理を非同期で実行する
      (async () => {
        //FFmpegの実行ファイルとWebAssemblyを読み込む
        await ff.load({ coreURL, wasmURL });

        //読み込み中に中断されていないか再確認する
        signal.throwIfAborted();

        //呼び出し元から受け取った動画処理を実行する
        return task(ff);
      })(),
    ]);
  } finally {
    //動画処理が終了したらタイムアウト監視を解除
    window.clearTimeout(timeout);

    //不要になった中断イベントの監視を解除
    signal.removeEventListener("abort", cancel);

    //成功・失敗に関係なくFFmpegを終了する
    ff.terminate();
  }
}
