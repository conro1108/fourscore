import { describe, expect, it } from "vitest";
import { Match } from "@fourscore/engine";
import { makeDirector, tierOf } from "./director.js";
import { clockText } from "./desktop.js";

describe("tierOf", () => {
  it("cuts at the mock's thresholds", () => {
    expect(tierOf(0)).toBe(0);
    expect(tierOf(0.24)).toBe(0);
    expect(tierOf(0.25)).toBe(1);
    expect(tierOf(0.5)).toBe(2);
    expect(tierOf(0.75)).toBe(3);
    expect(tierOf(1)).toBe(4);
  });
});

describe("director", () => {
  it("idles low on a quiet position", () => {
    const d = makeDirector();
    d.feedEval(0.05, 4, 42);
    for (let i = 0; i < 120; i++) d.step(1);
    expect(d.snapshot().fever).toBeLessThan(0.25);
    expect(d.snapshot().tier).toBe(0);
  });

  it("climbs as the position sharpens, and crossing tiers takes time", () => {
    const d = makeDirector();
    d.feedEval(0.9, 30, 42);
    let crossed = 0;
    for (let i = 0; i < 60; i++) {
      const s = d.step(1);
      if (s && s.tier > crossed) crossed = s.tier;
    }
    expect(d.snapshot().fever).toBeGreaterThan(0.5);
    expect(crossed).toBeGreaterThanOrEqual(2);
  });

  it("a win shoves fever high immediately", () => {
    const d = makeDirector();
    d.event("win");
    expect(d.snapshot().fever).toBeGreaterThanOrEqual(0.8);
    d.step(10);
    expect(d.snapshot().fever).toBeGreaterThan(0.8);
  });

  it("the win peaks, holds, and then lets go on its own", () => {
    const d = makeDirector();
    d.event("win");
    // it gets all the way up: the screensaver is the point of the crescendo
    for (let i = 0; i < 20; i++) d.step(0.5);
    expect(d.snapshot().tier).toBe(4);
    // and it does not stay there — no new game, no input, just time
    for (let i = 0; i < 20; i++) d.step(0.5);
    expect(d.snapshot().tier).toBeLessThan(4);
    for (let i = 0; i < 80; i++) d.step(0.5);
    expect(d.snapshot().tier).toBe(0);
  });

  it("stewing on a loss still escalates before it lets go", () => {
    const d = makeDirector();
    d.event("loss");
    for (let i = 0; i < 30; i++) d.step(0.5);
    expect(d.snapshot().fever).toBeGreaterThan(0.75); // the stew
    for (let i = 0; i < 60; i++) d.step(0.5);
    expect(d.snapshot().tier).toBe(0);
  });

  it("a new game does not inherit the last one's fever", () => {
    const d = makeDirector();
    d.event("win");
    d.step(6);
    const hot = d.snapshot().fever;
    d.event("newGame");
    d.step(10);
    const cooler = d.snapshot().fever;
    expect(cooler).toBeLessThan(hot);
    expect(cooler).toBeLessThan(0.55); // Again shouldn't deal you a tier-4 board
  });

  it("cooling stops when it gets there, so the next game rises normally", () => {
    const d = makeDirector();
    d.event("win");
    for (let i = 0; i < 200; i++) d.step(0.5);
    d.event("newGame");
    d.feedEval(0.9, 30, 42);
    const before = d.snapshot().fever;
    d.step(1);
    expect(d.snapshot().fever).toBeGreaterThan(before);
  });

  it("pin overrides everything until unpinned", () => {
    const d = makeDirector();
    d.pin(0.85);
    expect(d.snapshot().tier).toBe(3);
    d.pin(null);
    expect(d.snapshot().tier).toBe(0);
  });
});

describe("the clock", () => {
  it("keeps honest minutes from 6:66", () => {
    expect(clockText(0, 0)).toBe("6:66 PM");
    expect(clockText(2, 0)).toBe("6:68 PM");
    expect(clockText(2, 5)).toBe("6:73 PM");
  });
  it("never rolls over into sense", () => {
    expect(clockText(50, 22)).toBe("6:99 PM");
  });
});

describe("the harness game scripts stay legal", () => {
  // main.ts deep-links replay these; if the engine ever rejects one, the
  // screenshot harness dies silently. Keep them honest here.
  it("?state=win ends with red winning", () => {
    const m = Match.fromMoves([3, 4, 4, 3, 5, 2, 3, 2, 2, 4, 2]);
    expect(m.status).toBe("won");
    expect(m.winner).toBe("red");
  });
  it("?state=loss ends with yellow winning", () => {
    const m = Match.fromMoves([0, 6, 1, 6, 0, 6, 1, 6]);
    expect(m.status).toBe("won");
    expect(m.winner).toBe("yellow");
  });
  it("?state=midgame leaves yellow to move", () => {
    const m = Match.fromMoves([3, 2, 3, 3, 2, 4, 1]);
    expect(m.status).toBe("playing");
    expect(m.turn).toBe("yellow");
  });
});
