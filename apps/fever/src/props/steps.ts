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

/* ------------------------------------------------------------------------ *
 * The roster (phase 3). Every act below is built by holding it next to the
 * truck: it enters from off-stage, does exactly one legible thing, holds a
 * beat too long somewhere, and leaves the way it came. None of them fade.
 *
 * Poses are abstract — 0..1 through the act in, unit-ish numbers out — and the
 * components map them onto the layout, so every gag frames itself off the
 * variant and nothing here knows a board is 7 wide.
 * ------------------------------------------------------------------------ */

const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x);

/** The rocket that celebrates by failing. */
export interface RocketPose {
  /** Height above the launch point, in frame-heights. 0 = below the frame. */
  rise: number;
  /** Lean in radians; the tip-over runs past horizontal on purpose. */
  tilt: number;
  /** Exhaust is lit (it goes out at the stall — that's the joke). */
  burning: boolean;
}

export function rocketPose(phase: number): RocketPose {
  const p = clamp01(phase);
  const STALL = 0.34;
  const HANG = 0.5;
  const TIP = 0.66;

  if (p < STALL) {
    // Straight up, fast, no easing in — it means it.
    const t = p / STALL;
    return { rise: t * t * 1.15, tilt: 0, burning: true };
  }
  if (p < HANG) {
    // Momentum, then nothing. Still climbing, engine already dead.
    const t = (p - STALL) / (HANG - STALL);
    return { rise: 1.15 + (1 - (1 - t) * (1 - t)) * 0.12, tilt: 0, burning: false };
  }
  if (p < TIP) {
    // The hang, held exactly — the beat too long, and the only still frame in
    // the act.
    return { rise: 1.27, tilt: 0, burning: false };
  }
  const t = (p - TIP) / (1 - TIP);
  return { rise: 1.27 - t * t * 1.9, tilt: t * 2.4, burning: false };
}

/** The rally sign on a stick: up, hold, gone. */
export interface SignPose {
  /** Height in frame-heights; 0 is fully below the frame edge. */
  rise: number;
  /** Waggle in radians, alternating on the step clock. */
  lean: number;
}

export function signPose(phase: number, step: number): SignPose {
  const p = clamp01(phase);
  const UP = 0.14;
  const DOWN = 0.72;
  // Two-frame waggle while it's up: the only motion the sign ever makes.
  const lean = step % 2 === 0 ? 0.06 : -0.06;
  if (p < UP) return { rise: (p / UP) * 1, lean };
  if (p < DOWN) return { rise: 1, lean };
  return { rise: 1 - (p - DOWN) / (1 - DOWN), lean };
}

/** The hazard beacon that drops in when someone is one move from a run. */
export interface BeaconPose {
  /** Distance below the top of the frame, in frame-heights. */
  drop: number;
  /** Lamp yaw in radians — stepped, so it strobes rather than sweeps. */
  spin: number;
  /** Lamp brightness 0..1; a hard square wave, never a breath. */
  lamp: number;
}

export function beaconPose(phase: number, step: number): BeaconPose {
  const p = clamp01(phase);
  const IN = 0.18;
  const OUT = 0.8;
  const spin = step * 0.9;
  const lamp = step % 2 === 0 ? 1 : 0.15;
  if (p < IN) return { drop: p / IN, spin, lamp };
  if (p < OUT) return { drop: 1, spin, lamp };
  return { drop: 1 - (p - OUT) / (1 - OUT), spin, lamp };
}

/** The banner plane: straight across, no arrival, no departure, just passing. */
export interface BannerPose {
  /** 0..1 across the frame, off-stage to off-stage. */
  u: number;
  /** Vertical bob in world-ish units, stepped. */
  bob: number;
}

export function bannerPose(phase: number, step: number): BannerPose {
  const p = clamp01(phase);
  // Constant speed all the way through — a tow plane has no reason to
  // accelerate, and the banner behind it is the thing being read.
  return { u: p, bob: (step % 4 < 2 ? 1 : -1) * 0.08 };
}

/** Moss's sprinkler: up, water nothing for two beats, down. (VISION.md) */
export interface SprinklerPose {
  /** Height in frame-heights above its hidden rest position. */
  rise: number;
  /** Which of the two watering beats is happening, or 0 for neither. */
  beat: 0 | 1 | 2;
}

export function sprinklerPose(phase: number): SprinklerPose {
  const p = clamp01(phase);
  const UP = 0.22;
  const BEAT1 = 0.42;
  const BEAT2 = 0.62;
  const DOWN = 0.78;
  const rise = p < UP ? p / UP : p < DOWN ? 1 : 1 - (p - DOWN) / (1 - DOWN);
  const beat = p >= UP && p < BEAT1 ? 1 : p >= BEAT2 && p < DOWN ? 2 : 0;
  return { rise, beat: beat as 0 | 1 | 2 };
}

/**
 * The win detonation — the biggest thing in the game, and the only act allowed
 * to be flatly declarative about the result (see `director/types.ts`: `win` is
 * a fact, everything else on the bus is this engine's estimate).
 *
 * Four things overlapping: pyro erupts, debris launches, the banner slams at
 * the camera and freezes, then everything leaves downward.
 */
export interface DetonationPose {
  /** Pyro column height, 0..1. */
  pyro: number;
  /** Seconds since the debris was launched; negative before launch. */
  debris: number;
  /** Banner distance from the camera, 1 = far off, 0 = pressed against it. */
  bannerZ: number;
  /** Banner roll in radians; it leaves by tumbling, not by fading. */
  bannerRoll: number;
  /** True on the single beat the banner arrives — the stage flinch hangs here. */
  slam: boolean;
}

export const DETONATION_MS = 5200;

export function detonationPose(phase: number): DetonationPose {
  const p = clamp01(phase);
  const seconds = p * (DETONATION_MS / 1000);

  // Pyro: instant on, burns through the middle, cuts out. No taper.
  const pyro = p < 0.06 ? p / 0.06 : p < 0.62 ? 1 : Math.max(0, 1 - (p - 0.62) / 0.1);

  const DEBRIS_AT = 0.05;
  const debris = seconds - DEBRIS_AT * (DETONATION_MS / 1000);

  const BANNER_IN = 0.2;
  const BANNER_HELD = 0.34;
  const BANNER_OUT = 0.7;
  let bannerZ = 1;
  let bannerRoll = 0;
  if (p >= BANNER_IN && p < BANNER_HELD) {
    // Slams in over three stepped frames, overshooting nothing: it just stops.
    const t = (p - BANNER_IN) / (BANNER_HELD - BANNER_IN);
    bannerZ = 1 - t * t;
  } else if (p >= BANNER_HELD && p < BANNER_OUT) {
    bannerZ = 0;
  } else if (p >= BANNER_OUT) {
    const t = (p - BANNER_OUT) / (1 - BANNER_OUT);
    bannerZ = t * t * 1.4;
    bannerRoll = t * 3.4;
  }

  // The slam beat: the first stepped frame at rest, which is where the whole
  // stage flinches.
  const slam = p >= BANNER_HELD && p < BANNER_HELD + 0.02;

  return { pyro, debris, bannerZ, bannerRoll, slam };
}
