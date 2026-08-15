/**
 * Which act answers which beat — a weighted draw, not a lookup.
 *
 * This is fever's `gags.ts` law, ported intact because it is the part that
 * makes a small library of canned reactions read as a machine reacting rather
 * than as a status light: **randomness picks which act fires, never how an act
 * looks.** Every act below is fixed choreography — a dialog's position, a
 * title's text, the shape of a flare are all authored — and all that varies is
 * which one you get. A single fixed act per beat kind made the desktop
 * readable in a way a possessed OS never is: the third blunder popped the same
 * dialog as the first, so the dialog stopped being a reaction and became a
 * readout.
 *
 * `rng` is injected so the picker is deterministic under test. The app hands it
 * `Math.random`, and nothing else in the beat system is allowed to be random.
 *
 * What is *not* here: the ending. `win`, `loss` and `draw` belong to
 * `endgame.ts`, which is hand-tuned start to finish. A game does not end with a
 * draw from a hat.
 */

import type { Beat } from "./director.js";

/** Every reaction the desktop has to a ply, and what it costs to see one. */
export const BEAT_ACTS = {
  /** A sincere dialog, somewhere. The workhorse — it is how the OS talks. */
  dialog: { minFever: 0 },
  /** BOARD.EXE's titlebar says something else for a few seconds. */
  "title-slip": { minFever: 0 },
  /** moves.txt writes a line about it. */
  note: { minFever: 0 },
  /** The fire jumps and settles — the continuous system, shoved. */
  flare: { minFever: 0 },
  /** The clock loses several minutes and finds them again. */
  "clock-lurch": { minFever: 0.25 },
  /** Taskbar buttons crush to slivers and come back. */
  "taskbar-stutter": { minFever: 0.25 },
  /** The desktop icons flinch off-grid and settle. */
  "icon-twitch": { minFever: 0.5 },
  /** A flames.scr preview opens itself, is briefly a window, and gives up. */
  "preview-blink": { minFever: 0.5 },
} as const;

export type BeatAct = keyof typeof BEAT_ACTS;

export interface Candidate {
  /**
   * The act to play, or `null` for "the desktop lets this one go".
   *
   * A null entry is how a pool holds a *chance* of a reaction rather than a
   * certainty, and it has to live in the same draw as the choice — a coin
   * flipped first would decide whether to react before knowing what the
   * reaction would have been, and then a fever gate could turn a reaction the
   * desktop had already committed to into silence.
   */
  act: BeatAct | null;
  /** Relative frequency within its pool. Integers, and they mean nothing alone. */
  weight: number;
}

const w = (act: BeatAct | null, weight: number): Candidate => ({ act, weight });

/**
 * One pool per beat. The weights are the tuning.
 *
 * **`fine` is the pool this file exists for.** Measured over eight real games
 * (`tools/trace.ts`), an ordinary move is ~35% of plies and every other beat
 * put together is ~21%, so `fine` is most of the traffic and its silence weight
 * is what decides whether the desktop is haunted or merely noisy. At 60%
 * silence the whole roster lands at roughly one visible reaction every ten
 * seconds, which is the rhythm the reference has: a screen that answers most
 * throws with something small and occasionally with something stupid.
 *
 * Not lower. A reaction every move is exhausting, and `BEAT_QUIET` in the
 * director is already throttling on top of this.
 */
const POOLS: Record<string, Candidate[]> = {
  // Claims nothing, because an ordinary move is nothing. Everything in here is
  // the software volunteering that it is still running.
  "move:fine": [w(null, 18), w("note", 4), w("title-slip", 3), w("dialog", 3), w("flare", 2)],
  "move:brilliant": [w("flare", 4), w("dialog", 3), w("taskbar-stutter", 3), w("note", 2)],
  // The eyebrow. Both of these answer a questionable move by declining to say
  // what they think of it, which is the closest this desktop gets to a look.
  "move:dubious": [w("title-slip", 3), w("dialog", 3), w("note", 2), w("clock-lurch", 2)],
  "move:blunder": [w("dialog", 4), w("preview-blink", 3), w("icon-twitch", 3), w("flare", 2)],
  // A live win on the board is the loudest thing that can happen without the
  // game being over, so it gets the acts that fill the frame.
  "threat:you": [w("flare", 4), w("dialog", 3), w("taskbar-stutter", 2), w("preview-blink", 2)],
  "threat:bot": [w("dialog", 4), w("icon-twitch", 3), w("clock-lurch", 3), w("flare", 2)],
  "swing:rising": [w("preview-blink", 3), w("flare", 3), w("dialog", 3), w("taskbar-stutter", 2)],
  "swing:collapsing": [w("dialog", 4), w("clock-lurch", 3), w("title-slip", 3), w("note", 2)],
};

/** The pool key a beat draws from — also the key its copy is filed under. */
export const poolKey = (b: Beat): string =>
  b.kind === "move" ? `move:${b.grade}` : b.kind === "threat" ? `threat:${b.by}` : `swing:${b.direction}`;

export interface PickOptions {
  /** The act that just played. Skipped when the pool has anything else. */
  avoid?: BeatAct | null;
  /** How bad the desktop is right now — the loud acts are gated behind it. */
  fever?: number;
}

/**
 * Draw an act for this beat, or null for "nothing happens this time".
 *
 * Two rules on top of the weights, both about how the roster feels over a whole
 * game rather than in one moment:
 *
 * - **Never twice running.** Weighted draws clump, and a clump reads as the
 *   desktop being broken rather than as chance. The last act is dropped from
 *   the pool whenever there is anything else to play.
 * - **The fever gate loses the draw, not the beat.** An act the desktop is not
 *   hot enough for is filtered out *before* the draw and something else answers,
 *   so a cool desktop still reacts — it just reacts quietly.
 *
 * A pool's silence entry survives both rules: it is never the act that just
 * played and no gate can filter it, so a pool that is mostly silence stays
 * mostly silent however hot the desktop gets. That is the point of it.
 */
export function pickAct(beat: Beat, rng: () => number, options: PickOptions = {}): BeatAct | null {
  const fever = options.fever ?? 1;
  const pool = (POOLS[poolKey(beat)] ?? []).filter(
    (c) => c.act === null || fever >= BEAT_ACTS[c.act].minFever,
  );
  if (pool.length === 0) return null;
  const fresh = pool.filter((c) => c.act === null || c.act !== options.avoid);
  return weighted(fresh.length > 0 ? fresh : pool, rng);
}

function weighted(pool: readonly Candidate[], rng: () => number): BeatAct | null {
  const total = pool.reduce((sum, c) => sum + c.weight, 0);
  let r = rng() * total;
  for (const c of pool) {
    r -= c.weight;
    if (r < 0) return c.act;
  }
  // Only reachable if rng() returns exactly 1, which the contract allows.
  return pool[pool.length - 1]!.act;
}

/** Every pool key, for the copy pass and the tests. */
export const POOL_KEYS = Object.keys(POOLS);

/** `poolKey` inverted — the harness names a pool, the director names a beat. */
export function beatFromPool(key: string): Beat {
  const [kind, rest] = key.split(":") as [string, string];
  if (kind === "threat") return { kind: "threat", by: rest === "bot" ? "bot" : "you" };
  if (kind === "swing")
    return { kind: "swing", direction: rest === "collapsing" ? "collapsing" : "rising" };
  const grade = (["brilliant", "dubious", "blunder"] as const).find((g) => g === rest) ?? "fine";
  return { kind: "move", by: "you", grade };
}
