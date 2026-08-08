/**
 * The roster's contract, which is mostly the taste law written as assertions.
 * The gags themselves can only be judged in a screenshot, but "every event kind
 * has a gag" and "no prop is over budget" are facts a test can hold onto — and
 * both are exactly the kind of thing that rots silently when phase 5 adds a bot
 * with a signature act.
 */

import { describe, expect, it } from "vitest";
import { gagFor } from "./PropStage.js";
import { PROP_ACTS } from "./registry.js";
import { EVENT_KINDS, type SpectacleEvent } from "../director/types.js";
import {
  beaconPose,
  bannerPose,
  detonationPose,
  rocketPose,
  signPose,
  sprinklerPose,
} from "./steps.js";

/** One representative event per kind — the same set the debug panel fires. */
const SAMPLES: SpectacleEvent[] = [
  { kind: "move", player: "red", col: 3, quality: "brilliant" },
  { kind: "move", player: "red", col: 3, quality: "dubious" },
  { kind: "move", player: "red", col: 3, quality: "blunder" },
  { kind: "threat", player: "yellow" },
  { kind: "tension-shift", direction: "rising" },
  { kind: "tension-shift", direction: "collapsing" },
  { kind: "win", player: "red", line: [] },
  { kind: "draw" },
  { kind: "idle-beat" },
];

describe("the gag roster", () => {
  it("has an act for every event kind", () => {
    for (const kind of EVENT_KINDS) {
      const named = SAMPLES.filter((e) => e.kind === kind).map(gagFor);
      expect(named.length, kind).toBeGreaterThan(0);
      expect(named.some((name) => name !== null), kind).toBe(true);
    }
  });

  it("only names acts that exist", () => {
    for (const event of SAMPLES) {
      const name = gagFor(event);
      if (name) expect(PROP_ACTS[name], name).toBeDefined();
    }
  });

  it("leaves ordinary moves alone", () => {
    expect(gagFor({ kind: "move", player: "red", col: 3, quality: "fine" })).toBeNull();
  });

  it("keeps every prop under the 300-triangle budget", () => {
    for (const act of Object.values(PROP_ACTS)) {
      expect(act.tris, act.name).toBeLessThanOrEqual(300);
      expect(act.tris, act.name).toBeGreaterThan(0);
    }
  });

  it("gives every act a real length", () => {
    for (const act of Object.values(PROP_ACTS)) {
      expect(act.durationMs, act.name).toBeGreaterThan(500);
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
    expect(detonationPose(1).bannerRoll).toBeGreaterThan(3);
    // Pyro erupts immediately and is out before the act ends.
    expect(detonationPose(0.1).pyro).toBe(1);
    expect(detonationPose(1).pyro).toBe(0);
  });
});
