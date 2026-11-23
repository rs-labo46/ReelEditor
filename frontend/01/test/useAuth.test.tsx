// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import useAuth from "../src/hooks/useAuth";
import useStore from "../src/store";
import * as api from "../src/api/client";

// APIレスポンスとZustandへの反映を独立して確認する。
// 本物のAccess Token/パスワードはテストのStateには保持しない。
vi.mock("../src/api/client", () => ({
  ApiError: class ApiError extends Error {
    status = 400;
    code = "INVALID";
    requestId = "";
  },
  getConfig: vi.fn(async () => ({ stage: 1, min_password: 8 })),
  restore: vi.fn(async () => null),
  signUp: vi.fn(async () => null),
  login: vi.fn(async () => null),
  logoutAll: vi.fn(async () => undefined),
}));

function createWrapper() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return {
    client,
    wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
  };
}

describe("useAuth", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useStore.getState().setUser(null);
  });

  it("起動後に設定を取得し、ログイン復元が完了する", async () => {
    const { client, wrapper } = createWrapper();
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.checking).toBe(false));
    expect(api.getConfig).toHaveBeenCalledTimes(1);
    expect(api.restore).toHaveBeenCalledTimes(1);
    expect(client.getQueryData(["app", "config"])).toEqual({
      stage: 1,
      min_password: 8,
    });
    expect(result.current.minPassword).toBe(8);
    client.clear();
  });

  it("ログインMutationが完了したら通知が更新される", async () => {
    const { client, wrapper } = createWrapper();
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.checking).toBe(false));
    await act(async () => {
      const ok = await result.current.login({
        email: "demo@example.com",
        password: "password123",
      });
      expect(ok).toBe(true);
    });
    expect(api.login).toHaveBeenCalledTimes(1);
    expect(result.current.notice).toBe("ログインしました");
    expect(
      client
        .getMutationCache()
        .getAll()
        .some((mutation) => mutation.state.status === "success"),
    ).toBe(true);
    client.clear();
  });

  it("ログイン失敗を起動時復元エラーとして扱わない", async () => {
    const { wrapper, client } = createWrapper();
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.checking).toBe(false));
    vi.mocked(api.login).mockRejectedValueOnce(new Error("ログインできません"));
    await act(async () => {
      const ok = await result.current.login({
        email: "demo@example.com",
        password: "wrong",
      });
      expect(ok).toBe(false);
    });
    expect(result.current.error).toBe("ログインできません");
    expect(result.current.restoreError).toBe(false);
    client.clear();
  });
});
