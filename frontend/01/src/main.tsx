import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.tsx";

async function main(): Promise<void> {
  // 開発環境かつMSWが有効な場合のみモックAPIを起動する
  if (import.meta.env.DEV && import.meta.env.VITE_USE_MOCK === "true") {
    // MSWの起動機能を読み込む
    const { network } = await import("virtual:msw");

    // 認証APIなどのモック処理を読み込む
    const { handlers } = await import("./mocks/handlers");

    // 使用するAPIハンドラーを登録
    network.configure({ handlers });

    // MSWの起動完了を待つ
    await network.enable();
  }

  const root = document.getElementById("root");
  if (root === null) {
    throw new Error("root要素が見つかりません");
  }

  // MSW起動後にReactアプリ
  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}

void main().catch((error: unknown) => {
  console.error("アプリの起動に失敗しました", error);

  const root = document.getElementById("root");

  if (root) {
    root.textContent =
      "アプリを起動できませんでした。コンソールを確認してください。";
  }
});
