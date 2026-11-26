import { useLocation, useNavigate } from "react-router-dom";
import useAuth from "../hooks/useAuth";
import useStore from "../store";
import Account from "./Account";
import Auth from "./Auth";
import { Editor } from "../editor/Editor";
import useLocalEdit from "../hooks/useLocalEdit";

export default function Reel() {
  const auth = useAuth();
  const editing = useLocalEdit();
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
          role="status"
          className="feedback grid gap-[8px]"
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
              <p>編集した内容は、ログインしてもこのタブで保持されます。</p>
            </aside>
          </div>
        )}
        {!auth.checking && !signup && !login && (
          <>
            <div className="workspace-bar flex flex-wrap justify-between items-center gap-[16px] mt-[6px] mx-0 mb-[18px]">
              <div>
                <span className="overline text-[#b4a1ff] text-[11px] font-extrabold tracking-[.14em] uppercase mb-[10px]">
                  REEL EDITOR / GUEST WORKSPACE
                </span>
                <h1>新しい動画</h1>
              </div>
              <span className="badge badge-neutral">
                {user ? "ログイン中・未保存" : "ゲスト・未保存"}
              </span>
            </div>
            {editing.error && (
              <p className="error" role="alert">
                {editing.error}
              </p>
            )}
            {editing.busy && (
              <p className="note">
                動画検査中…{" "}
                <button
                  className="btn-quiet bg-transparent border-[color:var(--border)] text-[color:var(--muted)]"
                  type="button"
                  onClick={editing.cancel}
                >
                  動画検査を中断
                </button>
              </p>
            )}
            <Editor
              edit={editing.edit}
              apply={editing.apply}
              files={editing.addFiles}
              blocked={editing.busy || blocked}
            />
            <p className="editor-footnote block text-[color:var(--muted)] text-[12px] mt-[14px] mx-[2px] mb-0">
              未保存の編集はタブを閉じると消えます。ログイン画面への移動では保持されます。ゲストの元動画はサーバーへ送信されません。
            </p>
          </>
        )}
      </div>
    </main>
  );
}
