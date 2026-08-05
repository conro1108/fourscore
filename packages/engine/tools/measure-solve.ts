/**
 * How expensive is an exact solve, and from which ply does it become affordable?
 *
 * This exists because `exactFrom` is a claim about what the solver can actually
 * prove, and the project's rule is to say what the solver knows rather than what
 * we'd like it to know. Connect 4's answer (~10 discs) was measured; every new
 * variant needs its own number, and guessing would either make the Oracle stall
 * for minutes or make it claim exactness it doesn't have.
 *
 *   npx vite-node packages/engine/tools/measure-solve.ts -- connect5 5000
 *
 * Walks a plausible game backwards from its final position, solving each ply
 * under a node budget, and reports the earliest ply that came in under the time
 * budget. Backwards is deliberate: it mirrors what `reviewMatch` does, so the
 * shared transposition table is warm in the same way it will be in production.
 */

import { Position, VARIANTS, variantById, type Variant } from "../src/board.js";
import { BotBrain } from "../src/bots.js";
import { byId } from "../src/bots.js";
import { SearchAborted, TranspositionTable, analyze, solveScoreWithStats } from "../src/solver.js";

/** Deterministic RNG, so a re-run reports the same numbers. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A game between two mid-ladder bots, which is the kind of position a review sees. */
function playGame(v: Variant, seed: number): number[] {
  const rng = mulberry32(seed);
  const a = new BotBrain(byId("cinder"), rng);
  const b = new BotBrain(byId("bramble"), rng);
  const history: number[] = [];
  const p = Position.fromMoves([], v);

  while (!p.isDraw()) {
    const brain = p.moves % 2 === 0 ? a : b;
    const { col } = brain.decide(p);
    const winning = p.isWinningMove(col);
    history.push(col);
    p.play(col);
    if (winning) break;
  }
  return history;
}

function measure(variantId: string, budgetMs: number, games: number): void {
  const v = variantById(variantId);
  console.log(
    `\n=== ${v.name} (${v.width}x${v.height}, run ${v.run}, ${v.cells} cells, ` +
      `${v.keyBits}-bit keys) — budget ${budgetMs}ms ===`,
  );
  console.log("ply  empty   nodes        time     result");

  const earliest: number[] = [];

  for (let g = 0; g < games; g++) {
    const history = playGame(v, 1000 + g);
    const table = new TranspositionTable(23);
    let firstAffordable: number | null = null;

    for (let ply = history.length - 1; ply >= 0; ply--) {
      const p = Position.fromMoves(history.slice(0, ply), v);
      const t0 = performance.now();
      let nodes = 0;
      let outcome: string;
      try {
        const r = solveScoreWithStats(p, { table, nodeLimit: 60_000_000 });
        nodes = r.stats.nodes;
        outcome = `score ${r.score}`;
      } catch (e) {
        if (!(e instanceof SearchAborted)) throw e;
        outcome = "ABORTED";
      }
      const ms = performance.now() - t0;

      if (g === 0) {
        console.log(
          `${String(ply).padStart(3)}  ${String(v.cells - ply).padStart(5)}  ` +
            `${String(nodes).padStart(10)}  ${ms.toFixed(0).padStart(7)}ms  ${outcome}`,
        );
      }

      if (outcome === "ABORTED" || ms > budgetMs) break;
      firstAffordable = ply;
    }

    if (firstAffordable !== null) earliest.push(firstAffordable);
    console.log(
      `  game ${g}: ${history.length} plies, earliest affordable ply = ${firstAffordable ?? "none"}`,
    );
  }

  if (earliest.length > 0) {
    const sorted = [...earliest].sort((x, y) => x - y);
    const median = sorted[Math.floor(sorted.length / 2)]!;
    console.log(
      `\n  ${v.id}: earliest affordable ply — min ${sorted[0]}, ` +
        `median ${median}, max ${sorted[sorted.length - 1]}`,
    );
    console.log(`  suggested exactFrom.${v.id} = ${median}`);
  }
}

/**
 * What a *live* exact move costs, which is the number `exactFrom` actually
 * wants.
 *
 * `measure` above walks backwards with a warm table, which is what
 * `reviewMatch` does but not what a bot does. A bot solves forward, its table
 * warmed only by its own earlier moves, and it calls `analyze` — one solve per
 * legal column, not one for the position. Both differences push the affordable
 * ply later, so setting `exactFrom` from the backwards number would make the
 * Oracle sit there thinking for half a minute.
 */
function measureLive(variantId: string, budgetMs: number, games: number): void {
  const v = variantById(variantId);
  console.log(`\n=== ${v.name} — cost of the Oracle's FIRST exact move ===`);
  console.log(`budget ${budgetMs}ms\n`);
  console.log("ply  empty     time     result");

  const affordable: number[] = [];

  for (let g = 0; g < games; g++) {
    const history = playGame(v, 2000 + g);
    let earliest: number | null = null;

    // Descending, but each measurement gets its own cold table: the first exact
    // search of a match is the one the player waits on, and at that moment the
    // bot's table holds nothing useful — every search before it was heuristic,
    // and the heuristic search doesn't touch the transposition table at all.
    for (let ply = history.length - 1; ply >= 0; ply--) {
      const p = Position.fromMoves(history.slice(0, ply), v);
      if (p.isDraw()) continue;

      const table = new TranspositionTable(23);
      const t0 = performance.now();
      let outcome: string;
      try {
        // What the bot actually calls: one solve per legal column.
        const a = analyze(p, { table, nodeLimit: 12_000_000 });
        outcome = `best ${a.best}`;
      } catch (e) {
        if (!(e instanceof SearchAborted)) throw e;
        outcome = "ABORTED";
      }
      const ms = performance.now() - t0;

      if (g === 0) {
        console.log(
          `${String(ply).padStart(3)}  ${String(v.cells - ply).padStart(5)}  ` +
            `${ms.toFixed(0).padStart(7)}ms  ${outcome}`,
        );
      }

      if (outcome === "ABORTED" || ms > budgetMs) break;
      earliest = ply;
    }

    console.log(`  game ${g}: ${history.length} plies, earliest affordable ply = ${earliest ?? "none"}`);
    if (earliest !== null) affordable.push(earliest);
  }

  if (affordable.length > 0) {
    const sorted = [...affordable].sort((x, y) => x - y);
    console.log(
      `\n  ${v.id}: min ${sorted[0]}, median ${sorted[Math.floor(sorted.length / 2)]}, ` +
        `max ${sorted[sorted.length - 1]}`,
    );
    // The worst case is the one to quote: exactFrom has to hold for every game,
    // not for the median one, or the Oracle stalls on the unlucky matches.
    console.log(`  suggested exactFrom.${v.id} = ${sorted[sorted.length - 1]}`);
  }
}

const args = process.argv.slice(2).filter((a) => a !== "--");

if (args[0] === "live") {
  measureLive(args[1] ?? "connect5", Number(args[2] ?? 3000), Number(args[3] ?? 3));
} else {
  const ids = args[0] ? [args[0]] : VARIANTS.map((v) => v.id);
  const budget = Number(args[1] ?? 4000);
  const games = Number(args[2] ?? 3);
  for (const id of ids) measure(id, budget, games);
}
