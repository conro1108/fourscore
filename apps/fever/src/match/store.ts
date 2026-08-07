/**
 * Match state. The committed move list is the single source of game truth;
 * everything else — the 3D discs, the HUD, eventually the Director — derives
 * from it.
 *
 * The one deliberate wrinkle is `landed`: how many of `moves` have finished
 * their drop animation. Discs animate off the *move list*, not off the click,
 * so `landed` lags `moves` by one animation while a disc is in flight. That's
 * what makes a move arriving over the wire (phase 8) land exactly like one you
 * made — the scene can't tell the difference, because there isn't one.
 * Spectacle never affects game truth: the move commits first, the theater
 * catches up.
 */

import { CONNECT4, Match, type Player, type Variant } from "@fourscore/engine";
import { create } from "zustand";
import { engineClient } from "../engine/client.js";

export interface MatchStore {
  /** Bumped on every new game so stale async work can notice and stand down. */
  generation: number;
  variant: Variant;
  botId: string;
  humanFirst: boolean;
  /** Committed game truth, column indices in play order. */
  moves: number[];
  /** How many of `moves` have visually settled. Lags `moves` during a drop. */
  landed: number;
  /** Rebuilt from `moves` on every commit; cheap, and keeps state immutable. */
  match: Match;
  /** True from "bot's turn began" to "bot's move committed". */
  thinking: boolean;

  newGame(opts?: Partial<{ variant: Variant; humanFirst: boolean; botId: string }>): void;
  /** Human input. Validates; a click during a drop or off-turn is ignored. */
  playColumn(col: number): void;
  /** Commit a move to game truth. Both the human path and the bot path end here. */
  commitMove(col: number): void;
  /** The scene reports a drop animation finishing. */
  discLanded(): void;
  setThinking(thinking: boolean): void;
}

export const humanPlayer = (s: Pick<MatchStore, "humanFirst">): Player =>
  s.humanFirst ? "red" : "yellow";
export const botPlayer = (s: Pick<MatchStore, "humanFirst">): Player =>
  s.humanFirst ? "yellow" : "red";

/** All theater has settled and it's the human's turn to add to the move list. */
export const canHumanPlay = (s: MatchStore): boolean =>
  s.match.status === "playing" &&
  s.match.turn === humanPlayer(s) &&
  s.landed === s.moves.length &&
  !s.thinking;

export const useMatchStore = create<MatchStore>((set, get) => ({
  generation: 0,
  variant: CONNECT4,
  botId: "moss",
  humanFirst: true,
  moves: [],
  landed: 0,
  match: new Match(CONNECT4),
  thinking: false,

  newGame: (opts = {}) => {
    const s = get();
    const variant = opts.variant ?? s.variant;
    const humanFirst = opts.humanFirst ?? s.humanFirst;
    const botId = opts.botId ?? s.botId;
    // Fire and forget: clearing the bot's table is housekeeping, and making the
    // new game wait on a worker round-trip reads as a dead button.
    void engineClient().reset(botId, variant.id).catch(() => {});
    set({
      generation: s.generation + 1,
      variant,
      humanFirst,
      botId,
      moves: [],
      landed: 0,
      match: new Match(variant),
      thinking: false,
    });
  },

  playColumn: (col) => {
    const s = get();
    if (!canHumanPlay(s)) return;
    s.commitMove(col);
  },

  commitMove: (col) => {
    const s = get();
    if (s.match.status !== "playing" || !s.match.canPlay(col)) return;
    const moves = [...s.moves, col];
    set({ moves, match: Match.fromMoves(moves, s.variant) });
  },

  discLanded: () => {
    const s = get();
    if (s.landed < s.moves.length) set({ landed: s.landed + 1 });
  },

  setThinking: (thinking) => set({ thinking }),
}));

export interface DiscPlacement {
  col: number;
  /** Bottom-up row index — row 0 rests on the board floor. */
  row: number;
  player: Player;
  /** Ply index, so winning-line lookups can find it. */
  ply: number;
}

/**
 * Where each disc of a move list sits. Red always moves first (an engine
 * invariant), so color is ply parity and never depends on who the human is.
 */
export function placements(moves: readonly number[], variant: Variant): DiscPlacement[] {
  const heights = new Array<number>(variant.width).fill(0);
  return moves.map((col, ply) => ({
    col,
    row: heights[col]!++,
    player: ply % 2 === 0 ? "red" : "yellow",
    ply,
  }));
}
