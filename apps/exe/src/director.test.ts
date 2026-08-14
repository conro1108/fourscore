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

  it("a new game cools back down, slower than it rose", () => {
    const d = makeDirector();
    d.event("win");
    d.step(6);
    const hot = d.snapshot().fever;
    d.event("newGame");
    d.step(10);
    const cooler = d.snapshot().fever;
    expect(cooler).toBeLessThan(hot);
    expect(cooler).toBeGreaterThan(0.5); // falling is slow by design
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
