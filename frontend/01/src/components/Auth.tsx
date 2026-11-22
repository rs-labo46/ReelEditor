import type { FormEvent } from "react";
import type { LoginInput, SignupInput } from "../types/auth";
import { Link } from "react-router-dom";
type Props = {
  signup: boolean;
  blocked: boolean;
  minPassword: number;
  onSignup: (value: SignupInput) => Promise<boolean>;
  onLogin: (value: LoginInput) => Promise<boolean>;
  onSuccess: () => void;
};

export default function Auth({
  signup,
  blocked,
  minPassword,
  onSignup,
  onLogin,
  onSuccess,
}: Props) {
  async function submit(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    const data = new FormData(e.currentTarget); //送信されたフォームから入力値を取得する
    const email = String(data.get("email") ?? "");
    const password = String(data.get("email") ?? "");

    const done = signup
      ? await onSignup({
          name: String(data.get("name") ?? ""),
          email,
          password,
        })
      : await onLogin({ email, password });
    if (done) onSuccess();
  }
  return (
    <section
      className="panel auth bg-[color:var(--surface)] border border-[color:var(--border)] rounded-[var(--radius)] my-[16px] mx-0 min-w-0 shadow-[0_9px_24px_#00000017] p-[clamp(24px,3vw,40px)]"
      aria-label={signup ? "会員登録" : "ログイン"}
    >
      <div className="overline text-[#b4a1ff] text-[11px] font-extrabold tracking-[.14em] uppercase mb-[10px]">
        YOUR CREATIVE SPACE
      </div>
      <h2>{signup ? "編集を、もっと自由に。" : "おかえりなさい"}</h2>
      <p className="auth-subtitle mb-[26px] text-[color:var(--muted)] text-[14px]">
        {signup
          ? "アカウントを作成すると、編集の保存と再編集ができるようになります。"
          : "アカウントにログインして、作業を続きから再開できます。"}
      </p>
      <form
        onSubmit={(e) => {
          void submit(e);
        }}
      >
        <fieldset disabled={blocked}>
          {signup && (
            <label>
              お名前
              <input
                name="name"
                required
                maxLength={100}
                autoComplete="name"
                placeholder="例：編集 太郎"
              />
            </label>
          )}
          <label>
            メールアドレス
            <input
              name="email"
              type="email"
              required
              maxLength={254}
              autoComplete="email"
              placeholder="example@email.com"
            />
          </label>
          <label>
            パスワード
            <input
              name="password"
              type="password"
              required
              maxLength={72}
              autoComplete={signup ? "new-password" : "current-password"}
              placeholder="パスワードを入力"
            />
          </label>
          {signup && (
            <p className="muted text-[12px] m-0">{minPassword}文字以上</p>
          )}
          <button
            type="submit"
            className="btn-primary bg-[color:var(--accent)] border-[color:var(--accent)] text-[#11131a]"
          >
            {signup ? "アカウントを作成" : "ログイン"}
          </button>
        </fieldset>
      </form>
      <p className="auth-foot">
        {signup ? (
          <>
            すでにアカウントをお持ちですか？ <Link to="/login">ログイン</Link>
          </>
        ) : (
          <>
            初めての方は <Link to="/signup">会員登録</Link>
          </>
        )}
      </p>
    </section>
  );
}
