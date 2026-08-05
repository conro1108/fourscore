/**
 * Raw solver throughput on a fixed Connect 4 position.
 *
 * Deliberately written against only the API that predates variants, so it can
 * be run on an older checkout to compare against.
 *
 *   npx vite-node packages/engine/tools/bench-solve.ts
 */

import { Position } from "../src/board.js";
import { TranspositionTable, solveScoreWithStats } from "../src/solver.js";

const HISTORY = [3, 3, 4, 4, 2, 5, 1];

for (let run = 0; run < 3; run++) {
  const p = Position.fromMoves(HISTORY);
  const t0 = performance.now();
  const { score, stats } = solveScoreWithStats(p, { table: new TranspositionTable(22) });
  const ms = performance.now() - t0;
  console.log(
    `ply${p.moves} score=${score} nodes=${stats.nodes} ${ms.toFixed(0)}ms ` +
      `${(((stats.nodes / ms) * 1000) / 1e6).toFixed(3)}M nodes/sec`,
  );
}
