import { describe, expect, it } from "vitest";
import {
  applyMove,
  bestMove,
  evaluate,
  initialBoard,
  legalMoves,
  type CBoard,
  type Piece,
} from "./checkers.js";

const empty = (): CBoard => Array.from({ length: 8 }, () => Array<Piece | null>(8).fill(null));

describe("initialBoard", () => {
  it("lays 12 a side on the dark squares", () => {
    const b = initialBoard();
    const flat = b.flat().filter(Boolean) as Piece[];
    expect(flat.filter((p) => p.side === 0).length).toBe(12);
    expect(flat.filter((p) => p.side === 1).length).toBe(12);
    b.forEach((row, r) =>
      row.forEach((p, c) => {
        if (p) expect((r + c) % 2).toBe(1);
      }),
    );
  });

  it("gives each opening side seven moves", () => {
    expect(legalMoves(initialBoard(), 0).length).toBe(7);
    expect(legalMoves(initialBoard(), 1).length).toBe(7);
  });
});

describe("compulsory capture", () => {
  it("offers only the jump when a jump exists", () => {
    const b = empty();
    b[4]![3] = { side: 0, king: false };
    b[3]![2] = { side: 1, king: false };
    const moves = legalMoves(b, 0);
    expect(moves.length).toBe(1);
    expect(moves[0]!.captures).toEqual([[3, 2]]);
    expect(moves[0]!.path).toEqual([[4, 3], [2, 1]]);
  });

  it("runs a double jump to completion", () => {
    const b = empty();
    b[6]![1] = { side: 0, king: false };
    b[5]![2] = { side: 1, king: false };
    b[3]![4] = { side: 1, king: false };
    const moves = legalMoves(b, 0);
    expect(moves.length).toBe(1);
    expect(moves[0]!.path).toEqual([[6, 1], [4, 3], [2, 5]]);
    expect(moves[0]!.captures.length).toBe(2);
  });

  it("men do not capture backwards", () => {
    const b = empty();
    b[3]![2] = { side: 0, king: false };
    b[4]![3] = { side: 1, king: false }; // behind the red man
    const moves = legalMoves(b, 0);
    expect(moves.every((m) => m.captures.length === 0)).toBe(true);
  });

  it("kinging ends the move even with another jump waiting", () => {
    const b = empty();
    b[2]![1] = { side: 0, king: false };
    b[1]![2] = { side: 1, king: false };
    b[1]![4] = { side: 1, king: false }; // would be jumpable if the king kept going
    const moves = legalMoves(b, 0);
    expect(moves.length).toBe(1);
    expect(moves[0]!.path).toEqual([[2, 1], [0, 3]]);
    const after = applyMove(b, moves[0]!);
    expect(after[0]![3]).toEqual({ side: 0, king: true });
    expect(after[1]![4]).not.toBeNull(); // the second yellow man survives
  });
});

describe("evaluate / bestMove", () => {
  it("counts kings above men", () => {
    const men = empty();
    men[4]![3] = { side: 0, king: false };
    const kings = empty();
    kings[4]![3] = { side: 0, king: true };
    expect(evaluate(kings)).toBeGreaterThan(evaluate(men));
  });

  it("the machine takes a free capture", () => {
    const b = empty();
    b[2]![3] = { side: 1, king: false };
    b[3]![4] = { side: 0, king: false };
    b[7]![0] = { side: 0, king: false }; // so red still has a game
    const m = bestMove(b, 1, 5, () => 0);
    expect(m!.captures).toEqual([[3, 4]]);
  });

  it("prefers not to hand over a man for nothing", () => {
    // machine man at 2,1; stepping to 3,2 walks into red's jump at 4,3.
    const b = empty();
    b[2]![1] = { side: 1, king: false };
    b[4]![3] = { side: 0, king: false };
    const m = bestMove(b, 1, 5, () => 0);
    const lands = m!.path[m!.path.length - 1]!;
    expect(lands).not.toEqual([3, 2]);
  });
});
