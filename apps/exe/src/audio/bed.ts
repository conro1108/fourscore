/**
 * The ambient bed: fan, transformer hum, CRT flyback, disk seeks. A live node
 * graph (not a rendered loop) so fever can bend it. Every voice stays below the
 * level you'd call a noise; muting should feel like the room got smaller.
 */

import { filter, gain, loopify, noiseBuffer } from "./synth.js";

export interface Bed {
  update(fever: number): void;
  /** Advance the seek clock by `seconds`; `fire` when the disk is next touched. Scaled by last fever. */
  tick(seconds: number, fire: () => void): void;
}

/** Seconds between disk seeks, cycled. Fixed, not random (wrongness repeats); fever compresses the whole schedule. */
const SEEK_GAPS: readonly number[] = [7.3, 4.1, 11.7, 2.9, 6.2, 15.4, 3.3, 8.8];

export function startBed(ctx: AudioContext, bus: GainNode): Bed {
  /* mains hum: 60Hz and first two harmonics */
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

  /* fan: looped noise buffer */
  const fanGain = gain(ctx, 0.02);
  const fanTone = filter(ctx, "lowpass", 420, 0.7);
  const fan = ctx.createBufferSource();
  fan.buffer = loopify(ctx, noiseBuffer(ctx, 3, 0xfa27a), 0.5);
  fan.loop = true;
  fan.connect(fanTone);
  fanTone.connect(fanGain);
  fanGain.connect(bus);
  fan.start();

  /* flyback: CRT horizontal scan, real 15.7kHz. Deniable at rest; fever brings it up. */
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
      // fan louder and brighter under load
      fanGain.gain.setTargetAtTime(0.02 + 0.05 * f * f, now, SMOOTH);
      fanTone.frequency.setTargetAtTime(420 + 1500 * f, now, SMOOTH);
      // hum becomes buzz
      humGain.gain.setTargetAtTime(0.03 + 0.026 * f, now, SMOOTH);
      humTone.frequency.setTargetAtTime(320 + 900 * f * f, now, SMOOTH);
      // flyback drifts off line frequency — what a working monitor never does
      whineGain.gain.setTargetAtTime(0.004 + 0.013 * f, now, SMOOTH);
      whine.frequency.setTargetAtTime(15734 - 900 * f * f, now, SMOOTH * 2);
    },

    tick(seconds, fire) {
      // same rhythm ~5x faster at fever 1.0, not a different rhythm
      nextSeek -= seconds / (1 - 0.82 * heat);
      if (nextSeek > 0) return;
      fire();
      gapIndex = (gapIndex + 1) % SEEK_GAPS.length;
      nextSeek = SEEK_GAPS[gapIndex]!;
    },
  };
}
