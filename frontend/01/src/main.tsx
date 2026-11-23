import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.tsx";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";

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

  //Queryのデータやキャッシュを管理
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  // MSW起動後にReactアプリ
  createRoot(root).render(
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <App />

        {import.meta.env.DEV && <ReactQueryDevtools initialIsOpen={false} />}
      </QueryClientProvider>
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
