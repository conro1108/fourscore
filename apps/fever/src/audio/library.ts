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
  | "spike-sign"
  | "spike-beacon"
  | "spike-banner-rising"
  | "spike-banner-collapsing"
  | "spike-banner-draw"
  | "spike-sprinkler"
  | "spike-mascot-cheer"
  | "spike-mascot-flop"
  | "spike-callout"
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
 * that bends *up* a whole tone and refuses to resolve — the sound of a rally
 * PA being asked to do something a rally PA cannot do. Longer than anything
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
  // stops there. Nothing resolves; the rally just ends.
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

/** A sign says HMM. Two wooden clacks and a nasal descending hum between them. */
function signHmm(ctx: OfflineAudioContext, source: AudioBuffer | null): void {
  const bus = out(ctx, { drive: 8, space: [0.22, 3], wet: 0.25 });
  strike(ctx, bus, 0, [420, 611], 0.09, 0.5);
  strike(ctx, bus, 1.05, [392, 570], 0.08, 0.4);

  // The hum, waggling on the step clock rather than wobbling smoothly.
  const waggle = gain(ctx, 0.7);
  waggle.gain.setValueAtTime(0.7, 0);
  for (let i = 0; i < 12; i++) {
    waggle.gain.setValueAtTime(i % 2 === 0 ? 0.85 : 0.55, 0.08 + i * 0.0833);
  }
  const level = env(ctx, [
    [0.06, 0],
    [0.12, 0.3],
    [0.85, 0.26],
    [1.02, 0],
  ]);
  const nasal = filter(ctx, "bandpass", 520, 6);
  waggle.connect(level);
  level.connect(nasal);
  nasal.connect(bus);
  if (source) {
    sampleVoice(ctx, source, { at: 0.5, to: 0.84, over: 0.45 }).connect(waggle);
    return;
  }
  for (const freq of [196, 197.6]) {
    const o = osc(ctx, "triangle", freq, 0.06, 1.05);
    o.frequency.setValueAtTime(freq, 0.5);
    o.frequency.linearRampToValueAtTime(freq * 0.84, 0.95);
    o.connect(waggle);
  }
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
 * The tow plane. One engine, one flyby, and three PA barks along the banner —
 * the barks are what makes the banner a rhythm rather than a word.
 *
 * `steps` pitches the barks; rising steps up, collapsing steps down, and the
 * draw gets exactly one and no bend at all. Same construction all three times,
 * which is the point: it's one plane with three moods, not three sounds.
 */
function flyby(
  ctx: OfflineAudioContext,
  source: AudioBuffer | null,
  opts: { barks: number[]; cough: boolean; passSeconds: number },
): void {
  const bus = out(ctx, { drive: 12, space: [0.9, 2.4], wet: 0.35 });
  const pass = opts.passSeconds;

  // Engine: two saws with a propeller flutter gated at 17Hz, dopplering down
  // across the pass, with the lowpass opening as it comes and closing as it
  // goes.
  const flutter = gain(ctx, 1);
  for (let i = 0; i * 0.0588 < pass; i++) {
    flutter.gain.setValueAtTime(i % 2 === 0 ? 1 : 0.55, i * 0.0588);
  }
  const level = env(ctx, [
    [0, 0],
    [pass * 0.45, 0.26],
    [pass * 0.75, 0.16],
    [pass, 0],
  ]);
  const air = filter(ctx, "lowpass", 700);
  air.frequency.linearRampToValueAtTime(2200, pass * 0.45);
  air.frequency.linearRampToValueAtTime(500, pass);
  flutter.connect(level);
  level.connect(air);
  air.connect(bus);
  if (source) {
    sampleVoice(ctx, source, { at: pass * 0.45, to: 0.86, over: pass * 0.5 }).connect(flutter);
  } else {
    for (const freq of [92, 95.5]) {
      const o = osc(ctx, "sawtooth", freq, 0, pass);
      o.frequency.setValueAtTime(freq, pass * 0.45);
      o.frequency.linearRampToValueAtTime(freq * 0.86, pass);
      o.connect(flutter);
    }
  }

  if (opts.cough) {
    // The engine gives up on the way out. Its own voice either way: a sourced
    // plane sample is a healthy plane, and the cough is the joke.
    const cough = gate(ctx, [pass * 0.8, pass * 0.86, pass * 0.94], 0.04, 0.5);
    cough.connect(bus);
    const dying = osc(ctx, "sawtooth", 90, pass * 0.78, pass);
    dying.frequency.linearRampToValueAtTime(52, pass);
    dying.connect(cough);
  }

  // The barks. Distorted enough that the words are gone and the shape isn't.
  for (const [i, freq] of opts.barks.entries()) {
    const at = 0.95 + i * 0.6;
    const bark = env(ctx, [
      [at, 0],
      [at + 0.012, 0.3],
      [at + 0.2, 0.26],
      [at + 0.28, 0],
    ]);
    const mouth = filter(ctx, "bandpass", freq * 3.4, 2.2);
    bark.connect(mouth);
    mouth.connect(bus);
    osc(ctx, "sawtooth", freq, at, at + 0.3).connect(bark);
    osc(ctx, "square", freq * 1.005, at, at + 0.3).connect(bark);
  }
}

/** Moss's sprinkler: tk-tk-tk and some water. It is never in a hurry either. */
function sprinkler(ctx: OfflineAudioContext, source: AudioBuffer | null): void {
  const bus = out(ctx, { space: [0.4, 2.8], wet: 0.2 });

  // Water, under everything, going nowhere. On before the head is in frame:
  // a sprinkler doesn't start spraying when you look at it.
  const water = env(ctx, [
    [0.02, 0],
    [0.16, 0.12],
    [2.1, 0.1],
    [2.6, 0],
  ]);
  const spray = filter(ctx, "bandpass", 5200, 0.9);
  water.connect(spray);
  spray.connect(bus);
  noise(ctx, 2.6, 0x9c1f0, 0.02).connect(water);

  // The head ticks around at 7Hz, then runs out of enthusiasm.
  const ticks: number[] = [];
  let t = 0.28;
  for (let i = 0; i < 15; i++) {
    ticks.push(t);
    t += i < 11 ? 0.143 : 0.143 * (1 + (i - 10) * 0.5);
  }
  if (source) {
    const tickBus = gain(ctx, 0.5);
    tickBus.connect(bus);
    for (const at of ticks) play(ctx, source, tickBus, at);
    return;
  }
  for (const at of ticks) {
    const tick = env(ctx, [
      [at, 0],
      [at + 0.003, 0.55],
      [at + 0.016, 0],
    ]);
    const metal = filter(ctx, "bandpass", 2600, 8);
    tick.connect(metal);
    metal.connect(bus);
    noise(ctx, 0.02, 0x4410 + Math.round(at * 1000), at).connect(tick);
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

/** A rally PA welcoming you to something. The crowd is real. */
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
  "spike-sign": {
    want: "human 'hmm', close-mic, dry, <1s",
    seconds: 1.3,
    build: signHmm,
  },
  "spike-beacon": {
    want: "warning klaxon / reversing beacon, one cycle, dry, <0.5s",
    seconds: 2.3,
    build: beaconDrop,
  },
  "spike-banner-rising": {
    want: "small propeller plane, steady pass, dry, ~3s",
    seconds: 3.6,
    build: (ctx, source) =>
      flyby(ctx, source, { barks: [220, 247, 277], cough: false, passSeconds: 3.4 }),
  },
  "spike-banner-collapsing": {
    want: "small propeller plane, laboring or missing, dry, ~3s",
    seconds: 3.6,
    build: (ctx, source) =>
      flyby(ctx, source, { barks: [277, 247, 208], cough: true, passSeconds: 3.4 }),
  },
  "spike-banner-draw": {
    want: "PA announcer, one flat syllable, dry, <1s",
    seconds: 2.2,
    build: (ctx, source) =>
      flyby(ctx, source, { barks: [233], cough: false, passSeconds: 2.1 }),
  },
  "spike-sprinkler": {
    want: "impact sprinkler ticking, dry, ~3s",
    seconds: 2.8,
    build: sprinkler,
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
  "spike-callout": {
    want: "orchestra hit / MIDI stab, one shot, dry, <1s",
    seconds: 1.3,
    build: calloutHit,
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
    cached = render(name);
    cache.set(name, cached);
  }
  return cached;
}
