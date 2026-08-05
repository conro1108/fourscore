import { describe, expect, it } from "vitest";
import {
  BOARD_MASK,
  CELLS,
  CONNECT4,
  CONNECT5,
  HEIGHT,
  MOVE_ORDER,
  Position,
  WIDTH,
  alignment,
  makeVariant,
  popcount,
  type Variant,
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
 * The variants the fuzz test runs over.
 *
 * The two shipping boards, plus two that exist only here: a cramped 5x4 run-3
 * board, because short runs on a small board put every line right up against an
 * edge and that's where wraparound bugs live, and a 10x9 run-6 board to check
 * the shift schedules keep working at a run length nothing else exercises. The
 * whole point of the geometry rewrite is that N is a parameter, and a test that
 * only ever sees 4 and 5 wouldn't be testing that.
 */
const FUZZ_VARIANTS: readonly Variant[] = [
  CONNECT4,
  CONNECT5,
  makeVariant({ id: "tiny3", name: "Tiny 3", width: 5, height: 4, run: 3 }),
  makeVariant({ id: "wide6", name: "Wide 6", width: 10, height: 9, run: 6 }),
];

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

  it("agrees on the grid contents over random games", () => {
    let rng = 999;
    const next = () => (rng = (rng * 1103515245 + 12345) & 0x7fffffff);

    for (let game = 0; game < 100; game++) {
      const p = Position.fromMoves([], v);
      const grid: (string | null)[][] = Array.from({ length: v.height }, () =>
        Array<string | null>(v.width).fill(null),
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

  /**
   * `alignment` and `isWinningMove` come from different code paths —
   * `computeAlignmentSpots` predicts a win before the disc lands, `alignment`
   * confirms one after. They have to agree, and on a random position they
   * usually agree for the wrong reason (both say no), so this drives play until
   * someone actually wins.
   */
  it("agrees with alignment on the finished position", () => {
    let rng = 4242;
    const next = () => (rng = (rng * 1103515245 + 12345) & 0x7fffffff);
    let decided = 0;

    for (let game = 0; game < 200; game++) {
      const p = Position.fromMoves([], v);
      while (p.moves < v.cells) {
        const legal = p.legalMoves();
        if (legal.length === 0) break;
        const col = legal[next() % legal.length]!;
        const won = p.isWinningMove(col);
        p.play(col);
        if (won) {
          // `position` flipped to the loser on play, so the winner is the xor.
          expect(alignment(p.position ^ p.mask, v)).toBe(true);
          expect(alignment(p.position, v)).toBe(false);
          decided++;
          break;
        }
      }
    }

    expect(decided).toBeGreaterThan(0);
  });
});
