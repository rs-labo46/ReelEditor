//動画ファイルの情報
export type MediaInfo = {
  durationUs: number; //動画の再生時間 1秒が1000000マイクロ秒
  width: number;
  height: number;
  rotation: number;
  hasAudio: boolean; //音声が含まれているかどうか
  sizeBytes: number;
  fpsNum: number; //フレームレートの分子
  fpsDen: number; //フレームレートの分母
  videoOriginUs: number; //動画の映像トラックの開始時間に関する情報
  audioOffsetUs: number | null; //映像に対する音声の開始位置
  audioLayout: string; //音声の構成
  videoCodec: "h264"; //映像の圧縮方式
  audioCodec: "aac" | null; //音声の圧縮方式
  sampleAspectRatio: { num: number; den: number }; //SAR １ピクセルの横幅と縦幅の比率
};

//端末から選択した動画の素材
export type LocalSource = {
  localId: string;
  file: File;
  url: string; //動画をプレビューするためのURL
  info: MediaInfo;
};

//編集する動画の区間
export type Clip = {
  id: string;
  sourceId: string;
  startUs: number; //元の動画から切り出す開始位置
  endUs: number; //元動画から切り出す終了位置
  cropX: number; //9:16画面へ合わせる際の横方向の切り抜き
  cropY: number; //縦方向の切り抜き
};

//現在の編集内容全体
export type EditState = {
  sources: LocalSource[];
  clips: Clip[];
  revision: number;
  savedRevision: number | null;
};

//動画のプレビュー状態
export type PreviewState = {
  status: "stopped" | "loading" | "playing" | "paused" | "failed";
  positionUs: number;
  clipId: string | null;
  error: string | null;
};

//実行予定の操作
export type PendingAction = "save" | "export" | null;
