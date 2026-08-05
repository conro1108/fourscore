import { describe, expect, it } from "vitest";
import { CONNECT5, HEIGHT, Position, WIDTH } from "./board.js";
import { Match, findWinningLine, gradeMove, reviewMatch } from "./match.js";
import { analyze } from "./solver.js";

describe("Connect 5", () => {
  it("needs five in a row, not four", () => {
    // Four along the bottom, which would already have won on Connect 4.
    const four = Match.fromMoves([0, 0, 1, 1, 2, 2, 3, 3], CONNECT5);
    expect(four.status).toBe("playing");
    expect(four.winner).toBe(null);

    expect(four.play(4)).toBe(true);
    expect(four.winner).toBe("red");
    expect(four.winningCells).toHaveLength(5);
    expect(four.winningCells.map((c) => c.col).sort()).toEqual([0, 1, 2, 3, 4]);
  });

  it("uses the wider board", () => {
    const m = new Match(CONNECT5);
    expect(m.play(8)).toBe(true); // column 8 doesn't exist on Connect 4
    expect(m.play(9)).toBe(false);
    for (let i = 0; i < CONNECT5.height - 1; i++) m.play(0);
    expect(m.position.canPlay(0)).toBe(true); // 8 rows, not 6
  });

  it("reviews a game on the bigger board", () => {
    // Short and decisive: the point is that the review runs end to end on a
    // variant, grading what it can and admitting the rest, not that it proves
    // much — Connect 5's opening is far past the solver's horizon.
    const history = [0, 0, 1, 1, 2, 2, 3, 3, 4];
    const review = reviewMatch(history, { variant: CONNECT5, nodeLimit: 200_000 });
    expect(review.plies).toHaveLength(history.length);
    expect(review.plies.map((p) => p.ply)).toEqual(history.map((_, i) => i));
    // Every ply is either proven or honestly labelled unknown; nothing invented.
    for (const p of review.plies) {
      if (p.grade === "unknown") expect(p.bestScore).toBe(null);
      else expect(p.bestScore).not.toBe(null);
    }
  });
});

describe("Match", () => {
  it("starts empty with red to move", () => {
    const m = new Match();
    expect(m.status).toBe("playing");
    expect(m.turn).toBe("red");
    expect(m.history).toEqual([]);
  });

  it("refuses illegal moves instead of throwing", () => {
    const m = new Match();
    expect(m.play(-1)).toBe(false);
    expect(m.play(WIDTH)).toBe(false);
    for (let i = 0; i < HEIGHT; i++) m.play(0);
    expect(m.play(0)).toBe(false);
    expect(m.history.length).toBe(HEIGHT);
  });

  it("records a win and stops accepting moves", () => {
    const m = Match.fromMoves([0, 6, 1, 6, 2, 5]);
    expect(m.status).toBe("playing");
    expect(m.play(3)).toBe(true);
    expect(m.status).toBe("won");
    expect(m.winner).toBe("red");
    expect(m.play(4)).toBe(false);
  });

  it("reports the cells that won it", () => {
    const m = Match.fromMoves([0, 6, 1, 6, 2, 5, 3]);
    expect(m.winningCells).toHaveLength(4);
    for (const { row, col } of m.winningCells) {
      expect(m.grid()[row]![col]).toBe("red");
    }
    expect(m.winningCells.map((c) => c.col).sort()).toEqual([0, 1, 2, 3]);
  });

  it("replays to any earlier ply", () => {
    const m = Match.fromMoves([3, 3, 4, 4, 2]);
    expect(m.positionAt(0).moves).toBe(0);
    expect(m.positionAt(3).moves).toBe(3);
    expect(m.positionAt(5).grid()).toEqual(m.grid());
  });
});

describe("findWinningLine", () => {
  it("finds nothing on an empty board", () => {
    expect(findWinningLine(new Position().grid(), "red")).toEqual([]);
  });

  it("finds a diagonal", () => {
    const m = Match.fromMoves([0, 1, 1, 2, 2, 6, 2, 3, 3, 3, 3]);
    expect(m.winner).toBe("red");
    const cols = m.winningCells.map((c) => c.col).sort();
    expect(cols).toEqual([0, 1, 2, 3]);
  });
});

describe("gradeMove", () => {
  it("calls the best move best", () => {
    expect(gradeMove(5, 5)).toBe("best");
    expect(gradeMove(-3, -3)).toBe("best");
  });

  it("calls throwing away a win a blunder", () => {
    expect(gradeMove(4, -2)).toBe("blunder");
  });

  it("calls drawing a won game a mistake", () => {
    expect(gradeMove(4, 0)).toBe("mistake");
    expect(gradeMove(0, -4)).toBe("mistake");
  });

  it("grades slower versions of the same result gently", () => {
    expect(gradeMove(8, 7)).toBe("good");
    expect(gradeMove(8, 5)).toBe("inaccuracy");
    expect(gradeMove(12, 2)).toBe("mistake");
  });

  it("never calls a result-preserving move a blunder", () => {
    // Losing eleven points while still winning is bad play, not a lost game.
    expect(gradeMove(12, 1)).not.toBe("blunder");
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
    const m = randomGame(77);
    const review = reviewMatch(m.history);
    expect(review.plies).toHaveLength(m.history.length);
    expect(review.plies.map((p) => p.ply)).toEqual(m.history.map((_, i) => i));
    for (const rec of review.plies) expect(rec.col).toBe(m.history[rec.ply]);
  });

  it("grades the late game rather than giving up on it", () => {
    const m = randomGame(31);
    const review = reviewMatch(m.history);
    const late = review.plies.filter((p) => p.ply >= 20);
    expect(late.length).toBeGreaterThan(0);
    for (const rec of late) expect(rec.grade).not.toBe("unknown");
  });

  it("can restrict itself to one player's moves", () => {
    const m = randomGame(5);
    const review = reviewMatch(m.history, { forPlayer: "yellow" });
    expect(review.plies.every((p) => p.player === "yellow")).toBe(true);
    expect(review.plies.every((p) => p.ply % 2 === 1)).toBe(true);
  });

  it("names the move that threw the game away", () => {
    // Walk a random game to a late position where the mover has a winning move
    // and some other move loses, then make them play the losing one.
    let planted: { history: number[]; ply: number } | null = null;

    for (let seed = 1; seed <= 12 && !planted; seed++) {
      const setup = randomGame(seed * 1234 + 7);
      for (let ply = 20; ply < setup.history.length - 1 && !planted; ply++) {
        const before = Position.fromMoves(setup.history.slice(0, ply));
        if (before.canWinNext()) continue;
        const a = analyze(before);
        if (a.best <= 0) continue;
        const losing = a.moves.find((mv) => mv.score < 0);
        if (!losing) continue;

        // Play the losing move, then let the game finish legally.
        const m = Match.fromMoves(setup.history.slice(0, ply));
        m.play(losing.col);
        let rng = 99;
        while (m.status === "playing") {
          const legal = m.position.legalMoves();
          rng = (rng * 1103515245 + 12345) & 0x7fffffff;
          m.play(legal[rng % legal.length]!);
        }
        planted = { history: m.history, ply };
      }
    }

    expect(planted).not.toBeNull();
    const review = reviewMatch(planted!.history);
    expect(review.turningPoint).not.toBeNull();
    // The planted move must be the turning point, or something earlier already
    // was — either way the review must not point at a later one.
    expect(review.turningPoint!.ply).toBeLessThanOrEqual(planted!.ply);
  });

  it("marks what it could not prove as an estimate rather than a fact", () => {
    // The opening is out of exact reach. The review still has an opinion about
    // it — that's the point — but it must be labelled as an estimate, and it
    // must never claim an estimated move changed the result.
    const m = randomGame(8);
    const review = reviewMatch(m.history, { nodeLimit: 50_000 });
    const early = review.plies.filter((p) => p.ply < 6);

    expect(early.some((p) => p.source === "estimated")).toBe(true);
    expect(review.skipped).toBeGreaterThan(0);

    for (const p of review.plies) {
      if (p.source !== "estimated") continue;
      // An estimate is still a number, not silence.
      expect(p.bestScore).not.toBeNull();
      expect(p.playedScore).not.toBeNull();
      expect(p.bestCols.length).toBeGreaterThan(0);
      // But it is never allowed to be presented as the move that lost the game.
      expect(p.turningPoint).toBe(false);
    }
  });

  it("produces a curve over the whole game, on one scale", () => {
    const m = randomGame(12);
    const review = reviewMatch(m.history, { forPlayer: "red", nodeLimit: 200_000 });

    // One point per ply plus the empty board, regardless of whose moves were
    // graded — half a curve isn't a shape.
    expect(review.curve).toHaveLength(m.history.length + 1);
    expect(review.curve[0]).toEqual({ ply: 0, advantage: 0, source: "estimated" });
    expect(review.curve.map((c) => c.ply)).toEqual(
      m.history.map((_, i) => i + 1).reduce<number[]>((acc, p) => [...acc, p], [0]),
    );

    for (const point of review.curve) {
      expect(point.advantage).toBeGreaterThanOrEqual(-1);
      expect(point.advantage).toBeLessThanOrEqual(1);
      expect(Number.isFinite(point.advantage)).toBe(true);
    }
  });

  it("offers the biggest estimated swing as a lead, not a verdict", () => {
    // A budget of one node, so nothing beyond the trivially-decided endgame gets
    // proven. (`analyze` short-circuits immediate wins and draws without
    // spending nodes, so a handful of late plies come back proven anyway.)
    const m = randomGame(20);
    const review = reviewMatch(m.history, { forPlayer: "red", nodeLimit: 1 });

    const opening = review.plies.filter((p) => p.ply < 10);
    expect(opening.length).toBeGreaterThan(0);
    expect(opening.every((p) => p.source === "estimated")).toBe(true);

    if (review.biggestSwing) {
      // A lead is only ever drawn from the reviewed player's own estimated
      // moves — never from a proven one, which would have its own headline.
      expect(review.biggestSwing.player).toBe("red");
      expect(review.biggestSwing.source).toBe("estimated");
      expect(review.biggestSwing.drop).toBeGreaterThan(0.25);
    }
  });
});
