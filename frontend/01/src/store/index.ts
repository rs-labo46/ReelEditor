import { create } from "zustand";
import { devtools } from "zustand/middleware";
import type { User } from "../types/auth";

type State = {
  user: User | null;
  setUser: (user: User | null) => void;
};

const useStore = create<State>()(
  devtools(
    (set) => ({
      user: null,

      // User情報の変更をDevtoolsに記録する
      setUser: (user) => set({ user }, false, "auth/setUser"),
    }),
    {
      name: "reeleditor-auth",
      enabled: import.meta.env.DEV,
    },
  ),
);

export default useStore;
