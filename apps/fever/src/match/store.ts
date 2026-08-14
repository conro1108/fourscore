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
  /**
   * Who the other player is.
   *
   * `online` changes exactly two things: nobody searches (the turn loop stands
   * down) and a move you make also has to leave the machine. Everything else —
   * the move list, the drop animation, the Director, the void — cannot tell the
   * difference, and that is the whole design. `botId` stays meaningful either
   * way: online it holds the roster creature your opponent looks like.
   */
  mode: "bot" | "online";
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
  /**
   * Is this game actually being played right now?
   *
   * False on the menu, where the board is scenery. Without it the finished (or
   * half-finished) position is still a position whose turn belongs to the bot,
   * and the turn loop would go on playing it behind the menu — a disc quietly
   * dropping into the backdrop while you read the roster.
   */
  live: boolean;
  /**
   * The software wants the release slider pulled (the outcome window's AGAIN.
   * routes through the same chip-dump the hand gets). The stage reads it as
   * the slider's `auto`; `newGame` clears it, because the release *ends* in a
   * new game and a flag that survived would pull the next board's floor out.
   */
  releasePending: boolean;
  requestRelease(): void;
  /**
   * How a move gets off this machine, in online mode.
   *
   * Registered by `online/runtime.ts` while a wire match is up and cleared when
   * it comes down. A seam rather than an import because the runtime already
   * reads this store, and a store that imported it back would be a cycle — and
   * because a store with no sender is exactly what the preview harness and every
   * bot game want: `playColumn` then has nowhere to send and does nothing, which
   * is the correct amount of online play to have in a game against Moss.
   */
  sendMove: ((col: number) => void) | null;

  /**
   * Start over. `live: false` sets the board up without handing it to the
   * players — that's how the menu changes variant or opponent, and it has to be
   * part of this one atomic update rather than a `setLive` afterwards: for the
   * instant between two sets, a game the human doesn't lead is the bot's turn,
   * and the turn loop is subscribed.
   */
  newGame(
    opts?: Partial<{
      variant: Variant;
      humanFirst: boolean;
      botId: string;
      live: boolean;
      mode: "bot" | "online";
    }>,
  ): void;
  /** Hand the current board to the players, or take it back as scenery. */
  setLive(live: boolean): void;
  /** Human input. Validates; a click during a drop or off-turn is ignored. */
  playColumn(col: number): void;
  /** Commit a move to game truth. Both the human path and the bot path end here. */
  commitMove(col: number): void;
  /**
   * Adopt a move list wholesale. Online repairs only: the database is the
   * authority when the two disagree, and `landed` is handed in because a repair
   * has to be able to say "these are already on the board, don't drop them".
   */
  adoptMoves(moves: number[], landed: number): void;
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
  s.live &&
  s.match.status === "playing" &&
  s.match.turn === humanPlayer(s) &&
  s.landed === s.moves.length &&
  !s.thinking;

export const useMatchStore = create<MatchStore>((set, get) => ({
  generation: 0,
  variant: CONNECT4,
  mode: "bot",
  botId: "moss",
  humanFirst: true,
  moves: [],
  landed: 0,
  match: new Match(CONNECT4),
  thinking: false,
  live: false,
  releasePending: false,
  sendMove: null,

  requestRelease: () => set({ releasePending: true }),

  newGame: (opts = {}) => {
    const s = get();
    const variant = opts.variant ?? s.variant;
    const humanFirst = opts.humanFirst ?? s.humanFirst;
    const botId = opts.botId ?? s.botId;
    const mode = opts.mode ?? s.mode;
    // Fire and forget: clearing the bot's table is housekeeping, and making the
    // new game wait on a worker round-trip reads as a dead button. Online it
    // buys nothing — nothing searches — but it costs nothing either, and the
    // table is stale by then whichever mode comes next.
    void engineClient().reset(botId, variant.id).catch(() => {});
    set({
      generation: s.generation + 1,
      variant,
      mode,
      humanFirst,
      botId,
      moves: [],
      landed: 0,
      match: new Match(variant),
      thinking: false,
      live: opts.live ?? true,
      releasePending: false,
    });
  },

  setLive: (live) => set({ live }),

  playColumn: (col) => {
    const s = get();
    if (!canHumanPlay(s)) return;
    // Online, the disc appears now and the insert goes out in parallel: a
    // turn-based game that pauses for a round trip on every click feels broken
    // even though it isn't. The sender commits — see `online/runtime.ts`.
    if (s.mode === "online") s.sendMove?.(col);
    else s.commitMove(col);
  },

  commitMove: (col) => {
    const s = get();
    if (s.match.status !== "playing" || !s.match.canPlay(col)) return;
    const moves = [...s.moves, col];
    set({ moves, match: Match.fromMoves(moves, s.variant) });
  },

  adoptMoves: (moves, landed) =>
    set((s) => ({
      moves,
      landed: Math.min(landed, moves.length),
      match: Match.fromMoves(moves, s.variant),
    })),

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
