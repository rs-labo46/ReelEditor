import { useEffect, useState } from "react";
import type { LoginInput, SignupInput } from "../types/auth";
import * as api from "../api/client";
import useStore from "../store";

//useAuthが返すデータと関数の型
type State = {
  checking: boolean; //起動した時のログイン状態を確認
  busy: boolean; //会員登録・ログイン・ログアウトのApiの処理中
  error: string;
  notice: string; //成功メッセージ
  minPassword: number; //パスワードの最小文字数
  signUp: (input: SignupInput) => Promise<boolean>;
  login: (input: LoginInput) => Promise<boolean>;
  logout: () => Promise<void>;
  retry: () => Promise<void>; //ログイン状態の確認を再実行
};

//認証に必要な状態と操作
export default function useAuth(): State {
  const [checking, setChecking] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [minPassword, setMinPassword] = useState(8); //初期値は8文字
  const setUser = useStore((s) => s.setUser); //Zustandからユーザー情報を更新する関数を取得

  //ログイン状態の確認と復元
  async function retry(): Promise<void> {
    setChecking(true);
    setError("");

    try {
      //GET/config バックから設定情報を取得
      const config = await api.getConfig();
      setMinPassword(config.min_password); //更新

      const u = await api.restore(); //POST/refresh リフレッシュトークンを使って復元を試み、成功したらUserを返す。認証できないときはnull
      setUser(u); //Zustandのユーザー情報を更新
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "ログイン状態を確認できません");
    } finally {
      setChecking(false);
    }
  }
  //起動時に1回だけ復元を試みる
  useEffect(() => {
    void retry();
  }, []);

  //認証処理の共通実行関数
  async function run(action: () => Promise<void>): Promise<boolean> {
    if (busy || checking) return false; //API処理中、またはログイン状態の確認中なら実行しない
    setBusy(true);
    setError("");
    setNotice("");

    try {
      await action();
      return true;
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "処理に失敗しました");
      return false;
    } finally {
      setBusy(false);
    }
  }

  return {
    checking,
    busy,
    error,
    notice,
    minPassword,
    signUp: (input) =>
      run(async () => {
        await api.signUp(input);
        setNotice("登録が完了し、自動ログインしました");
      }),
    login: (input) =>
      run(async () => {
        await api.login(input);
        setNotice("ログインしました");
      }),
    logout: async () => {
      await run(async () => {
        await api.logoutAll();
        setNotice("全端末からログアウトしました");
      });
    },
    retry,
  };
}
