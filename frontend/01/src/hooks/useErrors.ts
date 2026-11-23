import { useCallback, useState } from "react";
import { ApiError } from "../api/client";

//エラー表示だけを共通化する。JWTやパスワードなどの認証情報はStateへ保存しない。
export function useError() {
  const [error, setError] = useState("");
  const clearError = useCallback(() => setError(""), []);
  const showError = useCallback((cause: unknown) => {
    if (cause instanceof ApiError) {
      // APIが返した確認番号は問い合わせ用。
      setError(
        cause.message +
          (cause.requestId ? `（確認番号：${cause.requestId}）` : ""),
      );
      return;
    }
    setError(cause instanceof Error ? cause.message : "処理に失敗しました");
  }, []);
  return { error, setError, clearError, showError };
}
