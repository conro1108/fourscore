import { describe, expect, it } from "vitest";
import { applyMove, inCheck, initialState, legalMoves, parseFen, perft, searchDepth, type ChessMove } from "./chess.js";

/** Move by algebraic squares, for readable tests. */
const mv = (from: string, to: string, promo?: "q" | "r" | "b" | "n"): ChessMove => ({
  from: [8 - Number(from[1]), from.charCodeAt(0) - 97],
  to: [8 - Number(to[1]), to.charCodeAt(0) - 97],
  ...(promo ? { promo } : {}),
});

describe("perft — the movegen's lie detector", () => {
  it("matches the published counts from the initial position", () => {
    const s = initialState();
    expect(perft(s, 1)).toBe(20);
    expect(perft(s, 2)).toBe(400);
    expect(perft(s, 3)).toBe(8902);
  });

  it("matches Kiwipete, the castling/ep/promotion gauntlet", () => {
    const s = parseFen("r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1");
    expect(perft(s, 1)).toBe(48);
    expect(perft(s, 2)).toBe(2039);
  });

});

describe("the endings", () => {
  it("sees fool's mate", () => {
    let s = initialState();
    for (const m of [mv("f2", "f3"), mv("e7", "e5"), mv("g2", "g4"), mv("d8", "h4")])
      s = applyMove(s, m);
    expect(inCheck(s, 0)).toBe(true);
    expect(legalMoves(s).length).toBe(0);
  });

});

describe("the opponent", () => {
  it("takes a mate in one", () => {
    // white: Ra1-a8 is mate (king g8 boxed by its own pawns, rook takes the back rank)
    const s = parseFen("6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1");
    const m = searchDepth(s, 3, null, () => 0)!;
    const after = applyMove(s, m);
    expect(inCheck(after, 1)).toBe(true);
    expect(legalMoves(after).length).toBe(0);
  });
});
