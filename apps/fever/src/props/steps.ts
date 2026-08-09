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

/**
 * Moss's mower: crosses, stops for no reason, crosses the rest of the way.
 *
 * Replaces the sprinkler, which was a *thing* where the reference wants a
 * *character* — the trait is that the cast is sentient, not that the alley has
 * equipment. So this one has a face, and the face never changes, and it is the
 * only act in the game whose whole joke is that nothing escalates.
 *
 * Constant velocity everywhere, no easing at either end: it enters already at
 * its cruising speed and leaves at the same one. Moss is not slow, Moss is
 * unhurried, and the difference between those two is entirely in the fact that
 * it never accelerates.
 */
export interface MowerPose {
  /** 0..1 along its lane, off-frame to off-frame. */
  u: number;
  /** Blade angle in radians. Never stops, never cuts anything. */
  blades: number;
  /** Two-frame chassis jolt in world-ish units — a machine, idling badly. */
  jolt: number;
}

/** Where along its lane it stops, and how much of the act it spends stopped. */
const MOWER_HOLD_U = 0.44;
const MOWER_STOP = 0.26;
/**
 * The two moving segments, derived rather than chosen — which is what makes
 * "one speed" a property of the code instead of a pair of numbers that happen
 * to agree today. It covers the whole lane in the act minus the stop, so both
 * segments run at `1 / (1 - MOWER_STOP)` and the hold is the only event.
 */
const MOWER_IN = MOWER_HOLD_U * (1 - MOWER_STOP);
const MOWER_OUT = MOWER_IN + MOWER_STOP;
/** Turns of the blade across the act. Fast enough to alias on the step clock. */
const MOWER_TURNS = 9;

export function mowerPose(phase: number, step: number): MowerPose {
  const p = clamp01(phase);
  const blades = p * MOWER_TURNS * Math.PI * 2;
  const jolt = (step % 2 === 0 ? 1 : -1) * 0.035;

  if (p < MOWER_IN) return { u: (p / MOWER_IN) * MOWER_HOLD_U, blades, jolt };
  // The hold. It has arrived somewhere it has no reason to be and stays there
  // for a quarter of the act, which is a very long time on a screen this loud.
  if (p < MOWER_OUT) return { u: MOWER_HOLD_U, blades, jolt };
  const t = (p - MOWER_OUT) / (1 - MOWER_OUT);
  return { u: MOWER_HOLD_U + t * (1 - MOWER_HOLD_U), blades, jolt };
}

/**
 * The stare: the mascot, in sunglasses, declining to do a bit.
 *
 * The reference's "apex predator" trait, taken as register rather than as
 * content — total confidence and zero action. It is the same disc as
 * `mascotPose`, which is the point: a lane screen's cast is unexplained, so the
 * character that cheers for you is also the character that rises out of the
 * floor and looks at you, and nothing accounts for the difference.
 *
 * Every transition is one frame. It does not rise, it *appears higher* three
 * times; the one lean is the only thing that ever happens; the exit is a single
 * frame of nothing. Interpolating any of it would make it a creature moving
 * rather than a machine playing four cels.
 */
export interface StarePose {
  /** Height in frame-heights above its hidden rest position, 0..1. */
  rise: number;
  /** Lean toward the lens, 0..1. It leans once and never leans back. */
  lean: number;
}

export function starePose(phase: number): StarePose {
  const p = clamp01(phase);
  const STEPS: [until: number, rise: number][] = [
    [0.08, 0.35],
    [0.16, 0.7],
    [0.62, 1],
  ];
  const GONE = 0.88;

  for (const [until, rise] of STEPS) if (p < until) return { rise, lean: 0 };
  // Leaned in, held, for a quarter of the act. Nothing else is scheduled; the
  // act from here is just a face, closer. Then one frame and an empty stage.
  if (p < GONE) return { rise: 1, lean: 1 };
  return { rise: 0, lean: 0 };
}

/**
 * Deep space: the act with nothing whatsoever to do with the game.
 *
 * The reference's fourth trait — the screen cuts to the vacuum of space for no
 * reason and cuts back — and the one act that is allowed to be about nothing.
 * It cannot react to the move because it does not know a move happened, which
 * is exactly why it is the funniest thing to answer an ordinary move with.
 *
 * A flat drift at a constant rate. It does not arrive and it does not conclude;
 * it was already crossing before the screen looked at it.
 */
export interface DeepSpacePose {
  /** 0..1 across the sky, off-frame to off-frame. */
  u: number;
  /** Height above the drift line, in world-ish units — a very shallow arc. */
  arc: number;
  /** Which of the two twinkle cels the stars are on. */
  twinkle: 0 | 1;
}

export function deepSpacePose(phase: number, step: number): DeepSpacePose {
  const p = clamp01(phase);
  return { u: p, arc: Math.sin(p * Math.PI) * 0.6, twinkle: (step % 2) as 0 | 1 };
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

/* ------------------------------------------------------------------------ *
 * The signatures (phase 5). One clip per opponent, wired in `bots/identity.ts`
 * and described in VISION.md. Every one of them is the same shape as the acts
 * above — enter from off-stage, do one legible thing, hold it a beat too long,
 * leave — and every one is a clip the alley's screen would actually have: the
 * bumpers going up, the ball return, a rack getting hit, a shell game, a
 * scoreboard, a targeting overlay, the pinsetter.
 *
 * These lean harder on the step clock than the phase-3 roster does, several of
 * them moving *only* in whole stepped jumps with no interpolation at all. That
 * is the reference taken at its word: canned animation on a machine with a
 * frame budget, not physics with the frame rate turned down.
 * ------------------------------------------------------------------------ */

/** Acorn's bumpers: up in three hard steps, up for the whole act, down. */
export interface BumperPose {
  /** 0 = below the frame, 1 = raised. */
  rise: number;
  /** True on the beat they seat. The clunk hangs here. */
  seated: boolean;
}

export function bumperPose(phase: number): BumperPose {
  const p = clamp01(phase);
  const IN = 0.12;
  const OUT = 0.86;
  // Three steps rather than a ramp: a bumper is a machine with two positions
  // and a motor that is not very good.
  if (p < IN) return { rise: Math.ceil((p / IN) * 3) / 3, seated: false };
  if (p < OUT) return { rise: 1, seated: p < IN + 0.03 };
  return { rise: 1 - (p - OUT) / (1 - OUT), seated: false };
}

/** Pebble's slab: falls, lands, bounces exactly one frame, is winched away. */
export interface SlabPose {
  /** Height above rest, in frame-heights. 1 is above the top of the frame. */
  height: number;
  /** True on the beat it hits. */
  impact: boolean;
}

export function slabPose(phase: number): SlabPose {
  const p = clamp01(phase);
  const FALL = 0.2;
  const BOUNCE = 0.26;
  const UP = 0.76;
  if (p < FALL) {
    // Accelerating, no ease out: it stops because the floor is there.
    const t = p / FALL;
    return { height: 1 - t * t, impact: false };
  }
  // One frame up off the landing and then nothing — a bounce with no second
  // bounce, which is what makes it read as weight rather than as rubber.
  if (p < BOUNCE) return { height: 0.09, impact: p < FALL + 0.02 };
  if (p < UP) return { height: 0, impact: false };
  return { height: (p - UP) / (1 - UP), impact: false };
}

/**
 * Bramble's rack. Five pins rise, something off-screen hits them, four go
 * over, and the fifth is left rocking. It never falls, and the clip leaves
 * before anyone finds out — which is Bramble's whole gameplay soul in three
 * seconds.
 */
export interface PinPose {
  /** Offset from the pin's rack position, in world-ish units. */
  x: number;
  y: number;
  /** Tumble in radians, for the four that were hit. */
  spin: number;
  /** Rock in radians, for the one that wasn't. */
  lean: number;
  standing: boolean;
}

/** The pin that survives, every time. Wrongness repeats. */
export const PIN_SURVIVOR = 2;

export function pinPose(phase: number, index: number, step: number): PinPose {
  const p = clamp01(phase);
  const IN = 0.14;
  const HIT = 0.34;
  const OUT = 0.82;
  const rest = { x: 0, y: 0, spin: 0, lean: 0, standing: true };

  // The rack rises into place, all five together, in three steps.
  if (p < IN) return { ...rest, y: -(1 - Math.ceil((p / IN) * 3) / 3) * 2.6 };
  if (p < HIT) return rest;

  if (index === PIN_SURVIVOR) {
    // Rocking on the two-frame clock, and swept out from under itself at the
    // end rather than settling. Nobody ever sees it stop.
    const lean = step % 2 === 0 ? 0.14 : -0.11;
    if (p < OUT) return { ...rest, lean };
    return { ...rest, lean, y: -((p - OUT) / (1 - OUT)) * 2.6 };
  }

  // The four that went over. Velocities are a function of the index, not of a
  // random number: the same pin goes the same way every single time. Tuned
  // high enough that they are visibly *launched* — the first pass sent them
  // sideways along the floor, which reads as a row of fallen pins rather than
  // as something having happened.
  const t = (p - HIT) * 3;
  const vx = (index - PIN_SURVIVOR) * 3.1 + (index % 2 === 0 ? -0.7 : 0.9);
  const vy = 5 + (index % 3) * 0.7;
  return {
    x: vx * t,
    y: vy * t - 7 * t * t,
    spin: Math.sign(vx) * t * 7,
    lean: 0,
    standing: false,
  };
}

/**
 * Cinder's shell game. Three cups, three swaps, and the swaps are *cuts* —
 * a cup is at one slot on one frame and the other on the next, with nothing
 * in between. Then one lifts, then all three lift, and there was never
 * anything under any of them.
 */
export interface ShellPose {
  /** Which slot this cup is at, 0..2. Always a whole number. */
  slot: number;
  /** Lift above the table, 0..1. */
  lift: number;
  /** How far off-stage the row is: -1 is off left, 0 on stage, 1 off right. */
  offstage: number;
}

/** Which two slots trade on each swap. Fixed, in order, forever. */
const SHELL_SWAPS: [number, number][] = [
  [0, 1],
  [1, 2],
  [0, 2],
];
const SHELL_AT = [0.24, 0.32, 0.4];

/** Where cup `index` sits after `done` swaps. */
export function shellSlot(index: number, done: number): number {
  const place = [0, 1, 2];
  for (let i = 0; i < Math.min(done, SHELL_SWAPS.length); i++) {
    const [a, b] = SHELL_SWAPS[i]!;
    const ca = place.indexOf(a!);
    const cb = place.indexOf(b!);
    place[ca] = b!;
    place[cb] = a!;
  }
  return place[index]!;
}

export function shellPose(phase: number, index: number): ShellPose {
  const p = clamp01(phase);
  const IN = 0.14;
  const LIFT_ONE = 0.5;
  const LIFT_ONE_END = 0.62;
  const LIFT_ALL = 0.7;
  const LIFT_ALL_END = 0.86;
  const OUT = 0.9;

  const done = SHELL_AT.filter((at) => p >= at).length;
  const slot = shellSlot(index, done);

  // In from the left in three steps, out to the right in three: it arrives and
  // leaves the way a prop should, and it does both on the step clock.
  const offstage =
    p < IN
      ? -(1 - Math.ceil((p / IN) * 3) / 3)
      : p < OUT
        ? 0
        : Math.ceil(((p - OUT) / (1 - OUT)) * 3) / 3;

  let lift = 0;
  // The middle cup is the one offered, because the middle is where you look.
  if (p >= LIFT_ONE && p < LIFT_ONE_END && slot === 1) lift = 1;
  if (p >= LIFT_ALL && p < LIFT_ALL_END) lift = 1;

  return { slot, lift, offstage };
}

/**
 * Vane's scoreboard. It comes down, it says something, and then on one frame
 * in the middle of the hold it says something else. Nothing announces the
 * change and nothing acknowledges it.
 */
export interface ScorePose {
  /** How far it has come down, 0..1. */
  drop: number;
  /** Which of the two marks is on the glass. */
  mark: 0 | 1;
}

export function scorePose(phase: number): ScorePose {
  const p = clamp01(phase);
  const IN = 0.16;
  const OUT = 0.84;
  // The lie is at 0.55: late enough that you have read the first mark, early
  // enough that you get to sit with the second one.
  const mark: 0 | 1 = p < 0.55 ? 0 : 1;
  if (p < IN) return { drop: Math.ceil((p / IN) * 4) / 4, mark };
  if (p < OUT) return { drop: 1, mark };
  return { drop: 1 - Math.ceil(((p - OUT) / (1 - OUT)) * 4) / 4, mark };
}

/**
 * Quill's targeting overlay. A dotted line draws itself one dash per stepped
 * frame, a reticle snaps on at the end of it, the whole thing holds a beat too
 * long, and then it un-draws itself dash by dash.
 *
 * The un-draw is this act's exit, and it is not a fade: every dash is on or
 * off, the reticle is present or absent, and the last frame of the act has
 * none of them. An overlay leaves the way an overlay leaves.
 */
export interface SolvePose {
  /** How many dashes are lit, from the start of the line. */
  lit: number;
  /** The reticle is on. It snaps; it never grows. */
  reticle: boolean;
}

export function solvePose(phase: number, dashes: number): SolvePose {
  const p = clamp01(phase);
  const DRAWN = 0.42;
  const ERASE = 0.78;
  if (p < DRAWN) return { lit: Math.floor((p / DRAWN) * dashes), reticle: false };
  if (p < ERASE) return { lit: dashes, reticle: true };
  const t = (p - ERASE) / (1 - ERASE);
  return { lit: Math.max(0, dashes - Math.ceil(t * dashes)), reticle: false };
}

/**
 * The Oracle's pinsetter. Down on two beats, a long hover over a board it has
 * no business with, up on two beats. There is no interpolation anywhere in
 * this function, which is the point: it is at a height or it is at another one.
 */
export function pinsetterHeight(phase: number): number {
  const p = clamp01(phase);
  if (p < 0.1) return 1;
  if (p < 0.26) return 0.55;
  if (p < 0.7) return 0.12;
  if (p < 0.86) return 0.55;
  return 1;
}

/* ------------------------------------------------------------------------ *
 * The full-frame acts (phase 9). The roster above grew up along the bottom
 * edge: the truck, the mascot, the mower and the pins all cross the floor, the
 * rocket climbs one corner, and everything else arrives at the lens. Held
 * together on one screen that reads as a strip of activity under a board, with
 * a lot of empty stage above it.
 *
 * So every act down here is built to cross the frame rather than to sit at the
 * edge of it: a shot that arcs from one bottom corner to the opposite top one,
 * a piano that falls past the whole board, a ball that sweeps the entire width.
 * The rule they add to the taste law is spatial rather than temporal — an act
 * whose whole travel fits in one corner belongs to the old roster, and there
 * are already enough of those.
 *
 * Everything else is unchanged: they enter from off-stage, do one legible
 * thing, hold it a beat too long, and leave the way they came.
 * ------------------------------------------------------------------------ */

/**
 * The cannon. It rolls in, cranks its barrel up in three hard steps, fires the
 * mascot across the entire frame, and sits there smoking.
 *
 * The longest travel in the game, and deliberately: the shot leaves the muzzle
 * at the bottom left and exits past the top right corner, so the act is a
 * diagonal across everything rather than a lap along the floor. The hold is the
 * beat between the barrel reaching its angle and the shot — the cannon is
 * ready, aimed, and does nothing, for long enough that you look at it.
 */
export interface CannonPose {
  /** Where the cannon is, 0 = off-frame left, 1 = in position. */
  u: number;
  /** Barrel elevation 0..1. Three steps, never a sweep. */
  crank: number;
  /** Barrel recoil back along its own axis, in world-ish units. */
  recoil: number;
  /**
   * The shot, or null before it is fired and after it has left. `u` runs 0..1
   * across the frame's width and `v` is height in frame-heights above the
   * muzzle — over 1 for most of the flight, because the arc goes over the top.
   */
  shot: { u: number; v: number; spin: number } | null;
  /** Muzzle smoke, 0..1. It outlives the shot, which is the point. */
  smoke: number;
}

const CANNON_ROLL_IN = 0.14;
const CANNON_AIMED = 0.32;
const CANNON_FIRE = 0.4;
const CANNON_LANDED = 0.8;
const CANNON_ROLL_OUT = 0.88;

export function cannonPose(phase: number): CannonPose {
  const p = clamp01(phase);

  // The shot: a parabola in flight, nothing before or after. Written first
  // because every segment below needs to know whether it is in the air.
  let shot: CannonPose["shot"] = null;
  if (p >= CANNON_FIRE && p < CANNON_LANDED) {
    const t = (p - CANNON_FIRE) / (CANNON_LANDED - CANNON_FIRE);
    // Overshoots the far edge rather than landing on it: the act ends with the
    // shot gone, not with it coming to rest somewhere.
    //
    // The apex is 0.75 of a frame-height above the muzzle, which puts it just
    // under the top edge. It was 1.5 in the first pass and the harness handed
    // back a stage with no shot on it at all — the arc cleared the frame
    // entirely and the whole act was a cannon and some smoke.
    shot = { u: t * 1.15, v: 4 * t * (1 - t) * 0.75, spin: t * Math.PI * 5 };
  }

  // Recoil is two stepped frames of the barrel driven back and one of it
  // returning — a spring with three positions and no travel between them.
  const sinceFire = p - CANNON_FIRE;
  const recoil = sinceFire >= 0 && sinceFire < 0.03 ? 0.5 : sinceFire < 0.06 ? 0.2 : 0;
  const smoke =
    sinceFire < 0 ? 0 : sinceFire < 0.04 ? 1 : Math.max(0, 1 - (sinceFire - 0.04) / 0.34);

  if (p < CANNON_ROLL_IN) {
    return { u: p / CANNON_ROLL_IN, crank: 0, recoil, shot, smoke };
  }
  if (p < CANNON_AIMED) {
    const t = (p - CANNON_ROLL_IN) / (CANNON_AIMED - CANNON_ROLL_IN);
    return { u: 1, crank: Math.ceil(t * 3) / 3, recoil, shot, smoke };
  }
  if (p < CANNON_ROLL_OUT) return { u: 1, crank: 1, recoil, shot, smoke };
  return { u: 1 - (p - CANNON_ROLL_OUT) / (1 - CANNON_ROLL_OUT), crank: 1, recoil, shot, smoke };
}

/**
 * The piano. It falls the height of the frame, stops dead in mid-air for a
 * third of the act, falls the rest of the way, and one key comes back up.
 *
 * The stop is the whole joke and it is the taste law's "the physics make
 * absolutely no sense" taken literally: nothing catches it, nothing holds it,
 * it is simply at a height and then it is at another one. Interpolating out of
 * the hold would make it a thing being lowered; cutting into it makes it a
 * thing that stopped.
 */
export interface PianoPose {
  /** Height in frame-heights, 0 = frame centre. Under -1 is out the bottom. */
  y: number;
  /** Tilt in radians. It acquires one at the hold and never loses it. */
  tilt: number;
  /** True while the piano is on stage at all. */
  present: boolean;
  /** The one key that bounces back up, in the same units. Null when it isn't. */
  key: number | null;
}

const PIANO_HELD = 0.2;
const PIANO_DROPS = 0.54;
const PIANO_GONE = 0.68;
const PIANO_KEY = 0.8;

export function pianoPose(phase: number): PianoPose {
  const p = clamp01(phase);
  const START = 1.15;
  const HOLD_AT = 0.05;

  if (p < PIANO_HELD) {
    // Accelerating, no ease out: it stops because the joke is there.
    const t = p / PIANO_HELD;
    return { y: START - (START - HOLD_AT) * t * t, tilt: 0, present: true, key: null };
  }
  if (p < PIANO_DROPS) {
    // Held. Nothing is scheduled and nothing moves; the tilt arrives on the
    // same frame the fall stops, so it reads as the thing having been caught
    // by something that isn't there.
    return { y: HOLD_AT, tilt: 0.12, present: true, key: null };
  }
  if (p < PIANO_GONE) {
    const t = (p - PIANO_DROPS) / (PIANO_GONE - PIANO_DROPS);
    return { y: HOLD_AT - (HOLD_AT + 1.6) * t * t, tilt: 0.12, present: true, key: null };
  }
  if (p < PIANO_KEY) return { y: -2, tilt: 0.12, present: false, key: null };

  // The exit: one white key comes back up into the empty frame, and goes
  // down again. Nobody is shown what it bounced off.
  const t = (p - PIANO_KEY) / (1 - PIANO_KEY);
  return { y: -2, tilt: 0.12, present: false, key: -1.15 + 4 * t * (1 - t) * 1.4 };
}

/**
 * The wrecking ball. It swings in from off-frame left, stops dead at the bottom
 * of its arc in front of the middle of the board, hangs there for a quarter of
 * the act, and then carries on and out the far side.
 *
 * The stop is at the *bottom* of the swing, which is the one place a pendulum
 * is going fastest and the last place it could possibly stop. That is the joke,
 * and it is also what makes the act legible: the first pass held it at the top
 * of the arc — momentarily still, so at least defensible — and the harness
 * showed a frame with a chain in the corner and the ball six units off-screen.
 * The pose you hold has to be a pose somebody can see.
 *
 * It hits nothing on the way through. There was never anything to hit; the
 * board is behind it.
 */
export interface WreckingPose {
  /** Swing angle in radians from straight down. Negative is frame-left. */
  swing: number;
  /** Two-frame chain rattle, in world-ish units along the chain. */
  rattle: number;
}

const WRECK_ARRIVES = 0.34;
const WRECK_HANGS = 0.6;
/** The extremes of the arc. Wide enough that the ball starts and ends off-frame. */
const WRECK_ARC = 1.0;

export function wreckingPose(phase: number, step: number): WreckingPose {
  const p = clamp01(phase);
  const rattle = (step % 2 === 0 ? 1 : -1) * 0.04;
  // A pendulum's own curve rather than a straight sweep — fastest at the
  // bottom, slowest at the ends — which is the one place this roster lets a
  // curve in, because a wrecking ball crossing at constant speed reads as a
  // sprite on a track. The 12fps sampling is what keeps it hard-edged.
  const fall = (t: number) => -Math.cos((t * Math.PI) / 2) * WRECK_ARC;

  if (p < WRECK_ARRIVES) return { swing: fall(p / WRECK_ARRIVES), rattle };
  if (p < WRECK_HANGS) return { swing: 0, rattle };
  return { swing: -fall(1 - (p - WRECK_HANGS) / (1 - WRECK_HANGS)), rattle };
}

/**
 * The mirror ball. Down on four steps, spinning at the centre of the frame for
 * two-thirds of the act, up on four.
 *
 * The one act in the new set that arrives where the game is rather than across
 * it: it comes down in front of the board, in the middle, and stays long enough
 * to be in the way. The spin is stepped hard, so the light squares it throws
 * jump around the void rather than sweeping it — a mirror ball at 12fps is a
 * strobe, which is both wrong and exactly what a lane screen would render.
 */
export interface MirrorPose {
  /** 0 = above the frame, 1 = at the centre. */
  drop: number;
  /** Yaw in radians. Whole steps only. */
  spin: number;
  /** Which of the two glint cels the facets are on. */
  glint: 0 | 1;
}

const MIRROR_DOWN = 0.16;
const MIRROR_UP = 0.82;

export function mirrorPose(phase: number, step: number): MirrorPose {
  const p = clamp01(phase);
  const spin = step * 0.62;
  const glint = (step % 2) as 0 | 1;
  if (p < MIRROR_DOWN) return { drop: Math.ceil((p / MIRROR_DOWN) * 4) / 4, spin, glint };
  if (p < MIRROR_UP) return { drop: 1, spin, glint };
  return { drop: 1 - Math.ceil(((p - MIRROR_UP) / (1 - MIRROR_UP)) * 4) / 4, spin, glint };
}

/**
 * The window washer. A plank winches up the full height of the frame with the
 * mascot on it, one stripe gets wiped, and then the rope gives.
 *
 * The only act that travels *up* the frame under its own power, which is what
 * it is for — the roster could already fall, cross and arrive, and had nothing
 * that climbed. The fall at the end is its exit and it is faster than the
 * climb by a factor of six: the whole act is patient, and then it is over.
 */
export interface WasherPose {
  /** Height in frame-heights, -0.7 = below the frame, 1 = at the top of it. */
  height: number;
  /**
   * The squeegee stroke across the glass, 0..1, or null when it isn't wiping.
   * Stepped: the stroke is six positions, not a sweep.
   */
  wipe: number | null;
  /** The rope has gone. Nothing about the pose is being held up any more. */
  falling: boolean;
}

const WASH_CLIMB = 0.34;
const WASH_ARRIVED = 0.46;
const WASH_WIPED = 0.66;
const WASH_ROPE_GOES = 0.84;
const WASH_BOTTOM = -0.75;

export function washerPose(phase: number): WasherPose {
  const p = clamp01(phase);
  // Six stepped jerks of the winch rather than a ramp: the machine that lifts
  // this thing is not good, and neither is the rope.
  if (p < WASH_CLIMB) {
    const t = Math.ceil((p / WASH_CLIMB) * 6) / 6;
    return { height: WASH_BOTTOM + (1 - WASH_BOTTOM) * t, wipe: null, falling: false };
  }
  if (p < WASH_ARRIVED) return { height: 1, wipe: null, falling: false };
  if (p < WASH_WIPED) {
    const t = (p - WASH_ARRIVED) / (WASH_WIPED - WASH_ARRIVED);
    return { height: 1, wipe: Math.ceil(t * 6) / 6, falling: false };
  }
  // Done, and admiring it, for a fifth of the act.
  if (p < WASH_ROPE_GOES) return { height: 1, wipe: 1, falling: false };
  // Straight down, accelerating, ending well under where it started — the one
  // fast thing in the act, and it never eases.
  const t = (p - WASH_ROPE_GOES) / (1 - WASH_ROPE_GOES);
  return { height: 1 - (1.6 - WASH_BOTTOM) * t * t, wipe: 1, falling: true };
}

/**
 * The foam finger. Up out of the floor on four steps to the full height of the
 * frame, two wags, a long point, and back down.
 *
 * The only prop that addresses the player rather than the stage, which is why
 * it holds the point for a quarter of the act and does nothing else in it. Two
 * wags and not three: three is a character emoting, two is a machine playing a
 * cel it has played before.
 */
export interface FingerPose {
  /** 0 = below the floor, 1 = at full height. */
  rise: number;
  /** Wag in radians about its own base. Zero everywhere except the two wags. */
  wag: number;
}

const FINGER_UP = 0.16;
const FINGER_WAGS = 0.3;
const FINGER_POINTS = 0.56;
const FINGER_DOWN = 0.84;

export function fingerPose(phase: number): FingerPose {
  const p = clamp01(phase);
  const rise = (r: number) => ({ rise: r, wag: 0 });

  if (p < FINGER_UP) return rise(Math.ceil((p / FINGER_UP) * 4) / 4);
  if (p < FINGER_WAGS) return rise(1);
  if (p < FINGER_POINTS) {
    // Two triangular wags, left and right of vertical, with nothing between
    // them — the same shape as the mascot's two hops, one axis over.
    const t = (p - FINGER_WAGS) / (FINGER_POINTS - FINGER_WAGS);
    const half = t < 0.5 ? t * 2 : (t - 0.5) * 2;
    return { rise: 1, wag: (tri(half) * (t < 0.5 ? -1 : 1) * Math.PI) / 9 };
  }
  if (p < FINGER_DOWN) return rise(1);
  return rise(1 - Math.ceil(((p - FINGER_DOWN) / (1 - FINGER_DOWN)) * 4) / 4);
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
