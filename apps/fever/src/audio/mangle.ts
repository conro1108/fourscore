/**
 * The mangling graph — the reason this is raw WebAudio and not a framework.
 * Sounds in this game are never played clean: they go through some chain of
 * pitch, reverse, chop, distortion and cheap convolution, and the mangling
 * *is* the sound design. These are the shared tools; recipes in `library.ts`
 * and the live ambient graph compose them.
 *
 * Everything here is deterministic. The taste law reaches audio too:
 * randomness may pick which sound fires, never how a sound is mangled.
 */

/** Works on both live and offline contexts. */
type AnyContext = BaseAudioContext;

/** A soft-clipping waveshaper. `drive` from ~5 (warm) to ~80 (destroyed). */
export function distortion(ctx: AnyContext, drive: number): WaveShaperNode {
  const shaper = ctx.createWaveShaper();
  const curve = new Float32Array(1024);
  for (let i = 0; i < curve.length; i++) {
    const x = (i / (curve.length - 1)) * 2 - 1;
    curve[i] = Math.tanh(drive * x) / Math.tanh(drive);
  }
  shaper.curve = curve;
  shaper.oversample = "2x";
  return shaper;
}

/**
 * A cheap convolution space: an exponentially decaying noise burst. Short
 * times read as a slapback in a metal shed; long ones as a cathedral that
 * shouldn't be there. Deterministic via a fixed LCG seed.
 */
export function convolver(ctx: AnyContext, seconds: number, decay: number): ConvolverNode {
  const rate = ctx.sampleRate;
  const length = Math.max(1, Math.floor(rate * seconds));
  const impulse = ctx.createBuffer(2, length, rate);
  let seed = 0x4fca5;
  const next = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 0xffffffff;
  };
  for (let ch = 0; ch < 2; ch++) {
    const data = impulse.getChannelData(ch);
    for (let i = 0; i < length; i++) {
      data[i] = (next() * 2 - 1) * Math.pow(1 - i / length, decay);
    }
  }
  const node = ctx.createConvolver();
  node.buffer = impulse;
  return node;
}

/** A reversed copy of a buffer. */
export function reversed(ctx: AnyContext, buffer: AudioBuffer): AudioBuffer {
  const out = ctx.createBuffer(buffer.numberOfChannels, buffer.length, buffer.sampleRate);
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const src = buffer.getChannelData(ch);
    const dst = out.getChannelData(ch);
    for (let i = 0; i < src.length; i++) dst[i] = src[src.length - 1 - i]!;
  }
  return out;
}

/**
 * Granular chop: slice a buffer into grains and reorder them with a fixed
 * deterministic shuffle. The same input always chops the same way.
 */
export function chopped(ctx: AnyContext, buffer: AudioBuffer, grainMs: number): AudioBuffer {
  const grain = Math.max(1, Math.floor((buffer.sampleRate * grainMs) / 1000));
  const count = Math.floor(buffer.length / grain);
  const order = Array.from({ length: count }, (_, i) => i);
  let seed = 0xbeef1;
  for (let i = count - 1; i > 0; i--) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    const j = seed % (i + 1);
    const a = order[i]!;
    order[i] = order[j]!;
    order[j] = a;
  }
  const out = ctx.createBuffer(buffer.numberOfChannels, buffer.length, buffer.sampleRate);
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const src = buffer.getChannelData(ch);
    const dst = out.getChannelData(ch);
    for (let g = 0; g < count; g++) {
      dst.set(src.subarray(order[g]! * grain, (order[g]! + 1) * grain), g * grain);
    }
  }
  return out;
}
