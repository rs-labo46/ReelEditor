//仮のユーザー情報の型
export type MockUser = {
  id: string;
  name: string;
  email: string;
};

//動画編集のプロジェクト情報の型
export type MockProject = {
  id: string;
  name: string;
  version: string;
  created_at: string;
  updated_at: string;
  source_count: number; //プロジェクトに登録されている動画の素材数
  clip_count: number; //編集クリップ数
};

//動画の素材情報の型
export type MockSource = {
  id: string;
  projectID: string;
  original_name: string;
  state:
    | "reserved" //登録枠が確保された状態
    | "validating" //動画の形式や内容を検証中
    | "ready" //検証が完了して利用できる状態
    | "invalid" //検証で不正と判定された状態
    | "expired"; //アップロードの有効期限が切れた状態

  size_bytes: number | null; //動画のファイルサイズ
  duration_us: number | null; //動画の再生時間1秒 = 1,000,000マイクロ秒
  width: number | null;
  height: number | null;
  rotation: number | null;

  fps_num: number | null; //フレームレート（1秒間の画像枚数）の分子・分母
  fps_den: number | null;

  //ピクセルの縦横比（SAR）の分子・分母
  //sar_num / sar_den で計算
  sar_num: number | null;
  sar_den: number | null;

  video_origin_us: number | null; //動画の開始位置に関する時間の情報

  audio_offset_us: number | null; //音声と動画の開始位置のずれ

  //音声チャンネルの構成
  //例えばmono（モノラル）、stereo（ステレオ）
  audio_layout: string | null;

  has_audio: boolean | null; //動画素材に音声が含まれているか

  //ファイル内容から計算するSHA-256ハッシュ値。同じファイルか確認する際などに利用
  sha256: string | null;

  failure_code: string | null; //検証失敗時の理由

  delete_pending: boolean; //削除待ちの素材かどうか

  upload_expires_at: string | null; //アップロードを完了できる期限

  //動画ファイルの実データをメモリ上で保持する
  //ArrayBufferはバイナリデータを扱うための型
  bytes: ArrayBuffer | null;
};

//編集タイムラインに配置する動画区間の情報
export type MockClip = {
  source_id: string;
  start_us: number; //切り出す開始位置と終了位置（マイクロ秒）
  end_us: number;
  crop_x: number; //縦画面へ合わせる際の切り抜き位置
  crop_y: number;
};

const SESSION_KEY = "reeleditor-mock-user";

// ページ更新前に保存した仮のユーザー情報を取得する
function loadMockUser(): MockUser | null {
  try {
    // ブラウザに保存された情報を取得
    const raw = sessionStorage.getItem(SESSION_KEY);

    // 保存情報がなければ未ログイン
    if (!raw) return null;

    // JSON文字列をオブジェクトへ変換
    const value: unknown = JSON.parse(raw);

    // オブジェクトか確認する
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      return null;
    }

    const v = value as Record<string, unknown>;

    // User情報の型を確認する
    if (
      typeof v.id !== "string" ||
      !/^[1-9][0-9]*$/.test(v.id) ||
      typeof v.name !== "string" ||
      typeof v.email !== "string"
    ) {
      return null;
    }

    return {
      id: v.id,
      name: v.name,
      email: v.email,
    };
  } catch {
    return null;
  }
}

// ページ更新前のログイン情報を読み込む
const restoredUser = loadMockUser();

//バックエンドの代わりに利用する仮データの保管場所。ReactからAPIを呼び出したとき、MSWのハンドラーがこのデータを参照・更新する。
export const mock = {
  user: restoredUser, //現在のユーザー情報

  //仮のアカウント一覧
  accounts: new Map<string, { user: MockUser; password: string }>([
    [
      "demo@example.com",
      {
        user: {
          id: "1",
          name: "デモ利用者",
          email: "demo@example.com",
        },
        password: "password123",
      },
    ],
  ]),

  active: restoredUser !== null, //ログイン状態などを示すフラグ
  deleting: false, //アカウント削除の処理中かどうか

  access: "m".repeat(60), //テスト用の固定Access Token
  csrf: "c".repeat(43), //テスト用の固定CSRF Token
  nextUser: 2, //次に作成するユーザーのIDに使用する番号
  nextProject: 1, //次に作成するプロジェクトの番号
  nextSource: 1, //次に作成する動画素材の番号

  //プロジェクト一覧を保存する
  projects: new Map<string, MockProject>(),

  //プロジェクト作成などの重複リクエストを判定するためのキー情報
  createKeys: new Map<string, string>(),

  //動画素材一覧を保存する
  sources: new Map<string, MockSource>(),

  //プロジェクトごとの編集クリップ一覧
  clips: new Map<string, MockClip[]>(),
};

// ログイン状態をブラウザに保存・削除する
export function saveMockSession(): void {
  // ログイン済みの場合
  if (mock.active && mock.user) {
    // 仮のユーザー情報だけを保存する
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(mock.user));
  } else {
    // ログアウト時は保存情報を削除する
    sessionStorage.removeItem(SESSION_KEY);
  }
}

//指定されたプロジェクトの現在の素材数・クリップ数を計算する。
export function projectView(p: MockProject): MockProject {
  return {
    ...p, //元のプロジェクト情報をコピー

    //登録済みの動画素材をすべて取得。指定したプロジェクトの素材だけに絞り、削除待ちの素材は除外する。残った素材の数を数える
    source_count: [...mock.sources.values()].filter(
      (s) => s.projectID === p.id && !s.delete_pending,
    ).length,

    //指定したプロジェクトのクリップ一覧を取得し、存在しない場合は空配列を使用する。クリップ数を取得する
    clip_count: (mock.clips.get(p.id) ?? []).length,
  };
}

//使用するMSWモックの開発段階を取得する。
export function mockStage(): number {
  const stage = Number(import.meta.env.VITE_MOCK_STAGE ?? "1");

  //整数かつ1〜6の範囲内なら、その値を返す
  return Number.isInteger(stage) && stage >= 1 && stage <= 6 ? stage : 1;
}
