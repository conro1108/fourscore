/**
 * The copy table's only real logic is its fallbacks, and every one of them is a
 * sentence a player reads. A missing persona line has to degrade to a plain
 * one, not to `undefined is thinking.`
 */

import { describe, expect, it } from "vitest";
import {
  CONNECT4,
  CONNECT5,
  CONNECT6,
  CONNECT7,
  ROSTER,
  byId,
  type PlyRecord,
  type Review,
} from "@fourscore/engine";
import { COPY } from "./copy.js";

/** A ply record with the fields a sentence reads; override what a case is about. */
const ply = (over: Partial<PlyRecord> = {}): PlyRecord => ({
  ply: 6,
  player: "red",
  col: 2,
  bestScore: 0,
  playedScore: 0,
  bestCols: [4],
  grade: "mistake",
  source: "estimated",
  turningPoint: false,
  drop: 0.3,
  ...over,
});

const review = (over: Partial<Review> = {}): Review => ({
  plies: [],
  turningPoint: null,
  biggestSwing: null,
  curve: [],
  skipped: 0,
  ...over,
});

describe("copy", () => {
  it("gives every bot a thinking line and a defeat line", () => {
    for (const bot of ROSTER) {
      // Shouting surface: all caps, ending in a stop of some kind. Acorn is
      // the reason the punctuation class isn't just a full stop.
      expect(COPY.thinking(bot)).toMatch(/^[A-Z][A-Z .]+[.!]+$/);
      expect(COPY.lost(bot)).toContain(bot.name.toUpperCase());
    }
  });

  it("speaks in every opponent's own voice, not a template", () => {
    // Phase 5 filled both tables from VISION.md's personas, so all eight rungs
    // now say something only they would say. Sampled across the ladder rather
    // than asserted in full — the table is the copy, and phase 9 reads it.
    expect(COPY.thinking(byId("moss"))).toBe("MOSS IS THINKING ABOUT DIRT.");
    expect(COPY.thinking(byId("vane"))).toBe("VANE IS THINKING ABOUT SOMETHING ELSE.");
    expect(COPY.lost(byId("oracle"))).toBe("THE ORACLE WINS. IT DOES NOT SAY WHEN IT KNEW.");
    // Nobody is left on the generic line.
    for (const bot of ROSTER) {
      expect(COPY.thinking(bot), bot.id).not.toBe(`${bot.name.toUpperCase()} IS THINKING.`);
      expect(COPY.lost(bot), bot.id).not.toBe(`${bot.name.toUpperCase()} WINS.`);
    }
  });

  it("still degrades to a plain line for an opponent it has never heard of", () => {
    // The fallback is what stops a new rung reading `undefined is thinking.`
    // before anyone has written it a voice.
    const stranger = { ...byId("moss"), id: "nobody", name: "Nobody" };
    expect(COPY.thinking(stranger)).toBe("NOBODY IS THINKING.");
    expect(COPY.lost(stranger)).toBe("NOBODY WINS.");
  });

  it("names the variants the way the voice sample does", () => {
    expect(COPY.variant(CONNECT4.id)).toBe("CONNECT 4");
    expect(COPY.variant(CONNECT5.id)).toBe("CONNECT 5 (more)");
    expect(COPY.variant(CONNECT6.id)).toBe("CONNECT 6 (even more)");
    expect(COPY.variant(CONNECT7.id)).toBe("CONNECT 7 (too many)");
  });

  it("says who starts in the second person and the third", () => {
    const moss = byId("moss");
    expect(COPY.swap(moss, true)).toBe("Rematch, Moss starts");
    expect(COPY.swap(moss, false)).toBe("Rematch, you start");
  });

  it("reads an empty record as never played, and drops a zero draw count", () => {
    expect(COPY.record(0, 0, 0)).toBe("You have not played this one.");
    expect(COPY.record(3, 1, 0)).toBe("You 3–1.");
    expect(COPY.record(3, 1, 2)).toBe("You 3–1–2.");
  });
});

/**
 * The confidence law, tested as a property rather than string by string: an
 * estimated ply may never produce a flat claim, and a proven one is the only
 * thing allowed to say a move lost the game. This is the check that catches a
 * phase-9 copy pass tightening a hedge out of a sentence for rhythm.
 */
describe("review copy", () => {
  const HEDGES = /\b(looks|seems|appears)\b/;
  /** Verbs that assert a result. None of these may appear on an estimate. */
  const CLAIMS = /\b(lost|loses|was|held|turned)\b/;

  it("hedges every estimated ply and never asserts a result on one", () => {
    for (const grade of ["best", "good", "inaccuracy", "mistake", "blunder"] as const) {
      const line = COPY.plyLine(ply({ grade, source: "estimated" }));
      expect(line, grade).toMatch(HEDGES);
      expect(line, grade).not.toMatch(CLAIMS);
    }
  });

  it("lets a proven ply be flat", () => {
    expect(COPY.plyLine(ply({ grade: "best", source: "proven", col: 3 }))).toBe(
      "Column 4 was the best there was.",
    );
    expect(COPY.plyLine(ply({ grade: "mistake", source: "proven" }))).not.toMatch(HEDGES);
  });

  it("only ever names a losing move from proof", () => {
    const turning = ply({
      source: "proven",
      turningPoint: true,
      bestScore: 4,
      playedScore: -2,
      bestCols: [1, 5],
    });
    expect(COPY.plyLine(turning)).toBe("This turned a won game into a lost one. Column 2 or 6 held it.");
    // The headline is the loud version of the same claim, and it comes from the
    // same field — an estimated ply can't set `turningPoint`, so it can't get
    // here (engine invariant, asserted in `match.test.ts`).
    expect(COPY.reviewHeadline(review({ turningPoint: turning }), true).title).toBe(
      "MOVE 4 LOST IT.",
    );
  });

  it("hedges the headline when nothing was proven", () => {
    const swing = ply({ ply: 8, source: "estimated", grade: "blunder", bestCols: [3] });
    const head = COPY.reviewHeadline(review({ plies: [swing], biggestSwing: swing }), true);
    expect(head.title).toBe("MOVE 5 IS WHERE IT SLIPPED.");
    expect(head.body).toMatch(HEDGES);
    expect(head.title).not.toMatch(/LOST/);
  });

  it("tells a loss behind the horizon apart from a game nobody lost on one move", () => {
    const proven = [ply({ source: "proven", grade: "good" })];
    // Lost, with plies the engine couldn't reach: the losing move is real and
    // out of sight, so the review says the opening, not "you played fine".
    expect(COPY.reviewHeadline(review({ plies: proven, skipped: 4 }), true).title).toBe(
      "IT WAS LOST IN THE OPENING.",
    );
    // Nothing skipped: now "no single losing move" is a finding.
    expect(COPY.reviewHeadline(review({ plies: proven, skipped: 0 }), true).title).toBe(
      "NO SINGLE LOSING MOVE.",
    );
  });

  it("says nothing turned on one move only when there was nothing to say", () => {
    expect(COPY.reviewHeadline(review(), false).title).toBe("NOTHING TURNED ON ONE MOVE.");
  });
});
