/**
 * Head-to-head sweep for a variant, to check the ladder is still a ladder.
 *
 * `bots.test.ts` asserts adjacent rungs beat each other, but the thresholds in
 * it came from a sweep like this one, and a new board is exactly the kind of
 * change that can invert a rung: the weights were tuned against 7x6 Connect 4,
 * and depth interacts with them. Run this before trusting a variant's roster.
 *
 *   npx vite-node packages/engine/tools/ladder.ts -- connect5 8
 */

import { Position, variantById, type Variant } from "../src/board.js";
import { BotBrain, byId } from "../src/bots.js";
import { Match } from "../src/match.js";

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function playMatch(
  aId: string,
  bId: string,
  seed: number,
  v: Variant,
): { winner: string | null; plies: number } {
  const rng = mulberry32(seed);
  const a = new BotBrain(byId(aId), rng);
  const b = new BotBrain(byId(bId), rng);
  const match = new Match(v);

  while (match.status === "playing") {
    const brain = match.position.moves % 2 === 0 ? a : b;
    const { col } = brain.decide(match.position);
    if (!match.play(col)) throw new Error(`${brain.profile.id} chose illegal column ${col}`);
  }
  const winner = match.winner === null ? null : match.winner === "red" ? aId : bId;
  return { winner, plies: match.history.length };
}

const RUNGS = [
  ["pebble", "acorn"],
  ["moss", "pebble"],
  ["bramble", "moss"],
  ["cinder", "bramble"],
  ["vane", "cinder"],
  ["quill", "vane"],
] as const;

const args = process.argv.slice(2).filter((a) => a !== "--");
const v = variantById(args[0] ?? "connect4");
const games = Number(args[1] ?? 8);
/** Optional substring filter, so a single broken rung can be iterated on. */
const only = args[2];

const rungs = only ? RUNGS.filter(([s, w]) => `${s} ${w}`.includes(only)) : RUNGS;

console.log(`\n=== ${v.name} ladder, ${games} games per rung ===\n`);
console.log("rung                     points   rate   avg plies  time");

for (const [strong, weak] of rungs) {
  let points = 0;
  let plies = 0;
  const t0 = performance.now();

  for (let g = 0; g < games; g++) {
    // Alternate who opens: on a gravity board the first player has a real edge,
    // and a one-sided sweep would measure that instead of the rung.
    const strongOpens = g % 2 === 0;
    const seed = 1 + g * 7919;
    const r = strongOpens
      ? playMatch(strong, weak, seed, v)
      : playMatch(weak, strong, seed, v);
    if (r.winner === strong) points += 1;
    else if (r.winner === null) points += 0.5;
    plies += r.plies;
  }

  const rate = points / games;
  const flag = rate > 0.65 ? "" : rate >= 0.5 ? "   <-- soft" : "   <-- INVERTED";
  console.log(
    `${`${strong} > ${weak}`.padEnd(24)} ${String(points).padStart(5)}   ` +
      `${(rate * 100).toFixed(0).padStart(3)}%   ${(plies / games).toFixed(0).padStart(8)}  ` +
      `${((performance.now() - t0) / 1000).toFixed(1)}s${flag}`,
  );
}
