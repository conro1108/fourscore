import { describe, expect, it } from "vitest";
import { createOrbit, ORBIT_LIMITS } from "./orbit.js";

/** One frame at 60fps, the unit `step` is called with in the real loop. */
const FRAME = 1 / 60;

/** Drag from (0,0) by (dx,dy) in `steps` pointer events, a frame apart. */
function drag(orbit: ReturnType<typeof createOrbit>, dx: number, dy: number, steps = 10) {
  orbit.press(0, 0);
  for (let i = 1; i <= steps; i++) {
    orbit.move((dx * i) / steps, (dy * i) / steps);
    orbit.step(FRAME);
  }
  orbit.release();
}

describe("orbit", () => {
  it("ignores a press that never travels — that gesture is a move, not a drag", () => {
    const orbit = createOrbit();
    orbit.press(100, 100);
    orbit.move(102, 103);
    orbit.step(FRAME);
    orbit.release();
    expect(orbit.dragged).toBe(false);
    expect(orbit.yaw).toBe(0);
    expect(orbit.pitch).toBe(0);
  });

  it("stays flagged after release, because the click arrives after pointerup", () => {
    const orbit = createOrbit();
    drag(orbit, 120, 0);
    expect(orbit.dragged).toBe(true);
    expect(orbit.dragging).toBe(false);
    orbit.press(0, 0);
    expect(orbit.dragged).toBe(false);
  });

  it("turns the board the way the hand goes", () => {
    const right = createOrbit();
    drag(right, 120, 0);
    // Drag right: the camera swings left, so yaw goes negative.
    expect(right.yaw).toBeLessThan(-0.2);

    const down = createOrbit();
    drag(down, 0, 120);
    // Drag down: the camera rises and looks along the columns.
    expect(down.pitch).toBeGreaterThan(0.2);
  });

  it("clamps to the authored limits however far the pointer goes", () => {
    const orbit = createOrbit();
    drag(orbit, 4000, 4000);
    expect(orbit.yaw).toBeCloseTo(-ORBIT_LIMITS.yaw);
    expect(orbit.pitch).toBeCloseTo(ORBIT_LIMITS.pitchMax);

    drag(orbit, -8000, -8000);
    expect(orbit.yaw).toBeCloseTo(ORBIT_LIMITS.yaw);
    expect(orbit.pitch).toBeCloseTo(ORBIT_LIMITS.pitchMin);
  });

  it("keeps spinning after release, and stops", () => {
    const orbit = createOrbit();
    drag(orbit, 150, 0, 30);
    const atRelease = orbit.yaw;

    orbit.step(FRAME);
    expect(orbit.yaw).toBeLessThan(atRelease);

    for (let i = 0; i < 600; i++) orbit.step(FRAME);
    const settled = orbit.yaw;
    orbit.step(FRAME);
    expect(orbit.yaw).toBe(settled);
    expect(settled).toBeGreaterThan(-ORBIT_LIMITS.yaw);
  });

  it("releases no throw from a pointer held still", () => {
    const orbit = createOrbit();
    orbit.press(0, 0);
    orbit.move(150, 0);
    orbit.step(FRAME);
    // Two frames of nothing: the hand stopped before it let go.
    orbit.step(FRAME);
    orbit.step(FRAME);
    orbit.release();
    const held = orbit.yaw;
    orbit.step(FRAME);
    expect(orbit.yaw).toBe(held);
  });

  it("builds no throw by shoving into a limit", () => {
    const orbit = createOrbit();
    drag(orbit, 100, 0);
    // Already at the stop, and still pushing.
    drag(orbit, 4000, 0, 20);
    expect(orbit.yaw).toBeCloseTo(-ORBIT_LIMITS.yaw);
    orbit.step(FRAME);
    expect(orbit.yaw).toBeCloseTo(-ORBIT_LIMITS.yaw);
  });

  it("catches a spinning board on the next press", () => {
    const orbit = createOrbit();
    drag(orbit, 150, 0);
    orbit.press(50, 50);
    const caught = orbit.yaw;
    orbit.step(FRAME);
    expect(orbit.yaw).toBe(caught);
  });
});
