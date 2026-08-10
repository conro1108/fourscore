import { describe, expect, it } from "vitest";
import { BotBrain, ROSTER, byId, type BotProfile } from "./bots.js";
import { Match } from "./match.js";
import { CONNECT4, CONNECT5, CONNECT6, CONNECT7, Position } from "./board.js";
import { searchHeuristic } from "./evaluate.js";

/** Deterministic RNG, so a flaky ladder can't pass by luck. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Play one game. Returns the winning bot id, or null for a draw. */
function playMatch(aId: string, bId: string, seed: number, variant = CONNECT4): string | null {
  const rng = mulberry32(seed);
  const a = new BotBrain(byId(aId), rng);
  const b = new BotBrain(byId(bId), rng);
  const match = new Match(variant);

  while (match.status === "playing") {
    // Red moves on even plies, and `a` is red.
    const brain = match.position.moves % 2 === 0 ? a : b;
    const { col } = brain.decide(match.position);
    if (!match.play(col)) throw new Error(`${brain.profile.id} chose illegal column ${col}`);
  }

  if (!match.winner) return null;
  return match.winner === "red" ? aId : bId;
}

/** Score a head-to-head, alternating who opens. Returns `strong`'s points out of games. */
function headToHead(
  strongId: string,
  weakId: string,
  games: number,
  seed = 1,
  variant = CONNECT4,
): number {
  let points = 0;
  for (let g = 0; g < games; g++) {
    const strongOpens = g % 2 === 0;
    const winner = strongOpens
      ? playMatch(strongId, weakId, seed + g * 7919, variant)
      : playMatch(weakId, strongId, seed + g * 7919, variant);
    if (winner === strongId) points += 1;
    else if (winner === null) points += 0.5;
  }
  return points;
}

describe("roster", () => {
  it("has unique ids and ascending tiers", () => {
    const ids = ROSTER.map((b) => b.id);
    expect(new Set(ids).size).toBe(ids.length);
    const tiers = ROSTER.map((b) => b.tier);
    expect([...tiers].sort((a, b) => a - b)).toEqual(tiers);
  });

  it("marks exactly one bot as perfect", () => {
    expect(ROSTER.filter((b) => b.perfect).map((b) => b.id)).toEqual(["oracle"]);
  });

  it("only lets the bottom rung slip away a win it can see", () => {
    // Exercised rather than asserted off the config, because the guard that
    // makes it true lives in `pick` and reads the tier — an earlier version of
    // this test compared the config to itself and would have passed with the
    // guard deleted.
    // Red has the bottom of columns 0-2 and can finish at 3.
    const win = Position.fromMoves([0, 6, 1, 6, 2, 5]);
    // Red threatens to finish at 3; yellow loses on the spot if it plays elsewhere.
    const block = Position.fromMoves([0, 6, 1, 6, 2]);

    const missesOver = (bot: BotProfile, p: Position, seeds: number) => {
      let misses = 0;
      for (let seed = 0; seed < seeds; seed++) {
        if (new BotBrain(bot, mulberry32(seed)).decide(p).col !== 3) misses++;
      }
      return misses;
    };

    // Slip rate forced to 1, so every decision below goes down the slip path.
    // At the shipped rates the top of the ladder slips once in a hundred moves
    // and a broken guard would hide behind that.
    for (const bot of ROSTER.filter((b) => b.tier >= 2)) {
      const always = { ...bot, slipRate: 1 };
      expect([bot.id, missesOver(always, win, 5)]).toEqual([bot.id, 0]);
      expect([bot.id, missesOver(always, block, 5)]).toEqual([bot.id, 0]);
    }

    // Acorn is the exemption, and it's the only one: the guard reads the tier.
    expect(ROSTER.filter((b) => b.tier < 2).map((b) => b.id)).toEqual(["acorn"]);

    // And it does miss them in play — a slip rate that never shows up isn't
    // fallibility, it's decoration.
    expect(missesOver(byId("acorn"), win, 100)).toBeGreaterThan(10);
    expect(missesOver(byId("acorn"), block, 100)).toBeGreaterThan(10);
  });

  it("slips toward the moves it rated next-best", () => {
    // A slip is the bot's second thought, not a random legal move: the worst
    // column on the board should be far rarer than the near-miss.
    const p = Position.fromMoves([3, 3, 4]);
    const scored = searchHeuristic(p, 4, byId("moss").weights, 400_000);
    const ranked = [...scored.moves].sort((a, b) => b.score - a.score);
    const runnerUp = ranked.find((m) => !scored.bestCols.includes(m.col))!.col;
    const worst = ranked[ranked.length - 1]!.col;
    expect(runnerUp).not.toBe(worst);

    const counts = new Map<number, number>();
    // Slip rate 1 isolates the choice from how often it happens.
    const slippy = { ...byId("moss"), slipRate: 1 };
    for (let seed = 0; seed < 400; seed++) {
      const { col } = new BotBrain(slippy, mulberry32(seed)).decide(p);
      counts.set(col, (counts.get(col) ?? 0) + 1);
    }
    expect(counts.get(runnerUp) ?? 0).toBeGreaterThan(2 * (counts.get(worst) ?? 0));
  });
});

describe("basic competence", () => {
  it("takes a win that is sitting there", () => {
    // Red has the bottom of columns 0-2 and can finish at 3.
    const p = Position.fromMoves([0, 6, 1, 6, 2, 5]);
    expect(p.turn).toBe("red");
    for (const bot of ROSTER.filter((b) => b.tier >= 2)) {
      const brain = new BotBrain(bot, mulberry32(9));
      expect(brain.decide(p).col).toBe(3);
    }
  });

  it("blocks a loss that is sitting there", () => {
    // Red threatens to finish at column 3; yellow has to stop it.
    const p = Position.fromMoves([0, 6, 1, 6, 2]);
    expect(p.turn).toBe("yellow");
    // Blocking needs one ply of lookahead, so Acorn is exempt by design.
    for (const bot of ROSTER.filter((b) => b.tier >= 2)) {
      const brain = new BotBrain(bot, mulberry32(11));
      expect(brain.decide(p).col).toBe(3);
    }
  });

  it("never returns an illegal column", () => {
    const rng = mulberry32(3);
    for (const bot of ROSTER) {
      const brain = new BotBrain(bot, rng);
      const match = new Match();
      while (match.status === "playing") {
        const { col } = brain.decide(match.position);
        expect(match.position.canPlay(col)).toBe(true);
        match.play(col);
      }
    }
  });
});

describe("the ladder is actually a ladder", () => {
  // Each rung must beat the one below it over a run of games. This is the test
  // that stops the roster quietly becoming seven flavours of the same bot —
  // weights and slip rates interact, and "deeper" does not automatically mean
  // "stronger" once personality is in the mix.
  // Game counts are a compromise: fewer than about sixteen and the result is
  // noise. An early version used fourteen and reported a rung as broken that a
  // forty-game sweep showed was fine — and `moss > pebble` did it again at
  // twenty, reading 63% on a window where forty games read 74% and a second
  // seed read 79%. The bottom two rungs are milliseconds a game, so they buy
  // their way out of the noise rather than being believed at twenty.
  const rungs = [
    ["pebble", "acorn", 40],
    ["moss", "pebble", 40],
    ["bramble", "moss", 16],
    ["cinder", "bramble", 10],
  ] as const;

  for (const [strong, weak, games] of rungs) {
    it(`${strong} beats ${weak}`, () => {
      // A measured sweep puts every adjacent rung between 69% and 90%, so 65%
      // is a floor that catches a rung going soft without failing on noise.
      const points = headToHead(strong, weak, games);
      expect(points).toBeGreaterThan(games * 0.65);
    });
  }

  /**
   * The bottom four rungs on Connect 5.
   *
   * Adding the variant inverted rungs that were fine on Connect 4, so the
   * ladder needs asserting per board rather than once. These four are the ones
   * that hold and are cheap enough to run every time — the sweep in
   * `tools/ladder.ts` covers `vane > cinder` (48s) and the known-soft
   * `quill > vane`, both too slow to live here.
   */
  const connect5Rungs = [
    ["pebble", "acorn", 8],
    ["moss", "pebble", 8],
    ["bramble", "moss", 8],
    ["cinder", "bramble", 6],
  ] as const;

  for (const [strong, weak, games] of connect5Rungs) {
    it(`${strong} beats ${weak} on Connect 5`, () => {
      const points = headToHead(strong, weak, games, 1, CONNECT5);
      expect(points).toBeGreaterThan(games * 0.65);
    });
  }

  /**
   * The rungs that hold on the two big boards, which is fewer than elsewhere.
   *
   * Connect 6 and 7 each repeated Connect 5's history on their first sweep —
   * the top inverted until Quill got its parity override, and a couple of
   * middle rungs sit just under the bar with every knob measured (the tables
   * are in feature_ideas.md). What's asserted here is only what measured
   * comfortably clear: the bar plus noise room at these game counts.
   */
  const bigBoardRungs = [
    [CONNECT6, "pebble", "acorn", 8],
    [CONNECT6, "bramble", "moss", 8],
    [CONNECT7, "pebble", "acorn", 8],
  ] as const;

  for (const [variant, strong, weak, games] of bigBoardRungs) {
    it(`${strong} beats ${weak} on ${variant.name}`, () => {
      const points = headToHead(strong, weak, games, 1, variant);
      expect(points).toBeGreaterThan(games * 0.65);
    });
  }

  it("vane beats moss handily", () => {
    // A deep rung against a shallow one, as a sanity check on the top half
    // without paying for a full adjacent-pair sweep on every test run.
    const points = headToHead("vane", "moss", 6);
    expect(points).toBeGreaterThan(4);
  });
});

describe("tells", () => {
  it("reports conviction in range and a mood for every decision", () => {
    const brain = new BotBrain(byId("cinder"), mulberry32(21));
    const match = new Match();
    while (match.status === "playing") {
      const d = brain.decide(match.position);
      expect(d.conviction).toBeGreaterThanOrEqual(-1);
      expect(d.conviction).toBeLessThanOrEqual(1);
      expect(d.mood).toBeTruthy();
      match.play(d.col);
    }
  });

  it("is honest except for the bot that isn't", () => {
    const honest = new BotBrain(byId("cinder"), mulberry32(5));
    const match = new Match();
    for (let i = 0; i < 8 && match.status === "playing"; i++) {
      const d = honest.decide(match.position);
      expect(d.mood).toBe(d.trueMood);
      match.play(d.col);
    }

    // Vane's shown mood diverges from its real one over a run of decisions.
    const liar = new BotBrain(byId("vane"), mulberry32(5));
    let divergences = 0;
    for (let seed = 0; seed < 40; seed++) {
      const p = Position.fromMoves([3, 3, 4, 2, 5].slice(0, (seed % 5) + 1));
      const d = liar.decide(p);
      if (d.mood !== d.trueMood) divergences++;
    }
    expect(divergences).toBeGreaterThan(0);
  });
});

describe("the oracle", () => {
  it("solves exactly once the board is deep enough", () => {
    const brain = new BotBrain(byId("oracle"), mulberry32(2));
    const p = Position.fromMoves([3, 3, 4, 4, 2, 2, 5, 5, 1, 1, 0]);
    expect(p.moves).toBeGreaterThanOrEqual(brain.exactFrom(CONNECT4));
    expect(brain.decide(p).exact).toBe(true);
  });

  it("estimates rather than stalling in the opening", () => {
    const brain = new BotBrain(byId("oracle"), mulberry32(2));
    const d = brain.decide(new Position());
    expect(d.exact).toBe(false);
    expect(d.col).toBeGreaterThanOrEqual(0);
  });
});
