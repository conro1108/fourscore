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

export type Screen = "menu" | "roster" | "online" | "match";

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
  /**
   * The review is a dialog and not a screen for one reason: it floats over the
   * finished board and closing it puts you back on that board, which is exactly
   * what this field is for. It is the only dialog with no veil under it — the
   * board behind it is the thing it is talking about.
   */
  | { kind: "review" }
  | null;

interface ShellStore {
  screen: Screen;
  dialog: Dialog;
  /**
   * The Director panel, in builds that don't have it for free.
   *
   * Long-pressing the wordmark toggles it. It's a deliberate back door rather
   * than a secret: playtesting on a phone means a real build on a real device,
   * and every tool for judging the fever curve lives in that panel.
   */
  debug: boolean;
  go(screen: Screen): void;
  open(dialog: NonNullable<Dialog>): void;
  close(): void;
  toggleDebug(): void;
}

export const useShellStore = create<ShellStore>((set) => ({
  screen: "menu",
  dialog: null,
  debug: false,
  toggleDebug: () => set((s) => ({ debug: !s.debug })),
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
