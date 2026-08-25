/**
 * Which act answers which beat — a weighted draw. Randomness picks *which*
 * act fires, never how an act looks; every act is fixed choreography. `rng`
 * is injected (deterministic under test) and is the only randomness in the
 * beat system. The ending (win/loss/draw) is `endgame.ts`, hand-tuned.
 */

import type { Beat } from "./director.js";

/** Every reaction to a ply, and the fever it is gated behind. */
export const BEAT_ACTS = {
  dialog: { minFever: 0 },
  "title-slip": { minFever: 0 },
  note: { minFever: 0 },
  flare: { minFever: 0 },
  "clock-lurch": { minFever: 0.25 },
  "taskbar-stutter": { minFever: 0.25 },
  "icon-twitch": { minFever: 0.5 },
  "preview-blink": { minFever: 0.5 },
} as const;

export type BeatAct = keyof typeof BEAT_ACTS;

export interface Candidate {
  /** `null` = silence. It lives in the same draw as the choice so the fever
      gate can't turn a committed reaction into silence. */
  act: BeatAct | null;
  /** Relative frequency within its pool. */
  weight: number;
}

const w = (act: BeatAct | null, weight: number): Candidate => ({ act, weight });

/** One pool per beat. `move:fine` is ~35% of plies (eight traced games; all
    other beats ~21% together), so its 60% silence sets the rhythm: about one
    visible reaction per ten seconds. Don't lower it — `BEAT_QUIET` already
    throttles on top. */
const POOLS: Record<string, Candidate[]> = {
  "move:fine": [w(null, 18), w("note", 4), w("title-slip", 3), w("dialog", 3), w("flare", 2)],
  "move:brilliant": [w("flare", 4), w("dialog", 3), w("taskbar-stutter", 3), w("note", 2)],
  "move:dubious": [w("title-slip", 3), w("dialog", 3), w("note", 2), w("clock-lurch", 2)],
  "move:blunder": [w("dialog", 4), w("preview-blink", 3), w("icon-twitch", 3), w("flare", 2)],
  "threat:you": [w("flare", 4), w("dialog", 3), w("taskbar-stutter", 2), w("preview-blink", 2)],
  "threat:bot": [w("dialog", 4), w("icon-twitch", 3), w("clock-lurch", 3), w("flare", 2)],
  "swing:rising": [w("preview-blink", 3), w("flare", 3), w("dialog", 3), w("taskbar-stutter", 2)],
  "swing:collapsing": [w("dialog", 4), w("clock-lurch", 3), w("title-slip", 3), w("note", 2)],
};

/** Pool key — also the key its copy is filed under. */
export const poolKey = (b: Beat): string =>
  b.kind === "move" ? `move:${b.grade}` : b.kind === "threat" ? `threat:${b.by}` : `swing:${b.direction}`;

export interface PickOptions {
  /** Last act; skipped when the pool has anything else. */
  avoid?: BeatAct | null;
  fever?: number;
}

/**
 * Draw an act, or null for silence. Never the same act twice running (clumps
 * read as broken); fever-gated acts are filtered *before* the draw so a cool
 * desktop still reacts, quietly. Silence survives both rules by design.
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

export const POOL_KEYS = Object.keys(POOLS);

/** `poolKey` inverted, for the harness. */
export function beatFromPool(key: string): Beat {
  const [kind, rest] = key.split(":") as [string, string];
  if (kind === "threat") return { kind: "threat", by: rest === "bot" ? "bot" : "you" };
  if (kind === "swing")
    return { kind: "swing", direction: rest === "collapsing" ? "collapsing" : "rising" };
  const grade = (["brilliant", "dubious", "blunder"] as const).find((g) => g === rest) ?? "fine";
  return { kind: "move", by: "you", grade };
}
