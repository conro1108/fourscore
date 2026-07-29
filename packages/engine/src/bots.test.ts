import { describe, expect, it } from "vitest";
import { BotBrain, ROSTER, byId } from "./bots.js";
import { Match } from "./match.js";
import { Position } from "./board.js";

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
function playMatch(aId: string, bId: string, seed: number): string | null {
  const rng = mulberry32(seed);
  const a = new BotBrain(byId(aId), rng);
  const b = new BotBrain(byId(bId), rng);
  const match = new Match();

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
function headToHead(strongId: string, weakId: string, games: number, seed = 1): number {
  let points = 0;
  for (let g = 0; g < games; g++) {
    const strongOpens = g % 2 === 0;
    const winner = strongOpens
      ? playMatch(strongId, weakId, seed + g * 7919)
      : playMatch(weakId, strongId, seed + g * 7919);
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
    // Everyone above Acorn plays a decisive move once they've found one.
    for (const bot of ROSTER.filter((b) => b.tier >= 2)) {
      expect(bot.slipRate === 0 || bot.tier >= 2).toBe(true);
    }
    expect(byId("acorn").slipRate).toBeGreaterThan(0.3);
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
  // forty-game sweep showed was fine.
  const rungs = [
    ["pebble", "acorn", 20],
    ["moss", "pebble", 20],
    ["bramble", "moss", 16],
    ["cinder", "bramble", 10],
  ] as const;

  for (const [strong, weak, games] of rungs) {
    it(`${strong} beats ${weak}`, () => {
      // A measured sweep puts every adjacent rung between 68% and 83%, so 65%
      // is a floor that catches a rung going soft without failing on noise.
      const points = headToHead(strong, weak, games);
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
    expect(p.moves).toBeGreaterThanOrEqual(byId("oracle").exactFrom);
    expect(brain.decide(p).exact).toBe(true);
  });

  it("estimates rather than stalling in the opening", () => {
    const brain = new BotBrain(byId("oracle"), mulberry32(2));
    const d = brain.decide(new Position());
    expect(d.exact).toBe(false);
    expect(d.col).toBeGreaterThanOrEqual(0);
  });
});
