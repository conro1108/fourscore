/**
 * The lobby's state, and nothing else.
 *
 * Game truth is not here. An online match's move list lives in the match store
 * exactly like a bot game's, which is what lets the stage, the Director, the
 * HUD and the props stay ignorant of who they're playing. What this store holds
 * is the paperwork around it: who I am, which row we're in, and whatever went
 * wrong.
 */

import { create } from "zustand";
import type { MatchRow } from "./session.js";

export interface OnlineStore {
  /** My user id, once anonymous sign-in has happened. Null before the lobby. */
  me: string | null;
  row: MatchRow | null;
  /** Their display name from `app.profiles`, if they have one. */
  opponentName: string | null;
  /** A lobby failure, shown in the lobby window. Match failures use the dialog. */
  error: string | null;
  /** A request is out. Hosting and joining both disable their buttons. */
  busy: boolean;
}

export const useOnlineStore = create<OnlineStore>(() => ({
  me: null,
  row: null,
  opponentName: null,
  error: null,
  busy: false,
}));
