/**
 * The ambient bed: a live node graph, not a loop of samples, because its whole
 * job is to *move* with fever and parameters move where buffers can't.
 *
 * Four voices, two synthesized here and two looped off the library:
 * - The drone: two saws a hair apart at A1 through a lowpass. At fever 0 the
 *   filter is nearly shut and the beat between them is slow breathing; fever
 *   opens the filter and pulls the detune wide, which is the "audio detunes"
 *   pillar made literal.
 * - The choir: a quiet, slightly wrong A-major cluster that only exists above
 *   mid-fever — the vaguely religious half of the void, arriving when things
 *   get serious.
 * - The crowd (`ambient-crowd`): an alley happening somewhere you can't see.
 *   Fever walks you toward it.
 * - The tape (`ambient-tape`): hiss and mains hum, always there, the layer
 *   that says all of this is being played back off something. Its wow is a
 *   real pitch wobble on the loop and fever deepens it, which is the one place
 *   the game audibly stops running at the right speed.
 *
 * The two loops arrive late — they're offline renders — and simply fade in
 * whenever they're ready. Nothing waits for them.
 *
 * `update(fever)` is called at a human rate (the runtime, ~12Hz); every param
 * moves through setTargetAtTime so nothing zippers.
 */

import { soundBuffer } from "./library.js";
import { convolver, distortion } from "./mangle.js";
import { loopify } from "./synth.js";

export interface AmbientBed {
  update(fever: number): void;
  /** Which of the two loops have arrived. Both failing is silent otherwise. */
  loops(): { crowd: boolean; tape: boolean };
}

/** A seamless looping voice off a rendered buffer, with a live pitch wobble. */
interface Loop {
  gain: GainNode;
  tone: BiquadFilterNode;
  wow: GainNode;
}

function startLoop(ctx: AudioContext, bus: GainNode, buffer: AudioBuffer, tone: number): Loop {
  const g = ctx.createGain();
  g.gain.value = 0;
  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = tone;
  const source = ctx.createBufferSource();
  source.buffer = loopify(ctx, buffer, 0.4);
  source.loop = true;

  // The wobble: a slow LFO into the loop's own detune. Depth is set by fever.
  const lfo = ctx.createOscillator();
  lfo.type = "sine";
  lfo.frequency.value = 0.7;
  const wow = ctx.createGain();
  wow.gain.value = 0;
  lfo.connect(wow);
  wow.connect(source.detune);
  lfo.start();

  source.connect(filter);
  filter.connect(g);
  g.connect(bus);
  source.start();
  return { gain: g, tone: filter, wow };
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

  // -- the two loops ---------------------------------------------------------
  let crowd: Loop | null = null;
  let tape: Loop | null = null;
  void soundBuffer("ambient-crowd").then((b) => (crowd = startLoop(ctx, bus, b, 1400)));
  void soundBuffer("ambient-tape").then((b) => (tape = startLoop(ctx, bus, b, 12000)));

  // -- fever mapping ---------------------------------------------------------
  const SMOOTH = 0.25;
  return {
    loops: () => ({ crowd: crowd !== null, tape: tape !== null }),
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
      // The room gets closer and brighter; you are never quite in it.
      if (crowd) {
        crowd.gain.gain.setTargetAtTime(0.02 + 0.11 * f * f, now, SMOOTH * 3);
        crowd.tone.frequency.setTargetAtTime(900 + 2600 * f, now, SMOOTH * 3);
      }
      // And the tape holding all of it starts to slip.
      if (tape) {
        tape.gain.gain.setTargetAtTime(0.055 + 0.02 * f, now, SMOOTH * 3);
        tape.wow.gain.setTargetAtTime(4 + 46 * f * f, now, SMOOTH * 3);
      }
    },
  };
}
