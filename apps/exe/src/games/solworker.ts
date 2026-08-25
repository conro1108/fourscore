/** Klondike review solve in a worker (seconds of work; would freeze the desktop). One worker per review. */

import { reviewGame, type SolReview } from "./solreview.js";
import type { SolState } from "./solstate.js";

export interface SolReviewRequest {
  journal: SolState[];
}
export type SolReviewResponse = { review: SolReview } | { error: string };

self.onmessage = (e: MessageEvent<SolReviewRequest>): void => {
  try {
    const review = reviewGame(e.data.journal);
    (self as unknown as Worker).postMessage({ review } satisfies SolReviewResponse);
  } catch (err) {
    (self as unknown as Worker).postMessage({
      error: err instanceof Error ? err.message : String(err),
    } satisfies SolReviewResponse);
  }
};
