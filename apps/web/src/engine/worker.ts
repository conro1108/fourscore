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

import { BotBrain, Position, byId, reviewMatch } from "@fourscore/engine";
import type { Request, Response } from "./protocol.js";

const brains = new Map<string, BotBrain>();

function brainFor(botId: string): BotBrain {
  let brain = brains.get(botId);
  if (!brain) {
    brain = new BotBrain(byId(botId));
    brains.set(botId, brain);
  }
  return brain;
}

const post = (msg: Response): void => self.postMessage(msg);

self.onmessage = (event: MessageEvent<Request>) => {
  const req = event.data;
  try {
    switch (req.type) {
      case "decide": {
        const started = performance.now();
        const decision = brainFor(req.botId).decide(Position.fromMoves(req.history));
        post({ type: "decided", id: req.id, decision, elapsed: performance.now() - started });
        break;
      }
      case "review": {
        const review = reviewMatch(req.history, { forPlayer: req.forPlayer });
        post({ type: "reviewed", id: req.id, review });
        break;
      }
      case "reset": {
        brains.delete(req.botId);
        post({ type: "reset", id: req.id });
        break;
      }
    }
  } catch (e) {
    post({ type: "error", id: req.id, message: e instanceof Error ? e.message : String(e) });
  }
};
