/**
 * Which act answers which event — as a weighted draw rather than a lookup.
 *
 * This is the lane screen's actual mechanic (VISION.md pillar 2): the screen
 * has a small library of canned clips, it picks one for what you just did, and
 * it does not care whether that clip fits. A single fixed gag per event kind
 * made the game readable in a way a lane screen never is — the third blunder
 * launched the same rocket as the first, so the rocket stopped being a
 * reaction and became a status light.
 *
 * The taste law's randomness rule survives intact and is the reason this file
 * exists at all: **randomness picks which gag fires, never how a gag looks.**
 * Every act is still fixed choreography; all that varies is which one you get.
 * `rng` is injected so the picker is deterministic under test — the app hands
 * it `Math.random`, and nothing else in the prop system is allowed to be
 * random at all.
 *
 * What is *not* random: the ending. `win` and `draw` are the only facts on the
 * bus (`director/types.ts`), so they have exactly one act each and it is the
 * same one every time. A game does not end with a draw from a hat.
 */

import { signatureMatches, type BotIdentity } from "../bots/identity.js";
import type { SpectacleEvent } from "../director/types.js";
import { PROP_ACTS, type PropAct } from "./registry.js";

export interface Candidate {
  name: string;
  /** Relative frequency within its pool. Integers, and they mean nothing alone. */
  weight: number;
}

const w = (name: string, weight: number): Candidate => ({ name, weight });

/**
 * The attract loop: what plays when there is nothing to react to.
 *
 * A lane screen is never blank between throws, and this is the pool it runs
 * from — weighted toward the quiet acts, because the loud ones are only loud
 * if they're rare. The mascot turning up to celebrate *nothing* is the most
 * on-reference thing in here, and it is deliberately common.
 */
const IDLE: Candidate[] = [
  w("sprinkler", 3),
  w("mascot-cheer", 3),
  w("callout-still-here", 2),
  w("truck-lap", 2),
  w("sign-hmm", 2),
  w("mascot-flop", 1),
  w("rocket-fizzle", 1),
];

/**
 * One pool per move grade — the mascot's two clips, the two older props, and a
 * callout each. A grade with more than one answer is the whole point: three
 * blunders in a game should not be three identical rockets.
 */
const MOVES: Record<"brilliant" | "fine" | "dubious" | "blunder", Candidate[]> = {
  brilliant: [w("mascot-cheer", 3), w("truck-lap", 2), w("callout-nice", 2)],
  blunder: [w("mascot-flop", 3), w("rocket-fizzle", 3), w("callout-oof", 2)],
  dubious: [w("sign-hmm", 2), w("callout-huh", 2)],
  fine: [],
};

/** Every act that may answer this event, with how often it should. */
export function candidatesFor(event: SpectacleEvent): readonly Candidate[] {
  switch (event.kind) {
    // Most moves are ordinary and get nothing back. A game where every move
    // summons a vehicle has no spikes left for the moves that matter.
    case "move":
      return MOVES[event.quality];
    case "threat":
      return [w("beacon-drop", 4), w("callout-heat", 1)];
    case "tension-shift":
      return event.direction === "rising"
        ? [w("banner-rising", 2), w("callout-heat", 2)]
        : [w("banner-collapsing", 1)];
    case "win":
      return [w("win-detonation", 1)];
    case "draw":
      return [w("banner-draw", 1)];
    case "idle-beat":
      return IDLE;
  }
}

/**
 * How heavily an opponent's signature outweighs the general library.
 *
 * A pool sums to 4-8, so at 5 the signature is the likely answer without being
 * the only one — which is the balance the whole file is about. Make it
 * exclusive and the opponent's clip becomes a status light again; leave it at
 * parity and nobody can tell whose stage they are standing on, which is this
 * phase's accept criterion.
 *
 * `IDLE_WEIGHT` is smaller and separate: every signature also joins the idle
 * pool, because an opponent whose gag only answers blunders is invisible in a
 * clean game, and the whole point is that you can tell them apart.
 */
const SIGNATURE_WEIGHT = 5;
const SIGNATURE_IDLE_WEIGHT = 3;

export interface PickOptions {
  /** The act that just played. Skipped when the pool has anything else. */
  avoid?: string;
  /** Veto — the stage uses it to keep two acts out of one berth. */
  eligible?: (act: PropAct) => boolean;
  /** Whose stage this is. Their signature joins the pool; see below. */
  bot?: BotIdentity | null;
}

/**
 * The pool for this event on this opponent's stage.
 *
 * The signature is *added*, never substituted: the general library still
 * answers everything it answered before, so an opponent is a bias on the
 * screen's clip list rather than a different screen. And it is added subject
 * to the claims law — an act that declares a result can never be pulled in
 * this way, because a signature hangs off a grade or a threat and both of
 * those are the Director's estimate (`director/types.ts`). No identity in the
 * roster names a declaring act; this makes that a property of the code rather
 * than of the roster staying careful.
 */
function poolFor(event: SpectacleEvent, bot: BotIdentity | null | undefined): Candidate[] {
  // Copy the entries, not just the array: the pools above are module constants
  // and the signature raises a weight in place further down.
  const pool = candidatesFor(event).map((c) => ({ ...c }));
  if (!bot) return pool;

  const { act, on } = bot.signature;
  // An act that doesn't exist and an act that declares a result are refused
  // the same way: silently, leaving the general library to answer.
  const entry = PROP_ACTS[act];
  if (!entry || entry.declares) return pool;

  const own = signatureMatches(on, event);
  if (!own && event.kind !== "idle-beat") return pool;

  const weight = own ? SIGNATURE_WEIGHT : SIGNATURE_IDLE_WEIGHT;
  // Its own entry may already be in the idle pool (Moss's sprinkler is, and
  // was there before any of this): raise that rather than listing it twice,
  // which would quietly double its odds.
  const existing = pool.find((c) => c.name === act);
  if (existing) existing.weight = Math.max(existing.weight, weight);
  else pool.push(w(act, weight));
  return pool;
}

/**
 * Draw an act for this event, or null if nothing can answer it.
 *
 * Two rules on top of the weights, both about how it feels over a whole game
 * rather than in one moment:
 *
 * - **Never twice running.** Weighted draws clump, and a clump reads as the
 *   game being broken rather than as chance. The last act is dropped from the
 *   pool whenever there is anything else to play.
 * - **Vetoes lose the draw, not the event.** If the stage can't take the act
 *   that was drawn, the pool is filtered *first* and re-drawn — so a busy
 *   berth costs you that act, not the reaction.
 */
export function pickGag(
  event: SpectacleEvent,
  rng: () => number,
  options: PickOptions = {},
): string | null {
  const pool = poolFor(event, options.bot).filter((c) => {
    const act = PROP_ACTS[c.name];
    return act !== undefined && (options.eligible?.(act) ?? true);
  });
  if (pool.length === 0) return null;

  const fresh = pool.filter((c) => c.name !== options.avoid);
  return weighted(fresh.length > 0 ? fresh : pool, rng);
}

function weighted(pool: readonly Candidate[], rng: () => number): string {
  const total = pool.reduce((sum, c) => sum + c.weight, 0);
  let r = rng() * total;
  for (const c of pool) {
    r -= c.weight;
    if (r < 0) return c.name;
  }
  // Only reachable if rng() returns exactly 1, which the contract allows.
  return pool[pool.length - 1]!.name;
}
