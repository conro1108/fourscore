/**
 * The search, off the main thread.
 *
 * Quill spends up to ~700ms on a move and the Oracle's exact search can run for
 * seconds. On the main thread that freezes the page — including the whole
 * fever-dream render loop, which is precisely the thing that's supposed to be
 * reassuring you the game hasn't died. So all of it happens here.
 *
 * Brains are cached per bot because `BotBrain` keeps a transposition table
 * across moves: positions it proved on an earlier turn are still proved, so its
 * searches get cheaper deeper into the game, which is exactly when it needs the
 * headroom. The UI resets a brain when its match ends.
 */

import {
  BALANCED_WEIGHTS,
  BotBrain,
  Match,
  Position,
  advantageOf,
  byId,
  estimateDepth,
  reviewMatch,
  searchHeuristic,
  variantById,
} from "@fourscore/engine";
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

/**
 * Node ceiling for the live eval feed.
 *
 * Well under the bots' budget on purpose: this fires once per ply for the
 * Director's benefit, and fever arriving a beat late is better than a search
 * that competes with the bot for a core. A clipped search here degrades to a
 * static evaluation, which for a tension number is a shrug, not a wrong move.
 */
const EVAL_NODES = 150_000;

/**
 * Score the position after `history` on `advantageOf`'s axis, red's point of view.
 *
 * A finished game is not searched at all: the result is a fact, and running a
 * heuristic over a terminal position returns garbage (no legal moves means no
 * best score). That's also the only `proven` the live feed ever produces —
 * everything mid-game is this engine's read, which is what gates spectacle from
 * making claims it can't back (see PLAN.md's product truths).
 */
function evaluatePosition(
  history: readonly number[],
  variantId: string,
): { advantage: number; source: "proven" | "estimated" } {
  const variant = variantById(variantId);
  const match = Match.fromMoves(history, variant);
  if (match.status === "won") {
    return { advantage: match.winner === "red" ? 1 : -1, source: "proven" };
  }
  if (match.status === "draw") return { advantage: 0, source: "proven" };

  const p = Position.fromMoves(history, variant);
  const r = searchHeuristic(p, estimateDepth(history.length), BALANCED_WEIGHTS, EVAL_NODES);
  return {
    advantage: advantageOf(r.best, p.turn === "red", "estimated", variant),
    source: "estimated",
  };
}

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
      case "evaluate": {
        const { advantage, source } = evaluatePosition(req.history, req.variantId);
        post({
          type: "evaluated",
          id: req.id,
          ply: req.history.length,
          advantage,
          source,
        });
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
