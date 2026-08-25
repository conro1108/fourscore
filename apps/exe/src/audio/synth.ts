/**
 * Synth primitives for `library.ts` recipes. Fully deterministic: the same
 * recipe renders the same bytes. Randomness may pick which sound fires, never how it sounds.
 */

/** Everything renders at one rate; a mismatch resamples silently. */
export const RATE = 44100;

/** The only random source in audio; fixed-seeded. */
export function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}

/** White noise, `seconds` long, seeded. */
export function noiseBuffer(ctx: BaseAudioContext, seconds: number, seed: number): AudioBuffer {
  const length = Math.max(1, Math.floor(ctx.sampleRate * seconds));
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  const rand = lcg(seed);
  for (let i = 0; i < length; i++) data[i] = rand() * 2 - 1;
  return buffer;
}

/** A started noise source. `at` is when it begins. */
export function noise(
  ctx: BaseAudioContext,
  seconds: number,
  seed: number,
  at = 0,
): AudioBufferSourceNode {
  const source = ctx.createBufferSource();
  source.buffer = noiseBuffer(ctx, seconds, seed);
  source.start(at);
  return source;
}

/** A started oscillator. Stops at `until` so the render doesn't drone past it. */
export function osc(
  ctx: BaseAudioContext,
  type: OscillatorType,
  freq: number,
  at = 0,
  until?: number,
): OscillatorNode {
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(freq, 0);
  o.start(at);
  if (until !== undefined) o.stop(until);
  return o;
}

/**
 * Gain envelope from `[time, value]` breakpoints, linear between them — on purpose.
 * Exponential decay sounds like a synth preset; audible corners are the period artifact.
 */
export function env(ctx: BaseAudioContext, points: readonly [number, number][]): GainNode {
  const g = ctx.createGain();
  const first = points[0]!;
  g.gain.setValueAtTime(first[1], first[0]);
  for (const [t, v] of points.slice(1)) g.gain.linearRampToValueAtTime(v, t);
  return g;
}

export function filter(
  ctx: BaseAudioContext,
  type: BiquadFilterType,
  freq: number,
  q = 1,
): BiquadFilterNode {
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.setValueAtTime(freq, 0);
  f.Q.value = q;
  return f;
}

export function gain(ctx: BaseAudioContext, value: number): GainNode {
  const g = ctx.createGain();
  g.gain.value = value;
  return g;
}

/** Convolver room from a decaying noise impulse. Short = the case; long = the room, where fever sends everything. */
export function room(ctx: BaseAudioContext, seconds: number, decay: number): ConvolverNode {
  const length = Math.max(1, Math.floor(ctx.sampleRate * seconds));
  const impulse = ctx.createBuffer(2, length, ctx.sampleRate);
  const rand = lcg(0x9500d);
  for (let ch = 0; ch < 2; ch++) {
    const data = impulse.getChannelData(ch);
    for (let i = 0; i < length; i++) data[i] = (rand() * 2 - 1) * Math.pow(1 - i / length, decay);
  }
  const node = ctx.createConvolver();
  node.buffer = impulse;
  return node;
}

/** Hard on/off gate (steps, not an LFO — same stepped clock as the chrome). Opens at each `times` for `onFor`. */
export function gate(ctx: BaseAudioContext, times: readonly number[], onFor: number, level = 1): GainNode {
  const g = gain(ctx, 0);
  g.gain.setValueAtTime(0, 0);
  for (const t of times) {
    g.gain.setValueAtTime(level, t);
    g.gain.setValueAtTime(0, t + onFor);
  }
  return g;
}

/** Crossfade tail over head so a buffer loops without a click; returns the shortened buffer. */
export function loopify(ctx: BaseAudioContext, buffer: AudioBuffer, fadeSeconds: number): AudioBuffer {
  const fade = Math.min(Math.floor(buffer.sampleRate * fadeSeconds), Math.floor(buffer.length / 3));
  const length = buffer.length - fade;
  const out = ctx.createBuffer(buffer.numberOfChannels, length, buffer.sampleRate);
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const src = buffer.getChannelData(ch);
    const dst = out.getChannelData(ch);
    dst.set(src.subarray(0, length));
    for (let i = 0; i < fade; i++) {
      const t = i / fade;
      dst[i] = src[i]! * t + src[length + i]! * (1 - t);
    }
  }
  return out;
}
