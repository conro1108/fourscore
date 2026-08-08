/**
 * The ambient bed: a live node graph, not a loop of samples, because its whole
 * job is to *move* with fever and parameters move where buffers can't.
 *
 * Two voices:
 * - The drone: two saws a hair apart at A1 through a lowpass. At fever 0 the
 *   filter is nearly shut and the beat between them is slow breathing; fever
 *   opens the filter and pulls the detune wide, which is the "audio detunes"
 *   pillar made literal.
 * - The choir: a quiet, slightly wrong A-major cluster that only exists above
 *   mid-fever — the vaguely religious half of the void, arriving when things
 *   get serious.
 *
 * `update(fever)` is called at a human rate (the runtime, ~12Hz); every param
 * moves through setTargetAtTime so nothing zippers.
 */

import { convolver, distortion } from "./mangle.js";

export interface AmbientBed {
  update(fever: number): void;
}

export function startAmbient(ctx: AudioContext, bus: GainNode): AmbientBed {
  // -- drone -----------------------------------------------------------------
  const droneGain = ctx.createGain();
  droneGain.gain.value = 0.0;
  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = 170;
  filter.Q.value = 2.2;
  const grit = distortion(ctx, 8);

  const saws: OscillatorNode[] = [];
  for (const sign of [1, -1]) {
    const osc = ctx.createOscillator();
    osc.type = "sawtooth";
    osc.frequency.value = 55;
    osc.detune.value = sign * 4;
    osc.connect(grit);
    osc.start();
    saws.push(osc);
  }
  grit.connect(filter);
  filter.connect(droneGain);
  droneGain.connect(bus);

  // -- choir -----------------------------------------------------------------
  // A cathedral that shouldn't be there: sines through a long convolver.
  const choirGain = ctx.createGain();
  choirGain.gain.value = 0.0;
  const nave = convolver(ctx, 2.8, 2.2);
  const choirOscs: OscillatorNode[] = [];
  for (const freq of [220, 277.18, 329.63]) {
    const osc = ctx.createOscillator();
    osc.type = "sine";
    // A few cents off on purpose; a choir in tune would be reassuring.
    osc.detune.value = (freq % 7) - 3;
    osc.frequency.value = freq;
    const voice = ctx.createGain();
    voice.gain.value = 0.33;
    osc.connect(voice);
    voice.connect(nave);
    osc.start();
    choirOscs.push(osc);
  }
  nave.connect(choirGain);
  choirGain.connect(bus);

  // -- fever mapping ---------------------------------------------------------
  const SMOOTH = 0.25;
  return {
    update(fever: number) {
      const f = Math.max(0, Math.min(1, fever));
      const now = ctx.currentTime;
      // Filter sweeps 170Hz → ~1.4kHz, exponentially — the bed sharpens.
      filter.frequency.setTargetAtTime(170 * Math.pow(8.2, f), now, SMOOTH);
      droneGain.gain.setTargetAtTime(0.05 + 0.035 * f, now, SMOOTH);
      // Detune spreads from a slow beat to a genuinely sick wobble.
      const spread = 4 + 42 * f * f;
      saws[0]!.detune.setTargetAtTime(spread, now, SMOOTH);
      saws[1]!.detune.setTargetAtTime(-spread, now, SMOOTH);
      // The choir fades in above mid-fever and drifts sharper as it grows.
      const presence = Math.max(0, (f - 0.45) / 0.55);
      choirGain.gain.setTargetAtTime(0.055 * presence, now, SMOOTH * 2);
      for (const [i, osc] of choirOscs.entries()) {
        osc.detune.setTargetAtTime(((i * 7) % 11) - 5 + 14 * presence, now, SMOOTH * 2);
      }
    },
  };
}
