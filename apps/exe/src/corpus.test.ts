/**
 * The corpus graders' test — Phase 3, station 2 (llm_training.md).
 *
 * The whole point of this file is the second half. Anyone can write a grader
 * that passes `pong.c`; the failure mode the plan warns about on day one is a
 * grader that **rejects nothing**, and the only way to know is to hand it
 * programs that have to be rejected and name the reason each one has to earn.
 * Every mutant is one edit away from passing, because that is the distance a
 * host model's mistakes actually land at — not garbage, but a pong whose
 * paddle is wired to nothing.
 *
 * It is quick (well under a second for all of it) because a frame on this
 * machine costs about nine instructions, so grading whole games is cheaper
 * than sampling them would be worth.
 */

import { describe, expect, it } from "vitest";
import "../tools/corpus/graders.js";
import { GOOD, MUTANTS } from "../tools/corpus/mutants.js";
import { histogram, verify } from "../tools/corpus/verify.js";

describe("the graders keep the good", () => {
  for (const c of GOOD)
    it(`passes ${c.id}`, () => {
      const v = verify(c);
      expect(`${v.fail ?? "pass"} ${v.detail ?? ""}`.trim()).toBe("pass");
      expect(v.ok).toBe(true);
    });

  it("reads pong without being told where anything is", () => {
    const v = verify(GOOD.find((c) => c.id === "good/pong")!);
    // Found, not assumed: nothing in the grader knows the court's layout.
    expect(v.notes).toMatchObject({ ball: "O", paddle: "|", paddleLen: 4 });
    expect(v.notes!.scoredAt as number).toBeGreaterThan(0);
    // And the whole game resolves under the farm's key policy rather than
    // running out the budget — 1,758 frames when this was written.
    expect(v.notes!.gameFrames as number).toBeLessThan(6_000);
  });
});

describe("the graders throw out the bad", () => {
  for (const m of MUTANTS)
    it(`rejects ${m.id} — ${m.why}`, () => {
      const v = verify(m);
      expect(v.fail).toBe(m.expectFail);
      expect(v.ok).toBe(false);
    });

  it("has an opinion about every one of them", () => {
    // A mutant that quietly passed would be a hole in the taxonomy, and a
    // taxonomy key nothing tests is a key nobody can trust.
    const keys = new Set(MUTANTS.map((m) => m.expectFail));
    expect(keys.size).toBeGreaterThanOrEqual(14);
    expect([...keys].every((k) => /^(v0|v1|v2):/.test(k))).toBe(true);
  });
});

it("counts a batch the way a batch gets read", () => {
  const rows = histogram([...GOOD, ...MUTANTS].map(verify));
  expect(rows[0]).toEqual(["pass", GOOD.length]); // worst first, and nothing ties it
  expect(rows.reduce((n, [, count]) => n + count, 0)).toBe(GOOD.length + MUTANTS.length);
});
