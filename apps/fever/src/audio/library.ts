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

export type SoundName = "spike-truck";

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

const RECIPES: Record<SoundName, () => Promise<AudioBuffer>> = {
  "spike-truck": truckHorn,
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
