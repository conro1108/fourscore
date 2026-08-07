import { CONNECT4, CONNECT5, makeVariant } from "@fourscore/engine";
import { describe, expect, it } from "vitest";
import { fitDistance, layoutFor } from "./layout.js";

// Layout must hold for geometries nobody chose by hand — same reason the
// engine fuzzes odd variants.
const VARIANTS = [
  CONNECT4,
  CONNECT5,
  makeVariant({ id: "wide", name: "Wide", width: 12, height: 4, run: 4 }),
  makeVariant({ id: "tall", name: "Tall", width: 4, height: 11, run: 4 }),
];

describe("layoutFor", () => {
  it("centers the board: columns and rows are symmetric about the origin", () => {
    for (const v of VARIANTS) {
      const l = layoutFor(v);
      expect(l.xOf(0)).toBeCloseTo(-l.xOf(v.width - 1));
      expect(l.yOf(0)).toBeCloseTo(-l.yOf(v.height - 1));
      expect(l.xOf(1) - l.xOf(0)).toBeCloseTo(1);
      expect(l.yOf(1) - l.yOf(0)).toBeCloseTo(1);
    }
  });

  it("keeps discs inside holes and holes inside cells", () => {
    for (const v of VARIANTS) {
      const l = layoutFor(v);
      expect(l.discRadius).toBeLessThan(l.holeRadius);
      expect(l.holeRadius).toBeLessThan(0.5);
    }
  });

  it("spawns drops above the frame", () => {
    for (const v of VARIANTS) {
      const l = layoutFor(v);
      expect(l.dropY).toBeGreaterThan(l.frameH / 2);
    }
  });
});

describe("fitDistance", () => {
  it("fits the frame at the returned distance, for any aspect", () => {
    for (const v of VARIANTS) {
      const l = layoutFor(v);
      for (const aspect of [0.7, 1, 1.6, 2.4]) {
        const fov = 38;
        const d = fitDistance(l, fov, aspect);
        const halfV = Math.tan((fov * Math.PI) / 360) * d;
        const halfH = halfV * aspect;
        expect(halfV).toBeGreaterThanOrEqual(l.frameH / 2);
        expect(halfH).toBeGreaterThanOrEqual(l.frameW / 2);
      }
    }
  });

  it("moves back for bigger boards", () => {
    const d4 = fitDistance(layoutFor(CONNECT4), 38, 1.6);
    const d5 = fitDistance(layoutFor(CONNECT5), 38, 1.6);
    expect(d5).toBeGreaterThan(d4);
  });
});
