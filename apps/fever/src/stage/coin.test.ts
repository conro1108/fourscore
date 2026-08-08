import { describe, expect, it } from "vitest";
import { coinProfile } from "./coin.js";

describe("coinProfile", () => {
  const R = 0.41;
  const T = 0.3;
  const profile = coinProfile(R, T);

  it("never exceeds the disc's radius or thickness", () => {
    for (const p of profile) {
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.x).toBeLessThanOrEqual(R + 1e-9);
      expect(Math.abs(p.y)).toBeLessThanOrEqual(T / 2 + 1e-9);
    }
  });

  it("traces center → rim → center without doubling back", () => {
    // A lathe profile that doubles back on itself folds the surface, and the
    // fold is invisible in a still until the light moves.
    const mid = profile.length / 2;
    for (let i = 1; i < mid; i++) expect(profile[i]!.x).toBeGreaterThan(profile[i - 1]!.x);
    for (let i = mid + 1; i < profile.length; i++) {
      expect(profile[i]!.x).toBeLessThan(profile[i - 1]!.x);
    }
    expect(profile[0]!.y).toBeLessThan(0);
    expect(profile[profile.length - 1]!.y).toBeGreaterThan(0);
  });

  it("is mirror-symmetric about the coin's midplane", () => {
    for (let i = 0; i < profile.length; i++) {
      const other = profile[profile.length - 1 - i]!;
      expect(profile[i]!.x).toBeCloseTo(other.x, 12);
      expect(profile[i]!.y).toBeCloseTo(-other.y, 12);
    }
  });

  it("raises the rim above the dished face", () => {
    const heights = profile.map((p) => p.y);
    const peak = Math.max(...heights);
    const center = profile[0]!;
    expect(Math.abs(center.y)).toBeLessThan(peak);
    expect(center.x).toBe(0);
    // And the outer wall is inset from the lip, so the edge is a chamfer.
    const wall = profile.reduce((a, b) => (b.x > a.x ? b : a));
    expect(Math.abs(wall.y)).toBeLessThan(peak);
  });
});
