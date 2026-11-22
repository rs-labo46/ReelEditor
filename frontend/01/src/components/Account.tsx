import { Link } from "react-router-dom";
import useStore from "../store";

type Props = { busy: boolean; logout: () => Promise<void> };

export default function Account({ busy, logout }: Props) {
  const user = useStore((s) => s.user);
  return (
    <header className="app-topbar top min-h-[74px] flex justify-between items-center flex-wrap gap-[14px] py-[14px] px-[clamp(18px,3vw,44px)] bg-[#12151c] border-b border-b-[color:var(--border)]">
      <Link
        className="brand flex items-center gap-[12px] min-w-0 no-underline text-[color:var(--text)]"
        to="/"
        aria-label="Reel Studio ホーム"
      >
        <span
          className="brand-mark inline-grid place-items-center w-[38px] h-[38px] rounded-[11px] flex-none font-black text-[19px] text-[#11131a] shadow-[0_0_23px_#9c83ff22]"
          aria-hidden="true"
        >
          R
        </span>
        <span className="brand-text grid gap-[1px] leading-[1.2]">
          <strong>REEL STUDIO</strong>
          <span>VERTICAL VIDEO EDITOR</span>
        </span>
      </Link>
      <nav aria-label="アカウント">
        {user ? (
          <>
            <span className="user-chip inline-flex gap-[9px] items-center border border-[color:var(--border)] bg-[#1b1e27] text-[#d7dae7] rounded-[25px] py-[7px] px-[12px] text-[12px] font-bold max-w-[220px] [overflow-wrap:anywhere]">
              <span
                className="user-avatar w-[23px] h-[23px] rounded-full grid place-items-center text-[#e7ddff] bg-[#423369] font-bold"
                aria-hidden="true"
              >
                {user.name.slice(0, 1)}
              </span>
              {user.name}
            </span>
            <button
              type="button"
              className="btn-quiet bg-transparent border-[color:var(--border)] text-[color:var(--muted)]"
              disabled={busy}
              onClick={() => {
                void logout();
              }}
            >
              全端末からログアウト
            </button>
          </>
        ) : (
          <>
            <Link className="nav-link" to="/login">
              ログイン
            </Link>
            <Link className="nav-link nav-link-strong" to="/signup">
              無料で始める
            </Link>
          </>
        )}
      </nav>
    </header>
  );
}
