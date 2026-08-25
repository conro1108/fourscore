import { describe, expect, it } from "vitest";
import { CELLS, Position } from "./board.js";
import { TranspositionTable, analyze, solveScore } from "./solver.js";

/** Full minimax, no pruning or table; only usable on nearly-full boards. */
function bruteForce(p: Position): number {
  if (p.isDraw()) return 0;
  const legal = p.legalMoves();
  for (const col of legal) {
    if (p.isWinningMove(col)) return Math.floor((CELLS + 1 - p.moves) / 2);
  }
  let best = -Infinity;
  for (const col of legal) {
    const child = p.clone();
    child.play(col);
    best = Math.max(best, -bruteForce(child));
  }
  return best === -Infinity ? 0 : best;
}

/** A random position of `plies` discs where nobody has won yet. */
function randomPosition(plies: number, seed: number): Position {
  let rng = seed;
  const next = () => (rng = (rng * 1103515245 + 12345) & 0x7fffffff);
  outer: for (;;) {
    const p = new Position();
    for (let i = 0; i < plies; i++) {
      const legal = p.legalMoves().filter((c) => !p.isWinningMove(c));
      if (legal.length === 0) continue outer;
      p.play(legal[next() % legal.length]!);
    }
    return p;
  }
}

describe("exact scores", () => {
  it("agrees with unpruned minimax on nearly-full boards", () => {
    for (let seed = 1; seed <= 25; seed++) {
      const p = randomPosition(32, seed * 31 + 7);
      if (p.canWinNext()) continue; // trivially scored, not interesting
      expect(solveScore(p)).toBe(bruteForce(p));
    }
  });

  it("agrees with unpruned minimax with a shared, reused table", () => {
    // Bots reuse a table across unrelated positions.
    const table = new TranspositionTable(18);
    for (let seed = 1; seed <= 25; seed++) {
      const p = randomPosition(30, seed * 613 + 5);
      if (p.canWinNext()) continue;
      expect(solveScore(p, { table })).toBe(bruteForce(p));
    }
  });
});

describe("analyze", () => {
  it("scores every legal move and no illegal ones", () => {
    const p = randomPosition(28, 4242);
    const a = analyze(p);
    expect(a.moves.map((m) => m.col)).toEqual(p.legalMoves().sort((x, y) => x - y));
  });
});
