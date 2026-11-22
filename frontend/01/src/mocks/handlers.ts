import { http, HttpResponse } from "msw/http";
import { mockStage } from "./state";
import { authHandlers } from "./auth";

//MSWが処理するAPIの一覧
export const handlers = [
  //GET /api/config アプリの設定情報を取得するAPI
  http.get("/api/config", ({ request }) => {
    const stage = mockStage(); //現在の開発段階を取得する

    //リクエストURLからオリジンを取得。オリジン = プロトコル + ホスト名 + ポート
    const origin = new URL(request.url).origin;

    //アプリの設定情報をJSON形式で返す
    return HttpResponse.json({
      stage: stage === 2 ? 1 : stage,

      min_password: 8,

      //動画保存先として使うオリジン情報。ここではリクエスト先と同じオリジン
      storage_origin: origin,

      saves: stage >= 4, //保存機能が利用可能な段階かを示す

      reads: stage >= 4, //読み込み機能が利用可能な段階かを示す
    });
  }),

  //認証APIを追加する

  //配列のスプレッド構文でauthHandlersを展開
  //GET  /api/csrf
  //POST /api/signup
  //POST /api/login
  //POST /api/refresh
  //GET  /api/me
  //POST /api/logout
  ...authHandlers,

  //未定義のAPIを拒否

  //http.allはGET・POST・DELETEなどHTTPメソッドに関係なくリクエストを受け取る
  //正規表現で/apiおよび/api/以下のURLに一致
  //このハンドラーは最後に置くことで、先に定義したAPIを優先させる
  http.all(/^https?:\/\/[^/]+\/api(?:\/.*)?$/, () =>
    //未定義のAPIなので501を返す
    HttpResponse.json(
      {
        code: "MOCK_NOT_DEFINED",
        message: "ここでは未作成のモックです",
        request_id: "mock-unknown",
      },
      {
        status: 501,
      },
    ),
  ),

  //未対応の動画保存APIを拒否。local-storageおよびその配下へのリクエストを受け取る
  http.all(/^https?:\/\/[^/]+\/__local-storage(?:\/.*)?$/, () =>
    HttpResponse.json(
      {
        code: "MOCK_NOT_DEFINED",
        message: "動画モックはまだ",
        request_id: "mock-unknown",
      },
      {
        status: 501,
      },
    ),
  ),
];
