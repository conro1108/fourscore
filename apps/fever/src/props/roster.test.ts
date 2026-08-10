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
  cherubPose,
  calloutPose,
  cannonPose,
  detonationPose,
  fingerPose,
  mirrorPose,
  pianoPose,
  washerPose,
  wreckingPose,
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

  it("lowers the cherub in hard steps, tilts it once, and takes it back", () => {
    // Off-stage above the frame at both ends — lowered in, winched out.
    expect(cherubPose(0, 0).height).toBe(1);
    expect(cherubPose(1, 0).height).toBe(1);
    expect(cherubPose(0.5, 0).height).toBe(0);
    // The descent is steps, not a float: five heights, nothing between them.
    expect(new Set(sample((p) => cherubPose(p, 0).height)).size).toBeLessThanOrEqual(5);
    // The one scheduled event: a single held tilt, mid-hover, level otherwise.
    expect(runs(sample((p) => cherubPose(p, 0).tilt === 1))).toBe(1);
    expect(cherubPose(0.1, 0).tilt).toBe(0);
    expect(cherubPose(0.9, 0).tilt).toBe(0);
    // Two wing cels, alternating on the step clock.
    expect(new Set([0, 1, 2, 3].map((s) => cherubPose(0.5, s).flap)).size).toBe(2);
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

/**
 * The full-frame acts (phase 9). Same two questions as everything above, plus
 * the one this set exists for: **does it actually cross the frame.** The
 * complaint that produced these six was spatial — the roster had grown up along
 * the bottom edge — so "the travel is large" is the property worth asserting,
 * and it is the one that would rot silently if somebody tuned a segment
 * boundary and clipped the arc.
 */
describe("the full-frame acts", () => {
  it("throws the cannon's shot clear across the frame and off it", () => {
    // The cannon itself arrives and leaves off-stage left.
    expect(cannonPose(0).u).toBe(0);
    expect(cannonPose(1).u).toBeCloseTo(0);
    // Nothing in the air before the shot or after it.
    expect(cannonPose(0.2).shot).toBeNull();
    expect(cannonPose(1).shot).toBeNull();
    // The barrel goes up in three steps and no interpolation between them.
    const cranks = new Set(sample((p) => cannonPose(p).crank));
    expect(cranks).toEqual(new Set([0, 1 / 3, 2 / 3, 1]));

    // The barrel is at rest right up until it fires and back at rest after —
    // three positions, and the same one at both ends. A sign slip in the recoil
    // window put it retracted for the entire approach, which reads as a barrel
    // that changes length rather than as a kick.
    expect(cannonPose(0.1).recoil).toBe(0);
    expect(cannonPose(0.39).recoil).toBe(0);
    expect(cannonPose(0.41).recoil).toBeGreaterThan(0);
    expect(cannonPose(1).recoil).toBe(0);
    expect(runs(sample((p) => cannonPose(p).recoil > 0))).toBe(1);

    // The travel: from one side of the frame past the other, over the top.
    const flight = sample((p) => cannonPose(p).shot).filter((s) => s !== null);
    expect(flight.length).toBeGreaterThan(20);
    expect(flight[0]!.u).toBeLessThan(0.1);
    expect(flight[flight.length - 1]!.u).toBeGreaterThan(1);
    // And it goes *over* — most of a frame-height above the muzzle, which is
    // the whole point of the act and the part a clipped arc would quietly lose.
    // (The first pass overshot the other way, at 1.5, and put the shot off the
    // top of the picture for its entire flight.)
    const apex = Math.max(...flight.map((s) => s!.v));
    expect(apex).toBeGreaterThan(0.6);
    expect(apex).toBeLessThan(1);
  });

  it("stops the piano dead in mid-air, and sends one key back", () => {
    // Above the frame, then out the bottom of it.
    expect(pianoPose(0).y).toBeGreaterThan(1);
    expect(pianoPose(0.67).y).toBeLessThan(-1);
    // The hold: two samples well apart inside it are the same frame, and the
    // tilt arrives on the frame the fall stops rather than during it.
    expect(pianoPose(0.3)).toEqual(pianoPose(0.5));
    expect(pianoPose(0.19).tilt).toBe(0);
    expect(pianoPose(0.21).tilt).toBeGreaterThan(0);

    // The exit is the key, and it happens in an empty frame.
    expect(sample((p) => pianoPose(p).present).some((v) => !v)).toBe(true);
    const key = sample((p) => pianoPose(p).key);
    expect(key.filter((k) => k !== null).length).toBeGreaterThan(10);
    // It comes up into frame and goes back out — one arc, not a landing.
    expect(Math.max(...key.map((k) => k ?? -99))).toBeGreaterThan(-1);
    expect(key[key.length - 1]).toBeLessThan(-1);
    // Nothing is on stage at the very last sample.
    expect(pianoPose(1).present).toBe(false);
  });

  it("swings the ball the whole way across, and stops it dead in the middle", () => {
    // In off one edge and out the other: it never doubles back.
    expect(wreckingPose(0, 0).swing).toBeLessThan(-0.9);
    expect(wreckingPose(1, 0).swing).toBeGreaterThan(0.9);
    const swings = sample((p) => wreckingPose(p, 0).swing);
    expect(swings.every((s, i) => i === 0 || s >= swings[i - 1]!)).toBe(true);

    // The hang, at the bottom of the arc, held exactly — the only still
    // stretch in the act, and the one place a pendulum cannot stop.
    expect(wreckingPose(0.4, 0).swing).toBe(0);
    expect(wreckingPose(0.55, 0).swing).toBe(0);
    expect(runs(swings.map((s) => s === 0))).toBe(1);

    // And the chain rattles on the two-frame clock the whole time.
    expect(new Set([0, 1, 2, 3].map((s) => wreckingPose(0.5, s).rattle)).size).toBe(2);
  });

  it("winches the mirror ball down in steps and strobes rather than sweeps", () => {
    expect(mirrorPose(0, 0).drop).toBe(0);
    expect(mirrorPose(1, 0).drop).toBeCloseTo(0);
    expect(mirrorPose(0.5, 0).drop).toBe(1);
    // Four positions on the way in and out, and nothing between them.
    expect(new Set(sample((p) => mirrorPose(p, 0).drop))).toEqual(
      new Set([0, 0.25, 0.5, 0.75, 1]),
    );
    // Two glint cels, alternating on the step clock.
    expect(new Set([0, 1, 2, 3].map((s) => mirrorPose(0.5, s).glint)).size).toBe(2);
    // The spin is whole steps only: it never moves within one.
    expect(mirrorPose(0.4, 7).spin).toBe(mirrorPose(0.6, 7).spin);
  });

  it("climbs the washer up the frame and drops it further than it started", () => {
    expect(washerPose(0).height).toBeLessThan(0);
    expect(washerPose(0.5).height).toBe(1);
    // The fall is the exit and it ends below where the climb began — an act
    // that stops at its start height is one that came to rest on stage.
    expect(washerPose(1).height).toBeLessThan(washerPose(0).height);
    expect(washerPose(1).falling).toBe(true);
    // Six stepped positions on the way up, and no wiping while it climbs.
    const climb = sample(washerPose).filter((p) => !p.falling && p.wipe === null);
    expect(new Set(climb.map((p) => p.height)).size).toBeLessThanOrEqual(7);
    // One stroke, once, in six steps, and it happens at the top.
    const wipes = sample(washerPose).map((p) => p.wipe);
    expect(runs(wipes.map((v) => v !== null && v < 1))).toBe(1);
    expect(new Set(wipes.filter((v): v is number => v !== null)).size).toBeLessThanOrEqual(7);
  });

  it("raises the finger to full height and wags it exactly twice", () => {
    expect(fingerPose(0).rise).toBe(0);
    expect(fingerPose(1).rise).toBe(0);
    expect(fingerPose(0.5).rise).toBe(1);
    // Four steps up, four down, nothing in between them.
    expect(new Set(sample((p) => fingerPose(p).rise))).toEqual(
      new Set([0, 0.25, 0.5, 0.75, 1]),
    );
    // Two wags: one each side of vertical, and it is dead still either side.
    const wag = sample((p) => fingerPose(p).wag);
    expect(runs(wag.map((w) => w < -0.01))).toBe(1);
    expect(runs(wag.map((w) => w > 0.01))).toBe(1);
    expect(fingerPose(0.7).wag).toBe(0);
    // And it never wags while it is still coming up or already going down.
    for (const p of [0.08, 0.92]) expect(fingerPose(p).wag, `${p}`).toBe(0);
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
