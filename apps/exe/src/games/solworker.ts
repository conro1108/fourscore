/**
 * The review's search, off the desktop's thread.
 *
 * A Klondike solve is seconds of straight-line work, and the desktop is a
 * machine with a fire burning on it — running this where the fire runs would
 * stop the fire, the clock and the cards while the review "thought", which is
 * a hang wearing a period costume. One worker per review, and it ends with
 * its answer: there is nothing here to keep alive between games.
 */

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
