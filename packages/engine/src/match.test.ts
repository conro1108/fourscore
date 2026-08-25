import { describe, expect, it } from "vitest";
import { CONNECT5 } from "./board.js";
import { Match, reviewMatch } from "./match.js";

describe("Match", () => {
  it("needs five in a row on Connect 5, not four", () => {
    // Four along the bottom: a win on Connect 4, not here.
    const four = Match.fromMoves([0, 0, 1, 1, 2, 2, 3, 3], CONNECT5);
    expect(four.status).toBe("playing");
    expect(four.winner).toBe(null);

    expect(four.play(4)).toBe(true);
    expect(four.winner).toBe("red");
    expect(four.winningCells).toHaveLength(5);
    expect(four.winningCells.map((c) => c.col).sort()).toEqual([0, 1, 2, 3, 4]);
  });

  it("records a win and stops accepting moves", () => {
    const m = Match.fromMoves([0, 6, 1, 6, 2, 5]);
    expect(m.status).toBe("playing");
    expect(m.play(3)).toBe(true);
    expect(m.status).toBe("won");
    expect(m.winner).toBe("red");
    expect(m.play(4)).toBe(false);
  });
});

/** A random legal game played to the end. */
function randomGame(seed: number): Match {
  let rng = seed;
  const next = () => (rng = (rng * 1103515245 + 12345) & 0x7fffffff);
  const m = new Match();
  while (m.status === "playing") {
    const legal = m.position.legalMoves();
    m.play(legal[next() % legal.length]!);
  }
  return m;
}

describe("reviewMatch", () => {
  it("returns one record per ply, in order", () => {
    const m = Match.fromMoves([0, 6, 1, 6, 2, 5, 3]);
    expect(m.status).toBe("won");
    const review = reviewMatch(m.history, { nodeLimit: 20_000 });
    expect(review.plies).toHaveLength(m.history.length);
    expect(review.plies.map((p) => p.ply)).toEqual(m.history.map((_, i) => i));
    for (const rec of review.plies) expect(rec.col).toBe(m.history[rec.ply]);
  });

  it("marks what it could not prove as an estimate rather than a fact", () => {
    // Opening is out of exact reach: must be labelled estimated, never a turning point.
    const m = randomGame(8);
    const review = reviewMatch(m.history, { nodeLimit: 50_000 });
    const early = review.plies.filter((p) => p.ply < 6);

    expect(early.some((p) => p.source === "estimated")).toBe(true);
    expect(review.skipped).toBeGreaterThan(0);

    for (const p of review.plies) {
      if (p.source !== "estimated") continue;
      expect(p.bestScore).not.toBeNull();
      expect(p.playedScore).not.toBeNull();
      expect(p.bestCols.length).toBeGreaterThan(0);
      expect(p.turningPoint).toBe(false);
    }
  });
});
