/**
 * The sound library. Sounds are addressed by semantic name, never filename —
 * "spike-truck" is what the moment means, and a recipe can swap its synthesis
 * for a mangled CC0 sample without a caller changing.
 *
 * Every entry is a recipe: build a dry voice (the installed sample if
 * `samples/manifest.json` has one, else the synthesized stand-in), push it
 * through the mangling graph, hand back a rendered buffer. Recipes run once
 * and cache.
 *
 * Three laws hold across all of them:
 *
 * - **Nothing that matters is played clean.** Every gag voice ends up through
 *   distortion, a cheap convolution space, a reversal or a chop; the mangling
 *   is the sound design and it is what survives the swap to real samples. The
 *   exceptions are deliberate: the board ticks and the chrome clicks are dry,
 *   because period software has no reverb and a spike needs a floor to spike
 *   off.
 * - **Timing is hard-edged.** Tremolos, alarms and engine sputters are
 *   `setValueAtTime` steps, not LFOs — the audio runs the same 12fps step
 *   clock the props do. Envelopes ramp linearly; exponential decay is the
 *   sound of a preset.
 * - **Deterministic.** Same recipe, same bytes, every time. Randomness picks
 *   which gag fires, never how it sounds.
 *
 * `want` is the shopping list: what to go record or find for that entry. It is
 * carried here rather than only in the manifest so the description sits next
 * to the placeholder it describes, and `tools/write-manifest.mjs` generates
 * the shipped `public/samples/manifest.json` from it.
 */

import { chopped, convolver, distortion, reversed } from "./mangle.js";
import { loadSample } from "./samples.js";
import { RATE, env, filter, gain, lcg, noise, osc, sampleVoice } from "./synth.js";

export type SoundName =
  // -- gags: one per prop act (props/registry.ts) --
  | "spike-truck"
  | "spike-win"
  | "spike-rocket"
  | "spike-beacon"
  | "spike-mascot-cheer"
  | "spike-mascot-flop"
  | "spike-stare"
  | "spike-deep-space"
  | "spike-cherub"
  | "spike-callout"
  // -- the signatures: one per opponent (bots/identity.ts) --
  | "spike-mower"
  | "spike-bumpers"
  | "spike-slab"
  | "spike-pins"
  | "spike-shells"
  | "spike-score"
  | "spike-solve"
  | "spike-pinsetter"
  // -- the full-frame acts (props/registry.ts, phase 9) --
  | "spike-cannon"
  | "spike-piano"
  | "spike-wrecking"
  | "spike-mirror"
  | "spike-washer"
  | "spike-finger"
  // -- the board --
  | "disc-drop"
  | "disc-land"
  | "column-hover"
  // -- the match --
  | "match-start"
  | "turn-yours"
  // -- possessed chrome --
  | "ui-click"
  | "toggle-on"
  | "toggle-off"
  | "dialog-open"
  | "dialog-close"
  | "error-ding"
  // -- the bed (looped by ambient.ts, not fired as one-shots) --
  | "ambient-crowd"
  | "ambient-tape";

export interface Recipe {
  /** The source sample this sound wants. Shipped as the shopping list. */
  want: string;
  /** Rendered length, seconds. */
  seconds: number;
  /** Schedule the whole sound into `ctx`. `source` is null until sourced. */
  build(ctx: OfflineAudioContext, source: AudioBuffer | null): void | Promise<void>;
}

/**
 * The tail every sound goes out through: optional drive, and an optional wet
 * send into a cheap space. Returns the node to play into.
 */
function out(
  ctx: OfflineAudioContext,
  opts: { drive?: number; space?: [seconds: number, decay: number]; wet?: number } = {},
): GainNode {
  const input = gain(ctx, 1);
  let node: AudioNode = input;
  if (opts.drive) {
    const crush = distortion(ctx, opts.drive);
    node.connect(crush);
    node = crush;
  }
  node.connect(ctx.destination);
  if (opts.space) {
    const room = convolver(ctx, opts.space[0], opts.space[1]);
    const wet = gain(ctx, opts.wet ?? 0.4);
    node.connect(room);
    room.connect(wet);
    wet.connect(ctx.destination);
  }
  return input;
}

/** A nested offline render, for recipes that mangle their own output. */
async function preRender(
  seconds: number,
  build: (ctx: OfflineAudioContext) => void,
): Promise<AudioBuffer> {
  const ctx = new OfflineAudioContext(1, Math.max(1, Math.floor(RATE * seconds)), RATE);
  build(ctx);
  return ctx.startRendering();
}

/** Play a buffer into `dest` at `at`, optionally at a different rate. */
function play(
  ctx: OfflineAudioContext,
  buffer: AudioBuffer,
  dest: AudioNode,
  at = 0,
  rate = 1,
): void {
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.playbackRate.value = rate;
  source.connect(dest);
  source.start(at);
}

/** A hard on/off gate: steps, not an LFO. `duty` is the fraction that is on. */
function gate(
  ctx: OfflineAudioContext,
  times: number[],
  onFor: number,
  level = 1,
): GainNode {
  const g = gain(ctx, 0);
  g.gain.setValueAtTime(0, 0);
  for (const t of times) {
    g.gain.setValueAtTime(level, t);
    g.gain.setValueAtTime(0, t + onFor);
  }
  return g;
}

/** A short percussive strike: transient noise plus inharmonic partials. */
function strike(
  ctx: OfflineAudioContext,
  dest: AudioNode,
  at: number,
  partials: number[],
  decay: number,
  level: number,
): void {
  const click = noise(ctx, 0.01, 0x2f10 + Math.round(at * 1000), at);
  const clickEnv = env(ctx, [
    [at, 0],
    [at + 0.002, level],
    [at + 0.02, 0],
  ]);
  click.connect(filter(ctx, "highpass", 900)).connect(clickEnv).connect(dest);
  for (const [i, freq] of partials.entries()) {
    const body = osc(ctx, "sine", freq, at, at + decay);
    const bodyEnv = env(ctx, [
      [at, 0],
      [at + 0.004, level * (0.9 - i * 0.25)],
      [at + decay, 0],
    ]);
    body.connect(bodyEnv).connect(dest);
  }
}

// ---------------------------------------------------------------------------
// Gags — one per prop act. Each is timed against its act's own choreography
// (durations in props/registry.ts), because an act is a fixed-length piece of
// theater and its sound is allowed to know that.
// ---------------------------------------------------------------------------

/**
 * The signature spike, and the one every other sound in the game is judged
 * against: an airhorn that has been left in the rain. Three detuned saws
 * beating against each other, a fifth-down pitch fall at the tail,
 * soft-clipped hard and slapped through a shed-sized convolver. It should read
 * as an announcement from inside a fever — a horn that means something is
 * starting, without saying what.
 */
function truckHorn(ctx: OfflineAudioContext, source: AudioBuffer | null): void {
  const bus = out(ctx, { drive: 26, space: [0.18, 3.5], wet: 0.45 });
  const lowpass = filter(ctx, "lowpass", 2400);
  lowpass.connect(bus);

  const level = env(ctx, [
    [0, 0],
    [0.02, 0.5],
    [0.7, 0.5],
    [0.9, 0],
  ]);
  level.connect(lowpass);

  if (source) {
    // The horn gives up on the sample's own pitch: same fifth-down fall.
    sampleVoice(ctx, source, { at: 0.55, to: 0.667, over: 0.3 }).connect(level);
    return;
  }
  for (const freq of [233, 236.5, 118.6]) {
    const o = osc(ctx, "sawtooth", freq, 0, 0.9);
    o.frequency.setValueAtTime(freq, 0.55);
    o.frequency.exponentialRampToValueAtTime(freq * 0.667, 0.85);
    o.connect(level);
  }
}

/**
 * The detonation. A pyro thud under a noise blast, and over the top a chord
 * that bends *up* a whole tone and refuses to resolve — the sound of a house
 * PA being asked to do something a house PA cannot do. Longer than anything
 * else in the game, because the win is the biggest thing in the game.
 */
function winBlast(ctx: OfflineAudioContext, source: AudioBuffer | null): void {
  const bus = out(ctx, { drive: 14, space: [1.4, 2.2], wet: 0.55 });

  // The blast: gone in a quarter second, all body.
  const blastGain = env(ctx, [
    [0, 0.9],
    [0.12, 0.5],
    [0.5, 0],
  ]);
  blastGain.connect(bus);
  const boom = filter(ctx, "lowpass", 1800);
  boom.frequency.exponentialRampToValueAtTime(90, 0.45);
  boom.connect(blastGain);
  if (source) sampleVoice(ctx, source).connect(boom);
  else noise(ctx, 0.5, 0x51f7d).connect(boom);

  // The chord: a major triad that bends a tone sharp over two seconds and
  // stops there. Nothing resolves; the clip just ends.
  const chord = env(ctx, [
    [0.02, 0],
    [0.09, 0.28],
    [1.6, 0.28],
    [2.4, 0],
  ]);
  chord.connect(bus);
  for (const freq of [110, 138.6, 164.8, 220]) {
    const o = osc(ctx, "sawtooth", freq, 0, 2.5);
    o.frequency.setValueAtTime(freq, 0.6);
    o.frequency.linearRampToValueAtTime(freq * 1.122, 2.3);
    o.connect(chord);
  }
}

/**
 * The rocket that celebrates a blunder by taking off badly. Ignition, a proud
 * climb, then the engine chops itself to pieces — the sputter is the climb
 * *granulated*, which is the fizzle being a real failure of the same sound
 * rather than a different sound pretending. Then it hangs in silence, and
 * lands somewhere off-stage.
 */
async function rocketFizzle(ctx: OfflineAudioContext, source: AudioBuffer | null): Promise<void> {
  const bus = out(ctx, { drive: 18, space: [0.5, 2.6], wet: 0.3 });

  // Ignition.
  const ignition = env(ctx, [
    [0, 0],
    [0.03, 0.55],
    [0.4, 0.12],
    [0.7, 0],
  ]);
  const sweep = filter(ctx, "lowpass", 300);
  sweep.frequency.exponentialRampToValueAtTime(4200, 0.3);
  sweep.connect(ignition);
  ignition.connect(bus);
  noise(ctx, 0.7, 0xa17c3).connect(sweep);

  // The climb, rendered on its own so the sputter can be made out of it.
  const climb = await preRender(0.9, (c) => {
    const level = env(c, [
      [0, 0],
      [0.05, 0.34],
      [0.85, 0.3],
      [0.9, 0],
    ]);
    level.connect(c.destination);
    if (source) {
      sampleVoice(c, source, { at: 0.05, to: 1.8, over: 0.8 }).connect(level);
      return;
    }
    for (const [i, freq] of [180, 181.5].entries()) {
      const o = osc(c, "sawtooth", freq, 0, 0.9);
      o.frequency.setValueAtTime(freq, 0.05);
      o.frequency.exponentialRampToValueAtTime(freq * 2.9 + i, 0.85);
      o.connect(level);
    }
  });
  play(ctx, climb, bus, 0.05);

  // The engine dies: the same climb chopped into 40ms grains, gated on the
  // step clock at a duty that runs out, and pitched down as it goes.
  const sputter = gate(ctx, [0.95, 1.03, 1.13, 1.26, 1.42], 0.055, 0.5);
  sputter.connect(bus);
  play(ctx, chopped(ctx, climb, 40), sputter, 0.9, 0.55);

  // ...and it hangs for half a second before anything is heard from it again.
  strike(ctx, bus, 1.98, [196, 279, 431], 0.5, 0.22);
}


/**
 * A hazard beacon lowers in and strobes. An alarm with no sound is a lamp —
 * this is the one the phase-3 log asked for first. Three hard two-tone
 * strobes on the step grid, in a shed.
 */
function beaconDrop(ctx: OfflineAudioContext, source: AudioBuffer | null): void {
  const bus = out(ctx, { drive: 20, space: [0.3, 2.4], wet: 0.4 });

  // The winch bringing it down.
  const motor = env(ctx, [
    [0, 0],
    [0.08, 0.16],
    [0.55, 0.14],
    [0.62, 0],
  ]);
  const muffle = filter(ctx, "lowpass", 900);
  motor.connect(muffle);
  muffle.connect(bus);
  const winch = osc(ctx, "sawtooth", 320, 0, 0.62);
  winch.frequency.linearRampToValueAtTime(120, 0.6);
  winch.connect(motor);
  strike(ctx, bus, 0.64, [140, 208], 0.16, 0.4); // it seats

  const strobes = [0.8, 1.25, 1.7];
  const alarm = gate(ctx, strobes, 0.26, 0.34);
  alarm.connect(bus);
  if (source) {
    for (const t of strobes) play(ctx, source, alarm, t);
    return;
  }
  for (const freq of [700, 990]) {
    const o = osc(ctx, "square", freq, 0.78, 2.0);
    o.connect(alarm);
  }
}

/**
 * The mascot's two reactions, and the first sounds written to VISION.md's
 * lane-screen reference. A bowling centre's monitor does not have an airhorn;
 * it has a sound card. So both of these are unashamedly MIDI — a brass patch
 * nobody licensed, played by a machine with no opinion about what just
 * happened — and they get less mangling than the rally spikes precisely
 * because cheap General MIDI is *already* the wrong sound, and burying it in
 * distortion would hide the joke rather than sharpen it.
 *
 * `up` is the three-note fanfare with a cymbal on the last note. `down` is the
 * fall: one slide, one rimshot, and it does not resolve.
 */
function mascotSting(ctx: OfflineAudioContext, source: AudioBuffer | null, up: boolean): void {
  const bus = out(ctx, { drive: 6, space: [0.5, 2.6], wet: 0.3 });

  if (up) {
    // C–E–G, each a hard sixteenth, the last one held. The patch is two
    // detuned saws and a square an octave down, which is what a 1998 sound
    // font thought a trumpet section was.
    const notes: [number, number, number][] = [
      [523.25, 0.0, 0.16],
      [659.25, 0.16, 0.16],
      [783.99, 0.32, 0.75],
    ];
    for (const [freq, at, held] of notes) {
      const level = env(ctx, [
        [at, 0],
        [at + 0.012, 0.3],
        [at + held - 0.05, 0.26],
        [at + held, 0],
      ]);
      level.connect(bus);
      if (source) {
        play(ctx, source, level, at, freq / 523.25);
        continue;
      }
      for (const detune of [1, 1.006]) {
        osc(ctx, "sawtooth", freq * detune, at, at + held).connect(level);
      }
      osc(ctx, "square", freq / 2, at, at + held).connect(gain(ctx, 0.25)).connect(level);
    }
    // The cymbal: noise through a highpass, cut off rather than decayed.
    const crash = env(ctx, [
      [0.32, 0],
      [0.35, 0.16],
      [0.95, 0],
    ]);
    crash.connect(filter(ctx, "highpass", 5200)).connect(bus);
    noise(ctx, 0.7, 0x51fa, 0.32).connect(crash);
    return;
  }

  // The fall. Three stepped notes down and then a slide off the bottom of the
  // patch — the joke is that it keeps going after the tune has finished.
  const level = env(ctx, [
    [0, 0],
    [0.02, 0.3],
    [0.9, 0.26],
    [1.15, 0],
  ]);
  const muffle = filter(ctx, "lowpass", 1800);
  level.connect(muffle);
  muffle.connect(bus);
  if (source) {
    sampleVoice(ctx, source, { at: 0.45, to: 0.5, over: 0.6 }).connect(level);
  } else {
    for (const detune of [1, 1.008]) {
      const o = osc(ctx, "sawtooth", 392 * detune, 0, 1.15);
      // Stepped down, then poured down: setValueAtTime for the tune, one ramp
      // for the part that has given up.
      o.frequency.setValueAtTime(392 * detune, 0.18);
      o.frequency.setValueAtTime(349.23 * detune, 0.36);
      o.frequency.setValueAtTime(311.13 * detune, 0.45);
      o.frequency.linearRampToValueAtTime(98 * detune, 1.1);
      o.connect(level);
    }
  }
  strike(ctx, bus, 1.12, [220, 331, 512], 0.22, 0.4); // the rimshot, late
}

/**
 * The cherub: General MIDI heaven. A harp gliss nobody tuned, then a choir
 * pad two voices short of a chord, held while the thing hovers and cut off
 * when it has seen enough. The gliss is `setValueAtTime` steps — a harp on
 * this sound card is a scale, not a strum — and the choir does not resolve,
 * because the cherub renders no verdict.
 */
function cherubVisit(ctx: OfflineAudioContext, source: AudioBuffer | null): void {
  const bus = out(ctx, { drive: 6, space: [1.6, 2.8], wet: 0.55 });

  // The gliss, up the white notes, one hard step per note. It announces the
  // descent the way a shopping-centre PA announces a lift arriving.
  const glissNotes = [523.25, 587.33, 659.25, 698.46, 783.99, 880, 987.77, 1046.5];
  glissNotes.forEach((freq, i) => {
    const at = 0.05 + i * 0.07;
    const pluck = env(ctx, [
      [at, 0],
      [at + 0.01, 0.16],
      [at + 0.5, 0],
    ]);
    pluck.connect(bus);
    if (source) play(ctx, source, pluck, at, freq / 523.25);
    else osc(ctx, "triangle", freq, at, at + 0.5).connect(pluck);
  });

  // The choir: root, third, octave — no fifth, same missing voices as the
  // stare's, because it is the same sound card. Major this time; heaven is
  // cheerful about withholding judgment. Cut, not released.
  const level = env(ctx, [
    [0.7, 0],
    [1.0, 0.2],
    [3.0, 0.18],
    [3.12, 0],
  ]);
  const throat = filter(ctx, "lowpass", 1700);
  level.connect(throat);
  throat.connect(bus);
  if (source) {
    play(ctx, source, level, 0.7, 1.26);
  } else {
    for (const freq of [261.63, 329.63, 523.25, 659.25]) {
      for (const detune of [1, 1.006]) {
        osc(ctx, "sawtooth", freq * detune, 0.7, 3.15)
          .connect(gain(ctx, freq > 400 ? 0.14 : 0.24))
          .connect(level);
      }
    }
    // Breath over the top, so it reads as voices rather than as an organ.
    noise(ctx, 2.5, 0x7e11, 0.7)
      .connect(filter(ctx, "bandpass", 1100, 1.2))
      .connect(gain(ctx, 0.04))
      .connect(level);
  }
}

/**
 * The callout: a word arriving at the lens. A rising whoosh under the spin,
 * then the orchestra hit — the single most 1997 sound there is, and the right
 * one, because the callout *is* the animation and the hit is what the
 * animation is scored to.
 */
function calloutHit(ctx: OfflineAudioContext, source: AudioBuffer | null): void {
  const bus = out(ctx, { drive: 14, space: [0.6, 2.2], wet: 0.4 });

  // The spin-in: noise swept up, cut dead on the beat the word lands.
  const air = env(ctx, [
    [0, 0],
    [0.3, 0.14],
    [0.44, 0.2],
    [0.46, 0],
  ]);
  const sweep = filter(ctx, "bandpass", 300, 1.4);
  sweep.frequency.linearRampToValueAtTime(4200, 0.45);
  air.connect(sweep);
  sweep.connect(bus);
  noise(ctx, 0.5, 0x77c3).connect(air);

  // The hit: a stack of fifths and a noise transient, all of it over in a
  // quarter second, with the room doing the rest.
  const hit = env(ctx, [
    [0.45, 0],
    [0.465, 0.42],
    [0.6, 0.2],
    [0.78, 0],
  ]);
  hit.connect(bus);
  if (source) {
    play(ctx, source, hit, 0.45);
  } else {
    for (const freq of [116.5, 175, 233, 349.2, 466]) {
      osc(ctx, "sawtooth", freq, 0.45, 0.8).connect(gain(ctx, 0.5)).connect(hit);
    }
    noise(ctx, 0.12, 0x2ad4, 0.45).connect(filter(ctx, "bandpass", 1400, 0.8)).connect(hit);
  }
}


/**
 * Moss's mower: one small engine, idling, for four and a half seconds.
 *
 * The quietest thing in the roster and the longest, which is the same trade the
 * sprinkler made before it — an act the player sees this often has to wear, and
 * nothing wears like something that never peaks. It has no spike in it at all.
 *
 * The chug is a gate rather than an LFO (the timing law: steps, not curves), and
 * it slows across the act by exactly nothing. It is not building to anything.
 */
function mowerIdle(ctx: OfflineAudioContext, source: AudioBuffer | null): void {
  const bus = out(ctx, { drive: 4, space: [0.5, 2.4], wet: 0.18 });

  // Four-stroke chug: a gate at ~9Hz on a low saw, through a lowpass that
  // takes everything that could be called bright out of it.
  const chugs: number[] = [];
  for (let t = 0.05; t < 4.4; t += 0.111) chugs.push(t);
  // Quiet: this is the sound the player hears most on Moss's stage, and the
  // roster's other signatures sit at rms 0.15-0.34. It belongs at the bottom
  // of that band, not the top — an idle is background by definition.
  const engine = gate(ctx, chugs, 0.055, 0.13);
  const body = filter(ctx, "lowpass", 520);
  engine.connect(body);
  body.connect(bus);

  if (source) {
    const level = env(ctx, [
      [0, 0],
      [0.2, 0.24],
      [4.1, 0.22],
      [4.5, 0],
    ]);
    level.connect(bus);
    play(ctx, source, level, 0);
  } else {
    for (const freq of [68, 68 * 1.004, 136]) {
      osc(ctx, "sawtooth", freq, 0, 4.5).connect(gain(ctx, freq > 100 ? 0.3 : 1)).connect(engine);
    }
  }

  // The blade, over the top: a thin band of noise that stays exactly where it
  // is. Present the whole act, doing nothing to anything.
  const blade = env(ctx, [
    [0.02, 0],
    [0.4, 0.05],
    [4.1, 0.045],
    [4.5, 0],
  ]);
  const whine = filter(ctx, "bandpass", 3100, 6);
  blade.connect(whine);
  whine.connect(bus);
  noise(ctx, 4.5, 0x9c1f0, 0.02).connect(blade);
}

/**
 * The stare: a choir patch with two voices too few, arriving and not resolving.
 *
 * The reference's whole sinister register in one chord — cheap General MIDI
 * "Choir Aahs" was already uncanny in 1997 and nobody had to try. It is a minor
 * triad with no fifth, held flat, cut off rather than released, and it never
 * goes anywhere because neither does the act.
 */
function stareDown(ctx: OfflineAudioContext, source: AudioBuffer | null): void {
  const bus = out(ctx, { drive: 8, space: [1.1, 2.4], wet: 0.5 });

  const level = env(ctx, [
    [0, 0],
    [0.25, 0.24],
    [2.6, 0.22],
    // Cut, not faded: three frames from full to nothing. A choir that releases
    // is a choir that finished; this one is switched off.
    [2.72, 0],
  ]);
  const throat = filter(ctx, "lowpass", 1500);
  level.connect(throat);
  throat.connect(bus);

  if (source) {
    play(ctx, source, level, 0);
  } else {
    // A and C, no E. The missing fifth is the two voices.
    for (const freq of [220, 261.63, 440, 523.25]) {
      for (const detune of [1, 1.007]) {
        osc(ctx, "sawtooth", freq * detune, 0, 2.75)
          .connect(gain(ctx, freq > 400 ? 0.18 : 0.3))
          .connect(level);
      }
    }
    // Breath, so it's a choir and not an organ. Barely there.
    noise(ctx, 2.75, 0x3ba7).connect(filter(ctx, "bandpass", 900, 1.2)).connect(gain(ctx, 0.05)).connect(level);
  }

  // One low thud on the lean, which is the only event in the act.
  strike(ctx, bus, 2.05, [55, 82, 131], 0.5, 0.32);
}

/**
 * Deep space: the interlude's music, which is a screensaver's music.
 *
 * A four-note sine arpeggio on a long delay, drifting up, going nowhere, with a
 * noise swell under it. The joke is the genre confusion — this is the cue for a
 * documentary about the solar system, playing over a game of Connect 4, at the
 * same volume as everything else.
 */
function deepSpace(ctx: OfflineAudioContext, source: AudioBuffer | null): void {
  const bus = out(ctx, { space: [2.2, 3.2], wet: 0.6 });

  // The swell: everything and nothing, arriving before the planet does. It
  // reaches audible inside a frame — a one-shot that takes a beat to start is a
  // spike that misses its moment, and `tools/audio-check.mjs` fails the build
  // over it. Slow *after* the onset is the mood; slow to the onset is a bug.
  const air = env(ctx, [
    [0, 0],
    [0.05, 0.06],
    [1.6, 0.1],
    [3.2, 0.08],
    [4.1, 0],
  ]);
  air.connect(filter(ctx, "lowpass", 700)).connect(bus);
  noise(ctx, 4.1, 0x50ac).connect(air);

  // C–E–G–B, one per beat, each held past the next. Sines, because a sine is
  // what a cheap patch reaches for when it means "space".
  const notes: [number, number][] = [
    [523.25, 0.1],
    [659.25, 0.8],
    [783.99, 1.5],
    [987.77, 2.2],
  ];
  for (const [freq, at] of notes) {
    const level = env(ctx, [
      [at, 0],
      [at + 0.03, 0.17],
      [at + 0.9, 0.05],
      [at + 1.4, 0],
    ]);
    level.connect(bus);
    if (source) {
      play(ctx, source, level, at, freq / 523.25);
      continue;
    }
    osc(ctx, "sine", freq, at, at + 1.4).connect(level);
    // The octave under it at a quarter, which is the whole of the patch.
    osc(ctx, "sine", freq / 2, at, at + 1.4).connect(gain(ctx, 0.25)).connect(level);
  }
}

// ---------------------------------------------------------------------------
// The signatures (phase 5) — one per opponent.
//
// These are the opponent's *presence*, not a reaction, so they are written
// against each other rather than against the airhorn: read down the roster and
// the sounds should get slower, lower and less certain, the same arc the void
// variations walk. Acorn is bright, small and eager; the Oracle is one machine
// noise that does not resolve and does not stop where you expect.
//
// All seven go through the phase-2 mangling graph, and all seven are cheap
// General MIDI where they are pitched at all — the lane screen has a sound
// card, not a horn.
// ---------------------------------------------------------------------------

/**
 * Acorn's bumpers. A small eager motor, a foam clunk, and two rising notes
 * that are pleased with themselves for no reason. The most major-key thing in
 * the game and the least earned.
 */
function bumpersUp(ctx: OfflineAudioContext, source: AudioBuffer | null): void {
  const bus = out(ctx, { drive: 6, space: [0.35, 3], wet: 0.25 });

  // The motor, running for exactly as long as the bumpers take to seat.
  const motor = env(ctx, [
    [0, 0],
    [0.04, 0.2],
    [0.24, 0.18],
    [0.3, 0],
  ]);
  const muffle = filter(ctx, "lowpass", 1100);
  motor.connect(muffle);
  muffle.connect(bus);
  if (source) sampleVoice(ctx, source).connect(motor);
  else {
    const whine = osc(ctx, "sawtooth", 190, 0, 0.3);
    whine.frequency.linearRampToValueAtTime(320, 0.28);
    whine.connect(motor);
  }

  // The clunk: soft, because it is foam, and doubled because there are two.
  strike(ctx, bus, 0.3, [128, 190], 0.14, 0.42);
  strike(ctx, bus, 0.35, [120, 178], 0.13, 0.3);

  // Two notes. It thinks something has been accomplished.
  for (const [i, freq] of [523.25, 783.99].entries()) {
    const at = 0.46 + i * 0.17;
    const level = env(ctx, [
      [at, 0],
      [at + 0.008, 0.24],
      [at + 0.3, 0.16],
      [at + 0.45, 0],
    ]);
    level.connect(bus);
    osc(ctx, "triangle", freq, at, at + 0.46).connect(level);
    osc(ctx, "square", freq * 2, at, at + 0.46).connect(gain(ctx, 0.12)).connect(level);
  }
}

/**
 * Pebble's slab. A winch paying out, a concrete landing with all the weight
 * the game has, and the winch taking it away again. No pitch, no tune, nothing
 * that could be mistaken for an opinion.
 */
function slabDrop(ctx: OfflineAudioContext, source: AudioBuffer | null): void {
  const bus = out(ctx, { drive: 10, space: [0.55, 2.4], wet: 0.35 });

  // Paying out: a ratchet on the step clock, speeding up as it falls.
  let t = 0;
  for (let i = 0; i < 9; i++) {
    strike(ctx, bus, t, [180, 244], 0.03, 0.1);
    t += 0.055 - i * 0.004;
  }

  // The landing. Body under a burst, and a room that is briefly bigger than
  // the game.
  const impactAt = 0.48;
  const body = env(ctx, [
    [impactAt, 0],
    [impactAt + 0.004, 0.85],
    [impactAt + 0.3, 0.1],
    [impactAt + 0.75, 0],
  ]);
  const floor = filter(ctx, "lowpass", 900);
  floor.frequency.exponentialRampToValueAtTime(70, impactAt + 0.4);
  body.connect(floor);
  floor.connect(bus);
  if (source) sampleVoice(ctx, source).connect(body);
  else {
    noise(ctx, 0.8, 0x3ba09, impactAt).connect(body);
    const thud = osc(ctx, "sine", 96, impactAt, impactAt + 0.4);
    thud.frequency.exponentialRampToValueAtTime(44, impactAt + 0.35);
    thud.connect(gain(ctx, 0.6)).connect(body);
  }
  // The grit that comes off it, a fraction late.
  strike(ctx, bus, impactAt + 0.06, [820, 1240], 0.12, 0.14);

  // And it is taken away. Slower going up; it always is.
  let u = 1.5;
  for (let i = 0; i < 7; i++) {
    strike(ctx, bus, u, [172, 232], 0.03, 0.09);
    u += 0.07;
  }
}

/**
 * Bramble's rack. One crash, and then the one that didn't fall, ticking
 * against itself for the rest of the sound. The tick never resolves and the
 * recipe ends before it does, which is the joke the prop is telling too.
 */
function pinScatter(ctx: OfflineAudioContext, source: AudioBuffer | null): void {
  const bus = out(ctx, { drive: 16, space: [0.7, 2.6], wet: 0.4 });

  // The rack coming up: three flat clacks, evenly spaced, no rush.
  for (const at of [0.02, 0.14, 0.26]) strike(ctx, bus, at, [300, 452], 0.05, 0.16);

  // The hit. A burst of air, then four wooden bodies going over at
  // deliberately uneven times — a scatter that lands on the beat isn't one.
  const hitAt = 0.62;
  const air = env(ctx, [
    [hitAt, 0],
    [hitAt + 0.006, 0.6],
    [hitAt + 0.18, 0],
  ]);
  const crack = filter(ctx, "bandpass", 1800, 0.7);
  air.connect(crack);
  crack.connect(bus);
  if (source) play(ctx, source, air, hitAt);
  else noise(ctx, 0.25, 0x7c02b, hitAt).connect(air);
  for (const [i, at] of [0.0, 0.055, 0.09, 0.17].entries()) {
    strike(ctx, bus, hitAt + at, [260 - i * 24, 396 - i * 30, 610], 0.19, 0.42 - i * 0.06);
  }

  // The survivor. Slowing, quieter, and still going when the sound stops.
  let t = 1.05;
  let gap = 0.115;
  for (let i = 0; i < 9; i++) {
    strike(ctx, bus, t, [340, 512], 0.045, 0.2 - i * 0.014);
    t += gap;
    gap *= 1.08;
  }
}

/**
 * Cinder's cups. Three wooden slides on the swap beats, two lifts, and a
 * two-note figure that asks a question and is not answered. Politeness, in a
 * patch nobody paid for.
 */
function shellGame(ctx: OfflineAudioContext, source: AudioBuffer | null): void {
  const bus = out(ctx, { drive: 5, space: [0.45, 3.2], wet: 0.3 });

  // Sliding in.
  const slide = env(ctx, [
    [0, 0],
    [0.08, 0.16],
    [0.4, 0.1],
    [0.52, 0],
  ]);
  const woody = filter(ctx, "bandpass", 900, 1.1);
  slide.connect(woody);
  woody.connect(bus);
  if (source) sampleVoice(ctx, source).connect(slide);
  else noise(ctx, 0.55, 0x1cd44).connect(slide);

  // The three swaps. Each is a cut on screen, so each is a single tap here —
  // no scrape, no travel, nothing that implies a path.
  for (const at of [0.91, 1.22, 1.52]) strike(ctx, bus, at, [430, 648], 0.06, 0.34);

  // The first lift, and the two-note figure under it. Minor second up, and it
  // stops there.
  for (const [i, freq] of [392, 415.3].entries()) {
    const at = 1.92 + i * 0.16;
    const level = env(ctx, [
      [at, 0],
      [at + 0.01, 0.2],
      [at + 0.34, 0.12],
      [at + 0.5, 0],
    ]);
    level.connect(bus);
    osc(ctx, "triangle", freq, at, at + 0.52).connect(level);
  }

  // All three lift, together, and there is nothing under any of them: three
  // taps and one soft empty thump where a reveal would be.
  for (const at of [2.66, 2.7, 2.76]) strike(ctx, bus, at, [455, 690], 0.05, 0.26);
  const hollow = env(ctx, [
    [2.82, 0],
    [2.85, 0.22],
    [3.3, 0],
  ]);
  hollow.connect(filter(ctx, "lowpass", 420)).connect(bus);
  noise(ctx, 0.5, 0x66aa1, 2.82).connect(hollow);
}

/**
 * Vane's scoreboard. Relays, a mains hum while it hangs there, and one very
 * small beep on the frame the mark changes. The beep is the entire lie and it
 * is quieter than everything around it, because a lie that announces itself
 * isn't one.
 */
function scoreLie(ctx: OfflineAudioContext, source: AudioBuffer | null): void {
  const bus = out(ctx, { drive: 4, space: [0.4, 3.4], wet: 0.28 });

  // Four relay clacks as it comes down, one per stepped position.
  for (const [i, at] of [0.0, 0.12, 0.24, 0.36].entries()) {
    strike(ctx, bus, at, [520 + i * 20, 790], 0.04, 0.3);
  }

  // The hum it makes while it is on. Mains, plus the line whine of a tube
  // that has been running since before any of this.
  const hum = env(ctx, [
    [0.42, 0],
    [0.6, 0.12],
    [2.3, 0.1],
    [2.5, 0],
  ]);
  hum.connect(bus);
  if (source) sampleVoice(ctx, source).connect(hum);
  else {
    osc(ctx, "sine", 60, 0.42, 2.5).connect(gain(ctx, 0.5)).connect(hum);
    osc(ctx, "square", 15720, 0.42, 2.5).connect(gain(ctx, 0.035)).connect(hum);
  }

  // The lie. One pip, at the moment the mark changes, at a level you could
  // talk over.
  const pip = env(ctx, [
    [1.65, 0],
    [1.653, 0.14],
    [1.72, 0.1],
    [1.75, 0],
  ]);
  pip.connect(bus);
  osc(ctx, "square", 1320, 1.65, 1.76).connect(pip);

  // Relays again, taking it back up.
  for (const [i, at] of [2.55, 2.66, 2.77].entries()) {
    strike(ctx, bus, at, [500 - i * 16, 760], 0.04, 0.22);
  }
}

/**
 * Quill's overlay. Twelve blips climbing a scale as the line draws itself, a
 * two-tone lock when the reticle snaps on, and the same twelve on the way back
 * down. Computer music with no music in it — the notes are a readout of
 * progress, which is exactly what Quill is doing to you.
 */
function laneSolve(ctx: OfflineAudioContext, source: AudioBuffer | null): void {
  const bus = out(ctx, { drive: 4, space: [0.3, 3.6], wet: 0.22 });
  const DASHES = 12;

  const blip = (at: number, freq: number, level: number) => {
    const g = env(ctx, [
      [at, 0],
      [at + 0.002, level],
      [at + 0.035, level * 0.6],
      [at + 0.05, 0],
    ]);
    g.connect(bus);
    if (source) play(ctx, source, g, at, freq / 880);
    else {
      osc(ctx, "square", freq, at, at + 0.06).connect(gain(ctx, 0.6)).connect(g);
      osc(ctx, "sine", freq * 2, at, at + 0.06).connect(gain(ctx, 0.25)).connect(g);
    }
  };

  // Drawing. A whole-tone climb, so it never lands anywhere.
  for (let i = 0; i < DASHES; i++) blip(0.03 + i * 0.076, 620 * Math.pow(2, i / 12), 0.2);

  // The lock: two tones a fifth apart, together, held flat.
  const lock = env(ctx, [
    [1.05, 0],
    [1.06, 0.24],
    [1.4, 0.2],
    [1.55, 0],
  ]);
  lock.connect(bus);
  for (const freq of [880, 1318.5]) osc(ctx, "square", freq, 1.05, 1.56).connect(gain(ctx, 0.5)).connect(lock);

  // Un-drawing, the same ladder in reverse and quieter.
  for (let i = 0; i < DASHES; i++) blip(2.12 + i * 0.04, 620 * Math.pow(2, (DASHES - 1 - i) / 12), 0.12);
}

/**
 * The Oracle's pinsetter. Two hydraulic steps down, a long low hum with a
 * beating second voice a couple of hertz off, two steps back up. Nothing in it
 * is a note and nothing in it resolves, and the hum is still there under the
 * last relay — the machine does not finish, it leaves.
 */
function pinsetter(ctx: OfflineAudioContext, source: AudioBuffer | null): void {
  const bus = out(ctx, { drive: 8, space: [1.2, 2.2], wet: 0.45 });

  const stepDown = (at: number) => {
    const g = env(ctx, [
      [at, 0],
      [at + 0.03, 0.34],
      [at + 0.26, 0.1],
      [at + 0.4, 0],
    ]);
    const air = filter(ctx, "lowpass", 700);
    g.connect(air);
    air.connect(bus);
    if (source) play(ctx, source, g, at);
    else {
      noise(ctx, 0.45, 0x2fa10 + Math.round(at * 100), at).connect(g);
      const ram = osc(ctx, "sawtooth", 130, at, at + 0.42);
      ram.frequency.linearRampToValueAtTime(58, at + 0.38);
      ram.connect(gain(ctx, 0.5)).connect(g);
    }
    strike(ctx, bus, at + 0.4, [92, 143], 0.3, 0.34);
  };

  stepDown(0.02);
  stepDown(0.62);

  // The hover. Two low voices two hertz apart, so the hum beats slowly against
  // itself — the sound of something waiting that is not waiting for you.
  const hover = env(ctx, [
    [1.1, 0],
    [1.4, 0.2],
    [2.9, 0.18],
    [3.35, 0],
  ]);
  hover.connect(filter(ctx, "lowpass", 340)).connect(bus);
  for (const freq of [55, 57]) osc(ctx, "sine", freq, 1.1, 3.4).connect(gain(ctx, 0.55)).connect(hover);
  for (const freq of [110, 165]) osc(ctx, "triangle", freq, 1.1, 3.4).connect(gain(ctx, 0.09)).connect(hover);

  // Going back up, and the second one is cut off by the end of the recipe
  // rather than finishing.
  strike(ctx, bus, 2.95, [98, 152], 0.28, 0.3);
  strike(ctx, bus, 3.4, [104, 160], 0.24, 0.24);
}

// ---------------------------------------------------------------------------
// The full-frame acts (phase 9). Six props that cross the frame instead of
// sitting at the edge of it, and six sounds written to the same shape as the
// rest: one buffer per act, carrying the whole choreography — the beat of
// silence before the cannon fires is inside `spike-cannon`, not scheduled by
// the stage.
//
// One thing is different, and it is because these acts are physically bigger:
// each of them has a single loud event with a long approach or a long tail, so
// the low end is where the size lives. A big prop with a small sound reads as a
// sprite, which is the one thing more expensive geometry can't fix.
// ---------------------------------------------------------------------------

/**
 * The cannon. A three-step crank, a beat of nothing, one report, and a long
 * whistle going away — the whistle is the shot crossing the frame, so it is the
 * longest voice in the sound and it never comes back down.
 */
function cannonShot(ctx: OfflineAudioContext, source: AudioBuffer | null): void {
  const bus = out(ctx, { drive: 14, space: [0.9, 2.4], wet: 0.4 });

  // Rolling in, then the ratchet: three clacks, one per stepped crank position.
  const roll = env(ctx, [
    [0, 0],
    [0.1, 0.14],
    [0.5, 0.1],
    [0.56, 0],
  ]);
  roll.connect(filter(ctx, "lowpass", 480)).connect(bus);
  noise(ctx, 0.6, 0x5ba71).connect(roll);
  for (const at of [0.6, 0.78, 0.96]) strike(ctx, bus, at, [340, 516], 0.05, 0.28);

  // The report. Everything before it is quiet so this can be the only loud
  // thing in the buffer.
  //
  // 1.52 is not a feel — it is `CANNON_FIRE 0.4 x CANNON_MS 3800` (`steps.ts`,
  // `Cannon.tsx`). One buffer carrying the whole act means the buffer has to
  // agree with the act's own segment boundaries, and this was written at 1.34,
  // which put the loudest transient in the library 180ms before the muzzle
  // moved. Fever plays spikes up to 5% sharp, which only ever widens that.
  const fireAt = 1.52;
  const boom = env(ctx, [
    [fireAt, 0],
    [fireAt + 0.005, 0.95],
    [fireAt + 0.35, 0.12],
    [fireAt + 0.9, 0],
  ]);
  const body = filter(ctx, "lowpass", 1400);
  body.frequency.exponentialRampToValueAtTime(90, fireAt + 0.5);
  boom.connect(body);
  body.connect(bus);
  if (source) play(ctx, source, boom, fireAt);
  else {
    noise(ctx, 1.0, 0x3c19f, fireAt).connect(boom);
    const thump = osc(ctx, "sine", 120, fireAt, fireAt + 0.6);
    thump.frequency.exponentialRampToValueAtTime(38, fireAt + 0.5);
    thump.connect(gain(ctx, 0.7)).connect(boom);
  }

  // The shot going away: a whistle that falls the whole time and is still
  // falling when the buffer ends. Nothing lands.
  const whistleAt = fireAt + 0.06;
  const whistle = env(ctx, [
    [whistleAt, 0],
    [whistleAt + 0.05, 0.16],
    [whistleAt + 1.4, 0.09],
    [whistleAt + 1.85, 0],
  ]);
  whistle.connect(bus);
  const tone = osc(ctx, "square", 1250, whistleAt, whistleAt + 1.88);
  tone.frequency.linearRampToValueAtTime(430, whistleAt + 1.85);
  tone.connect(gain(ctx, 0.5)).connect(whistle);
}

/**
 * The piano. A fall, a crash of every note at once, a third of the act of
 * absolutely nothing while it hangs there, then the rest of the fall — and one
 * small woody tap at the end, which is the key.
 *
 * The cluster is the sound: eleven partials struck together is what a piano
 * makes when it is not being played, and it is the only chord in the game that
 * isn't a chord.
 */
function pianoDrop(ctx: OfflineAudioContext, source: AudioBuffer | null): void {
  const bus = out(ctx, { drive: 9, space: [1.1, 2.2], wet: 0.42 });

  // The first fall: air, rising, cut off dead by the hold.
  const fall = env(ctx, [
    [0, 0],
    [0.1, 0.3],
    [0.62, 0.44],
    [0.66, 0],
  ]);
  const wind = filter(ctx, "bandpass", 300, 0.8);
  wind.frequency.linearRampToValueAtTime(1100, 0.64);
  fall.connect(wind);
  wind.connect(bus);
  noise(ctx, 0.7, 0x9f24c).connect(fall);

  // The hold. Nothing is scheduled between 0.66 and 1.9 — the longest silence
  // in the library, and it is the joke.

  const crashAt = 1.92;
  const level = env(ctx, [
    [crashAt, 0],
    [crashAt + 0.004, 0.9],
    [crashAt + 0.5, 0.22],
    [crashAt + 1.2, 0],
  ]);
  level.connect(bus);
  if (source) play(ctx, source, level, crashAt);
  else {
    // Every string at once, and the low ones loudest. Detuned in whole cents
    // nobody chose carefully, because a piano dropped from a height is out.
    for (const [i, freq] of [55, 82.4, 110, 138.6, 164.8, 220, 277.2, 329.6, 440].entries()) {
      const o = osc(ctx, "triangle", freq * (1 + (i % 3) * 0.004), crashAt, crashAt + 1.3);
      o.connect(gain(ctx, 0.3 / (1 + i * 0.35))).connect(level);
    }
    const body = osc(ctx, "sine", 58, crashAt, crashAt + 0.7);
    body.frequency.exponentialRampToValueAtTime(32, crashAt + 0.6);
    body.connect(gain(ctx, 0.7)).connect(level);
    noise(ctx, 0.3, 0x14bb2, crashAt).connect(gain(ctx, 0.35)).connect(level);
  }

  // The key, coming back. One tap, wooden, far too small for what just
  // happened, which is the entire punchline.
  strike(ctx, bus, 2.78, [780, 1180], 0.09, 0.22);
  strike(ctx, bus, 3.16, [740, 1120], 0.08, 0.16);
}

/**
 * The wrecking ball. Chain, air, chain — and no impact anywhere in it, because
 * there is no impact anywhere in the act. A swoosh that resolves into nothing
 * is a strange sound to write on purpose and it is what this one is.
 */
function wreckingBall(ctx: OfflineAudioContext, source: AudioBuffer | null): void {
  const bus = out(ctx, { drive: 11, space: [1.4, 2.0], wet: 0.5 });

  /** One pass across the frame: air swelling and falling, chain over the top. */
  const pass = (at: number, seconds: number, level: number): void => {
    const air = env(ctx, [
      [at, 0],
      [at + seconds * 0.45, level],
      [at + seconds, 0],
    ]);
    const move = filter(ctx, "bandpass", 180, 0.9);
    move.frequency.linearRampToValueAtTime(520, at + seconds * 0.5);
    move.frequency.linearRampToValueAtTime(150, at + seconds);
    air.connect(move);
    move.connect(bus);
    if (source) play(ctx, source, air, at);
    else noise(ctx, seconds + 0.1, 0x2ae83 + Math.round(at * 100), at).connect(air);
    // The links, rattling on the step clock the whole way across.
    for (let t = at; t < at + seconds; t += 0.083) {
      strike(ctx, bus, t, [620, 940, 1380], 0.035, 0.09 * level * 3);
    }
  };

  pass(0.02, 1.5, 0.34);
  // The hang: one link settling, and then nothing at all for half a second.
  strike(ctx, bus, 1.56, [640, 960], 0.12, 0.14);
  pass(2.32, 1.5, 0.28);
}

/**
 * The mirror ball. A winch, a shimmer that holds far too long, and the winch
 * again. The shimmer is four sines a whole tone apart with no root under them —
 * pretty, and slightly wrong, and it does not resolve.
 */
function mirrorBall(ctx: OfflineAudioContext, source: AudioBuffer | null): void {
  const bus = out(ctx, { drive: 3, space: [1.6, 2.6], wet: 0.5 });

  const winch = (at: number, seconds: number, from: number, to: number): void => {
    const g = env(ctx, [
      [at, 0],
      [at + 0.04, 0.16],
      [at + seconds - 0.05, 0.14],
      [at + seconds, 0],
    ]);
    g.connect(filter(ctx, "lowpass", 1200)).connect(bus);
    if (source) play(ctx, source, g, at);
    else {
      const motor = osc(ctx, "sawtooth", from, at, at + seconds);
      motor.frequency.linearRampToValueAtTime(to, at + seconds - 0.02);
      motor.connect(g);
    }
    // Four clacks, one per stepped position, same as the pose.
    for (let i = 0; i < 4; i++) strike(ctx, bus, at + (i * seconds) / 4, [420, 640], 0.04, 0.2);
  };

  winch(0.02, 0.6, 260, 150);

  // The shimmer. Whole tones stacked, no third, no root movement — a chord
  // that is only sparkle.
  const holdAt = 0.7;
  const hold = env(ctx, [
    [holdAt, 0],
    [holdAt + 0.4, 0.17],
    [holdAt + 2.3, 0.15],
    [holdAt + 2.7, 0],
  ]);
  hold.connect(bus);
  for (const [i, freq] of [523.25, 587.33, 659.25, 739.99].entries()) {
    osc(ctx, "sine", freq, holdAt, holdAt + 2.75)
      .connect(gain(ctx, 0.14 - i * 0.02))
      .connect(hold);
  }
  // The glints, gated on the two-frame clock the facets use. Hard steps, so the
  // sparkle strobes with the light rather than breathing under it.
  const glints = [];
  for (let t = holdAt + 0.5; t < holdAt + 2.3; t += 0.167) glints.push(t);
  const gated = gate(ctx, glints, 0.05, 0.09);
  gated.connect(bus);
  osc(ctx, "triangle", 2093, holdAt, holdAt + 2.4).connect(gated);

  winch(3.6, 0.6, 150, 260);
}

/**
 * The window washer. Six winch jerks going up, a rubber squeak across glass
 * that isn't there, a beat of nothing, and one rope letting go.
 *
 * The fall has no landing in it. The act ends before the rig hits anything, so
 * the sound ends on the rope and the air, and the last thing in the buffer is
 * still going down.
 */
function windowWasher(ctx: OfflineAudioContext, source: AudioBuffer | null): void {
  const bus = out(ctx, { drive: 7, space: [0.8, 2.8], wet: 0.34 });

  // Going up: six jerks, each a short motor burst and a clack.
  for (let i = 0; i < 6; i++) {
    const at = 0.04 + i * 0.22;
    const g = env(ctx, [
      [at, 0],
      [at + 0.02, 0.17],
      [at + 0.14, 0],
    ]);
    g.connect(filter(ctx, "lowpass", 900)).connect(bus);
    const motor = osc(ctx, "sawtooth", 150 + i * 8, at, at + 0.16);
    motor.frequency.linearRampToValueAtTime(240 + i * 8, at + 0.13);
    motor.connect(g);
    strike(ctx, bus, at + 0.15, [280, 424], 0.05, 0.18);
  }

  // The wipe: six stepped squeaks up a scale that is not a scale, because a
  // squeegee does not play in tune. Six of them at 140ms because that is what
  // the pose does — `WASH_ARRIVED 0.46` to `WASH_WIPED 0.66` of 4200ms, in six
  // steps (`steps.ts`).
  for (let i = 0; i < 6; i++) {
    const at = 1.93 + i * 0.14;
    const g = env(ctx, [
      [at, 0],
      [at + 0.01, 0.13],
      [at + 0.1, 0],
    ]);
    g.connect(bus);
    if (source) play(ctx, source, g, at, 1 + i * 0.08);
    else {
      const squeak = osc(ctx, "sawtooth", 900 + i * 130, at, at + 0.12);
      squeak.frequency.linearRampToValueAtTime(1400 + i * 130, at + 0.1);
      squeak.connect(filter(ctx, "highpass", 700)).connect(g);
    }
  }

  // The rope. One snap, and then air going away from you.
  //
  // `WASH_ROPE_GOES 0.84 x WASHER_MS 4200`, to the millisecond. Written at 3.0
  // it landed half a second before the rope went, so the act's loudest moment
  // arrived while the rig was still hanging there admiring its stripe.
  const snapAt = 3.53;
  strike(ctx, bus, snapAt, [180, 268, 410], 0.18, 0.5);
  const drop = env(ctx, [
    [snapAt + 0.02, 0],
    [snapAt + 0.15, 0.34],
    [snapAt + 0.5, 0.2],
    [snapAt + 0.6, 0],
  ]);
  const going = filter(ctx, "lowpass", 1600);
  going.frequency.exponentialRampToValueAtTime(240, snapAt + 0.55);
  drop.connect(going);
  going.connect(bus);
  noise(ctx, 0.7, 0x6b3d1, snapAt + 0.02).connect(drop);
}

/**
 * The foam finger. A PA crowd that was not recorded here, two wags of squeaking
 * foam, and a held cheer that stops mid-breath.
 *
 * The crowd is the point and it is deliberately canned: reversed into itself,
 * so it swells the wrong way round before it starts. That is the sound of a
 * clip being played rather than of people being pleased.
 */
async function foamFinger(ctx: OfflineAudioContext, source: AudioBuffer | null): Promise<void> {
  const bus = out(ctx, { drive: 6, space: [1.3, 2.4], wet: 0.45 });

  const crowd = await preRender(2.4, (c) => {
    const level = env(c, [
      [0, 0],
      [0.25, 0.4],
      [2.0, 0.3],
      [2.35, 0],
    ]);
    const band = filter(c, "bandpass", 900, 0.5);
    level.connect(band);
    band.connect(c.destination);
    if (source) sampleVoice(c, source).connect(level);
    else {
      noise(c, 2.4, 0x8cd12).connect(level);
      // Two tones under it, so the noise reads as voices rather than as hiss.
      for (const freq of [320, 505]) {
        osc(c, "sawtooth", freq, 0, 2.4).connect(gain(c, 0.05)).connect(level);
      }
    }
  });
  // The PA being punched in — one small click, before anything else.
  //
  // Not decoration: `tools/audio-check.mjs` fails the build on a non-ambient
  // recipe whose first audible sample lands after 0.12s, and a reversed crowd
  // opens on the *original's* silent tail, so this one arrived at 0.111 and
  // passed the gate by nine milliseconds. A spike that takes a tenth of a
  // second to start isn't a spike, and a channel opening is the honest way for
  // a canned clip to say it has started.
  strike(ctx, bus, 0.01, [900, 1360], 0.03, 0.16);

  const swell = env(ctx, [
    [0, 0],
    [0.1, 0.5],
    [2.3, 0.42],
    [2.7, 0],
  ]);
  swell.connect(bus);
  // Reversed: it comes up the wrong way round, which is what a canned crowd
  // sounds like when the tape is not the one it was cut for.
  play(ctx, reversed(ctx, crowd), swell, 0.04);

  // Two wags of foam, which is a soft dry squeak and nothing else.
  for (const at of [1.02, 1.42]) {
    const g = env(ctx, [
      [at, 0],
      [at + 0.02, 0.14],
      [at + 0.16, 0],
    ]);
    g.connect(filter(ctx, "bandpass", 1400, 1.4)).connect(bus);
    noise(ctx, 0.2, 0x4de91 + Math.round(at * 100), at).connect(g);
  }

  // Two PA pips over the top of the hold, because the screen has decided this
  // is an announcement.
  for (const [i, freq] of [880, 1174.66].entries()) {
    const at = 1.86 + i * 0.2;
    const level = env(ctx, [
      [at, 0],
      [at + 0.008, 0.2],
      [at + 0.24, 0],
    ]);
    level.connect(bus);
    osc(ctx, "square", freq, at, at + 0.26).connect(level);
  }
}

// ---------------------------------------------------------------------------
// The board. These fire on nearly every move, so they are small, dry and
// quiet: a sound you hear twenty times a game is furniture, not a spike.
// ---------------------------------------------------------------------------

/** The coin leaving your hand: a short upward breath, and nothing else. */
function discDrop(ctx: OfflineAudioContext, source: AudioBuffer | null): void {
  const bus = out(ctx);
  const level = env(ctx, [
    [0, 0],
    [0.05, 0.5],
    [0.28, 0],
  ]);
  const air = filter(ctx, "bandpass", 400, 1.1);
  air.frequency.linearRampToValueAtTime(1500, 0.28);
  level.connect(air);
  air.connect(bus);
  if (source) sampleVoice(ctx, source).connect(level);
  else noise(ctx, 0.3, 0x7d21a).connect(level);
}

/**
 * The coin landing on lacquer. A body thud and a metal ring that hangs a
 * fraction longer than a coin's should — the board is obsidian and the room
 * it is in does not exist.
 */
function discLand(ctx: OfflineAudioContext, source: AudioBuffer | null): void {
  const bus = out(ctx, { space: [0.25, 2.6], wet: 0.22 });
  if (source) {
    const level = env(ctx, [
      [0, 0.9],
      [0.6, 0],
    ]);
    level.connect(bus);
    sampleVoice(ctx, source).connect(level);
    return;
  }
  const thud = env(ctx, [
    [0, 0],
    [0.004, 0.55],
    [0.16, 0],
  ]);
  thud.connect(bus);
  const body = osc(ctx, "sine", 165, 0, 0.18);
  body.frequency.exponentialRampToValueAtTime(72, 0.15);
  body.connect(thud);
  strike(ctx, bus, 0.001, [1120, 1673, 2510], 0.55, 0.12);
}

/** Column tick under the ghost. As small as a sound can be and still be one. */
function columnHover(ctx: OfflineAudioContext, source: AudioBuffer | null): void {
  const bus = out(ctx);
  const level = env(ctx, [
    [0, 0],
    [0.001, 0.2],
    [0.03, 0],
  ]);
  const top = filter(ctx, "highpass", 2400);
  level.connect(top);
  top.connect(bus);
  if (source) sampleVoice(ctx, source).connect(level);
  else {
    noise(ctx, 0.03, 0x1c07).connect(level);
    osc(ctx, "square", 2600, 0, 0.02).connect(level);
  }
}

// ---------------------------------------------------------------------------
// The match.
// ---------------------------------------------------------------------------

/** A house PA welcoming you to something. Nobody is on the mic. */
function matchStart(ctx: OfflineAudioContext, source: AudioBuffer | null): void {
  const bus = out(ctx, { drive: 10, space: [1.1, 2.4], wet: 0.5 });

  const crowd = env(ctx, [
    [0, 0],
    [0.6, 0.13],
    [1.5, 0],
  ]);
  const distance = filter(ctx, "bandpass", 760, 0.7);
  crowd.connect(distance);
  distance.connect(bus);
  if (source) sampleVoice(ctx, source).connect(crowd);
  else noise(ctx, 1.5, 0x33b91).connect(crowd);

  const stab = env(ctx, [
    [0.15, 0],
    [0.17, 0.24],
    [0.55, 0.2],
    [0.72, 0],
  ]);
  stab.connect(bus);
  for (const freq of [146.8, 220, 293.7]) {
    const o = osc(ctx, "sawtooth", freq, 0.15, 0.75);
    o.frequency.setValueAtTime(freq, 0.5);
    o.frequency.linearRampToValueAtTime(freq * 1.06, 0.72);
    o.connect(stab);
  }
}

/** Control comes back to you. Two pips, quiet, from a PA two fields away. */
function turnYours(ctx: OfflineAudioContext, source: AudioBuffer | null): void {
  const bus = out(ctx, { space: [0.5, 2.6], wet: 0.35 });
  if (source) {
    const level = env(ctx, [
      [0, 0.5],
      [0.4, 0],
    ]);
    level.connect(bus);
    sampleVoice(ctx, source).connect(level);
    return;
  }
  for (const [i, freq] of [660, 880].entries()) {
    const at = 0.04 + i * 0.13;
    const pip = env(ctx, [
      [at, 0],
      [at + 0.006, 0.22],
      [at + 0.07, 0.18],
      [at + 0.09, 0],
    ]);
    pip.connect(bus);
    osc(ctx, "sine", freq, at, at + 0.1).connect(pip);
    osc(ctx, "square", freq * 2, at, at + 0.1).connect(gain(ctx, 0.15)).connect(pip);
  }
}

// ---------------------------------------------------------------------------
// Possessed chrome. Dry, small, plastic — period software has no reverb. The
// exception is `error-ding`, which is the one that isn't well.
// ---------------------------------------------------------------------------

function uiClick(ctx: OfflineAudioContext, source: AudioBuffer | null): void {
  const bus = out(ctx);
  const level = env(ctx, [
    [0, 0],
    [0.001, 0.6],
    [0.035, 0],
  ]);
  const plastic = filter(ctx, "bandpass", 2100, 1.6);
  level.connect(plastic);
  plastic.connect(bus);
  if (source) sampleVoice(ctx, source).connect(level);
  else {
    noise(ctx, 0.04, 0x5501).connect(level);
    osc(ctx, "square", 900, 0, 0.02).connect(gain(ctx, 0.4)).connect(level);
  }
}

/** The switch. Two mechanical halves; `up` decides which way it leans. */
function toggle(ctx: OfflineAudioContext, source: AudioBuffer | null, up: boolean): void {
  const bus = out(ctx, { drive: 6 });
  const [a, b] = up ? [1500, 2500] : [2500, 1200];
  for (const [i, freq] of [a!, b!].entries()) {
    const at = i * 0.05;
    const level = env(ctx, [
      [at, 0],
      [at + 0.002, 0.26],
      [at + 0.03, 0],
    ]);
    const shell = filter(ctx, "bandpass", freq, 2.4);
    level.connect(shell);
    shell.connect(bus);
    if (source) play(ctx, source, level, at, up ? 1.12 : 0.9);
    else noise(ctx, 0.04, 0x6600 + i, at).connect(level);
  }
}

/**
 * A window opening. The chirp climbs in four hard steps rather than gliding —
 * a period UI sound is a lookup table, not a portamento.
 */
function dialogOpen(ctx: OfflineAudioContext, source: AudioBuffer | null, up = true): void {
  const bus = out(ctx, { space: [0.12, 4], wet: 0.2 });
  const steps = up ? [420, 620, 840, 1180] : [1180, 840, 620, 420];
  const level = env(ctx, [
    [0, 0],
    [0.006, 0.2],
    [0.16, 0.18],
    [0.2, 0],
  ]);
  level.connect(bus);
  if (source) {
    play(ctx, source, level, 0, up ? 1 : 0.72);
  } else {
    const o = osc(ctx, "square", steps[0]!, 0, 0.2);
    for (const [i, freq] of steps.entries()) o.frequency.setValueAtTime(freq, i * 0.04);
    o.connect(gain(ctx, 0.5)).connect(level);
  }
  strike(ctx, bus, 0, [1900, 2600], 0.03, 0.25);
}

/**
 * The system ding, unwell. A bell rendered and then played *backwards*, so the
 * attack arrives at the end and the software sounds like it is about to say
 * something. Tritone, because a ding that resolves is a ding that is fine.
 */
async function errorDing(ctx: OfflineAudioContext, source: AudioBuffer | null): Promise<void> {
  const bus = out(ctx, { drive: 7, space: [0.7, 2.2], wet: 0.45 });
  const bell =
    source ??
    (await preRender(0.7, (c) => {
      const level = env(c, [
        [0, 0],
        [0.003, 0.5],
        [0.68, 0],
      ]);
      level.connect(c.destination);
      for (const [i, freq] of [740, 1046.5, 1560].entries()) {
        const o = osc(c, "sine", freq, 0, 0.7);
        o.connect(gain(c, 0.8 - i * 0.22)).connect(level);
      }
    }));
  play(ctx, reversed(ctx, bell), bus, 0);
  // ...and then it lands, forwards, an octave down, as if it meant to.
  play(ctx, bell, bus, 0.66, 0.5);
}

// ---------------------------------------------------------------------------
// The bed. These two are looped by `ambient.ts` and never fired as one-shots;
// they're here because the bed's voices deserve the same swap-in path as
// everything else.
// ---------------------------------------------------------------------------

/** A crowd two fields away, in weather. Fever decides how close it gets. */
function ambientCrowd(ctx: OfflineAudioContext, source: AudioBuffer | null): void {
  const bus = out(ctx);
  const wander = gain(ctx, 0.5);
  // A slow deterministic swell — a crowd is never at one level, and an
  // unmoving noise bed reads instantly as a noise bed.
  const rand = lcg(0x77aa3);
  wander.gain.setValueAtTime(0.7, 0);
  for (let i = 0; i < 40; i++) {
    wander.gain.linearRampToValueAtTime(0.45 + rand() * 0.55, (i + 1) * 0.11);
  }
  wander.connect(bus);
  const voice = source ? sampleVoice(ctx, source) : noise(ctx, 4.4, 0x2be71);
  for (const [freq, q, level] of [
    [420, 1.2, 0.5],
    [980, 1.6, 0.32],
    [2400, 0.8, 0.16],
  ] as const) {
    const band = filter(ctx, "bandpass", freq, q);
    voice.connect(band);
    band.connect(gain(ctx, level)).connect(wander);
  }
}

/**
 * Tape. Hiss, mains hum and a flutter — the layer that says this is all being
 * played back off something. Its wow is driven live by fever in `ambient.ts`,
 * which is the "the audio detunes" pillar taken literally.
 */
function ambientTape(ctx: OfflineAudioContext, source: AudioBuffer | null): void {
  const bus = out(ctx);
  const flutter = gain(ctx, 1);
  for (let i = 0; i * 0.135 < 4.4; i++) {
    flutter.gain.setValueAtTime(i % 2 === 0 ? 1 : 0.82, i * 0.135);
  }
  flutter.connect(bus);
  const hiss = filter(ctx, "highpass", 2600);
  hiss.connect(gain(ctx, 0.22)).connect(flutter);
  if (source) sampleVoice(ctx, source).connect(hiss);
  else noise(ctx, 4.4, 0x1f0c4).connect(hiss);
  for (const [freq, level] of [
    [50, 0.05],
    [150, 0.018],
  ] as const) {
    osc(ctx, "sine", freq, 0, 4.4).connect(gain(ctx, level)).connect(flutter);
  }
}

// ---------------------------------------------------------------------------

export const RECIPES: Record<SoundName, Recipe> = {
  "spike-truck": {
    want: "airhorn, dry, single sustained blast, <1s",
    seconds: 1.1,
    build: truckHorn,
  },
  "spike-win": {
    want: "stadium pyro mortar or close firework thud, dry, <2s",
    seconds: 2.6,
    build: winBlast,
  },
  "spike-rocket": {
    want: "small solid rocket motor or two-stroke engine, dry, ~1s",
    seconds: 2.5,
    build: rocketFizzle,
  },
  "spike-beacon": {
    want: "warning klaxon / reversing beacon, one cycle, dry, <0.5s",
    seconds: 2.3,
    build: beaconDrop,
  },
  "spike-mascot-cheer": {
    want: "cheap MIDI brass fanfare, three rising notes, ~1.5s",
    seconds: 1.5,
    build: (ctx, source) => mascotSting(ctx, source, true),
  },
  "spike-mascot-flop": {
    want: "sad trombone, one fall, ~1.5s (same patch as the fanfare)",
    seconds: 1.6,
    build: (ctx, source) => mascotSting(ctx, source, false),
  },
  "spike-stare": {
    want: "cheap MIDI choir pad, one held minor chord, ~3s",
    seconds: 3.1,
    build: stareDown,
  },
  "spike-deep-space": {
    want: "sine arpeggio with long delay, documentary-space cue, ~4s",
    seconds: 4.1,
    build: deepSpace,
  },
  "spike-cherub": {
    want: "MIDI harp gliss into a synth choir pad, ~3s",
    seconds: 3.6,
    build: cherubVisit,
  },
  "spike-callout": {
    want: "orchestra hit / MIDI stab, one shot, dry, <1s",
    seconds: 1.3,
    build: calloutHit,
  },

  "spike-mower": {
    want: "small petrol engine idling, steady, ~4.5s",
    seconds: 4.55,
    build: mowerIdle,
  },
  "spike-bumpers": {
    want: "small electric motor, short run, dry, <0.5s",
    seconds: 1.4,
    build: bumpersUp,
  },
  "spike-slab": {
    want: "heavy concrete or stone block landing, dry, <1s",
    seconds: 2.3,
    build: slabDrop,
  },
  "spike-pins": {
    want: "bowling pins struck, full crash, dry, ~1s",
    seconds: 2.5,
    build: pinScatter,
  },
  "spike-shells": {
    want: "wooden cup or bowl set down on wood, dry, <0.5s",
    seconds: 3.5,
    build: shellGame,
  },
  "spike-score": {
    want: "electromechanical relay clack, dry, <0.2s",
    seconds: 2.95,
    build: scoreLie,
  },
  "spike-solve": {
    want: "single square-wave computer blip, dry, <0.1s",
    seconds: 2.65,
    build: laneSolve,
  },
  "spike-pinsetter": {
    want: "hydraulic ram or pneumatic machine step, dry, ~1s",
    seconds: 3.9,
    build: pinsetter,
  },

  "spike-cannon": {
    want: "circus cannon or mortar report, dry, single blast, <1s",
    seconds: 3.5,
    build: cannonShot,
  },
  "spike-piano": {
    want: "grand piano struck as a cluster, all strings, ~2s",
    seconds: 3.35,
    build: pianoDrop,
  },
  "spike-wrecking": {
    want: "heavy chain rattling under load, steady, ~2s",
    seconds: 3.95,
    build: wreckingBall,
  },
  "spike-mirror": {
    want: "small winch motor, one short run, dry, <1s",
    seconds: 4.35,
    build: mirrorBall,
  },
  "spike-washer": {
    want: "rubber squeegee squeaking on glass, one stroke, dry, <1s",
    seconds: 4.15,
    build: windowWasher,
  },
  "spike-finger": {
    want: "PA crowd cheer, canned and distant, ~2.5s",
    seconds: 3.15,
    build: foamFinger,
  },

  "disc-drop": { want: "short air whoosh / cloth swipe, dry, <0.5s", seconds: 0.32, build: discDrop },
  "disc-land": { want: "coin or poker chip on hard lacquer, dry, <1s", seconds: 0.75, build: discLand },
  "column-hover": { want: "tiny UI tick, dry, <0.1s", seconds: 0.06, build: columnHover },

  "match-start": {
    want: "distant crowd swell / fairground PA sting, ~2s",
    seconds: 1.7,
    build: matchStart,
  },
  "turn-yours": { want: "PA chime, two pips, dry, <0.5s", seconds: 0.45, build: turnYours },

  "ui-click": { want: "beige plastic button click, dry, <0.1s", seconds: 0.07, build: uiClick },
  "toggle-on": {
    want: "rocker switch, mechanical, dry, <0.2s",
    seconds: 0.15,
    build: (ctx, source) => toggle(ctx, source, true),
  },
  "toggle-off": {
    want: "rocker switch, mechanical, dry, <0.2s (same switch as toggle-on)",
    seconds: 0.15,
    build: (ctx, source) => toggle(ctx, source, false),
  },
  "dialog-open": {
    want: "90s OS window chirp, dry, <0.3s",
    seconds: 0.35,
    build: (ctx, source) => dialogOpen(ctx, source, true),
  },
  "dialog-close": {
    want: "90s OS window chirp, dry, <0.3s (same chirp as dialog-open)",
    seconds: 0.35,
    build: (ctx, source) => dialogOpen(ctx, source, false),
  },
  "error-ding": { want: "small struck bell or system ding, dry, <1s", seconds: 1.5, build: errorDing },

  "ambient-crowd": {
    want: "distant crowd murmur, no distinct voices, loopable, 4s+",
    seconds: 4.4,
    build: ambientCrowd,
  },
  "ambient-tape": {
    want: "tape hiss with mains hum, loopable, 4s+",
    seconds: 4.4,
    build: ambientTape,
  },
};

export const SOUND_NAMES = Object.keys(RECIPES) as SoundName[];

const cache = new Map<SoundName, Promise<AudioBuffer>>();

async function render(name: SoundName): Promise<AudioBuffer> {
  const recipe = RECIPES[name];
  const ctx = new OfflineAudioContext(2, Math.max(1, Math.floor(RATE * recipe.seconds)), RATE);
  // The sample has to be decoded and the graph fully scheduled before
  // rendering starts — an offline context renders faster than real time and
  // will not wait for a fetch.
  await recipe.build(ctx, await loadSample(name, ctx));
  return limit(await ctx.startRendering());
}

/**
 * Scale a rendered buffer down if it went past full scale, and only then.
 *
 * A recipe is written as a mix — dry plus a convolver send plus a strike on
 * top — and the sum lands where it lands; several of them peaked around 1.4.
 * That's the sound card clipping, which is the wrong kind of broken: it's
 * inconsistent, it changes with the volume slider, and it isn't in any recipe.
 * Scaling down (never up) leaves the loudness relationships between sounds
 * exactly as authored, which is what a normalizer would destroy — the
 * sprinkler is supposed to be 30dB under the airhorn.
 */
function limit(buffer: AudioBuffer): AudioBuffer {
  let peak = 0;
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const data = buffer.getChannelData(ch);
    for (let i = 0; i < data.length; i++) {
      const v = Math.abs(data[i]!);
      if (v > peak) peak = v;
    }
  }
  if (peak <= 0.95) return buffer;
  const scale = 0.95 / peak;
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const data = buffer.getChannelData(ch);
    for (let i = 0; i < data.length; i++) data[i] = data[i]! * scale;
  }
  return buffer;
}

export function soundBuffer(name: SoundName): Promise<AudioBuffer> {
  let cached = cache.get(name);
  if (!cached) {
    // A failed render must not be remembered. WebKit will refuse or stall an
    // offline render on a page that isn't in front, and a rejected promise
    // left in this map is a sound that never plays again for the rest of the
    // session — with no error, because every caller of a cached promise gets
    // the *first* attempt's failure forever. Dropping it means the next call
    // simply tries again, on a page that is now probably in front.
    cached = render(name).catch((e) => {
      cache.delete(name);
      throw e;
    });
    cache.set(name, cached);
  }
  return cached;
}
