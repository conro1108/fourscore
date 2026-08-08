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

/* ------------------------------------------------------------------------ *
 * The lane screen (VISION.md pillar 2, after the reference change). Two forms
 * a bowling centre's overhead monitor has that a county fair doesn't:
 *
 * - **the cast** — a character with no origin who shows up, does its one
 *   canned reaction to what you did, and leaves. Same reaction next time.
 * - **the callout** — a word in extruded chrome that spins at the lens, holds
 *   a beat too long, and is thrown past you.
 * ------------------------------------------------------------------------ */

/** Which canned reaction the mascot has come to perform. */
export type MascotMood = "cheer" | "flop";

/**
 * The mascot: a game disc with a face, rolling on its edge.
 *
 * One entrance and one exit shared by both moods, because that is exactly how
 * a lane screen is built — one character, one clip per outcome, and the clip
 * you get says nothing about how close the outcome was.
 */
export interface MascotPose {
  /** 0..1 along its lane, off-frame to off-frame. */
  u: number;
  /** Rolling angle in radians. Negative: it rolls the way it travels. */
  roll: number;
  /** Hop height in world-ish units. 0 is on the ground. */
  hop: number;
  /** Vertical squash, 1 = round. Cartoon flat is 0.3, and it is instant. */
  squash: number;
}

const MASCOT_IN = 0.3;
const MASCOT_OUT = 0.72;
/** Where along its lane it stops to do the bit. */
const MASCOT_HOLD_U = 0.42;
/**
 * Turns across the whole lane. Set so the disc has made exactly one full turn
 * when it arrives: a mascot that stops mid-roll does its reaction with its face
 * at a tilt, and a face at a tilt reads as a rigging bug rather than as a joke.
 */
const MASCOT_TURNS = 1 / MASCOT_HOLD_U;

export function mascotPose(phase: number, mood: MascotMood): MascotPose {
  const p = clamp01(phase);
  const IN = MASCOT_IN;
  const OUT = MASCOT_OUT;
  const HOLD_U = MASCOT_HOLD_U;
  // A disc that slides instead of rolling reads as a bug, so the roll is tied
  // to the distance travelled rather than to time.
  const rollOf = (u: number) => -u * MASCOT_TURNS * Math.PI * 2;

  if (p < IN) {
    const u = (p / IN) * HOLD_U;
    return { u, roll: rollOf(u), hop: 0, squash: 1 };
  }
  if (p < OUT) {
    const t = (p - IN) / (OUT - IN);
    const base = { u: HOLD_U, roll: rollOf(HOLD_U) };
    if (mood === "cheer") {
      // Two hops, triangular — up on a step, down on a step, no easing, and no
      // spin: the face has to stay square long enough to be read.
      const hop = t < 0.34 ? tri(t / 0.34) : t >= 0.42 && t < 0.8 ? tri((t - 0.42) / 0.38) : 0;
      return { ...base, hop: hop * 1.15, squash: 1 };
    }
    // Flop: a moment of wobble, then flat in a single frame, held far too
    // long, then round again just as abruptly. Nothing in between, ever.
    const squash = t < 0.22 ? 1 : t < 0.86 ? 0.3 : 1;
    return { ...base, hop: 0, squash };
  }
  const t = (p - OUT) / (1 - OUT);
  const u = HOLD_U + t * (1 - HOLD_U);
  return { u, roll: rollOf(u), hop: 0, squash: 1 };
}

/** A triangle wave over 0..1: up to 1 at the middle, back to 0. */
const tri = (t: number): number => 1 - Math.abs(clamp01(t) * 2 - 1);

/**
 * The callout: one word, thrown at the camera.
 *
 * It arrives spinning, stops dead facing you, holds past the point of comfort,
 * and then keeps coming — it exits *through* the lens rather than retreating,
 * which is the one exit that can't be mistaken for a fade.
 */
export interface CalloutPose {
  /** Distance from the camera. 1 = far off, 0 = at the lens, negative = past. */
  z: number;
  /** Yaw in radians. Ends at 0: it stops flat-on, mid-word, and stays there. */
  yaw: number;
}

export function calloutPose(phase: number): CalloutPose {
  const p = clamp01(phase);
  const IN = 0.24;
  const OUT = 0.62;
  if (p < IN) {
    const t = p / IN;
    // Accelerating in, unwinding as it comes: three half-turns, and the last
    // one lands square rather than easing out of the spin.
    return { z: 1 - t * t, yaw: (1 - t) * Math.PI * 3 };
  }
  if (p < OUT) return { z: 0, yaw: 0 };
  const t = (p - OUT) / (1 - OUT);
  return { z: -t * t * 1.8, yaw: 0 };
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
    // Tips away, never turns over. This used to roll 3.4 radians, and the last
    // third of the act was a banner past 180° — which is a sentence the player
    // reads upside down and backwards. It reads as broken text rather than as
    // a thing being thrown, and "looks broken by accident" is the one thing the
    // taste law doesn't allow. A quarter turn is plenty of tumble.
    bannerRoll = t * 0.8;
  }

  // The slam beat: the first stepped frame at rest, which is where the whole
  // stage flinches.
  const slam = p >= BANNER_HELD && p < BANNER_HELD + 0.02;

  return { pyro, debris, bannerZ, bannerRoll, slam };
}
