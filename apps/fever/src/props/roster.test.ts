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
  bannerPose,
  calloutPose,
  detonationPose,
  mascotPose,
  rocketPose,
  signPose,
  sprinklerPose,
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

  it("the sign and sprinkler both end hidden where they started", () => {
    expect(signPose(0, 0).rise).toBe(0);
    expect(signPose(1, 0).rise).toBeCloseTo(0);
    expect(sprinklerPose(0).rise).toBe(0);
    expect(sprinklerPose(1).rise).toBeCloseTo(0);
  });

  it("the sprinkler waters nothing exactly twice, with a gap", () => {
    const beats = [];
    let prev: number = 0;
    for (let p = 0; p <= 1; p += 0.001) {
      const { beat } = sprinklerPose(p);
      if (beat !== prev && beat !== 0) beats.push(beat);
      prev = beat;
    }
    expect(beats).toEqual([1, 2]);
  });

  it("the beacon strobes rather than breathes", () => {
    const levels = new Set([0, 1, 2, 3].map((s) => beaconPose(0.5, s).lamp));
    expect(levels.size).toBe(2);
    expect(beaconPose(0, 0).drop).toBe(0);
    expect(beaconPose(1, 0).drop).toBeCloseTo(0);
  });

  it("the banner crosses at a constant speed, off-stage to off-stage", () => {
    expect(bannerPose(0, 0).u).toBe(0);
    expect(bannerPose(1, 0).u).toBe(1);
    expect(bannerPose(0.5, 0).u).toBeCloseTo(0.5);
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

/** The pose sampled across the whole act, at a finer grain than the step clock. */
function sample<T>(pose: (p: number) => T): T[] {
  return Array.from({ length: 201 }, (_, i) => pose(i / 200));
}

/** How many separate stretches of `true` there are — one per hop, one per flat. */
function runs(flags: boolean[]): number {
  return flags.filter((on, i) => on && !flags[i - 1]).length;
}
