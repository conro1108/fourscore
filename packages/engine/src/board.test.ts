import { describe, expect, it } from "vitest";
import {
  BOARD_MASK,
  CELLS,
  HEIGHT,
  MOVE_ORDER,
  Position,
  WIDTH,
  alignment,
  popcount,
} from "./board.js";

/** Bit index of a cell, row 0 being the bottom of the column. */
const bit = (col: number, row: number): bigint => 1n << (BigInt(col) * BigInt(HEIGHT + 1) + BigInt(row));

/**
 * A slow, obviously-correct reference implementation, used to cross-check the
 * bitboard on random games. The bit tricks in board.ts are the kind of thing
 * that passes every hand-written case and then quietly mishandles one diagonal
 * near an edge, so the real coverage here is the fuzz test at the bottom rather
 * than any single example above it.
 */
function refWins(grid: (string | null)[][], player: string): boolean {
  const dirs = [
    [0, 1],
    [1, 0],
    [1, 1],
    [1, -1],
  ] as const;
  for (let r = 0; r < HEIGHT; r++) {
    for (let c = 0; c < WIDTH; c++) {
      if (grid[r]![c] !== player) continue;
      for (const [dc, dr] of dirs) {
        let n = 1;
        let rr = r + dr;
        let cc = c + dc;
        while (rr >= 0 && rr < HEIGHT && cc >= 0 && cc < WIDTH && grid[rr]![cc] === player) {
          n++;
          rr += dr;
          cc += dc;
        }
        if (n >= 4) return true;
      }
    }
  }
  return false;
}

describe("layout", () => {
  it("packs every playable cell and nothing else", () => {
    expect(popcount(BOARD_MASK)).toBe(CELLS);
  });

  it("searches the centre column first", () => {
    expect([...MOVE_ORDER]).toEqual([3, 2, 4, 1, 5, 0, 6]);
  });
});

describe("play", () => {
  it("alternates turns starting with red", () => {
    const p = new Position();
    expect(p.turn).toBe("red");
    p.play(3);
    expect(p.turn).toBe("yellow");
    p.play(3);
    expect(p.turn).toBe("red");
  });

  it("stacks discs and reports the column full after HEIGHT drops", () => {
    const p = new Position();
    for (let i = 0; i < HEIGHT; i++) {
      expect(p.canPlay(0)).toBe(true);
      p.play(0);
    }
    expect(p.canPlay(0)).toBe(false);
    expect(p.legalMoves()).not.toContain(0);
  });

  it("rejects out-of-range columns", () => {
    const p = new Position();
    expect(p.canPlay(-1)).toBe(false);
    expect(p.canPlay(WIDTH)).toBe(false);
  });

  it("places discs where the grid says it did", () => {
    const p = Position.fromMoves([3, 3]);
    const g = p.grid();
    expect(g[HEIGHT - 1]![3]).toBe("red");
    expect(g[HEIGHT - 2]![3]).toBe("yellow");
    expect(g[HEIGHT - 3]![3]).toBe(null);
  });

  it("reports the landing row a disc would fall to", () => {
    const p = new Position();
    expect(p.landingRow(3)).toBe(HEIGHT - 1);
    p.play(3);
    expect(p.landingRow(3)).toBe(HEIGHT - 2);
  });

  it("refuses to build a position from an illegal move list", () => {
    expect(() => Position.fromMoves([0, 0, 0, 0, 0, 0, 0])).toThrow(/illegal/);
  });
});

describe("alignment", () => {
  it("finds four stacked in one column", () => {
    const pos = bit(0, 2) | bit(0, 3) | bit(0, 4) | bit(0, 5);
    expect(alignment(pos)).toBe(true);
  });

  it("does not leak a run across the column boundary", () => {
    // Three at the top of column 0 plus one at the bottom of column 1 are
    // adjacent in bit space only if the sentinel row is missing. It isn't.
    const pos = bit(0, 3) | bit(0, 4) | bit(0, 5) | bit(1, 0);
    expect(alignment(pos)).toBe(false);
  });

  it("finds both diagonals", () => {
    const up = bit(0, 0) | bit(1, 1) | bit(2, 2) | bit(3, 3);
    const down = bit(0, 3) | bit(1, 2) | bit(2, 1) | bit(3, 0);
    expect(alignment(up)).toBe(true);
    expect(alignment(down)).toBe(true);
  });

  it("is not fooled by three in a row", () => {
    expect(alignment(bit(0, 0) | bit(1, 0) | bit(2, 0))).toBe(false);
  });
});

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

  it("knows when it can win next", () => {
    expect(Position.fromMoves([0, 0, 1, 1, 2, 2]).canWinNext()).toBe(true);
    expect(new Position().canWinNext()).toBe(false);
  });
});

describe("nonLosingMoves", () => {
  it("forces the block when the opponent has one threat", () => {
    // Red holds the bottom of columns 0-2; yellow's only survivable move is 3.
    const p = Position.fromMoves([0, 6, 1, 6, 2]);
    expect(p.turn).toBe("yellow");
    expect(p.nonLosingMoves()).toBe(bit(3, 0));
  });

  it("gives up when the opponent has two threats", () => {
    // Red's open three on columns 2-4 can be completed at either end.
    const p = Position.fromMoves([2, 0, 3, 0, 4]);
    expect(p.turn).toBe("yellow");
    expect(p.nonLosingMoves()).toBe(0n);
  });

  it("never plays directly under an opponent's winning cell", () => {
    const p = Position.fromMoves([0, 6, 1, 6, 2]);
    // Column 3 row 0 is the block; row 1 sits above it and is not yet playable,
    // so the mask returned must be exactly the block and nothing stacked on it.
    expect(p.nonLosingMoves() & bit(3, 1)).toBe(0n);
  });
});

describe("fuzz against the reference implementation", () => {
  it("agrees on win detection over random games", () => {
    let rng = 12345;
    const next = () => (rng = (rng * 1103515245 + 12345) & 0x7fffffff);

    for (let game = 0; game < 400; game++) {
      const p = new Position();
      const grid: (string | null)[][] = Array.from({ length: HEIGHT }, () =>
        Array<string | null>(WIDTH).fill(null),
      );

      while (p.moves < CELLS) {
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
        expect(claimed).toBe(refWins(grid, player));
        if (claimed) break;
      }
    }
  });

  it("agrees on the grid contents over random games", () => {
    let rng = 999;
    const next = () => (rng = (rng * 1103515245 + 12345) & 0x7fffffff);

    for (let game = 0; game < 100; game++) {
      const p = new Position();
      const grid: (string | null)[][] = Array.from({ length: HEIGHT }, () =>
        Array<string | null>(WIDTH).fill(null),
      );
      for (let ply = 0; ply < 20; ply++) {
        const legal = p.legalMoves();
        if (legal.length === 0) break;
        const col = legal[next() % legal.length]!;
        grid[p.landingRow(col)]![col] = p.turn;
        p.play(col);
      }
      expect(p.grid()).toEqual(grid);
    }
  });
});
