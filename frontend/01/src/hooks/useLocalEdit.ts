import { useEffect, useRef, useState } from "react";
import { addSource, MAX_BYTES } from "../editor/edit";
import type { EditState } from "../editor/types";
import { probeLocalFile } from "../media/probe";
import { useEditStore } from "../store/edit";

//ゲストの動画編集を管理し、動画の追加・検査・編集状態の更新を画面から使えるようにする
export default function useLocalEdit() {
  //Zustandから現在の動画編集状態を取得
  const edit = useEditStore((s) => s.edit);

  //Zustandに新しい動画編集状態を保存する関数を取得
  const replaceEdit = useEditStore((s) => s.replaceEdit);

  //動画ファイルを読み込み中かどうかをStateで管理
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  //動画の読み込み処理が重複して実行されないようにする
  const busyRef = useRef(false);

  //実行中の動画検査を中断するためのAbortControllerを保持
  const op = useRef<AbortController | null>(null);

  //画面から離れる際に、実行中の動画検査を中断する
  useEffect(
    () => () => {
      op.current?.abort();
    },
    [],
  );

  //編集関数を実行し、その結果をZustandに反映
  const apply = (fn: (prev: EditState) => EditState): void => {
    //動画の読み込み中は編集処理を実行しない
    if (busyRef.current) return;

    try {
      //Zustandから最新の編集状態を取得
      const previous = useEditStore.getState().edit;

      //編集関数の結果を新しい編集状態として保存
      replaceEdit(fn(previous));
      setError("");
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : "編集に失敗しました");
    }
  };

  //選択された動画を順番に検査し、条件を満たすものだけ編集状態に追加する
  const addFiles = async (files: File[]): Promise<void> => {
    //すでに動画を読み込み中なら、追加の処理を実行しない
    if (busyRef.current) return;
    busyRef.current = true; //重複実行を防ぐため、処理中フラグを立てる
    setBusy(true); //画面に読み込み中の状態を反映
    setError("");

    const abort = new AbortController(); //動画検査を途中で中断できるようにする
    op.current = abort; //現在実行中の中断処理を保持する

    const failures: string[] = []; //追加に失敗したファイルのエラーメッセージを保存する

    try {
      for (const file of files) {
        //選択された動画ファイルを1本ずつ処理する
        abort.signal.throwIfAborted(); //中断が要求されていた場合は処理を停止する
        const current = useEditStore.getState().edit; //Zustandから最新の編集状態を取得

        //元動画がすでに3本ある場合は追加しない
        if (current.sources.length >= 3) {
          failures.push(file.name + "：最大3本です");
          continue;
        }

        //動画が空ファイル、または25MBを超える場合は追加しない
        if (file.size < 1 || file.size > MAX_BYTES) {
          failures.push(file.name + "：25MB以下で選択してください");
          continue;
        }

        try {
          //動画の形式・再生時間・解像度などを非同期で検査する
          const info = await probeLocalFile(file, abort.signal);

          //動画検査中に中断された場合は追加処理を行わない
          abort.signal.throwIfAborted();

          //選択した動画をブラウザ内で再生するためのURLを作成する
          const url = URL.createObjectURL(file);

          try {
            //動画に一意のID・URL・検査結果を設定して編集状態へ追加する
            const next = addSource(useEditStore.getState().edit, {
              localId: crypto.randomUUID(),
              file,
              url,
              info,
            });

            //新しい動画が追加された編集状態をZustandへ保存する
            replaceEdit(next);
          } catch (cause) {
            //動画追加に失敗した場合は作成したURLを解放する
            URL.revokeObjectURL(url);
            throw cause;
          }
        } catch (cause: unknown) {
          //中断された場合は処理を停止し、通常の検査エラーとは区別する
          abort.signal.throwIfAborted();

          //検査に失敗した動画の名前と理由を記録
          failures.push(
            file.name +
              "：" +
              (cause instanceof Error ? cause.message : "検査失敗"),
          );
        }
      }
    } catch (cause: unknown) {
      //中断以外の予期しないエラー
      if (!abort.signal.aborted) {
        failures.push(
          cause instanceof Error ? cause.message : "処理に失敗しました",
        );
      }
    } finally {
      //現在の処理が終了した場合は中断用の参照を解除する
      if (op.current === abort) op.current = null;
      busyRef.current = false; //動画読み込みの重複実行防止フラグを解除する

      setBusy(false); //画面の読み込み中表示を終了する
    }

    //追加できなかった動画があれば、理由を改行して画面に表示する
    if (failures.length) setError(failures.join("\n"));
  };

  //編集画面から使用する状態と操作関数をまとめて返す
  return {
    edit, //現在の動画編集状態

    apply, //切り出し・分割・削除・並べ替えなどの編集処理を適用する関数

    //動画の追加処理を開始し、Promiseを呼び出し側には返さない関数
    addFiles: (files: File[]) => {
      void addFiles(files);
    },
    busy, //動画の読み込み中かどうか
    error, //編集や動画検査のエラーメッセージ
    cancel: () => op.current?.abort(), //実行中の動画検査を中断する関数
    //編集状態全体を新しい状態に置き換える関数
    replaceEdit,
  };
}
