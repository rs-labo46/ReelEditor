import { create } from "zustand";
import type { EditState } from "../editor/types";
import { devtools } from "zustand/middleware";
import { EMPTY } from "../editor/edit";

//ゲストの元動画はFile/BlobのURLとしてタブ内のメモリにだけ保持する。
type EditStore = {
  edit: EditState;
  replaceEdit: (next: EditState) => void;
  resetEdit: () => void;
};

export const useEditStore = create<EditStore>()(
  devtools(
    (set, get) => ({
      edit: EMPTY,
      replaceEdit: (next) => {
        const previous = get().edit;
        if (previous === next) return;
        // 先にStateを更新し、その後、不要になったURLだけ解放する。
        set({ edit: next }, false, "edit/replace");
        for (const source of previous.sources) {
          if (!next.sources.some((item) => item.url === source.url)) {
            URL.revokeObjectURL(source.url);
          }
        }
      },
      resetEdit: () => get().replaceEdit(EMPTY),
    }),
    { name: "reeleditor-edit", enabled: import.meta.env.DEV },
  ),
);
