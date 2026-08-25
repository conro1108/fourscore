import { describe, expect, it } from "vitest";
import { bestMove, type CBoard, type Piece } from "./checkers.js";

const empty = (): CBoard => Array.from({ length: 8 }, () => Array<Piece | null>(8).fill(null));

describe("bestMove", () => {
  it("the machine takes a free capture", () => {
    const b = empty();
    b[2]![3] = { side: 1, king: false };
    b[3]![4] = { side: 0, king: false };
    b[7]![0] = { side: 0, king: false }; // so red still has a game
    const m = bestMove(b, 1, 5, () => 0);
    expect(m!.captures).toEqual([[3, 4]]);
  });
});
