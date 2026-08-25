import { describe, expect, it } from "vitest";
import { CONNECT4, CONNECT7, Position, makeVariant, type Variant } from "./board.js";

/**
 * A slow, obviously-correct reference implementation, used to cross-check the
 * bitboard on random games. The bit tricks in board.ts are the kind of thing
 * that passes every hand-written case and then quietly mishandles one diagonal
 * near an edge, so the real coverage here is the fuzz test at the bottom rather
 * than any single example above it.
 */
function refWins(grid: (string | null)[][], player: string, v: Variant): boolean {
  const dirs = [
    [0, 1],
    [1, 0],
    [1, 1],
    [1, -1],
  ] as const;
  for (let r = 0; r < v.height; r++) {
    for (let c = 0; c < v.width; c++) {
      if (grid[r]![c] !== player) continue;
      for (const [dc, dr] of dirs) {
        let n = 1;
        let rr = r + dr;
        let cc = c + dc;
        while (rr >= 0 && rr < v.height && cc >= 0 && cc < v.width && grid[rr]![cc] === player) {
          n++;
          rr += dr;
          cc += dc;
        }
        if (n >= v.run) return true;
      }
    }
  }
  return false;
}

/**
 * The shipping default, the biggest shipping board, and a cramped 5x4 run-3
 * board that exists only here: short runs on a small board put every line
 * right up against an edge, which is where wraparound bugs live.
 */
const FUZZ_VARIANTS: readonly Variant[] = [
  CONNECT4,
  CONNECT7,
  makeVariant({ id: "tiny3", name: "Tiny 3", width: 5, height: 4, run: 3 }),
];

describe("win detection", () => {
  it("sees a vertical win", () => {
    // Red owns column 3 rows 0-2, and is to move.
    const p = Position.fromMoves([3, 0, 3, 0, 3, 0]);
    expect(p.turn).toBe("red");
    expect(p.isWinningMove(3)).toBe(true);
  });

  it("sees a horizontal win", () => {
    const p = Position.fromMoves([0, 0, 1, 1, 2, 2]);
    expect(p.turn).toBe("red");
    expect(p.isWinningMove(3)).toBe(true);
    expect(p.isWinningMove(5)).toBe(false);
  });

  it("sees a diagonal win", () => {
    // Red staircases (0,0) (1,1) (2,2) and can complete at (3,3).
    const p = Position.fromMoves([0, 1, 1, 2, 2, 6, 2, 3, 3, 3]);
    expect(p.turn).toBe("red");
    expect(p.isWinningMove(3)).toBe(true);
  });
});

describe.each(FUZZ_VARIANTS)("fuzz against the reference implementation ($id)", (v) => {
  it("agrees on win detection over random games", () => {
    let rng = 12345;
    const next = () => (rng = (rng * 1103515245 + 12345) & 0x7fffffff);

    for (let game = 0; game < 400; game++) {
      const p = Position.fromMoves([], v);
      const grid: (string | null)[][] = Array.from({ length: v.height }, () =>
        Array<string | null>(v.width).fill(null),
      );

      while (p.moves < v.cells) {
        const legal = p.legalMoves();
        if (legal.length === 0) break;
        const col = legal[next() % legal.length]!;
        const player = p.turn;
        const row = p.landingRow(col);

        // The bitboard's prediction, made before the disc lands...
        const claimed = p.isWinningMove(col);

        grid[row]![col] = player;
        p.play(col);

        // ...checked against what the reference sees after it has.
        expect(claimed).toBe(refWins(grid, player, v));
        if (claimed) break;
      }
    }
  });
});
