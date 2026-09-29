/** Klondike solves in a worker (seconds of work; would freeze the desktop):
    the review (one worker per review) and the live probe that looks ahead
    after every move for a proof the hand is dead. */

import { prove, reviewGame, type SolReview, type Verdict3 } from "./solreview.js";
import type { SolState } from "./solstate.js";

export type SolReviewRequest = { journal: SolState[] } | { probe: SolState; gen: number };
export type SolReviewResponse =
  | { review: SolReview }
  | { probe: Verdict3; gen: number }
  | { error: string };

self.onmessage = (e: MessageEvent<SolReviewRequest>): void => {
  try {
    if ("probe" in e.data) {
      const verdict = prove(e.data.probe, { nodes: 250_000, ms: 2500 }).verdict;
      (self as unknown as Worker).postMessage({ probe: verdict, gen: e.data.gen } satisfies SolReviewResponse);
      return;
    }
    const review = reviewGame(e.data.journal);
    (self as unknown as Worker).postMessage({ review } satisfies SolReviewResponse);
  } catch (err) {
    (self as unknown as Worker).postMessage({
      error: err instanceof Error ? err.message : String(err),
    } satisfies SolReviewResponse);
  }
};
