/**
 * Head-to-head rung sweep — the real ladder measurement (CLAUDE.md § ladder).
 * Run after any retune or new variant.
 *
 *   npx vite-node packages/engine/tools/ladder.ts -- connect5 8
 *   npx vite-node packages/engine/tools/ladder.ts -- checks     # slip guard, tells, oracle
 */

import { CONNECT4, Position, variantById, type Variant } from "../src/board.js";
import { BotBrain, ROSTER, byId } from "../src/bots.js";
import { Match } from "../src/match.js";
import { searchHeuristic } from "../src/evaluate.js";

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

/** Behavioural checks: slip guard, slip ranking, tells, Oracle crossover. */
function checks(): void {
  const report = (name: string, ok: boolean, detail = "") =>
    console.log(`${ok ? "ok  " : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);

  const win = Position.fromMoves([0, 6, 1, 6, 2, 5]);
  const block = Position.fromMoves([0, 6, 1, 6, 2]);
  const misses = (bot: (typeof ROSTER)[number], p: Position, seeds: number) => {
    let n = 0;
    for (let seed = 0; seed < seeds; seed++) {
      if (new BotBrain(bot, mulberry32(seed)).decide(p).col !== 3) n++;
    }
    return n;
  };
  for (const bot of ROSTER.filter((b) => b.tier >= 2)) {
    const always = { ...bot, slipRate: 1 };
    report(`${bot.id} never slips a win or block`, misses(always, win, 5) + misses(always, block, 5) === 0);
  }
  const acornWin = misses(byId("acorn"), win, 100);
  const acornBlock = misses(byId("acorn"), block, 100);
  report("acorn does miss them", acornWin > 10 && acornBlock > 10, `${acornWin}/100 wins, ${acornBlock}/100 blocks`);

  {
    const p = Position.fromMoves([3, 3, 4]);
    const scored = searchHeuristic(p, 4, byId("moss").weights, 400_000);
    const ranked = [...scored.moves].sort((a, b) => b.score - a.score);
    const runnerUp = ranked.find((m) => !scored.bestCols.includes(m.col))!.col;
    const worst = ranked[ranked.length - 1]!.col;
    const counts = new Map<number, number>();
    const slippy = { ...byId("moss"), slipRate: 1 };
    for (let seed = 0; seed < 400; seed++) {
      const { col } = new BotBrain(slippy, mulberry32(seed)).decide(p);
      counts.set(col, (counts.get(col) ?? 0) + 1);
    }
    const ru = counts.get(runnerUp) ?? 0;
    const w = counts.get(worst) ?? 0;
    report("slips favour the runner-up over the worst move", ru > 2 * w, `runner-up ${ru}, worst ${w}`);
  }

  {
    const brain = new BotBrain(byId("cinder"), mulberry32(21));
    const match = new Match();
    let ok = true;
    let honest = true;
    while (match.status === "playing") {
      const d = brain.decide(match.position);
      if (d.conviction < -1 || d.conviction > 1 || !d.mood) ok = false;
      if (match.position.moves < 8 && d.mood !== d.trueMood) honest = false;
      match.play(d.col);
    }
    report("cinder's tells are in range", ok);
    report("cinder's mood is honest", honest);
    const liar = new BotBrain(byId("vane"), mulberry32(5));
    let divergences = 0;
    for (let seed = 0; seed < 40; seed++) {
      const p = Position.fromMoves([3, 3, 4, 2, 5].slice(0, (seed % 5) + 1));
      const d = liar.decide(p);
      if (d.mood !== d.trueMood) divergences++;
    }
    report("vane's mood lies sometimes", divergences > 0, `${divergences}/40`);
  }

  {
    const brain = new BotBrain(byId("oracle"), mulberry32(2));
    const deep = Position.fromMoves([3, 3, 4, 4, 2, 2, 5, 5, 1, 1, 0]);
    report("oracle solves exactly past exactFrom", deep.moves >= brain.exactFrom(CONNECT4) && brain.decide(deep).exact);
    const d = brain.decide(new Position());
    report("oracle estimates in the opening", !d.exact && d.col >= 0);
  }
}

const args = process.argv.slice(2).filter((a) => a !== "--");
if (args[0] === "checks") {
  checks();
  process.exit(0);
}
const v = variantById(args[0] ?? "connect4");
const games = Number(args[1] ?? 8);
/** Optional substring filter on rung name. */
const only = args[2];

const rungs = only ? RUNGS.filter(([s, w]) => `${s} ${w}`.includes(only)) : RUNGS;

console.log(`\n=== ${v.name} ladder, ${games} games per rung ===\n`);
console.log("rung                     points   rate   avg plies  time");

for (const [strong, weak] of rungs) {
  let points = 0;
  let plies = 0;
  const t0 = performance.now();

  for (let g = 0; g < games; g++) {
    // Alternate who opens; first player has a real edge.
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
