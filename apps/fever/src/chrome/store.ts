/**
 * Where you are in the software, and what it has put in front of you.
 *
 * Routing is a value, not a URL. The game is one page with a WebGL context in
 * it — rebuilding that context to change screens would cost more than every
 * screen in this directory put together — so the shell is a screen name and a
 * dialog name, and the stage stays mounted underneath all of it.
 *
 * Two fields rather than one because they're genuinely orthogonal: a dialog
 * floats over whatever screen you were already on, and closing it puts you back
 * there without anything having to remember where "there" was.
 */

import { create } from "zustand";

export type Screen = "menu" | "roster" | "match";

/**
 * The modal on top, if any.
 *
 * `error` carries its own sentence because the one rule dialogs can't break is
 * saying what actually happened (PLAN.md product truth 4) — the styling is
 * allowed to be possessed, the facts are not.
 */
export type Dialog =
  | { kind: "settings" }
  | { kind: "about" }
  | { kind: "quit" }
  | { kind: "error"; detail: string }
  | null;

interface ShellStore {
  screen: Screen;
  dialog: Dialog;
  go(screen: Screen): void;
  open(dialog: NonNullable<Dialog>): void;
  close(): void;
}

export const useShellStore = create<ShellStore>((set) => ({
  screen: "menu",
  dialog: null,
  // Changing screens closes whatever was floating over the old one. A settings
  // window that survives the trip to the menu is the kind of thing that reads
  // as possessed but is actually just a bug.
  go: (screen) => set({ screen, dialog: null }),
  open: (dialog) => set({ dialog }),
  close: () => set({ dialog: null }),
}));

/** Report a failure the player has to be told about, in one place. */
export const shellError = (detail: string): void =>
  useShellStore.getState().open({ kind: "error", detail });
