import { describe, expect, it } from "vitest";
import { CELLS, Position, mirror } from "./board.js";
import { TranspositionTable, analyze, solveScore } from "./solver.js";

/**
 * Full minimax, no pruning, no table — slow but incapable of being subtly
 * wrong. Only usable on nearly-full boards, which is exactly where we want to
 * pin the real solver down: alpha-beta bugs love to hide in the terminal cases.
 */
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
  it("scores an immediate win by how much material is left over", () => {
    // Red completes the bottom row on ply 6, leaving 18 discs unplayed.
    const p = Position.fromMoves([0, 0, 1, 1, 2, 2]);
    expect(solveScore(p)).toBe(Math.floor((CELLS + 1 - 6) / 2));
  });

  it("rates an available win above every alternative", () => {
    // Deliberately a late position: `analyze` solves each non-winning reply
    // exactly, and doing that from a six-disc board takes minutes.
    let found = 0;
    for (let seed = 1; seed <= 40 && found < 3; seed++) {
      const p = randomPosition(30, seed * 149);
      if (!p.canWinNext()) continue;
      found++;
      const a = analyze(p);
      expect(a.best).toBe(Math.floor((CELLS + 1 - p.moves) / 2));
      for (const col of a.bestCols) expect(p.isWinningMove(col)).toBe(true);
    }
    expect(found).toBeGreaterThan(0);
  });

  it("sees a loss coming when every reply hands over the game", () => {
    // Red's open three on columns 2-4 cannot be answered.
    const p = Position.fromMoves([2, 0, 3, 0, 4]);
    expect(p.turn).toBe("yellow");
    expect(solveScore(p)).toBeLessThan(0);
  });

  it("is unaffected by mirroring the board", () => {
    for (let seed = 1; seed <= 6; seed++) {
      const p = randomPosition(20, seed * 977);
      expect(solveScore(p)).toBe(solveScore(mirror(p)));
    }
  });

  it("agrees with unpruned minimax on nearly-full boards", () => {
    for (let seed = 1; seed <= 25; seed++) {
      const p = randomPosition(32, seed * 31 + 7);
      if (p.canWinNext()) continue; // trivially scored, not interesting
      expect(solveScore(p)).toBe(bruteForce(p));
    }
  });

  it("agrees with unpruned minimax with a shared, reused table", () => {
    // Reusing a table across unrelated positions is how the bots run, so the
    // entries left behind by one search must not corrupt the next.
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

  it("reports a best score matching a direct solve", () => {
    for (let seed = 1; seed <= 8; seed++) {
      const p = randomPosition(30, seed * 101);
      if (p.canWinNext()) continue;
      expect(analyze(p).best).toBe(solveScore(p));
    }
  });

  it("lists every column that ties for best", () => {
    const p = randomPosition(30, 55);
    const a = analyze(p);
    for (const col of a.bestCols) {
      expect(a.moves.find((m) => m.col === col)!.score).toBe(a.best);
    }
    expect(a.moves.filter((m) => m.score === a.best).length).toBe(a.bestCols.length);
  });
});
