/**
 * The placeholder workshop: the small set of tools every recipe in
 * `library.ts` is built out of.
 *
 * Phase 2 built the *mangling* graph (`mangle.ts`) — what happens to a sound
 * after it exists. This is what makes one exist in the first place when the
 * CC0 sample it wants hasn't been sourced yet. The split matters: mangling is
 * the sound design and survives the swap to real samples; everything here is
 * scaffolding that a real recording replaces.
 *
 * Deterministic like everything else on the bus — the same recipe renders the
 * same bytes every time, because "wrongness repeats" reaches audio too.
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
 * Linear on purpose: exponential decays are the sound of a synth preset, and
 * the timing law wants edges you can hear the corners of.
 */
export function env(ctx: BaseAudioContext, points: [number, number][]): GainNode {
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
 * The dry voice of a sound: the installed CC0 sample if Connor has sourced
 * one, else the synthesized stand-in. Everything downstream — envelopes,
 * filters, the mangling — is identical either way, which is the whole point of
 * the manifest: swapping in a real airhorn changes the timbre and nothing
 * about the choreography.
 *
 * `bend` re-uses the sample's own pitch as the fall or climb the recipe wants,
 * so a gag whose joke is a pitch bend still has one.
 */
export function sampleVoice(
  ctx: BaseAudioContext,
  buffer: AudioBuffer,
  bend?: { at: number; to: number; over: number },
): AudioBufferSourceNode {
  const s = ctx.createBufferSource();
  s.buffer = buffer;
  if (bend) {
    s.playbackRate.setValueAtTime(1, 0);
    s.playbackRate.setValueAtTime(1, bend.at);
    s.playbackRate.exponentialRampToValueAtTime(bend.to, bend.at + bend.over);
  }
  s.start(0);
  return s;
}

/**
 * Make a rendered buffer loop without a tick: crossfade the tail back over the
 * head and hand back the shortened result. A noise bed looped raw clicks once
 * per lap, which reads as a bug in the game rather than a bug in the tape.
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
