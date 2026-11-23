import { Link, useLocation, useNavigate } from "react-router-dom";
import useAuth from "../hooks/useAuth";
import useStore from "../store";
import Account from "./Account";
import Auth from "./Auth";

export default function Reel() {
  const auth = useAuth();
  const user = useStore((s) => s.user);
  const navigate = useNavigate();
  const path = useLocation().pathname;
  const signup = path === "/signup";
  const login = path === "/login";
  const blocked = auth.busy || auth.checking;

  return (
    <main className="app-shell">
      <Account busy={blocked} logout={auth.logout} />
      <div className="app-content max-w-[1580px] pt-[28px] px-[clamp(14px,3vw,44px)] pb-[60px] my-0 mx-auto">
        <div
          className="feedback grid gap-[8px]"
          role="status"
          aria-live="polite"
        >
          {auth.checking && <p>認証状態を確認中…</p>}
          {auth.notice && <p>{auth.notice}</p>}
          {auth.error && (
            <p className="error" role="alert">
              {auth.error}
            </p>
          )}
        </div>
        {!auth.checking && auth.restoreError && (
          <button
            type="button"
            onClick={() => {
              void auth.retry();
            }}
          >
            状態を再確認
          </button>
        )}
        {!auth.checking && !user && (signup || login) && (
          <div className="auth-layout max-w-[1040px] grid grid-cols-[minmax(320px,1fr)_minmax(270px,.85fr)] items-center gap-[28px] my-[34px] mx-auto">
            <Auth
              signup={signup}
              blocked={blocked}
              minPassword={auth.minPassword}
              onSignup={auth.signUp}
              onLogin={auth.login}
              onSuccess={() => navigate("/", { replace: true })}
            />
            <aside
              className="auth-visual min-h-[375px] p-[30px] rounded-[18px] border border-[#393149] grid place-items-center gap-[15px]"
              aria-hidden="true"
            >
              <div className="mini-phone">
                <span className="mini-overlay">
                  YOUR STORY
                  <br />
                  9:16 / MP4
                </span>
              </div>
              <p>使いたい瞬間だけを選んで、自分だけの動画に。</p>
            </aside>
          </div>
        )}
        {!auth.checking && user && (
          <>
            <section className="welcome mt-[28px] mx-0 mb-[18px] p-[clamp(24px,4vw,44px)] border border-[#39334d] rounded-[20px]">
              <div className="overline text-[#b4a1ff] text-[11px] font-extrabold tracking-[.14em] uppercase mb-[10px]">
                YOUR WORKSPACE
              </div>
              <h1>ログインできました</h1>
              <p>{user.name} さんのアカウントで認証されています。</p>
              <span className="status-tag badge-success">認証済み</span>
            </section>
            <div className="feature-preview grid grid-cols-[repeat(3,minmax(0,1fr))] gap-[12px] my-[16px] mx-0">
              <div className="feature-card border border-[color:var(--border)] rounded-[13px] p-[20px] bg-[color:var(--surface)]">
                <b>01 / 素材</b>
                <p>MP4を端末から選択</p>
              </div>
              <div className="feature-card border border-[color:var(--border)] rounded-[13px] p-[20px] bg-[color:var(--surface)]">
                <b>02 / 編集</b>
                <p>切り出し・分割・並べ替え</p>
              </div>
              <div className="feature-card border border-[color:var(--border)] rounded-[13px] p-[20px] bg-[color:var(--surface)]">
                <b>03 / 完成</b>
                <p>MP4に書き出し</p>
              </div>
            </div>
          </>
        )}
        {!auth.checking && !user && !signup && !login && (
          <section className="welcome mt-[28px] mx-0 mb-[18px] p-[clamp(24px,4vw,44px)] border border-[#39334d] rounded-[20px]">
            <div className="overline text-[#b4a1ff] text-[11px] font-extrabold tracking-[.14em] uppercase mb-[10px]">
              SIMPLE REEL CREATOR
            </div>
            <h1>
              この瞬間を、
              <br />
              一本のリールに。
            </h1>
            <p>必要な場面だけを選び、整えるシンプルな動画エディター。</p>
            <div className="row flex flex-wrap gap-[10px] items-center">
              <Link className="nav-link nav-link-strong" to="/signup">
                会員登録して始める
              </Link>
              <Link className="nav-link" to="/login">
                ログイン
              </Link>
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
