/**
 * The search, off the main thread.
 *
 * Quill spends up to ~700ms on a move and the Oracle's exact search can run for
 * seconds. On the main thread that freezes the page — including the thinking
 * animation, which is precisely the thing that's supposed to be reassuring you
 * the game hasn't died. So all of it happens here.
 *
 * Brains are cached per bot because `BotBrain` keeps a transposition table
 * across moves: positions it proved on an earlier turn are still proved, so its
 * searches get cheaper deeper into the game, which is exactly when it needs the
 * headroom. The UI resets a brain when its match ends.
 */

import { BotBrain, Position, byId, reviewMatch, variantById } from "@fourscore/engine";
import type { Request, Response } from "./protocol.js";

/**
 * Brains are keyed by bot *and* variant. A transposition table holds positions
 * from one geometry and its keys mean nothing under another, so sharing one
 * across variants would feed the solver garbage hits.
 */
const brains = new Map<string, BotBrain>();

const brainKey = (botId: string, variantId: string): string => `${botId}@${variantId}`;

function brainFor(botId: string, variantId: string): BotBrain {
  const key = brainKey(botId, variantId);
  let brain = brains.get(key);
  if (!brain) {
    brain = new BotBrain(byId(botId));
    brains.set(key, brain);
  }
  return brain;
}

const post = (msg: Response): void => self.postMessage(msg);

self.onmessage = (event: MessageEvent<Request>) => {
  const req = event.data;
  try {
    switch (req.type) {
      case "decide": {
        const variant = variantById(req.variantId);
        const started = performance.now();
        const decision = brainFor(req.botId, req.variantId).decide(
          Position.fromMoves(req.history, variant),
        );
        post({ type: "decided", id: req.id, decision, elapsed: performance.now() - started });
        break;
      }
      case "review": {
        const review = reviewMatch(req.history, {
          forPlayer: req.forPlayer,
          variant: variantById(req.variantId),
        });
        post({ type: "reviewed", id: req.id, review });
        break;
      }
      case "reset": {
        brains.delete(brainKey(req.botId, req.variantId));
        post({ type: "reset", id: req.id });
        break;
      }
    }
  } catch (e) {
    post({ type: "error", id: req.id, message: e instanceof Error ? e.message : String(e) });
  }
};
