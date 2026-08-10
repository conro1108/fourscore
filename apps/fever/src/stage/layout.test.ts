import { CONNECT4, CONNECT5, CONNECT6, CONNECT7, makeVariant } from "@fourscore/engine";
import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { fitDistance, layoutFor } from "./layout.js";
import { ORBIT_LIMITS } from "./orbit.js";

// Layout must hold for geometries nobody chose by hand — same reason the
// engine fuzzes odd variants.
const VARIANTS = [
  CONNECT4,
  CONNECT5,
  CONNECT6,
  CONNECT7,
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

  /**
   * Checked against three's own projection rather than the same trigonometry
   * again: the thing that can actually be wrong here is the camera basis, and
   * a test that rebuilds it agrees with any sign error it makes.
   */
  it("keeps the padded frame on screen at every orbit the player can reach", () => {
    const fov = 38;
    const yaws = [-ORBIT_LIMITS.yaw, -0.4, 0, 0.55, ORBIT_LIMITS.yaw];
    const pitches = [ORBIT_LIMITS.pitchMin, -0.2, 0, 0.35, ORBIT_LIMITS.pitchMax];

    for (const v of VARIANTS) {
      const l = layoutFor(v);
      for (const aspect of [0.7, 1, 1.6, 2.4]) {
        for (const yaw of yaws) {
          for (const pitch of pitches) {
            const d = fitDistance(l, fov, aspect, yaw, pitch);
            const camera = new THREE.PerspectiveCamera(fov, aspect, 0.1, 200);
            const cp = Math.cos(pitch);
            camera.position.set(Math.sin(yaw) * cp * d, Math.sin(pitch) * d, Math.cos(yaw) * cp * d);
            camera.lookAt(0, 0, 0);
            camera.updateMatrixWorld();
            camera.updateProjectionMatrix();

            // The padded frame — what the fit promises to hold, board plus
            // breathing room. Its tightest corner should sit *on* the frustum
            // edge: any slack here is the camera standing further back than
            // the shot asks for.
            const halfW = l.frameW / 2 + 1.35;
            const halfH = l.frameH / 2 + 1.55;
            let tightest = 0;
            for (const sx of [-1, 1]) {
              for (const sy of [-1, 1]) {
                const ndc = new THREE.Vector3(sx * halfW, sy * halfH, 0).project(camera);
                tightest = Math.max(tightest, Math.abs(ndc.x), Math.abs(ndc.y));
              }
            }
            expect(tightest).toBeLessThanOrEqual(1 + 1e-9);
            expect(tightest).toBeCloseTo(1, 6);
          }
        }
      }
    }
  });
});
