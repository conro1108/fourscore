import { describe, expect, it } from "vitest";
import { planDrop, squashAt } from "./timing.js";

describe("planDrop", () => {
  const start = 5.5;
  const rest = -2.5;
  const plan = planDrop(start, rest);

  it("starts at the release height and ends at rest", () => {
    expect(plan.yAt(0)).toBe(start);
    expect(plan.yAt(plan.durationMs)).toBe(rest);
    expect(plan.yAt(plan.durationMs + 1000)).toBe(rest);
  });

  it("never dips below the resting height", () => {
    for (let t = 0; t <= plan.durationMs + 50; t += 2) {
      expect(plan.yAt(t)).toBeGreaterThanOrEqual(rest - 1e-9);
    }
  });

  it("falls monotonically until impact", () => {
    let prev = plan.yAt(0);
    for (let t = 2; t < plan.impactMs; t += 2) {
      const y = plan.yAt(t);
      expect(y).toBeLessThan(prev);
      prev = y;
    }
  });

  it("bounces once, small: apex well under a fifth of the fall", () => {
    let apex = rest;
    for (let t = plan.impactMs; t <= plan.durationMs; t += 1) {
      apex = Math.max(apex, plan.yAt(t));
    }
    expect(apex).toBeGreaterThan(rest); // it does bounce
    expect(apex - rest).toBeLessThan((start - rest) / 5); // but stays sharp
  });

  it("is snappy: a full-board fall settles in under 600ms", () => {
    const tall = planDrop(6.1, -3.5); // Connect 5's worst case
    expect(tall.durationMs).toBeLessThan(600);
    expect(tall.durationMs).toBeGreaterThan(150); // and isn't a teleport
  });

  it("handles a zero-height drop without NaN", () => {
    const flat = planDrop(1, 1);
    expect(flat.durationMs).toBe(0);
    expect(flat.yAt(0)).toBe(1);
    expect(flat.yAt(10)).toBe(1);
  });
});

describe("squashAt", () => {
  it("does nothing before impact and returns to identity after", () => {
    expect(squashAt(0, 300)).toEqual({ x: 1, y: 1 });
    expect(squashAt(300 + 200, 300)).toEqual({ x: 1, y: 1 });
  });

  it("steps through smack then over-correct", () => {
    const smack = squashAt(310, 300);
    expect(smack.y).toBeLessThan(1);
    expect(smack.x).toBeGreaterThan(1);
    const over = squashAt(300 + 90, 300);
    expect(over.y).toBeGreaterThan(1);
  });
});
