/** Dev-only switches. The post stack must always be toggleable for debugging. */

import { create } from "zustand";

interface DebugStore {
  postEnabled: boolean;
  setPostEnabled(on: boolean): void;
}

export const useDebugStore = create<DebugStore>((set) => ({
  postEnabled: true,
  setPostEnabled: (postEnabled) => set({ postEnabled }),
}));
