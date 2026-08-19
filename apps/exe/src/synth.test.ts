/**
 * The synthesiser's test — Phase 3, station 2's exit criterion
 * (llm_training.md): the farm keeps close to 100% of what synth.ts emits.
 * Here that is held to exactly 100% on a sample, because a generator that
 * produces rejects is a generator with a bug — it builds from the fence
 * rather than guessing at it. Sample sizes are set by grading cost (a pong
 * is ~20ms of whole-game grading; soup is microseconds), and a wider sweep
 * lives a command away: `npm run corpus:synth -- --tier 4 --n 100 --check`.
 */

import { describe, expect, it } from "vitest";
import "../tools/corpus/graders.js";
import { synthesize } from "../tools/corpus/synth.js";
import { verify, type Tier } from "../tools/corpus/verify.js";

const SAMPLE: Record<Tier, number> = { 1: 24, 2: 16, 3: 12, 4: 8 };

describe("the farm keeps everything the synthesiser emits", () => {
  for (const tier of [1, 2, 3, 4] as Tier[])
    it(`tier ${tier}: ${SAMPLE[tier]} of ${SAMPLE[tier]} pass`, () => {
      for (const c of synthesize(tier, SAMPLE[tier], 7)) {
        const v = verify(c);
        expect(`${c.id} ${v.fail ?? "pass"} ${v.detail ?? ""}`.trim()).toBe(`${c.id} pass`);
      }
    });
});

describe("what a candidate carries", () => {
  const t1 = synthesize(1, 20, 11);
  const t2 = synthesize(2, 12, 11);
  const t4 = synthesize(4, 6, 11);

  it("tiers 1 and 2 know their own answer", () => {
    for (const c of [...t1, ...t2]) expect(c.expect, c.id).toBeDefined();
    for (const c of t2) expect(c.keys!.length, c.id).toBeGreaterThan(0);
  });

  it("every document opens with a one-line header from the tier's set", () => {
    for (const c of [...t1, ...t2, ...t4]) {
      const [first, second] = c.text.split("\n");
      expect(first, c.id).toMatch(/^\/\* [a-z]+\.c — .*\*\/$/);
      expect(second, c.id).toBe("");
    }
  });

  it("pong declares its keys, so the grader can find them", () => {
    for (const c of t4) {
      expect(c.axes!.up).toBeDefined();
      expect(c.axes!.down).toBeDefined();
    }
  });

  it("axes vary rather than repeat", () => {
    const sigs = new Set(t1.map((c) => JSON.stringify(c.axes)));
    expect(sigs.size).toBe(t1.length);
    const families = new Set(t1.map((c) => c.axes!.family));
    expect(families.size).toBeGreaterThanOrEqual(3);
  });

  it("the same seed is the same batch", () => {
    expect(synthesize(3, 8, 5)).toEqual(synthesize(3, 8, 5));
  });
});
