/**
 * The roster's contract, which is mostly the taste law written as assertions.
 * The gags themselves can only be judged in a screenshot, but "no prop is over
 * budget" and "every act has a berth and a real length" are facts a test can
 * hold onto — and both are exactly the kind of thing that rots silently when a
 * later phase adds a bot with a signature act.
 *
 * Which act answers which event moved to `gags.ts`, and so did that half of
 * this file's coverage (`gags.test.ts`).
 */

import { describe, expect, it } from "vitest";
import { PROP_ACTS } from "./registry.js";
import {
  beaconPose,
  bumperPose,
  calloutPose,
  detonationPose,
  mascotPose,
  pinPose,
  pinsetterHeight,
  PIN_SURVIVOR,
  rocketPose,
  scorePose,
  shellPose,
  shellSlot,
  slabPose,
  solvePose,
  starePose,
  mowerPose,
  deepSpacePose,
} from "./steps.js";

describe("the gag roster", () => {
  it("keeps every prop under the 300-triangle budget", () => {
    for (const act of Object.values(PROP_ACTS)) {
      expect(act.tris, act.name).toBeLessThanOrEqual(300);
      expect(act.tris, act.name).toBeGreaterThan(0);
    }
  });

  it("gives every act a real length and a berth", () => {
    for (const act of Object.values(PROP_ACTS)) {
      expect(act.durationMs, act.name).toBeGreaterThan(500);
      expect(["left", "right", "floor", "sky", "lens"], act.name).toContain(act.berth);
    }
  });
});

describe("roster poses", () => {
  it("the rocket starts and ends below the frame, and dies at the top", () => {
    expect(rocketPose(0).rise).toBe(0);
    expect(rocketPose(1).rise).toBeLessThan(0);
    expect(rocketPose(0.2).burning).toBe(true);
    expect(rocketPose(0.55).burning).toBe(false);
    // The hang: two samples inside it are the same frame.
    expect(rocketPose(0.52)).toEqual(rocketPose(0.62));
  });

  it("the stare ends hidden, having arrived already risen", () => {
    expect(starePose(0).rise).toBeGreaterThan(0);
    expect(starePose(1).rise).toBe(0);
  });

  /**
   * The stare's entrance is cels, not a rise: sampling it densely turns up a
   * handful of distinct heights, not a continuum. This is the one act built
   * entirely out of hard cuts, so it is the one worth asserting that on.
   */
  it("the stare arrives in steps and never interpolates", () => {
    const heights = new Set<number>();
    for (let p = 0; p <= 1; p += 0.001) heights.add(starePose(p).rise);
    expect(heights.size).toBeLessThanOrEqual(4);
    // And it leans exactly once, having already stopped moving.
    const leans = [];
    let prev = 0;
    for (let p = 0; p <= 1; p += 0.001) {
      const { lean } = starePose(p);
      if (lean !== prev) leans.push(lean);
      prev = lean;
    }
    expect(leans).toEqual([1, 0]);
  });

  /**
   * Moss's mower crosses at one speed and stops once. Constant velocity is the
   * whole character — the difference between unhurried and slow is that it
   * never accelerates — so the test is that the two moving segments have the
   * same gradient and the middle one has none.
   */
  it("the mower crosses at a constant crawl and stops dead in the middle", () => {
    const u = (p: number) => mowerPose(p, 0).u;
    expect(u(0)).toBe(0);
    expect(u(1)).toBeCloseTo(1);
    const inSpeed = (u(0.3) - u(0.2)) / 0.1;
    const outSpeed = (u(0.9) - u(0.8)) / 0.1;
    expect(inSpeed).toBeCloseTo(outSpeed, 1);
    expect(u(0.35)).toBe(u(0.55));
    // The blades never stop, including while it does.
    expect(mowerPose(0.55, 0).blades).toBeGreaterThan(mowerPose(0.35, 0).blades);
  });

  it("the interlude drifts across and twinkles on the step clock", () => {
    expect(deepSpacePose(0, 0).u).toBe(0);
    expect(deepSpacePose(1, 0).u).toBe(1);
    // Two cels, alternating, and nothing between them.
    expect(new Set([0, 1, 2, 3].map((s) => deepSpacePose(0.5, s).twinkle)).size).toBe(2);
  });

  it("the beacon strobes rather than breathes", () => {
    const levels = new Set([0, 1, 2, 3].map((s) => beaconPose(0.5, s).lamp));
    expect(levels.size).toBe(2);
    expect(beaconPose(0, 0).drop).toBe(0);
    expect(beaconPose(1, 0).drop).toBeCloseTo(0);
  });

  it("the detonation holds the banner, then throws it back into the void", () => {
    expect(detonationPose(0).bannerZ).toBe(1);
    expect(detonationPose(0.5).bannerZ).toBe(0);
    expect(detonationPose(1).bannerZ).toBeGreaterThan(1);
    // It tips as it goes, but never turns over: past a quarter turn the words
    // are upside down and backwards, which reads as broken text.
    expect(detonationPose(1).bannerRoll).toBeGreaterThan(0.3);
    expect(detonationPose(1).bannerRoll).toBeLessThan(Math.PI / 2);
    // Pyro erupts immediately and is out before the act ends.
    expect(detonationPose(0.1).pyro).toBe(1);
    expect(detonationPose(1).pyro).toBe(0);
  });
});

describe("the lane screen", () => {
  it("rolls the mascot on and off stage, both moods", () => {
    for (const mood of ["cheer", "flop"] as const) {
      expect(mascotPose(0, mood).u).toBe(0);
      expect(mascotPose(1, mood).u).toBe(1);
      // It rolls rather than slides: the angle tracks the distance, and it has
      // turned exactly whole turns by the time it stops to do the bit.
      const arrival = mascotPose(0.3, mood);
      expect(arrival.roll / (Math.PI * 2)).toBeCloseTo(-1, 6);
      expect(mascotPose(0.9, mood).roll).toBeLessThan(arrival.roll);
    }
  });

  it("gives each mood one legible thing and holds it", () => {
    // Cheer hops twice and never squashes; flop squashes once and never hops.
    const cheer = sample((p) => mascotPose(p, "cheer"));
    expect(new Set(cheer.map((c) => c.squash))).toEqual(new Set([1]));
    expect(Math.max(...cheer.map((c) => c.hop))).toBeGreaterThan(1);
    expect(runs(cheer.map((c) => c.hop > 0.01))).toBe(2);

    const flop = sample((p) => mascotPose(p, "flop"));
    expect(new Set(flop.map((c) => c.hop))).toEqual(new Set([0]));
    // Flat is instant and total — two values, never a slope between them.
    expect(new Set(flop.map((c) => c.squash))).toEqual(new Set([1, 0.3]));
    expect(runs(flop.map((c) => c.squash < 1))).toBe(1);
  });

  it("throws the callout through the lens rather than fading it", () => {
    expect(calloutPose(0).z).toBe(1);
    // It stops flat-on, and stays flat-on for the hold.
    expect(calloutPose(0.4).z).toBe(0);
    expect(calloutPose(0.4).yaw).toBe(0);
    expect(calloutPose(0.24).yaw).toBeCloseTo(0, 6);
    // Spinning on the way in, and past the camera on the way out.
    expect(Math.abs(calloutPose(0.05).yaw)).toBeGreaterThan(1);
    expect(calloutPose(1).z).toBeLessThan(-1);
  });
});

/**
 * The signatures (phase 5). Same two questions as every act above — does it
 * start and end off-stage, and does it do exactly one legible thing — plus the
 * one each of them is individually about.
 */
describe("the signatures", () => {
  it("starts and ends every one of them off-stage", () => {
    expect(bumperPose(0).rise).toBe(0);
    expect(bumperPose(1).rise).toBeCloseTo(0);
    // The slab arrives from above and is taken back up there.
    expect(slabPose(0).height).toBe(1);
    expect(slabPose(1).height).toBeCloseTo(1);
    expect(scorePose(0).drop).toBe(0);
    expect(scorePose(1).drop).toBeCloseTo(0);
    expect(pinsetterHeight(0)).toBe(1);
    expect(pinsetterHeight(1)).toBe(1);
    // The overlay's exit is an un-draw: nothing lit, no reticle, in the last
    // frame. It is binary the whole way, which is what makes it not a fade.
    expect(solvePose(0, 12)).toEqual({ lit: 0, reticle: false });
    expect(solvePose(1, 12)).toEqual({ lit: 0, reticle: false });
    // The cups leave to the right, having entered from the left.
    expect(shellPose(0, 0).offstage).toBe(-1);
    expect(shellPose(1, 0).offstage).toBeCloseTo(1);
  });

  it("seats the bumpers and lands the slab on exactly one beat each", () => {
    expect(sample(bumperPose).filter((p) => p.seated).length).toBeGreaterThan(0);
    expect(runs(sample(bumperPose).map((p) => p.seated))).toBe(1);
    expect(runs(sample(slabPose).map((p) => p.impact))).toBe(1);
    // One bounce, and only one: the slab is above rest exactly once after it
    // has landed and before it is winched away.
    const after = sample(slabPose).slice(45, 150);
    expect(runs(after.map((p) => p.height > 0 && p.height < 0.5))).toBe(1);
  });

  it("leaves one pin standing, and never lets it settle", () => {
    const late = [0.5, 0.6, 0.7, 0.8];
    for (const p of late) {
      for (let i = 0; i < 5; i++) {
        expect(pinPose(p, i, 0).standing, `${i}@${p}`).toBe(i === PIN_SURVIVOR);
      }
      // The four that went over are away from the rack and still moving.
      expect(Math.abs(pinPose(p, 0, 0).x)).toBeGreaterThan(0.5);
      expect(pinPose(p, 0, 0).spin).not.toBe(0);
    }
    // They arc — up first, then down and off the bottom of the frame. A pin
    // that only travels sideways reads as a row falling over rather than as
    // something having been hit.
    expect(pinPose(0.42, 0, 0).y).toBeGreaterThan(0.4);
    expect(pinPose(1, 0, 0).y).toBeLessThan(-8);
    // The survivor rocks on the two-frame clock and is swept out from under
    // itself rather than coming to rest.
    expect(new Set([0, 1, 2, 3].map((s) => pinPose(0.6, PIN_SURVIVOR, s).lean)).size).toBe(2);
    expect(pinPose(1, PIN_SURVIVOR, 0).y).toBeLessThan(-2);
  });

  it("shuffles the cups by permutation, and shows nothing under any of them", () => {
    // Every swap is a bijection — a cup never lands on another cup.
    for (let done = 0; done <= 3; done++) {
      expect(new Set([0, 1, 2].map((i) => shellSlot(i, done))).size, `${done}`).toBe(3);
    }
    // And the shuffle actually moves them: the end is not the start.
    expect([0, 1, 2].map((i) => shellSlot(i, 3))).not.toEqual([0, 1, 2]);

    // One cup lifts, then all three do — two separate lifts, and the second
    // one is unanimous.
    const lifted = (p: number) => [0, 1, 2].filter((i) => shellPose(p, i).lift > 0).length;
    const counts = Array.from({ length: 201 }, (_, i) => lifted(i / 200));
    expect(new Set(counts)).toEqual(new Set([0, 1, 3]));
    expect(runs(counts.map((c) => c > 0))).toBe(2);
  });

  it("changes the scoreboard's mark once, silently, mid-hold", () => {
    const marks = sample(scorePose).map((p) => p.mark);
    expect(runs(marks.map((m) => m === 1))).toBe(1);
    // The change happens while it is fully down, not on the way in or out.
    const changeAt = marks.findIndex((m) => m === 1) / 200;
    expect(scorePose(changeAt).drop).toBe(1);
  });

  it("draws the overlay dash by dash and un-draws it the same way", () => {
    const lit = sample((p) => solvePose(p, 12).lit);
    expect(Math.max(...lit)).toBe(12);
    // Monotone up, then monotone down: one drawing and one erasing, never a
    // flicker between them.
    const peak = lit.indexOf(12);
    expect(lit.slice(0, peak).every((v, i, a) => i === 0 || v >= a[i - 1]!)).toBe(true);
    expect(lit.slice(peak).every((v, i, a) => i === 0 || v <= a[i - 1]!)).toBe(true);
    // The reticle exists only while the line is whole.
    expect(runs(sample((p) => solvePose(p, 12).reticle))).toBe(1);
    expect(solvePose(0.5, 12).lit).toBe(12);
  });

  it("moves the pinsetter in whole steps and nothing else", () => {
    // The one act in the game with no curve under it at all: five heights,
    // and no sample anywhere lands between them.
    const heights = new Set(sample(pinsetterHeight));
    expect(heights).toEqual(new Set([1, 0.55, 0.12]));
    // Down on two beats, hold, up on two.
    expect(pinsetterHeight(0.2)).toBe(0.55);
    expect(pinsetterHeight(0.5)).toBe(0.12);
    expect(pinsetterHeight(0.8)).toBe(0.55);
  });
});

/** The pose sampled across the whole act, at a finer grain than the step clock. */
function sample<T>(pose: (p: number) => T): T[] {
  return Array.from({ length: 201 }, (_, i) => pose(i / 200));
}

/** How many separate stretches of `true` there are — one per hop, one per flat. */
function runs(flags: boolean[]): number {
  return flags.filter((on, i) => on && !flags[i - 1]).length;
}
