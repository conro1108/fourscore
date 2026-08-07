/**
 * Where subsystems read the current DirectorFrame from.
 *
 * In phase 0 the only writer is the debug panel's fever slider — the real
 * Director (phase 1) will replace the writer and keep this read surface, so
 * anything built against `useDirectorFrame` now is already built right.
 */

import { create } from "zustand";
import type { DirectorFrame, Fever } from "./types.js";

interface DirectorStore {
  frame: DirectorFrame;
  /** Debug override. Phase 1's Director becomes the real writer. */
  setFever(fever: Fever): void;
}

export const useDirectorStore = create<DirectorStore>((set) => ({
  frame: { fever: 0, events: [] },
  setFever: (fever) =>
    set((s) => ({ frame: { ...s.frame, fever: Math.min(1, Math.max(0, fever)) } })),
}));

/** The one hook subsystems should use. */
export const useFever = (): Fever => useDirectorStore((s) => s.frame.fever);
