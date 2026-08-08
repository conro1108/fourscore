/**
 * The sound library. Sounds are addressed by semantic name, never filename —
 * "spike-truck" is what the moment means, and phase 4 can swap the synthesis
 * for a mangled CC0 sample without a caller changing.
 *
 * Every entry is a recipe: synthesize (or later, load) a dry source into an
 * OfflineAudioContext, push it through the mangling graph, hand back a
 * rendered buffer. Recipes run once and cache.
 */

import { convolver, distortion } from "./mangle.js";

export type SoundName = "spike-truck" | "spike-win";

/**
 * The signature spike: an airhorn that has been left in the rain. Three
 * detuned saws beating against each other, a fifth-down pitch fall at the
 * tail, soft-clipped hard and slapped through a shed-sized convolver. Tuned
 * by ear against the truck's entrance — it should read as SUNDAY SUNDAY
 * SUNDAY from inside a fever.
 */
async function truckHorn(): Promise<AudioBuffer> {
  const rate = 44100;
  const ctx = new OfflineAudioContext(2, Math.floor(rate * 1.1), rate);

  const out = ctx.createGain();
  const crush = distortion(ctx, 26);
  const shed = convolver(ctx, 0.18, 3.5);
  const shedMix = ctx.createGain();
  shedMix.gain.value = 0.45;
  const lowpass = ctx.createBiquadFilter();
  lowpass.type = "lowpass";
  lowpass.frequency.value = 2400;

  out.connect(crush);
  crush.connect(lowpass);
  lowpass.connect(ctx.destination);
  lowpass.connect(shed);
  shed.connect(shedMix);
  shedMix.connect(ctx.destination);

  for (const freq of [233, 236.5, 118.6]) {
    const osc = ctx.createOscillator();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(freq, 0);
    // The blast holds, then the horn gives up: a fifth-down fall.
    osc.frequency.setValueAtTime(freq, 0.55);
    osc.frequency.exponentialRampToValueAtTime(freq * 0.667, 0.85);
    osc.connect(out);
    osc.start(0);
    osc.stop(0.9);
  }

  out.gain.setValueAtTime(0, 0);
  out.gain.linearRampToValueAtTime(0.5, 0.02);
  out.gain.setValueAtTime(0.5, 0.7);
  out.gain.linearRampToValueAtTime(0, 0.9);

  return ctx.startRendering();
}

/**
 * The detonation. A pyro thud under a noise blast, and over the top a chord
 * that bends *up* a whole tone and refuses to resolve — the sound of a rally PA
 * being asked to do something a rally PA cannot do. Longer than anything else
 * in the game, because the win is the biggest thing in the game.
 *
 * Phase 4 owns the rest of the one-shots; this one is here because a silent
 * detonation is a broken detonation, not a placeholder.
 */
async function winBlast(): Promise<AudioBuffer> {
  const rate = 44100;
  const ctx = new OfflineAudioContext(2, Math.floor(rate * 2.6), rate);

  const crush = distortion(ctx, 14);
  const hall = convolver(ctx, 1.4, 2.2);
  const hallMix = ctx.createGain();
  hallMix.gain.value = 0.55;
  crush.connect(ctx.destination);
  crush.connect(hall);
  hall.connect(hallMix);
  hallMix.connect(ctx.destination);

  // The blast: filtered noise, gone in a quarter second, all body.
  const noise = ctx.createBuffer(1, Math.floor(rate * 0.5), rate);
  const data = noise.getChannelData(0);
  let seed = 0x51f7d;
  for (let i = 0; i < data.length; i++) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    data[i] = (seed / 0xffffffff) * 2 - 1;
  }
  const blast = ctx.createBufferSource();
  blast.buffer = noise;
  const blastGain = ctx.createGain();
  const boom = ctx.createBiquadFilter();
  boom.type = "lowpass";
  boom.frequency.setValueAtTime(1800, 0);
  boom.frequency.exponentialRampToValueAtTime(90, 0.45);
  blast.connect(boom);
  boom.connect(blastGain);
  blastGain.connect(crush);
  blastGain.gain.setValueAtTime(0.9, 0);
  blastGain.gain.exponentialRampToValueAtTime(0.001, 0.5);
  blast.start(0);

  // The chord: a major triad that bends a tone sharp over two seconds and
  // stops there. Nothing resolves; the rally just ends.
  const chord = ctx.createGain();
  chord.connect(crush);
  chord.gain.setValueAtTime(0, 0.02);
  chord.gain.linearRampToValueAtTime(0.28, 0.09);
  chord.gain.setValueAtTime(0.28, 1.6);
  chord.gain.linearRampToValueAtTime(0, 2.4);
  for (const freq of [110, 138.6, 164.8, 220]) {
    const osc = ctx.createOscillator();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(freq, 0);
    osc.frequency.setValueAtTime(freq, 0.6);
    osc.frequency.linearRampToValueAtTime(freq * 1.122, 2.3);
    osc.connect(chord);
    osc.start(0);
    osc.stop(2.5);
  }

  return ctx.startRendering();
}

const RECIPES: Record<SoundName, () => Promise<AudioBuffer>> = {
  "spike-truck": truckHorn,
  "spike-win": winBlast,
};

const cache = new Map<SoundName, Promise<AudioBuffer>>();

export function soundBuffer(name: SoundName): Promise<AudioBuffer> {
  let cached = cache.get(name);
  if (!cached) {
    cached = RECIPES[name]();
    cache.set(name, cached);
  }
  return cached;
}
