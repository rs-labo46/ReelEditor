import { http, HttpResponse } from "msw/http";
import { mock, saveMockSession } from "./state";
import { failure, input, scenario } from "./errors";

//認証成功時のレスポンスを生成
function authView() {
  return {
    access_token: mock.access, //テスト用のAccess Token
    token_type: "Bearer", //JWTをBearer方式で送信
    expires_in: 900, //Access Tokenの有効期間(15分）
    user: mock.user, //現在ログインしているユーザー情報
  };
}

//Access Tokenを確認する
function authorized(request: Request): boolean {
  //次の3つをすべて満たせばtrue
  return (
    mock.active &&
    !mock.deleting &&
    request.headers.get("authorization") === `Bearer ${mock.access}`
  );
}

//CSRF Tokenを確認
function allowed(request: Request): boolean {
  //リクエストヘッダーからCSRF Tokenを取得し、モックに保存された値と一致するか確認する
  return request.headers.get("x-csrf-token") === mock.csrf;
}

//認証APIのモック処理をまとめる
export const authHandlers = [
  //GET /api/csrf CSRF Tokenを取得する
  http.get("/api/csrf", () =>
    //モックのCSRF TokenをJSON形式で返す
    HttpResponse.json({
      csrf_token: mock.csrf,
    }),
  ),

  //POST /api/signup 会員登録 + 自動ログイン
  http.post("/api/signup", async ({ request }) => {
    //CSRF Tokenが一致しなければ403を返す
    if (!allowed(request)) {
      return failure(403, "CSRF_INVALID", "CSRF確認値が一致しません");
    }

    //テスト条件がrate-429なら操作回数制限を.
    if (scenario() === "rate-429") {
      return failure(429, "RATE_LIMITED", "操作回数が上限です");
    }

    //テスト条件がserver-503ならサーバー障害を再現。
    if (scenario() === "server-503") {
      return failure(503, "UNAVAILABLE", "仮の通信障害です");
    }

    //input()でオブジェクト形式か確認する。送信されたJSONを読み取り、JSON解析に失敗した場合はnullを使用する
    const b = input(await request.json().catch(() => null));

    //会員登録データの形式を確認
    if (
      !b ||
      typeof b.name !== "string" ||
      typeof b.email !== "string" ||
      typeof b.password !== "string" ||
      //名前が空文字でない
      b.name.trim().length === 0 ||
      //名前が50文字を超えていない
      b.name.trim().length > 50 ||
      //パスワードが8文字以上
      b.password.length < 8
    ) {
      return failure(400, "INVALID_INPUT", "登録情報を確認してください");
    }

    //メールアドレスの前後の空白を削除し、小文字に統一する
    const email = b.email.trim().toLowerCase();

    //メールアドレスの形式を確認
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return failure(400, "INVALID_INPUT", "メールの形式が不正です");
    }

    //同じメールアドレスがすでに登録されているか確認
    if (mock.accounts.has(email)) {
      return failure(409, "EMAIL_USED", "このメールは登録済みです");
    }

    //新しいユーザーを作成する。nextUser++で連番を割り当てる
    const user = {
      id: String(mock.nextUser++),
      name: b.name.trim(),
      email,
    };

    //仮のアカウント一覧（Map）に保存する。※モックなのでパスワードを平文で保持している
    mock.accounts.set(email, {
      user,
      password: b.password,
    });

    mock.user = user; //作成したユーザーを現在のユーザーに設定
    mock.active = true; //ログイン済み状態に変更する
    mock.deleting = false; //アカウント削除中ではない状態にする

    saveMockSession();
    //認証情報をJSONで返す
    return HttpResponse.json(authView(), { status: 201 });
  }),

  //POST /api/login ログイン処理
  http.post("/api/login", async ({ request }) => {
    //CSRF Tokenが一致しなければ403
    if (!allowed(request)) {
      return failure(403, "CSRF_INVALID", "CSRF確認値が一致しません");
    }

    //テスト用に認証失敗を強制
    if (scenario() === "auth-401") {
      return failure(401, "AUTH_FAILED", "ログインできません");
    }

    //テスト用にサーバー障害
    if (scenario() === "server-503") {
      return failure(503, "UNAVAILABLE", "仮の通信障害です");
    }

    //リクエストのJSONを取得し、形式を確認
    const b = input(await request.json().catch(() => null));

    //emailが文字列なら、そのメールに対応する。アカウントをMapから取得する。不正な形式ならundefinedを設定する
    const a =
      typeof b?.email === "string"
        ? mock.accounts.get(b.email.trim().toLowerCase())
        : undefined;

    //認証失敗：アカウントが存在しない・パスワードが一致しない・アカウントが削除
    if (!a || b?.password !== a.password || mock.deleting) {
      return failure(401, "AUTH_FAILED", "ログインできません");
    }

    mock.user = a.user; //認証成功したユーザーを保存
    mock.active = true; //ログイン済み状態にする
    saveMockSession();
    //Access Tokenなどを返す。HTTPステータスは200
    return HttpResponse.json(authView());
  }),

  //POST /api/refresh ログイン状態の復元
  http.post("/api/refresh", ({ request }) => {
    //CSRF Tokenを確認
    if (!allowed(request)) {
      return failure(403, "CSRF_INVALID", "CSRF確認値が一致しません");
    }

    //ログインしていない・削除処理中・またはユーザー情報がない場合は401
    if (!mock.active || mock.deleting || !mock.user) {
      return failure(401, "AUTH_REQUIRED", "ログインが必要です");
    }

    //サーバー障害のテスト条件
    if (scenario() === "server-503") {
      return failure(503, "UNAVAILABLE", "仮の通信障害です");
    }

    //認証情報を返してログイン復元を再現する
    return HttpResponse.json(authView());
  }),

  //GET /api/me 現在のユーザー情報を取得
  http.get("/api/me", ({ request }) =>
    //Access Tokenが正しければユーザー情報を返す
    authorized(request)
      ? HttpResponse.json({
          user: mock.user,
        })
      : //認証できなければ401
        failure(401, "AUTH_REQUIRED", "ログインが必要です"),
  ),

  //POST /api/logout ログアウト処理
  http.post("/api/logout", ({ request }) => {
    //CSRF Tokenの確認
    if (!allowed(request)) {
      return failure(403, "CSRF_INVALID", "CSRF確認値が一致しません");
    }

    //Access Tokenの確認
    if (!authorized(request)) {
      return failure(401, "AUTH_REQUIRED", "ログインが必要です");
    }

    mock.active = false; //ログイン状態を解除する
    mock.user = null; //現在のユーザー情報を削除
    saveMockSession();

    //204 No Content 成功したがレスポンス本文は返さない
    return new HttpResponse(null, {
      status: 204,
    });
  }),
];
