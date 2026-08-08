/**
 * Prop timing, pure and unit-testable.
 *
 * The taste law's timing rule lives here: props animate on a hard step while
 * the camera and gradients move at 60. `stepped` is the only sanctioned way a
 * prop samples its clock — a prop reading smooth time is a budget violation
 * that reads as a bug, not a choice.
 */

/** Quantize a time in seconds to a stepped frame clock. */
export const stepped = (seconds: number, fps: number): number =>
  Math.floor(seconds * fps) / fps;

/** Which stepped frame a time falls in — for two-frame alternations. */
export const stepIndex = (seconds: number, fps: number): number =>
  Math.floor(seconds * fps);

/**
 * The monster truck lap, as a pure pose: phase 0..1 in, abstract pose out.
 * The component maps `u` onto the world x-range and `lift` onto world y.
 *
 * Choreography (entrance AND exit — a gag that pops in or fades out is a bug):
 *  - drive in hard from off-frame left, nose lifting into a wheelie
 *  - launch off nothing, arc over the frame's low third
 *  - FREEZE at the apex, a beat too long
 *  - slam down (the stage flinch hangs off this transition)
 *  - two-frame suspension bounce, then drive off frame right
 */
export interface TruckPose {
  /** 0..1 across the driving range, off-frame to off-frame. */
  u: number;
  /** World-units above ground level. */
  lift: number;
  /** Pitch in radians; positive is nose-up. */
  pitch: number;
  /** On the ground (suspension bounce applies; leaving it means airborne). */
  grounded: boolean;
}

export function truckPose(phase: number): TruckPose {
  const p = phase < 0 ? 0 : phase > 1 ? 1 : phase;

  // Segment boundaries of the act.
  const LAUNCH = 0.3;
  const APEX = 0.44;
  const UNFREEZE = 0.54;
  const LAND = 0.62;

  if (p < LAUNCH) {
    const t = p / LAUNCH;
    const wheelie = t > 0.4 ? (t - 0.4) / 0.6 : 0;
    return { u: t * 0.42, lift: wheelie * 0.14, pitch: wheelie * 0.38, grounded: true };
  }
  if (p < APEX) {
    const t = (p - LAUNCH) / (APEX - LAUNCH);
    // Rising half of a parabola; pitch rotates through level toward nose-down.
    return {
      u: 0.42 + t * 0.16,
      lift: 1.7 * (1 - (1 - t) * (1 - t)),
      pitch: 0.38 - t * 0.5,
      grounded: false,
    };
  }
  if (p < UNFREEZE) {
    // The freeze-frame: held exactly, a beat too long. Identical pose to the
    // end of the launch segment on purpose.
    return { u: 0.58, lift: 1.7, pitch: -0.12, grounded: false };
  }
  if (p < LAND) {
    const t = (p - UNFREEZE) / (LAND - UNFREEZE);
    // Falling half: fast, accelerating, no easing out.
    return { u: 0.58 + t * 0.1, lift: 1.7 * (1 - t * t), pitch: -0.12 + t * 0.12, grounded: t >= 1 };
  }
  const t = (p - LAND) / (1 - LAND);
  return { u: 0.68 + t * 0.32, lift: 0, pitch: 0, grounded: true };
}
