/**
 * The workshop: the handful of tools every recipe in `library.ts` is built out
 * of.
 *
 * This is a deliberate copy of `apps/fever/src/audio/synth.ts`, not a shared
 * module. The two apps share `packages/engine` and nothing else (DIRECTION.md
 * — sibling app, its own world), and a `packages/audio` would be the first
 * thing tying the two *worlds* together rather than the two games. A hundred
 * lines of oscillators is the cheaper side of that trade, and the two libraries
 * they feed have nothing in common anyway: fever's is a carnival, this one is a
 * 1995 machine.
 *
 * Deterministic, all the way down. The same recipe renders the same bytes every
 * time, because "wrongness repeats" (redesign/VISION.md) reaches audio too:
 * randomness may pick which sound fires, never how one sounds.
 */

/** Everything renders at one rate; a mismatch resamples silently. */
export const RATE = 44100;

/** The one random source in audio, fixed-seeded so it isn't random. */
export function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}

/** White noise, `seconds` long. Same seed, same noise, forever. */
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
 * A gain envelope from `[time, value]` breakpoints, linear between them.
 *
 * Linear on purpose, and it is the same reason the chrome has no ease-in-out:
 * an exponential decay is the sound of a synth preset, and a struck thing whose
 * corners you can hear is the period artifact. A bell decay here is four
 * straight segments approximating the curve, not the curve.
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

/**
 * A cheap room: an exponentially decaying noise burst as an impulse response.
 * Short and dead is a beige plastic case; long is the room the case is in,
 * which is where the fever sends everything. Deterministic via a fixed seed.
 */
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

/**
 * A hard on/off gate: steps, not an LFO — the audio runs the same stepped clock
 * the chrome does. `times` are the moments it opens, each for `onFor`.
 */
export function gate(ctx: BaseAudioContext, times: readonly number[], onFor: number, level = 1): GainNode {
  const g = gain(ctx, 0);
  g.gain.setValueAtTime(0, 0);
  for (const t of times) {
    g.gain.setValueAtTime(level, t);
    g.gain.setValueAtTime(0, t + onFor);
  }
  return g;
}

/**
 * Make a rendered buffer loop without a tick: crossfade the tail back over the
 * head and hand back the shortened result. A hum looped raw clicks once per
 * lap, which reads as a bug in the game rather than as a bug in the machine.
 */
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
