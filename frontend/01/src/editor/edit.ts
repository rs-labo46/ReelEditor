import type { Clip, EditState, LocalSource } from "./types";

//動画の場面を分割する。1つのクリップを指定した時刻で2つに分割する
export function splitClip(
  state: EditState, //現在の編集状態
  clipId: string,
  atUs: number, //分割する位置（マイクロ秒）
  newId: string,
): EditState {
  //findIndexで対象のクリップが何番目にあるか取得する。見つからない場合は-1になる
  const index = state.clips.findIndex((clip) => clip.id === clipId);

  //対象クリップの情報を取得
  const clip = state.clips[index];

  //分割できる条件を確認する
  if (
    !clip || //クリップが存在しない
    state.clips.length >= 3 || //最大3場面を超えている
    !Number.isSafeInteger(atUs) || //分割位置が安全な整数ではない
    atUs <= clip.startUs || //開始位置以前では分割できない
    atUs >= clip.endUs || //終了位置以降では分割できない
    !newId || //新しいIDが空文字
    state.clips.some((item) => item.id === newId) || //新しいIDが既存IDと重複
    !Number.isSafeInteger(state.revision + 1) //編集番号の上限を超える
  ) {
    throw new Error("場面を分けられない");
  }

  //元のstateを変更せず、新しいEditStateを返す
  return {
    ...state, //元の編集状態をコピーする

    //編集が行われたので版番号を1増やす
    revision: state.revision + 1,

    //分割したクリップを反映した新しい配列
    clips: [
      //分割対象より前のクリップをそのまま残す
      ...state.clips.slice(0, index),

      //分割後の前半
      //IDと開始位置を維持し、終了位置だけ変更する
      { ...clip, endUs: atUs },

      //分割後の後半
      //新しいIDを設定し、開始位置を分割時刻にする
      { ...clip, id: newId, startUs: atUs },

      //分割対象より後ろのクリップをそのまま残す
      ...state.clips.slice(index + 1),
    ],
  };
}

//2.編集開始時の初期状態

export const EMPTY: EditState = {
  sources: [], //元動画はまだ選択されていない
  clips: [], //編集クリップはまだ存在しない
  revision: 0, //編集版番号の初期値
  savedRevision: null, //まだ保存されていない
};

//3.動画編集で使用する制限値

//動画1本あたりの最大ファイル容量：25MB
export const MAX_BYTES = 25_000_000;

//完成動画の最短時間：1秒
export const MIN_US = 1_000_000;

//完成動画の最長時間：15秒
export const MAX_US = 15_000_000;

//4.編集状態を更新する共通関数

//この関数は他の編集関数の内部で使用する
//exportしていないため、このファイルの外からは呼び出せない
function change(
  s: EditState, //現在の編集状態
  patch: Partial<EditState>, //変更したいプロパティだけを持つオブジェクト
): EditState {
  //revisionを1増やしても安全な整数か確認する
  if (!Number.isSafeInteger(s.revision + 1)) {
    throw new Error("編集画面を開き直してください");
  }

  //元のStateを直接書き換えず、新しいStateを返す
  return {
    ...s, //元の編集状態をコピー
    ...patch, //変更内容を上書き
    revision: s.revision + 1, //編集版番号を1増やす
  };
}

//5.addSource：元動画を追加する

//端末から選択した動画素材を編集状態に追加する
export function addSource(
  s: EditState, //現在の編集状態
  src: LocalSource, //新しく追加する動画素材
): EditState {
  //動画の追加条件を確認する
  if (
    s.sources.length >= 3 || //元動画は最大3本
    s.sources.some((x) => x.localId === src.localId) || //同じIDの動画が存在する
    src.file.size < 1 || //空ファイルは許可しない
    src.file.size > MAX_BYTES || //1本25MBを超えている
    //既存動画の容量と追加動画の容量を合計する
    //reduceの第2引数は集計の初期値
    //ここでは新しい動画の容量から計算を開始する
    s.sources.reduce((n, x) => n + x.file.size, src.file.size) > 3 * MAX_BYTES //合計75MBを超える
  ) {
    throw new Error("元動画は最大3本、1本25MBまでです");
  }

  //元のsources配列は変更せず、
  //新しい動画を末尾に追加した配列を作成する
  return change(s, {
    sources: [...s.sources, src],
  });
}

//6.元動画を削除する

export function removeLocalSource(
  s: EditState,
  sourceId: string, //削除対象の元動画ID
): EditState {
  //some()で削除対象が存在するか確認する
  if (!s.sources.some((x) => x.localId === sourceId)) {
    throw new Error("元動画が見つかりません");
  }

  return change(s, {
    //filter()で指定した動画以外を残す
    sources: s.sources.filter((x) => x.localId !== sourceId),

    //削除する元動画を使用しているクリップも削除する
    //存在しない動画を参照するクリップを残さないため
    clips: s.clips.filter((c) => c.sourceId !== sourceId),
  });
}

//7.タイムラインにクリップを追加する

//LocalSourceは元動画そのもの
//Clipは元動画の使用区間を表す編集データ
export function addClip(
  s: EditState,
  sourceId: string, //使用する元動画のID
  id: string, //作成するクリップのID
): EditState {
  //使用する元動画を探す
  const src = s.sources.find((x) => x.localId === sourceId);

  //追加条件を確認する
  if (
    !src || //元動画が存在しない
    s.clips.length >= 3 || //最大3場面
    !id || //クリップIDが空
    s.clips.some((c) => c.id === id) //IDが重複している
  ) {
    throw new Error("場面を追加できません。最大3場面です");
  }

  // 編集区間は元動画の再生時間内でなければならない。
  if (!Number.isSafeInteger(src.info.durationUs) || src.info.durationUs <= 0) {
    throw new Error("元動画の再生時間が不正です");
  }

  return change(s, {
    clips: [
      ...s.clips, //既存のクリップを維持する

      //新しいクリップを追加する
      {
        id, //クリップ自身のID
        sourceId, //使用する元動画のID
        startUs: 0, //元動画の先頭から使用
        endUs: src.info.durationUs, //元動画の最後まで使用
        cropX: 5000, //横方向の切り抜き位置：中央
        cropY: 5000, //縦方向の切り抜き位置：中央
      },
    ],
  });
}

//8.クリップの内容を検証する

//編集されたクリップが元動画の範囲内か確認する
//条件をすべて満たすとtrue、満たさなければfalse
export function validClip(
  c: Clip, //検証するクリップ
  src: LocalSource | undefined, //対応する元動画
): boolean {
  return (
    !!src && //元動画が存在する
    src.localId === c.sourceId && //参照先IDが一致する
    //開始・終了位置が安全な整数である
    Number.isSafeInteger(c.startUs) &&
    Number.isSafeInteger(c.endUs) &&
    //開始位置は0以上
    c.startUs >= 0 &&
    //開始位置は終了位置より前
    c.startUs < c.endUs &&
    //元動画の再生時間を超えない
    c.endUs <= src.info.durationUs &&
    //cropX、cropYが0〜10000の整数である
    [c.cropX, c.cropY].every((n) => Number.isInteger(n) && n >= 0 && n <= 10000)
  );
}

//9.クリップの編集情報を更新する

export function updateClip(
  s: EditState,
  id: string,

  //Clip型から更新を許可する4項目だけを取り出す
  //idやsourceIdはこの関数では変更しない
  patch: Pick<Clip, "startUs" | "endUs" | "cropX" | "cropY">,
): EditState {
  //更新対象のクリップを探す
  const c = s.clips.find((x) => x.id === id);

  if (!c) {
    throw new Error("場面が見つかりません");
  }

  //現在のクリップに変更内容を反映する
  const next = { ...c, ...patch };

  //更新後のデータが正しいか検証する
  if (
    !validClip(
      next,
      s.sources.find((x) => x.localId === c.sourceId),
    )
  ) {
    throw new Error("時刻または位置が元動画の範囲外です");
  }

  //変更前と変更後が同じなら更新する必要がない
  if (
    c.startUs === next.startUs &&
    c.endUs === next.endUs &&
    c.cropX === next.cropX &&
    c.cropY === next.cropY
  ) {
    return s;
  }

  //map()で対象のクリップだけを変更する
  //他のクリップはそのまま残す
  return change(s, {
    clips: s.clips.map((x) => (x.id === id ? next : x)),
  });
}

//動画の切り出し範囲を変更する

export function trimClip(
  s: EditState,
  id: string, //変更対象のクリップID
  startUs: number, //新しい開始位置
  endUs: number, //新しい終了位置
): EditState {
  //対象クリップを取得する
  const c = s.clips.find((x) => x.id === id);

  if (!c) {
    throw new Error("場面が見つかりません");
  }

  //切り抜き位置は維持し、時間だけ更新する
  //updateClip()に検証と状態更新を任せる
  return updateClip(s, id, {
    startUs,
    endUs,
    cropX: c.cropX,
    cropY: c.cropY,
  });
}

//動画の切り抜き位置を変更する

export function setCrop(
  s: EditState,
  id: string, //編集するクリップID
  cropX: number, //横方向の切り抜き位置
  cropY: number, //縦方向の切り抜き位置
): EditState {
  const c = s.clips.find((x) => x.id === id);

  if (!c) {
    throw new Error("場面が見つかりません");
  }

  //時間は維持し、切り抜き位置だけ変更する
  return updateClip(s, id, {
    startUs: c.startUs,
    endUs: c.endUs,
    cropX,
    cropY,
  });
}

//removeClip：不要な場面を削除する

export function removeClip(s: EditState, id: string): EditState {
  //指定したクリップが存在するか確認する
  if (!s.clips.some((x) => x.id === id)) {
    throw new Error("場面が見つかりません");
  }

  //filter()で削除対象以外を残す
  return change(s, {
    clips: s.clips.filter((x) => x.id !== id),
  });
}

//クリップを並べ替える

export function moveClip(
  s: EditState,
  id: string, //移動するクリップID
  to: number, //移動先の配列インデックス
): EditState {
  //現在のクリップ位置を取得する
  const from = s.clips.findIndex((c) => c.id === id);

  //移動対象のクリップを取得する
  const c = s.clips[from];

  //移動できる条件を確認する
  if (
    !c ||
    !Number.isInteger(to) || //移動先が整数でない
    to < 0 || //移動先が負数
    to >= s.clips.length //配列の範囲外
  ) {
    throw new Error("並べ替え先が正しくありません");
  }

  //移動先が現在の位置と同じなら変更しない
  if (to === from) return s;

  //移動するクリップを一旦除外する
  const clips = s.clips.filter((x) => x.id !== id);

  //splice()で指定位置にクリップを挿入する
  //第2引数の0は、ここでは既存要素を削除しない意味
  clips.splice(to, 0, c);

  //並べ替えた配列を新しいStateへ反映する
  return change(s, { clips });
}

//totalUs：完成動画の合計時間を計算する

export function totalUs(clips: readonly Clip[]): number {
  //各クリップの長さを合計する
  //クリップの長さ = endUs - startUs
  //reduceの初期値は0
  return clips.reduce((n, c) => n + c.endUs - c.startUs, 0);
}

//checkEdit：編集結果の全体検証

export function checkEdit(
  s: EditState,
  emptyOK: boolean, //クリップ0件を許可するか
): void {
  //クリップがなくてもよい場合は検証終了
  if (emptyOK && s.clips.length === 0) return;

  //完成動画の合計時間を取得する
  const n = totalUs(s.clips);

  //最大3場面、合計1〜15秒に収まっているか確認する
  if (s.clips.length > 3 || n < MIN_US || n > MAX_US) {
    throw new Error("場面の合計を1〜15秒にしてください");
  }

  //すべてのクリップを確認し、
  //1件でも不正なデータがあればエラーにする
  if (
    s.clips.some(
      (c) =>
        !validClip(
          c,

          //クリップが参照する元動画を取得する
          s.sources.find((x) => x.localId === c.sourceId),
        ),
    )
  ) {
    throw new Error("場面の元動画、範囲、位置を確認してください");
  }

  //戻り値はvoid
  //問題なければ何も返さず正常終了する
}

//マイクロ秒を秒に変換する

export function seconds(us: number): string {
  if (!Number.isSafeInteger(us) || us < 0) {
    throw new Error("時刻が不正です");
  }
  //1秒 = 1,000,000マイクロ秒
  //toFixed(6)で小数点以下6桁にする
  //replaceで末尾の余分な0と小数点を削除する
  //
  //例：1_250_000 → "1.25"
  //例：10_000_000 → "10"
  return (us / 1_000_000).toFixed(6).replace(/0+$/, "").replace(/\.$/, "");
}

//秒をマイクロ秒に変換する

export function toUs(s: string): number {
  //正規表現で秒数の入力形式を確認する
  //整数部分は1〜2桁
  //小数点以下は最大6桁
  //
  //許可する例："1"、"1.25"、"12.123456"
  //不許可の例："abc"、"-1"、"1.1234567"
  if (!/^\d{1,2}(\.\d{1,6})?$/.test(s)) {
    throw new Error("時刻を秒で入力してください。例：1.25");
  }

  //秒数を数値に変換して1,000,000倍する
  //Math.round()で整数のマイクロ秒に丸める
  //
  //例："1.25" → 1_250_000
  return Math.round(Number(s) * 1_000_000);
}

// 18.9:16の切り抜き領域を計算する

//動画を720×1280の縦画面に合わせるため、
//拡大後のサイズと切り抜き開始位置を計算する
export function cropRect(
  width: number, //元動画の横幅
  height: number, //元動画の縦幅
  rotation: number, //回転角度
  sar: number, //ピクセルの横幅と縦幅の比率
  x: number, //横方向の切り抜き位置（0〜10000を想定）
  y: number, //縦方向の切り抜き位置（0〜10000を想定）
) {
  // 入力動画のメタデータと切り抜き位置を実行前に検証する。
  // 不正な値があるとInfinityやNaNが計算結果に混入するため。
  if (
    !Number.isSafeInteger(width) ||
    !Number.isSafeInteger(height) ||
    width <= 0 ||
    height <= 0 ||
    ![0, 90, 180, 270].includes(rotation) ||
    !Number.isFinite(sar) ||
    sar <= 0 ||
    ![x, y].every((n) => Number.isInteger(n) && n >= 0 && n <= 10_000)
  ) {
    throw new Error("動画のサイズまたは切り抜き位置が不正です");
  }

  //90度または270度の横倒し状態か判定する
  const sideways = rotation === 90 || rotation === 270;

  //回転とSARを考慮した表示上の幅と高さを求める
  const w = sideways ? height : width * sar;
  const h = sideways ? width * sar : height;

  //720×1280を隙間なく埋めるための拡大率
  //Math.max()で横・縦のうち大きい倍率を採用する
  const scale = Math.max(720 / w, 1280 / h);

  //拡大後の動画全体の横幅と縦幅
  //Math.max()で出力画面より小さくならないようにする
  const fullW = Math.max(720, Math.round(w * scale));
  const fullH = Math.max(1280, Math.round(h * scale));

  return {
    fullW, //拡大後の動画全体の横幅
    fullH, //拡大後の動画全体の縦幅

    //出力画面からはみ出した部分について、
    //横方向のどこを表示するか計算する
    x: Math.round(((fullW - 720) * x) / 10000),

    //縦方向のどこを表示するか計算する
    y: Math.round(((fullH - 1280) * y) / 10000),

    //動画を何倍に拡大するか
    scale,
  };
}
