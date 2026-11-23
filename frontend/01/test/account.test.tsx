// @vitest-environment jsdom
import { act, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import Account from "../src/components/Account";
import useStore from "../src/store";

// Zustandの変更がReact画面へ反映されることを確認する。
describe("Account", () => {
  beforeEach(() => {
    useStore.getState().setUser(null);
  });
  it("ログインするとユーザー名とログアウトボタンを表示する", () => {
    render(
      <MemoryRouter>
        <Account busy={false} logout={vi.fn(async () => {})} />
      </MemoryRouter>,
    );
    act(() => {
      useStore
        .getState()
        .setUser({ id: "1", name: "デモユーザー", email: "demo@example.com" });
    });
    expect(screen.getByText("デモユーザー")).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "全端末からログアウト" }),
    ).toBeTruthy();
  });
});
