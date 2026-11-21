import { create } from "zustand";
import type { User } from "../types/auth";

type State = {
  user: User | null;
  setUser: (user: User | null) => void;
};

const useStore = create<State>((set) => ({
  user: null,
  setUser: (user) => set({ user }),
}));

export default useStore;
