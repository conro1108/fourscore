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
    // The top rungs and the Oracle play whole games in seconds, not
    // milliseconds; `tools/ladder.ts` exercises them.
    const rng = mulberry32(3);
    for (const bot of ROSTER.filter((b) => b.tier <= 5)) {
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
  // One cheap rung as a regression check that the roster hasn't become seven
  // flavours of the same bot. The full sweep — every rung, every variant — is
  // `tools/ladder.ts`, run by hand when a bot is retuned.
  it("moss beats pebble", () => {
    const games = 40;
    let points = 0;
    for (let g = 0; g < games; g++) {
      const seed = 1 + g * 7919;
      const winner = g % 2 === 0 ? playMatch("moss", "pebble", seed) : playMatch("pebble", "moss", seed);
      if (winner === "moss") points += 1;
      else if (winner === null) points += 0.5;
    }
    expect(points).toBeGreaterThan(games * 0.65);
  });
});
