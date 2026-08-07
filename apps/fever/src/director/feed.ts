/**
 * The eval feed: the Director's view of how the game is actually going.
 *
 * One number per position — advantage from red's point of view, on exactly the
 * axis the post-game review draws (`advantageOf` in the engine, not a copy of
 * it). The Director turns that history into fever; nothing else reads it.
 *
 * Deliberately a plain module with a store, like the match controller: it isn't
 * rendering, and the preview harness must be able to mount scenes without a
 * search worker ever waking up. `startEvalFeed` is called once from the app
 * entry and never from the harness.
 *
 * Evals are requested newest-first. If the searches ever fall behind the moves
 * (they shouldn't — a ply costs tens of milliseconds and a turn costs hundreds)
 * the number that matters is the current position's, not the backlog's.
 */

import type { ScoreSource } from "@fourscore/engine";
import { create } from "zustand";
import { analysisClient } from "../engine/client.js";
import { useMatchStore } from "../match/store.js";

export interface EvalPoint {
  /** Advantage from red's point of view, -1..1. */
  advantage: number;
  /**
   * Whether this is a fact or this engine's read. Live play is `estimated`
   * until the game actually ends. Spectacle that makes a declarative claim
   * ("this lost it") may only key off `proven` — same rule as review copy.
   */
  source: ScoreSource;
}

interface EvalFeedStore {
  /** Matches the match store's `generation`; a mismatch means these are stale. */
  generation: number;
  /**
   * Indexed by plies played, so `points[n]` scores the position after `n`
   * moves. Sparse while searches are in flight; `points[0]` is the empty board,
   * which is level by definition and never searched.
   */
  points: (EvalPoint | undefined)[];
}

export const useEvalFeed = create<EvalFeedStore>(() => ({
  generation: 0,
  points: [{ advantage: 0, source: "estimated" }],
}));

/** Non-reactive read, for the per-frame runtime. */
export const evalPoints = (): readonly (EvalPoint | undefined)[] =>
  useEvalFeed.getState().points;

let inFlight = false;
let started = false;

/** The newest position we have no number for yet, or null if we're current. */
function nextGap(): number | null {
  const { moves } = useMatchStore.getState();
  const { points } = useEvalFeed.getState();
  for (let n = moves.length; n >= 1; n--) {
    if (points[n] === undefined) return n;
  }
  return null;
}

async function pump(): Promise<void> {
  if (inFlight) return;
  const ply = nextGap();
  if (ply === null) return;

  const m = useMatchStore.getState();
  const generation = m.generation;
  const history = m.moves.slice(0, ply);
  inFlight = true;
  try {
    const res = await analysisClient().evaluate(m.variant.id, history);
    // A new game may have started while this was searching; its numbers describe
    // a board that no longer exists.
    if (useMatchStore.getState().generation === generation) {
      useEvalFeed.setState((s) => {
        const points = s.points.slice();
        points[res.ply] = { advantage: res.advantage, source: res.source };
        return { ...s, points };
      });
    }
  } catch (e) {
    // No eval means fever coasts on what it has, which is a mood going stale
    // rather than a broken game. Don't retry: the gap stays claimed only until
    // the next move re-enters this loop with fresher work to do.
    console.error("eval feed failed:", e);
  } finally {
    inFlight = false;
  }
  void pump();
}

function onMatchChange(): void {
  const { generation } = useMatchStore.getState();
  if (useEvalFeed.getState().generation !== generation) {
    useEvalFeed.setState({ generation, points: [{ advantage: 0, source: "estimated" }] });
  }
  void pump();
}

/** Call once from the app entry. The preview harness never calls it. */
export function startEvalFeed(): void {
  if (started) return;
  started = true;
  useMatchStore.subscribe(onMatchChange);
  onMatchChange();
}
