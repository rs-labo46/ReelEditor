import { useCallback, useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as api from "../api/client";
import type { LoginInput, SignupInput } from "../types/auth";
import { useError } from "./useErrors";

let restoreInFlight: Promise<void> | null = null;
function restoreOnce(): Promise<void> {
  if (restoreInFlight) return restoreInFlight;
  const task = api.restore().then(() => undefined);
  restoreInFlight = task;
  void task
    .finally(() => {
      if (restoreInFlight === task) restoreInFlight = null;
    })
    .catch(() => {});
  return task;
}

//useAuthが返すデータと関数の型
type State = {
  checking: boolean; //起動した時のログイン状態を確認
  busy: boolean; //会員登録・ログイン・ログアウトのApiの処理中
  error: string;
  notice: string; //成功メッセージ
  restoreError: boolean;
  minPassword: number; //パスワードの最小文字数
  signUp: (input: SignupInput) => Promise<boolean>;
  login: (input: LoginInput) => Promise<boolean>;
  logout: () => Promise<void>;
  retry: () => Promise<void>; //ログイン状態の確認を再実行
};

//認証に必要な状態と操作
export default function useAuth(): State {
  const client = useQueryClient();
  const { error, clearError, showError } = useError();
  const [checking, setChecking] = useState(true);
  const [restoreError, setRestoreError] = useState(false);
  const [notice, setNotice] = useState("");
  const actionInFlight = useRef(false);

  //サーバーの設定値。キャッシュするが認証トークンは保存しない。
  const configQuery = useQuery({
    queryKey: ["app", "config"],
    queryFn: api.getConfig,
    staleTime: 60_000,
    retry: false,
    refetchOnWindowFocus: false,
  });
  //ユーザーが実行する更新系API。自動再試行しない。
  const signUpMutation = useMutation({
    mutationFn: (input: SignupInput) => api.signUp(input),
    retry: false,
    onSuccess: () => {
      client.removeQueries({ queryKey: ["projects"] });
      setNotice("登録が完了し、自動ログインしました");
    },
  });
  const loginMutation = useMutation({
    mutationFn: (input: LoginInput) => api.login(input),
    retry: false,
    onSuccess: () => {
      client.removeQueries({ queryKey: ["projects"] });
      setNotice("ログインしました");
    },
  });
  const logoutMutation = useMutation({
    mutationFn: () => api.logoutAll(),
    retry: false,
    onSuccess: () => {
      // 別ユーザーへ前ユーザーのプロジェクト情報を見せない。
      client.removeQueries({ queryKey: ["projects"] });
      setNotice("全端末からログアウトしました");
    },
  });

  const retry = useCallback(async (): Promise<void> => {
    setChecking(true);
    setRestoreError(false);
    clearError();
    try {
      // QueryClientを経由して取得し、重複したGETはQuery側でまとめる。
      await client.ensureQueryData({
        queryKey: ["app", "config"],
        queryFn: api.getConfig,
        staleTime: 60_000,
      });
      // 起動時の復元はQueryキャッシュに載せない
      await restoreOnce();
      // API内でZustandが同期。ここではUserが消えても安全な状態にする。
    } catch (cause: unknown) {
      setRestoreError(true);
      showError(cause);
    } finally {
      setChecking(false);
    }
  }, [client, clearError, showError]);

  // マウント時に復元。Effect内から直接setStateせず非同期の継続で更新する。
  useEffect(() => {
    void Promise.resolve().then(retry);
  }, [retry]);

  const run = async (action: () => Promise<unknown>): Promise<boolean> => {
    if (actionInFlight.current || checking) return false;
    actionInFlight.current = true;
    clearError();
    setNotice("");
    try {
      await action();
      return true;
    } catch (cause: unknown) {
      showError(cause);
      return false;
    } finally {
      actionInFlight.current = false;
    }
  };

  return {
    checking,
    busy:
      signUpMutation.isPending ||
      loginMutation.isPending ||
      logoutMutation.isPending,
    error,
    restoreError,
    notice,
    minPassword: configQuery.data?.min_password ?? 8,
    signUp: (input) => run(() => signUpMutation.mutateAsync(input)),
    login: (input) => run(() => loginMutation.mutateAsync(input)),
    logout: async () => {
      await run(() => logoutMutation.mutateAsync());
    },
    retry,
  };
}
