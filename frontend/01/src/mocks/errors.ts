import { HttpResponse } from "msw/http";

//APIのエラーレスポンスを生成
export function failure(status: number, code: string, message: string) {
  //JSON形式のHTTPレスポンスを生成する
  return HttpResponse.json(
    {
      code,
      message,
      request_id: "mock-request-1",
    },
    { status },
  );
}

//リクエストデータの形式を確認
export function input(body: unknown): Record<string, unknown> | null {
  return body !== null && typeof body === "object" && !Array.isArray(body)
    ? (body as Record<string, unknown>)
    : null;
}

//使用するモックのテスト条件を取得
export function scenario(): string {
  return import.meta.env.VITE_MOCK_SCENARIO ?? "normal";
}
