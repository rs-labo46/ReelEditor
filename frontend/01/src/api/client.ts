import useStore from "../store";
import type { Config, LoginInput, SignupInput, User } from "../types/auth";
import axiosApi from "./axios";

//扱えるデータの制限
type Json = Record<string, unknown>;
type Method = "GET" | "POST"; //Deleteだったらエラー
type Body = SignupInput | LoginInput;
type Session = { access: string; expiresAt: number; user: User }; //API認証に使用するAccess TokenとAccess Tokenの有効期限とログイン中のユーザー情報

//APIエラーを共通に
export class ApiError extends Error {
  public readonly status: number;
  public readonly code: string;
  public readonly requestId: string;
  constructor(status: number, code: string, message: string, requestId = "") {
    super(message);

    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.requestId = requestId;
  }
}

//ログイン情報の管理
const state: {
  session: Session | null; //ログイン中のAccess TokenとUser情報
  csrf: string;
  epoch: number; //ログイン状態が変更された時の番号
  channel: BroadcastChannel | null; //別タブとのログイン状態の連携
} = {
  session: null,
  csrf: "",
  epoch: 0,
  channel: null,
};

//API応答を検証
function object(value: unknown): Json {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new ApiError(
      503,
      "UNAVAILABLE",
      "サーバーから正しい応答を取得できませんでした",
    );
  }
  return value as Json;
}
function string(value: unknown): string {
  if (typeof value !== "string")
    throw new ApiError(503, "UNAVAILABLE", "応答の形式が不正です");
  return value;
}

//バックエンドから受け取ったデータが、想定した形式か
function user(value: unknown): User {
  const v = object(value);
  const id = string(v.id);
  if (!/^[1-9][0-9]*$/.test(id))
    throw new ApiError(503, "UNAVAILABLE", "利用者IDの形式が不正です");
  return { id, name: string(v.name), email: string(v.email) };
}

//別タブと認証状態を共有する
function setupChannel(): void {
  if (state.channel !== null || typeof BroadcastChannel === "undefined") return;

  state.channel = new BroadcastChannel("reeleditor-auth");

  state.channel.addEventListener("message", (event: MessageEvent<unknown>) => {
    if (event.data === "invalidate") clear(false);
  });
}

//clearの処理:epochを増やすことで、以前のログイン状態で開始した非同期処理の結果を受け入れないように。通知するだけではバックエンドのトークンは失効しない。それはバックで。
function clear(broadcast: boolean): void {
  state.epoch++;
  state.session = null;
  state.csrf = "";
  useStore.getState().setUser(null);
  if (broadcast) state.channel?.postMessage("invalidate");
}

//ログイン成功時の認証情報を保持
// 1. バックエンドの認証応答が正しいか検証。
// 2. Access Tokenをメモリ上に保存。
// 3. ユーザー情報をZustandへ反映。
function accept(raw: unknown, epoch: number): User {
  const v = object(raw);
  const u = user(v.user);
  const access = string(v.access_token);
  if (
    v.token_type !== "Bearer" ||
    v.expires_in !== 900 ||
    !/^[A-Za-z0-9_.-]{40,4096}$/.test(access)
  ) {
    throw new ApiError(503, "UNAVAILABLE", "認証の応答が不正です");
  }
  if (epoch !== state.epoch)
    throw new ApiError(409, "SESSION_CHANGED", "ログイン状態が変更されました");

  // 認証結果を検証
  state.session = { access, expiresAt: Date.now() + 900_000, user: u };
  useStore.getState().setUser(u);
  return u;
}

//同時に認証処理を実行させない
async function locked<T>(action: () => Promise<T>): Promise<T> {
  //navigator.locksは、同じ名前のロックを使う処理を順番に実行するブラウザの機能
  if (typeof navigator === "undefined" || !navigator.locks) {
    throw new ApiError(
      503,
      "LOCK_UNAVAILABLE",
      "安全なログイン更新機能に対応したChromeまたはEdgeを使用してください",
    );
  }
  return navigator.locks.request("reeleditor-auth", action);
}

//AxiosによるAPI通信を共通化
async function http(
  path: string,
  method: Method,
  body?: Body,
  access = "",
  csrf = "",
): Promise<unknown> {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (body) headers["Content-Type"] = "application/json";
  if (access) headers.Authorization = "Bearer " + access;
  if (csrf) headers["X-CSRF-Token"] = csrf;
  let response;
  try {
    response = await axiosApi.request<string>({
      url: path,
      method,
      data: body,
      headers,
    });
  } catch {
    throw new ApiError(503, "UNAVAILABLE", "APIへ接続できませんでした");
  }
  if (response.status === 204) return null;
  let data: unknown;
  try {
    data = JSON.parse(response.data);
  } catch {
    throw new ApiError(503, "UNAVAILABLE", "API応答を解析できませんでした");
  }
  if (response.status < 200 || response.status >= 300) {
    const v = object(data);
    throw new ApiError(
      response.status,
      typeof v.code === "string" ? v.code : "UNAVAILABLE",
      typeof v.message === "string" ? v.message : "処理に失敗しました",
      typeof v.request_id === "string" ? v.request_id : "",
    );
  }
  return data;
}

//CSRFトークンを取得する。
async function csrf(): Promise<string> {
  if (state.csrf) return state.csrf;
  const epoch = state.epoch;
  const token = string(object(await http("/csrf", "GET")).csrf_token);
  if (!/^[A-Za-z0-9_-]{43}$/.test(token))
    throw new ApiError(503, "UNAVAILABLE", "CSRF確認値が不正です");
  if (epoch !== state.epoch)
    throw new ApiError(409, "SESSION_CHANGED", "ログイン状態が変更されました");
  state.csrf = token;
  return token;
}

//アプリの情報を取得
export async function getConfig(): Promise<Config> {
  const v = object(await http("/config", "GET"));
  if (v.stage !== 1 || typeof v.min_password !== "number")
    throw new ApiError(503, "UNAVAILABLE", "構成を確認できません");
  return { stage: 1, min_password: v.min_password };
}

//会員登録
export async function signUp(input: SignupInput): Promise<User> {
  return locked(async () => {
    const token = await csrf();
    const epoch = state.epoch;
    const result = await http("/signup", "POST", input, "", token);
    const u = accept(result, epoch);
    setupChannel();
    state.channel?.postMessage("invalidate");
    return u;
  });
}

//ログイン
export async function login(input: LoginInput): Promise<User> {
  return locked(async () => {
    const token = await csrf();
    const epoch = state.epoch;
    const result = await http("/login", "POST", input, "", token);
    const u = accept(result, epoch);
    setupChannel();
    state.channel?.postMessage("invalidate");
    return u;
  });
}

//ログイン状態を復元
export async function restore(): Promise<User | null> {
  setupChannel();
  return locked(async () => {
    try {
      const token = await csrf();
      const epoch = state.epoch;
      const result = await http("/refresh", "POST", undefined, "", token);
      return accept(result, epoch);
    } catch (e: unknown) {
      if (
        e instanceof ApiError &&
        (e.status === 401 || e.code === "SESSION_CHANGED")
      ) {
        clear(false);
        return null;
      }
      throw e;
    }
  });
}

//ログイン中のユーザー情報を取得する。
export async function me(): Promise<User> {
  const session = state.session;
  if (!session) throw new ApiError(401, "AUTH_REQUIRED", "ログインが必要です");
  const v = object(await http("/me", "GET", undefined, session.access));
  return user(v.user);
}

//ログアウトAPIを実行する。
export async function logoutAll(): Promise<void> {
  await locked(async () => {
    const session = state.session;
    if (!session) return;
    const token = await csrf();
    await http("/logout", "POST", undefined, session.access, token);
    clear(true);
  });
}
