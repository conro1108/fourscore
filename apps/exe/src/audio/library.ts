/**
 * The sound scheme, computed.
 *
 * The law (DIRECTION.md): **build the period artifact; never illustrate it.**
 * The fire in `flames.scr` is not a picture of fire, it is the 1995 demoscene
 * automaton actually running — so the dings are not recordings of a 1995
 * machine either. Every sound in here is a struck bell, a filtered noise sweep
 * or a relay tick, synthesized per render out of `synth.ts`, the way a period
 * sound card's own scheme would have been made. There is no `public/sounds/`
 * directory and there should never be one; a wav file is the audio equivalent
 * of a pixel-art illustration pretending to be a screenshot.
 *
 * Three rules hold across all of them:
 *
 * - **Deterministic.** Same recipe, same bytes, every time. The draw picks
 *   which sound fires; nothing picks how one sounds.
 * - **Dry by default.** Period software has no reverb. The room only opens as
 *   the fever rises, and it opens on the *bus* (`index.ts`), never in a recipe
 *   — the machine sounding wrong is a property of the evening, not of the ding.
 * - **Short.** Everything that answers a click is under a fifth of a second.
 *   The four that aren't (`startup`, `tada`, `chord`, `saver-thunk`) are the
 *   ones the machine means.
 *
 * Sounds are addressed by semantic name, never by what they're made of:
 * `disc-land` is what the moment means, and its recipe can be rebuilt from
 * scratch without a caller changing.
 */

import { env, filter, gain, gate, noise, osc, RATE, room } from "./synth.js";

export type SoundName =
  // -- the system scheme: what the OS says about itself --
  | "startup"
  | "ding"
  | "chord"
  | "tada"
  | "shutdown-chime"
  // -- chrome: what a control sounds like when it works --
  | "click"
  | "menu"
  | "window-open"
  | "window-close"
  | "window-min"
  | "window-max"
  // -- the board --
  | "hover-tick"
  | "disc-drop"
  | "disc-land"
  | "bot-step"
  // -- the endgame --
  | "line-catch"
  | "smolder"
  // -- the fever, made audible --
  | "tier-cross"
  | "flare"
  | "clock-tick"
  | "twitch"
  | "saver-thunk"
  | "drive-seek";

export interface Recipe {
  /** Rendered length, seconds. */
  seconds: number;
  /** One line on what it is, for `sounds.ctl` and for the next reader. */
  note: string;
  /** Schedule the whole sound into `ctx`. Everything must start before render. */
  build(ctx: OfflineAudioContext): void;
}

/* ---- the parts a period scheme is built out of ---- */

/**
 * A struck bell: one partial per entry, each decaying at its own rate — the
 * high ones first, which is the whole difference between a bell and an organ.
 * The ratios are inharmonic on purpose; a harmonic stack reads as a synth pad.
 */
const PARTIALS: readonly (readonly [ratio: number, level: number, decay: number])[] = [
  [1, 1, 1],
  [2.76, 0.42, 0.62],
  [5.4, 0.22, 0.34],
  [8.93, 0.11, 0.2],
];

function bell(
  ctx: OfflineAudioContext,
  dest: AudioNode,
  freq: number,
  opts: { at?: number; seconds?: number; level?: number } = {},
): void {
  const at = opts.at ?? 0;
  const d = opts.seconds ?? 1;
  const level = opts.level ?? 0.3;
  for (const [ratio, weight, decay] of PARTIALS) {
    const len = d * decay;
    const g = env(ctx, [
      [at, 0],
      [at + 0.004, level * weight],
      [at + len * 0.16, level * weight * 0.42],
      [at + len * 0.45, level * weight * 0.14],
      [at + len, 0],
    ]);
    osc(ctx, "sine", freq * ratio, at, at + len + 0.01).connect(g);
    g.connect(dest);
  }
}

/** A short pitched voice that slides. The blips, the drop, the thump. */
function slide(
  ctx: OfflineAudioContext,
  dest: AudioNode,
  type: OscillatorType,
  from: number,
  to: number,
  opts: { at?: number; seconds: number; level?: number },
): void {
  const at = opts.at ?? 0;
  const d = opts.seconds;
  const level = opts.level ?? 0.3;
  const o = osc(ctx, type, from, at, at + d + 0.01);
  o.frequency.setValueAtTime(from, at);
  o.frequency.linearRampToValueAtTime(to, at + d);
  const g = env(ctx, [
    [at, 0],
    [at + 0.003, level],
    [at + d * 0.6, level * 0.5],
    [at + d, 0],
  ]);
  o.connect(g);
  g.connect(dest);
}

/** Noise through a band that moves — every whoosh in the scheme. */
function sweep(
  ctx: OfflineAudioContext,
  dest: AudioNode,
  opts: { at?: number; seconds: number; from: number; to: number; q?: number; level?: number; seed?: number },
): void {
  const at = opts.at ?? 0;
  const d = opts.seconds;
  const level = opts.level ?? 0.3;
  const band = filter(ctx, "bandpass", opts.from, opts.q ?? 1.4);
  band.frequency.setValueAtTime(opts.from, at);
  band.frequency.linearRampToValueAtTime(opts.to, at + d);
  const g = env(ctx, [
    [at, 0],
    [at + d * 0.18, level],
    [at + d * 0.6, level * 0.55],
    [at + d, 0],
  ]);
  noise(ctx, d + 0.02, opts.seed ?? 0x51ee9, at).connect(band);
  band.connect(g);
  g.connect(dest);
}

/** A transient — the click under everything mechanical. */
function tick(
  ctx: OfflineAudioContext,
  dest: AudioNode,
  opts: { at?: number; seconds?: number; cut?: number; level?: number; seed?: number },
): void {
  const at = opts.at ?? 0;
  const d = opts.seconds ?? 0.005;
  const level = opts.level ?? 0.5;
  const hp = filter(ctx, "highpass", opts.cut ?? 2600, 0.8);
  const g = env(ctx, [
    [at, level],
    [at + d, 0],
  ]);
  noise(ctx, d + 0.005, opts.seed ?? 0x1c1c1, at).connect(hp);
  hp.connect(g);
  g.connect(dest);
}

/** Crackle: noise let through in hard steps, the way a fire is drawn here. */
function crackle(
  ctx: OfflineAudioContext,
  dest: AudioNode,
  opts: { at?: number; seconds: number; cut: number; level?: number; every?: number; seed?: number },
): void {
  const at = opts.at ?? 0;
  const step = opts.every ?? 0.045;
  const times: number[] = [];
  for (let t = at; t < at + opts.seconds; t += step) times.push(t);
  const g = gate(ctx, times, step * 0.35, opts.level ?? 0.22);
  const lp = filter(ctx, "lowpass", opts.cut, 1.1);
  noise(ctx, opts.seconds + 0.02, opts.seed ?? 0xf12e5, at).connect(lp);
  lp.connect(g);
  // and it fades out rather than stopping dead, or the fire has an off switch
  const tail = env(ctx, [
    [at, 1],
    [at + opts.seconds * 0.7, 1],
    [at + opts.seconds, 0],
  ]);
  g.connect(tail);
  tail.connect(dest);
}

/** The output every recipe plays into. `space` is for the four that get one. */
function out(ctx: OfflineAudioContext, space?: [seconds: number, decay: number, wet: number]): GainNode {
  const input = gain(ctx, 1);
  input.connect(ctx.destination);
  if (space) {
    const r = room(ctx, space[0], space[1]);
    const wet = gain(ctx, space[2]);
    input.connect(r);
    r.connect(wet);
    wet.connect(ctx.destination);
  }
  return input;
}

/* ---- the scheme ---- */

export const RECIPES: Record<SoundName, Recipe> = {
  /**
   * The machine finishing its boot. It plays on the first gesture and only
   * then — which is not a workaround for the autoplay rule but the best use
   * anyone has found for it: the desktop has been sitting there since the page
   * loaded, and the moment you touch it, it comes up.
   */
  startup: {
    seconds: 3,
    note: "The machine finishing its boot.",
    build(ctx) {
      const o = out(ctx, [2.4, 2.4, 0.3]);
      // an A-major swell that takes its time, the way a period boot logo does
      for (const [i, f] of [110, 164.81, 220, 329.63].entries()) {
        const at = 0.05 + i * 0.06;
        const g = env(ctx, [
          [at, 0],
          [at + 0.9, 0.09],
          [1.9, 0.075],
          [2.6, 0],
        ]);
        const lp = filter(ctx, "lowpass", 1800 + i * 400, 0.9);
        osc(ctx, "sawtooth", f, at, 2.65).connect(lp);
        // two saws a hair apart, because one is a test tone
        const o2 = osc(ctx, "sawtooth", f, at, 2.65);
        o2.detune.value = 6;
        o2.connect(lp);
        lp.connect(g);
        g.connect(o);
      }
      bell(ctx, o, 880, { at: 1.0, seconds: 1.6, level: 0.16 });
      bell(ctx, o, 1318.5, { at: 1.16, seconds: 1.5, level: 0.11 });
    },
  },

  /** The information ding. The one the OS says most often, and it means nothing. */
  ding: {
    seconds: 1.1,
    note: "Information.",
    build(ctx) {
      const o = out(ctx);
      tick(ctx, o, { seconds: 0.004, cut: 4000, level: 0.16 });
      bell(ctx, o, 1174.66, { seconds: 1.0, level: 0.3 });
    },
  },

  /**
   * The error chord. Same bells, one of them thirty cents flat — a sour stack
   * is how a scheme says something is wrong without a word in it, and it is
   * why this is unmistakable at a tenth the length of the sentence in the box.
   */
  chord: {
    seconds: 1.3,
    note: "A problem the machine can hear.",
    build(ctx) {
      const o = out(ctx);
      tick(ctx, o, { seconds: 0.005, cut: 3000, level: 0.2 });
      bell(ctx, o, 880, { seconds: 1.15, level: 0.24 });
      bell(ctx, o, 1029, { seconds: 1.1, level: 0.2 }); // C6, flat
      bell(ctx, o, 1318.51, { seconds: 1.0, level: 0.15 });
    },
  },

  /** The win. Four notes up and the top one held — the biggest thing it has. */
  tada: {
    seconds: 2.6,
    note: "Congratulations.",
    build(ctx) {
      const o = out(ctx, [1.6, 2.2, 0.34]);
      const notes: readonly [number, number][] = [
        [523.25, 0],
        [659.25, 0.105],
        [783.99, 0.21],
        [1046.5, 0.33],
      ];
      for (const [f, at] of notes) {
        const held = at === 0.33;
        const d = held ? 1.9 : 0.28;
        const lp = filter(ctx, "lowpass", 3200, 0.9);
        const g = env(ctx, [
          [at, 0],
          [at + 0.012, held ? 0.2 : 0.17],
          [at + d * 0.35, held ? 0.14 : 0.07],
          [at + d, 0],
        ]);
        for (const detune of [-7, 7]) {
          const s = osc(ctx, "sawtooth", f, at, at + d + 0.01);
          s.detune.value = detune;
          s.connect(lp);
        }
        lp.connect(g);
        g.connect(o);
        bell(ctx, o, f * 2, { at, seconds: held ? 1.8 : 0.4, level: held ? 0.12 : 0.07 });
      }
      // the chord underneath arrives with the top note, not before it
      for (const f of [261.63, 329.63, 392]) {
        const g = env(ctx, [
          [0.33, 0],
          [0.4, 0.075],
          [1.6, 0.05],
          [2.3, 0],
        ]);
        osc(ctx, "triangle", f, 0.33, 2.35).connect(g);
        g.connect(o);
      }
    },
  },

  /** Shut Down. Three notes down, and it does not shut down. */
  "shutdown-chime": {
    seconds: 1.7,
    note: "Shutting down.",
    build(ctx) {
      const o = out(ctx, [1.2, 2.6, 0.25]);
      bell(ctx, o, 783.99, { at: 0, seconds: 0.9, level: 0.24 });
      bell(ctx, o, 659.25, { at: 0.17, seconds: 0.9, level: 0.22 });
      bell(ctx, o, 523.25, { at: 0.34, seconds: 1.25, level: 0.26 });
    },
  },

  /** A control that worked. Dry, tiny, and under half the desktop. */
  click: {
    seconds: 0.05,
    note: "A control accepting a click.",
    build(ctx) {
      const o = out(ctx);
      tick(ctx, o, { seconds: 0.006, cut: 2400, level: 0.42 });
      slide(ctx, o, "square", 1500, 900, { seconds: 0.014, level: 0.06 });
    },
  },

  /** A menu opening: the click, plus the little breath of it unrolling. */
  menu: {
    seconds: 0.12,
    note: "A menu unrolling.",
    build(ctx) {
      const o = out(ctx);
      tick(ctx, o, { seconds: 0.005, cut: 2800, level: 0.3, seed: 0x2a2a2 });
      sweep(ctx, o, { seconds: 0.075, from: 900, to: 2200, q: 2.2, level: 0.12, seed: 0x77c1 });
    },
  },

  /** A window arriving. Period whooshes are noise through a moving band. */
  "window-open": {
    seconds: 0.3,
    note: "A window opening.",
    build(ctx) {
      const o = out(ctx);
      sweep(ctx, o, { seconds: 0.22, from: 420, to: 3100, q: 1.1, level: 0.38, seed: 0x30ee1 });
      tick(ctx, o, { at: 0.02, seconds: 0.005, cut: 3200, level: 0.14 });
    },
  },

  "window-close": {
    seconds: 0.3,
    note: "A window closing.",
    build(ctx) {
      const o = out(ctx);
      sweep(ctx, o, { seconds: 0.2, from: 3000, to: 380, q: 1.1, level: 0.36, seed: 0x30ee2 });
    },
  },

  "window-min": {
    seconds: 0.16,
    note: "A window going down to the taskbar.",
    build(ctx) {
      const o = out(ctx);
      slide(ctx, o, "triangle", 760, 210, { seconds: 0.1, level: 0.22 });
      tick(ctx, o, { at: 0.1, seconds: 0.004, cut: 1800, level: 0.14 });
    },
  },

  "window-max": {
    seconds: 0.16,
    note: "A window filling the desk.",
    build(ctx) {
      const o = out(ctx);
      slide(ctx, o, "triangle", 240, 820, { seconds: 0.1, level: 0.22 });
    },
  },

  /**
   * The picker crossing a column. This one is quiet at the callsite too, and it
   * has to stay the smallest thing in here: you can drag across seven columns
   * in a flick, and a scheme that goes *tick tick tick tick* at that is the
   * sound of a broken machine rather than an attentive one.
   */
  "hover-tick": {
    seconds: 0.03,
    note: "The disc crossing a column.",
    build(ctx) {
      const o = out(ctx);
      tick(ctx, o, { seconds: 0.0035, cut: 4200, level: 0.3, seed: 0x8fe1 });
    },
  },

  /** Letting go of it. */
  "disc-drop": {
    seconds: 0.14,
    note: "Releasing a disc.",
    build(ctx) {
      const o = out(ctx);
      tick(ctx, o, { seconds: 0.005, cut: 3400, level: 0.24, seed: 0x4d40b });
      slide(ctx, o, "triangle", 460, 190, { seconds: 0.075, level: 0.16 });
    },
  },

  /**
   * The disc arriving in the cabinet. Two things at once, which is what a knock
   * is: the low thump of the stack taking the weight, and the hard plastic
   * rattle of the disc against the frame.
   */
  "disc-land": {
    seconds: 0.24,
    note: "A disc landing in the cabinet.",
    build(ctx) {
      const o = out(ctx);
      slide(ctx, o, "sine", 165, 68, { seconds: 0.1, level: 0.42 });
      const body = filter(ctx, "bandpass", 940, 4.5);
      const g = env(ctx, [
        [0, 0],
        [0.002, 0.3],
        [0.03, 0.09],
        [0.09, 0],
      ]);
      noise(ctx, 0.1, 0x1a2d3).connect(body);
      body.connect(g);
      g.connect(o);
      tick(ctx, o, { seconds: 0.004, cut: 2200, level: 0.2, seed: 0x1a2d4 });
    },
  },

  /** The opponent's disc walking a column. Duller and quieter than yours. */
  "bot-step": {
    seconds: 0.03,
    note: "The opponent moving its disc.",
    build(ctx) {
      const o = out(ctx);
      const lp = filter(ctx, "lowpass", 2600, 0.9);
      lp.connect(o);
      tick(ctx, lp, { seconds: 0.004, cut: 1400, level: 0.3, seed: 0x60b7e });
    },
  },

  /** The line catching: the whoosh, and then the seam burning along it. */
  "line-catch": {
    seconds: 1.4,
    note: "The winning line catching.",
    build(ctx) {
      const o = out(ctx, [1.1, 2.4, 0.22]);
      sweep(ctx, o, { seconds: 0.55, from: 260, to: 2600, q: 0.9, level: 0.36, seed: 0xf1e00 });
      crackle(ctx, o, { at: 0.14, seconds: 1.2, cut: 3400, level: 0.22, every: 0.05, seed: 0xf1e01 });
    },
  },

  /** The loss version: it does not blaze, and it does not go out. */
  smolder: {
    seconds: 1.5,
    note: "The line smoldering.",
    build(ctx) {
      const o = out(ctx);
      crackle(ctx, o, { seconds: 1.45, cut: 1300, level: 0.15, every: 0.11, seed: 0xc0a15 });
      slide(ctx, o, "sine", 96, 74, { seconds: 0.7, level: 0.09 });
    },
  },

  /**
   * A tier crossing: the machine changing gear. A relay somewhere lets go and
   * something bigger takes over — this is the only sound with real sub in it,
   * because four crossings in a game can afford to be felt.
   */
  "tier-cross": {
    seconds: 1.2,
    note: "The machine changing gear.",
    build(ctx) {
      const o = out(ctx, [1.4, 2.2, 0.2]);
      tick(ctx, o, { seconds: 0.007, cut: 1600, level: 0.34 });
      // The sub was measured at twice the rms of everything else in the scheme
      // and it read as the mix being broken rather than as the machine being
      // big. It stays the heaviest thing in here, but only by a little.
      slide(ctx, o, "sine", 44, 58, { seconds: 0.75, level: 0.3 });
      const g = env(ctx, [
        [0.02, 0],
        [0.4, 0.05],
        [0.95, 0],
      ]);
      const lp = filter(ctx, "lowpass", 700, 2.4);
      noise(ctx, 1, 0x7e1e5).connect(lp);
      lp.connect(g);
      g.connect(o);
    },
  },

  /** The fire, shoved. */
  flare: {
    seconds: 0.5,
    note: "The fire jumping.",
    build(ctx) {
      const o = out(ctx);
      sweep(ctx, o, { seconds: 0.4, from: 700, to: 2900, q: 0.8, level: 0.32, seed: 0xf1a1e });
    },
  },

  /** The clock losing several minutes: two ticks of something mechanical. */
  "clock-tick": {
    seconds: 0.18,
    note: "The clock losing its grip.",
    build(ctx) {
      const o = out(ctx);
      for (const [i, at] of [0, 0.075].entries()) {
        tick(ctx, o, { at, seconds: 0.005, cut: 3000, level: 0.34, seed: 0x717c + i });
        slide(ctx, o, "square", 300, 190, { at, seconds: 0.02, level: 0.09 });
      }
    },
  },

  /** The icons flinching: something small dragged across a desk. */
  twitch: {
    seconds: 0.16,
    note: "The icons moving without being asked.",
    build(ctx) {
      const o = out(ctx);
      const grains = [0, 0.022, 0.048, 0.079, 0.108];
      const g = gate(ctx, grains, 0.011, 0.32);
      const band = filter(ctx, "bandpass", 1900, 2.6);
      noise(ctx, 0.15, 0x7217c).connect(band);
      band.connect(g);
      g.connect(o);
    },
  },

  /**
   * The screensaver taking the desktop — a degauss, which is a real thing a
   * period monitor does when the picture changes hands: mains hum modulated by
   * its own dying coil, and a thunk from the case.
   */
  "saver-thunk": {
    seconds: 1.3,
    note: "The monitor changing hands.",
    build(ctx) {
      const o = out(ctx);
      slide(ctx, o, "sine", 130, 92, { seconds: 0.09, level: 0.28 });
      const ripple: number[] = [];
      for (let t = 0.02, step = 0.024; t < 1.05; t += step, step *= 1.14) ripple.push(t);
      const g = gate(ctx, ripple, 0.012, 0.26);
      const body = filter(ctx, "lowpass", 340, 1.6);
      osc(ctx, "sine", 62, 0, 1.1).connect(body);
      osc(ctx, "sine", 124, 0, 1.1).connect(body);
      body.connect(g);
      const fade = env(ctx, [
        [0, 1],
        [0.7, 0.6],
        [1.15, 0],
      ]);
      g.connect(fade);
      fade.connect(o);
    },
  },

  /**
   * The disk working. Fired by the bed, more often the worse things get — a
   * 1995 machine under load is a machine you can *hear* thinking, and it is the
   * one channel that reports the fever without a window opening.
   */
  "drive-seek": {
    seconds: 0.3,
    note: "The disk being asked for something.",
    build(ctx) {
      const o = out(ctx);
      const band = filter(ctx, "bandpass", 2400, 3.2);
      const g = gate(ctx, [0, 0.042, 0.071, 0.155, 0.187], 0.009, 0.24);
      noise(ctx, 0.28, 0xd12e6).connect(band);
      band.connect(g);
      g.connect(o);
      // the arm has mass; each seek lands on something
      for (const at of [0, 0.071, 0.187])
        slide(ctx, o, "sine", 220, 150, { at, seconds: 0.02, level: 0.07 });
    },
  },
};

export const SOUND_NAMES = Object.keys(RECIPES) as SoundName[];

/**
 * Render a recipe once and keep it. The promise is cached, not the buffer, so
 * twenty callers during the warm-up share one render instead of starting twenty.
 */
const cache = new Map<SoundName, Promise<AudioBuffer>>();

export function soundBuffer(name: SoundName): Promise<AudioBuffer> {
  let pending = cache.get(name);
  if (!pending) {
    const recipe = RECIPES[name];
    pending = (async () => {
      const ctx = new OfflineAudioContext(1, Math.max(1, Math.floor(RATE * recipe.seconds)), RATE);
      recipe.build(ctx);
      return ctx.startRendering();
    })();
    cache.set(name, pending);
  }
  return pending;
}
