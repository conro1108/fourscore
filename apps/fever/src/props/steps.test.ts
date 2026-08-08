import { describe, expect, it } from "vitest";
import { stepIndex, stepped, truckPose } from "./steps.js";

describe("stepped", () => {
  it("quantizes to the frame grid", () => {
    expect(stepped(0.0, 12)).toBe(0);
    expect(stepped(1 / 12 - 1e-9, 12)).toBe(0);
    expect(stepped(1 / 12, 12)).toBeCloseTo(1 / 12);
    expect(stepped(0.5, 12)).toBeCloseTo(Math.floor(6) / 12);
  });

  it("indexes frames for two-frame alternation", () => {
    expect(stepIndex(0, 12)).toBe(0);
    expect(stepIndex(0.09, 12)).toBe(1);
  });
});

describe("truckPose", () => {
  it("enters and exits off-frame: u sweeps 0 to 1", () => {
    expect(truckPose(0).u).toBe(0);
    expect(truckPose(1).u).toBeCloseTo(1);
  });

  it("never drives backwards", () => {
    let prev = -1;
    for (let p = 0; p <= 1.0001; p += 0.001) {
      const { u } = truckPose(p);
      expect(u).toBeGreaterThanOrEqual(prev - 1e-9);
      prev = u;
    }
  });

  it("freezes at the apex: identical pose across the hold", () => {
    const a = truckPose(0.45);
    const b = truckPose(0.53);
    expect(a).toEqual(b);
    expect(a.grounded).toBe(false);
    expect(a.lift).toBeGreaterThan(1);
  });

  it("is grounded at both ends and airborne in the middle", () => {
    expect(truckPose(0.1).grounded).toBe(true);
    expect(truckPose(0.48).grounded).toBe(false);
    expect(truckPose(0.8).grounded).toBe(true);
    expect(truckPose(0.8).lift).toBe(0);
  });

  it("lands: lift returns to 0 when the slam completes", () => {
    expect(truckPose(0.62).lift).toBeCloseTo(0, 1);
  });
});
