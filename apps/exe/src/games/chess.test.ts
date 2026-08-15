import { describe, expect, it } from "vitest";
import {
  applyMove,
  attackerValue,
  endSquares,
  evaluate,
  hangingValue,
  inCheck,
  initialState,
  legalMoves,
  mateInOne,
  outcomeOf,
  parseFen,
  perft,
  searchDepth,
  sharpness,
  type ChessMove,
} from "./chess.js";

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

  it("matches position 3, where en-passant pins live", () => {
    const s = parseFen("8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1");
    expect(perft(s, 1)).toBe(14);
    expect(perft(s, 2)).toBe(191);
    expect(perft(s, 3)).toBe(2812);
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

  it("sees stalemate as no moves and no check", () => {
    const s = parseFen("7k/5Q2/6K1/8/8/8/8/8 b - - 0 1");
    expect(legalMoves(s).length).toBe(0);
    expect(inCheck(s, 1)).toBe(false);
  });
});

describe("the special moves", () => {
  it("offers en passant only right after the double push", () => {
    let s = initialState();
    for (const m of [mv("e2", "e4"), mv("a7", "a6"), mv("e4", "e5"), mv("d7", "d5")])
      s = applyMove(s, m);
    const ep = legalMoves(s).find((m) => m.from[1] === 4 && m.to[1] === 3 && m.to[0] === 2);
    expect(ep).toBeTruthy();
    // the captured pawn actually leaves
    const after = applyMove(s, ep!);
    expect(after.board[3]![3]).toBeNull();
    // and a move later the offer is gone
    const s2 = applyMove(applyMove(s, mv("h2", "h3")), mv("h7", "h6"));
    expect(legalMoves(s2).some((m) => m.to[0] === 2 && m.to[1] === 3 && m.from[1] === 4)).toBe(false);
  });

  it("castles through open, unattacked lanes only", () => {
    const open = parseFen("r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1");
    const kingMoves = legalMoves(open).filter((m) => m.from[0] === 7 && m.from[1] === 4);
    expect(kingMoves.some((m) => m.to[1] === 6)).toBe(true);
    expect(kingMoves.some((m) => m.to[1] === 2)).toBe(true);
    // a rook eyeing f1 forbids kingside but not queenside
    const watched = parseFen("r3k2r/8/8/8/8/5q2/8/R3K2R w KQkq - 0 1");
    const wk = legalMoves(watched).filter((m) => m.from[0] === 7 && m.from[1] === 4);
    expect(wk.some((m) => m.to[1] === 6)).toBe(false);
    // castling moves the rook too
    const after = applyMove(open, mv("e1", "g1"));
    expect(after.board[7]![5]?.t).toBe("r");
    expect(after.board[7]![7]).toBeNull();
  });

  it("promotes to all four pieces", () => {
    const s = parseFen("8/P6k/8/8/8/8/8/K7 w - - 0 1");
    const promos = legalMoves(s).filter((m) => m.promo);
    expect(promos.map((m) => m.promo).sort()).toEqual(["b", "n", "q", "r"]);
    const after = applyMove(s, promos.find((m) => m.promo === "q")!);
    expect(after.board[0]![0]).toEqual({ t: "q", s: 0 });
  });
});

describe("the opponent", () => {
  it("values material like it should", () => {
    const up = parseFen("k7/8/8/8/8/8/8/K2Q4 w - - 0 1");
    expect(evaluate(up.board)).toBeGreaterThan(800);
  });

  it("takes a mate in one", () => {
    // white: Ra1-a8 is mate (king g8 boxed by its own pawns, rook takes the back rank)
    const s = parseFen("6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1");
    const m = searchDepth(s, 3, null, () => 0)!;
    const after = applyMove(s, m);
    expect(inCheck(after, 1)).toBe(true);
    expect(legalMoves(after).length).toBe(0);
  });

  it("grabs a hanging queen", () => {
    const s = parseFen("k7/8/8/3q4/4P3/8/8/K7 w - - 0 1");
    const m = searchDepth(s, 3, null, () => 0)!;
    expect(m.to).toEqual([3, 3]);
  });
});

/* The result is a fact and the window states it flat; the sharpness is a guess
   and everything it drives hedges. These are the two halves of that. */

describe("the result, which stays on the board", () => {
  it("names checkmate for whichever king ran out of squares", () => {
    let s = initialState();
    for (const m of [mv("f2", "f3"), mv("e7", "e5"), mv("g2", "g4"), mv("d8", "h4")])
      s = applyMove(s, m);
    expect(outcomeOf(s, 1)).toBe("machineWins");
    // and it is the mated king that gets selected — e1, the white king
    expect(endSquares(s, "machineWins")).toEqual([[7, 4]]);
  });

  it("names stalemate and selects the king with nowhere to go", () => {
    const s = parseFen("7k/5Q2/6K1/8/8/8/8/8 b - - 0 1");
    expect(outcomeOf(s, 1)).toBe("stalemate");
    expect(endSquares(s, "stalemate")).toEqual([[0, 7]]);
  });

  it("counts the draws, and a draw is about both kings", () => {
    const quiet = parseFen("7k/8/6K1/8/8/8/8/R7 w - - 0 1");
    expect(outcomeOf(quiet, 1)).toBeNull();
    expect(outcomeOf(quiet, 3)).toBe("threefold");
    expect(outcomeOf(parseFen("7k/8/6K1/8/8/8/8/R7 w - - 100 1"), 1)).toBe("fifty");
    expect(endSquares(quiet, "threefold")).toEqual([[2, 6], [0, 7]]);
  });

  it("says nothing about a position that is still a game", () => {
    expect(outcomeOf(initialState(), 1)).toBeNull();
  });
});

describe("how sharp the window thinks it looks", () => {
  it("reads the opening as calm, and stays calm after a normal move", () => {
    const s = initialState();
    expect(sharpness(s).tier).toBe(0);
    expect(sharpness(s).note).toBeNull();
    expect(sharpness(applyMove(s, mv("e2", "e4"))).tier).toBe(0);
  });

  it("finds the cheapest attacker, and a king is not cheap", () => {
    // black queen on d5, attacked by a white pawn on e4 and the white king on c4
    const b = parseFen("k7/8/8/3q4/2K1P3/8/8/8 w - - 0 1").board;
    expect(attackerValue(b, 3, 3, 0)).toBe(100);
    // nothing of black's attacks e4 except the queen
    expect(attackerValue(b, 4, 4, 1)).toBe(900);
    expect(attackerValue(b, 0, 0, 0)).toBe(Infinity);
  });

  it("notices material standing loose, and how much of it", () => {
    expect(hangingValue(initialState().board)).toBe(0);
    // an undefended queen where a pawn can reach it costs the whole queen
    expect(hangingValue(parseFen("k7/8/8/3q4/4P3/8/8/K7 w - - 0 1").board)).toBe(900);
    // defended by its own king, it still costs the difference against a pawn
    expect(hangingValue(parseFen("8/8/2k5/3q4/4P3/8/8/K7 w - - 0 1").board)).toBe(800);
    const loose = sharpness(parseFen("k7/8/8/3q4/4P3/8/8/K7 w - - 0 1"));
    expect(loose.tier).toBeGreaterThanOrEqual(1);
    expect(loose.note).toBe("loose");
  });

  it("sits up for a mate on the board and calls it nothing stronger", () => {
    const s = parseFen("6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1");
    expect(mateInOne(s)).toBe(true);
    const sharp = sharpness(s);
    expect(sharp.tier).toBeGreaterThanOrEqual(2);
    expect(sharp.note).toBe("mate");
    expect(mateInOne(initialState())).toBe(false);
  });

  it("answers a check, and lets go of it again", () => {
    const checked = parseFen("4k3/8/8/8/8/8/8/4R1K1 b - - 0 1");
    expect(sharpness(checked).tier).toBeGreaterThanOrEqual(1);
    // the king steps aside and the window goes back to calm — a tier is a
    // state, and this one is allowed to end
    const quiet = applyMove(checked, mv("e8", "d8"));
    expect(sharpness(quiet).tier).toBe(0);
  });

  it("hears a big swing, and never reports more than 1", () => {
    const s = initialState();
    expect(sharpness(s, 900).tier).toBeGreaterThanOrEqual(1);
    expect(sharpness(parseFen("6k1/5ppp/3q4/8/8/8/8/R5K1 w - - 0 1"), 900).level)
      .toBeLessThanOrEqual(1);
  });
});
