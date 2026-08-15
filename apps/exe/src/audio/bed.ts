/**
 * The machine you are sitting at.
 *
 * A 1995 desktop is never silent — a fan, a transformer, and a CRT's flyback
 * whining at the line frequency. That is the bed, and it is a live node graph
 * rather than a rendered loop for the same reason `flames.scr` is an automaton
 * rather than a gif: it has to *move*. Fever is the machine working harder, and
 * you should be able to hear the position sharpening with the desktop covered
 * up and every window shut.
 *
 * Nothing here is a sound effect. It is furniture that happens to be audible,
 * so all four voices live under the point where you'd call them a noise — the
 * test is that muting it should feel like the room got smaller, not like a
 * sound stopped.
 */

import { filter, gain, loopify, noiseBuffer } from "./synth.js";

export interface Bed {
  update(fever: number): void;
  /**
   * Advance the housekeeping clock by `seconds` and call `fire` when the disk
   * is next asked for something. The bed owns this rather than the bus because
   * the schedule is scaled by the fever it was last handed.
   */
  tick(seconds: number, fire: () => void): void;
}

/**
 * How long the machine leaves the disk alone, in order, cycled. Fixed rather
 * than random: wrongness repeats (VISION.md), and a pattern of gaps you can
 * almost learn is what a real machine's housekeeping sounds like. Fever
 * compresses the whole schedule rather than picking from a shorter list, so
 * the same rhythm arrives faster instead of becoming a different rhythm.
 */
const SEEK_GAPS: readonly number[] = [7.3, 4.1, 11.7, 2.9, 6.2, 15.4, 3.3, 8.8];

export function startBed(ctx: AudioContext, bus: GainNode): Bed {
  /* ---- mains hum: the transformer, and its first two harmonics ---- */
  const humGain = gain(ctx, 0.03);
  const humTone = filter(ctx, "lowpass", 320, 1.2);
  for (const [i, f] of [60, 120, 180].entries()) {
    const o = ctx.createOscillator();
    o.type = "sine";
    o.frequency.value = f;
    const v = gain(ctx, [1, 0.4, 0.18][i]!);
    o.connect(v);
    v.connect(humTone);
    o.start();
  }
  humTone.connect(humGain);
  humGain.connect(bus);

  /* ---- the fan: noise, looped off a buffer so it costs nothing per frame ---- */
  const fanGain = gain(ctx, 0.02);
  const fanTone = filter(ctx, "lowpass", 420, 0.7);
  const fan = ctx.createBufferSource();
  fan.buffer = loopify(ctx, noiseBuffer(ctx, 3, 0xfa27a), 0.5);
  fan.loop = true;
  fan.connect(fanTone);
  fanTone.connect(fanGain);
  fanGain.connect(bus);
  fan.start();

  /* ---- the flyback: a CRT's horizontal scan, which is a real 15.7kHz and
     the reason a room with a monitor in it sounds different. Quiet enough to
     be deniable at rest; the fever is what makes you notice it. ---- */
  const whineGain = gain(ctx, 0.004);
  const whine = ctx.createOscillator();
  whine.type = "sine";
  whine.frequency.value = 15734;
  whine.connect(whineGain);
  whineGain.connect(bus);
  whine.start();

  let gapIndex = 0;
  let nextSeek = SEEK_GAPS[0]!;
  let heat = 0;

  const SMOOTH = 0.4;
  return {
    update(fever: number) {
      const f = Math.max(0, Math.min(1, fever));
      heat = f;
      const now = ctx.currentTime;
      // the fan spins up and gets brighter — the machine under load
      fanGain.gain.setTargetAtTime(0.02 + 0.05 * f * f, now, SMOOTH);
      fanTone.frequency.setTargetAtTime(420 + 1500 * f, now, SMOOTH);
      // the supply starts to buzz rather than hum
      humGain.gain.setTargetAtTime(0.03 + 0.026 * f, now, SMOOTH);
      humTone.frequency.setTargetAtTime(320 + 900 * f * f, now, SMOOTH);
      // and the flyback slips off its own line frequency, which is the one
      // thing in here a working monitor never does
      whineGain.gain.setTargetAtTime(0.004 + 0.013 * f, now, SMOOTH);
      whine.frequency.setTargetAtTime(15734 - 900 * f * f, now, SMOOTH * 2);
    },

    tick(seconds, fire) {
      // The whole schedule compresses with fever rather than being redrawn, so
      // at 1.0 it is the same uneven rhythm arriving five times as often and
      // not a different machine.
      nextSeek -= seconds / (1 - 0.82 * heat);
      if (nextSeek > 0) return;
      fire();
      gapIndex = (gapIndex + 1) % SEEK_GAPS.length;
      nextSeek = SEEK_GAPS[gapIndex]!;
    },
  };
}
