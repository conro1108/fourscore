/**
 * The post-game review: one request, one result, one selected ply.
 *
 * It runs on the *analysis* worker, not the gameplay one. That worker was built
 * in phase 1 for the Director's eval feed and its doc comment already promised
 * this: a review is a couple of seconds of solving, and a message queue is FIFO,
 * so putting it behind the bot's brain would mean a rematch started from the
 * review window sits there while the review it replaced finishes. The two never
 * share a transposition table, which is the whole reason a second worker is
 * cheap.
 *
 * `generation` is the guard on every piece of state in here. A review is about
 * one specific finished game, and the player can start another one while it is
 * still solving — so the result carries the generation it was asked for, and
 * anything reading it (the window, and the board scrub in `App.tsx`) checks that
 * against the match store's before believing a word of it.
 */

import type { Player, Review } from "@fourscore/engine";
import { create } from "zustand";
import { analysisClient } from "../engine/client.js";

export interface ReviewStore {
  /**
   * `running` is a real screen state, not a spinner: a review takes seconds and
   * the window opens into it. `failed` exists because a dead worker must not
   * leave the window claiming to still be reading.
   */
  status: "idle" | "running" | "ready" | "failed";
  review: Review | null;
  /** Which game this is about. Compared against `MatchStore.generation`. */
  generation: number;
  /** The ply the review is pointing at, if any. Drives the board scrub. */
  selected: number | null;
  run(args: {
    generation: number;
    variantId: string;
    moves: readonly number[];
    forPlayer: Player;
  }): Promise<void>;
  select(ply: number | null): void;
  clear(): void;
}

export const useReviewStore = create<ReviewStore>((set, get) => ({
  status: "idle",
  review: null,
  generation: -1,
  selected: null,

  run: async ({ generation, variantId, moves, forPlayer }) => {
    set({ status: "running", review: null, selected: null, generation });
    try {
      // Scoped to the human. `reviewMatch` picks its turning point from whatever
      // plies it graded, and grading both sides would let it headline the
      // opponent's losing move as though it were yours.
      const review = await analysisClient().review(variantId, moves, forPlayer);
      // The game moved on while we were solving; this answer is about a board
      // nobody is looking at any more.
      if (get().generation !== generation) return;
      set({
        status: "ready",
        review,
        // Open on the move that lost it, when there is one. That is the answer
        // the player came for, and everything else in the window is the working.
        selected: review.turningPoint?.ply ?? null,
      });
    } catch {
      if (get().generation !== generation) return;
      set({ status: "failed", review: null });
    }
  },

  select: (ply) => set({ selected: ply }),

  clear: () => set({ status: "idle", review: null, selected: null, generation: -1 }),
}));

/**
 * How the board reads a review.
 *
 * The stage is wound back to the position the mover was looking at — *before*
 * their move, not after it — and the two columns are marked on it: what they
 * played, and what would have held. That's the whole reason this review lives on
 * a 3D stage instead of in a panel; the sentence says "column 5" and the board
 * shows you column 5.
 */
export interface Scrub {
  /** How many moves of the list to show. */
  ply: number;
  marks: { col: number; kind: "best" | "played" }[];
}

export function useScrub(matchGeneration: number): Scrub | null {
  const generation = useReviewStore((s) => s.generation);
  const selected = useReviewStore((s) => s.selected);
  const review = useReviewStore((s) => s.review);
  if (selected === null || review === null || generation !== matchGeneration) return null;

  const rec = review.plies.find((p) => p.ply === selected);
  if (!rec) return { ply: selected, marks: [] };
  return {
    ply: selected,
    marks: [
      ...rec.bestCols.map((col) => ({ col, kind: "best" as const })),
      // A move that was already the best gets no second mark: two markers on one
      // column reads as a disagreement that isn't there.
      ...(rec.grade === "best" ? [] : [{ col: rec.col, kind: "played" as const }]),
    ],
  };
}
