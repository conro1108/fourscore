/**
 * The factory: turn a float checkpoint into the drive image the 16-bit
 * machine reads. Everything hard about running a transformer on a machine
 * with no floating point is decided here, once, on the Mac — the machine
 * itself only ever shifts, adds and looks things up.
 *
 * The scheme, in one paragraph. Every weight row is int8 with its own
 * power-of-two scale, so dequantising is a shift and never a multiply. Every
 * activation is int8 too, at a scale a float calibration run picked (or, at
 * the three RMSNorms, one the machine measures for itself), so a dot
 * product's exponent is known before it starts: out = acc >> (ax + aw - ay).
 * Both operands are stored biased by 128, which makes every product unsigned
 * and non-negative — that is what lets the inner loop accumulate 32 bits with
 * one carry branch and no sign extension, and it is worth three instructions
 * on every one of the ~300,000 multiply-accumulates a token costs. The bias
 * comes back out once per row, from sums the packer wrote down:
 *
 *     sum(w'a')  =  sum(wa) + 128*sum(a) + 128*sum(w')
 *
 * Softmax and sigmoid are one 256-entry table of exp(-i/32), indexed by a
 * subtraction because scores are kept in 32nds. Sampling is Gumbel-max out of
 * a second table, which is exact softmax sampling in a single pass and needs
 * neither a running total nor anywhere to put 512 logits. Temperature is
 * folded into the classifier's exponent, which is why it has to be a power of
 * two: 0.5.
 *
 * The layout is stream order. Every matrix is read front to back exactly
 * once per token, the K cache is stored so the scores stream and the V cache
 * so the weighted sum streams, and w1 and w3 alternate a row at a time so
 * SwiGLU finishes a hidden unit without anywhere to keep 172 of them. The
 * machine seeks about 250 times a token and reads ~300,000 bytes.
 */

import type { Checkpoint, Config, Tokenizer } from "./checkpoint.js";
import { forward, makeState, pieceText } from "./checkpoint.js";

export const MAGIC = 0x4d4c; // 'L','M'
export const VERSION = 2; // 2 appended WARM_TOKENS to the header
export const HEADER_BYTES = 128;
/** How far back the machine can see. The K/V cache is sized from it. */
export const MAX_SEQ = 128;
/** exp(-i/32) in 0..255 — the whole of softmax and the whole of sigmoid. */
export const LUT_ENTRIES = 256;
/** What the table calls 1.0. Not 255: the attention weights divide by the
    table's own total, and a 127 ceiling is what keeps that numerator inside
    the signed word the machine's divide insists on. */
export const LUT_ONE = 127;
/** Fixed-point bits for attention scores and logits: 1/32 of a logit. */
export const SCORE_BITS = 5;
/** Attention weights are 256ths — as fine as a 16-bit numerator allows. */
export const ATT_BITS = 8;
/** How many quantiles of the Gumbel the sampler draws from. */
export const GUMBEL_ENTRIES = 512;
/** Sampling temperature. A power of two, because it is folded into a shift. */
export const TEMPERATURE = 0.5;
/**
 * How many tokens the machine picks loosely before it settles.
 *
 * The temperature above is one shift, so undoing it for a while is also one
 * shift, and that turns out to be worth having: this model has effectively
 * memorised "Once upon a time, there was a little", and at 0.5 it is 98.8%
 * sure of the word after it: forty runs told two stories, thirty-five of
 * them about a little girl named Lily.
 *
 * Ten is where the curve turns. It reaches past the fork at token nine,
 * where the model settles on girl-or-boy, and gets 26 distinct openings out
 * of 40. Twelve and sixteen also get 26 — the opening is already decided by
 * then — but the float model finds their extra tokens more surprising (0.64
 * and 0.68 nats against 0.56), which is what a made-up word looks like as a
 * number. So: all of the variety available, at the least nonsense that buys.
 * Everything after the tenth token is sampled exactly as it was.
 */
export const WARM_TOKENS = 10;
/** One token's text: a length byte and up to seven characters. */
export const TEXT_STRIDE = 8;
/** Exponents ride in a byte with this much added, so they can be negative. */
export const EXP_BIAS = 64;
/** Seven exponents describe a layer, and the eighth byte keeps it even. */
export const EXPS_PER_LAYER = 8;
/** Every row the machine multiplies by carries these three bytes in front:
    the row's exponent, then its byte sum, low first. */
export const ROW_HEADER = 3;
/** The weights start on a bank boundary; everything the machine writes to
    lives below it, where the address latch's low word is the whole address. */
export const WEIGHT_BASE = 0x10000;

/** Where each section starts, in bytes from the front of the drive. */
export interface Layout {
  lut: number;
  rope: number;
  gumbel: number;
  exps: number;
  text: number;
  kCache: number;
  vCache: number;
  embed: number;
  layers: number;
  layerStride: number;
  rmsFinal: number;
  classifier: number;
  /** Where the machine's own writes stop; the weights start a bank up. */
  bank0End: number;
  bytes: number;
}

/* ---- fixed point ---- */

/** The exponent that puts `max` just inside `cap`: max * 2^a <= cap. */
export function expFor(max: number, cap: number): number {
  if (!(max > 0)) return 0;
  return Math.max(-30, Math.min(30, Math.floor(Math.log2(cap / max))));
}

const clamp8 = (v: number): number => (v < -127 ? -127 : v > 127 ? 127 : v);

/** One int8 row: a power-of-two exponent, the biased bytes, and the byte sum
    the machine needs to undo the bias. */
export interface QRow {
  exp: number;
  bytes: Uint8Array;
  sum: number;
}

export function quantRow(src: ArrayLike<number>, off: number, n: number, scale = 1): QRow {
  let max = 0;
  for (let i = 0; i < n; i++) {
    const a = Math.abs(src[off + i]! * scale);
    if (a > max) max = a;
  }
  const exp = expFor(max, 127);
  const mul = Math.pow(2, exp);
  const bytes = new Uint8Array(n);
  let sum = 0;
  for (let i = 0; i < n; i++) {
    const b = clamp8(Math.round(src[off + i]! * scale * mul)) + 128;
    bytes[i] = b;
    sum += b;
  }
  return { exp, bytes, sum };
}

/* ---- calibration ---- */

export interface LayerExp {
  aq: number;
  ak: number;
  av: number;
  axo: number;
  az: number;
  a3: number;
  ah: number;
}

export interface Calib {
  /** The residual stream's exponent, shared by every layer. */
  ares: number;
  layers: LayerExp[];
  /** What the float run saw, for the report. */
  maxima: Map<string, number>;
}

/**
 * Run the float model over a few generations and note how big everything
 * gets. Exponents chosen from one sample would clip on the next, so this
 * takes the worst case over several.
 *
 * Only the sites the machine cannot measure for itself are here. The three
 * RMSNorm outputs are not: their scale is a max over sixty-four words, and
 * two extra passes over sixty-four words cost nothing beside a matvec, so
 * the machine fits those to the token in front of it rather than to the
 * worst token of a calibration run.
 */
export function calibrate(ck: Checkpoint, seeds: number[], steps: number): Calib {
  const c = ck.config;
  const maxima = new Map<string, number>();
  const note = (site: string, values: ArrayLike<number>): void => {
    let m = maxima.get(site) ?? 0;
    for (let i = 0; i < values.length; i++) {
      const a = Math.abs(values[i]!);
      if (a > m) m = a;
    }
    maxima.set(site, m);
  };

  for (const seed of seeds) {
    const s = makeState(c, MAX_SEQ);
    let token = 1;
    let rng = seed & 0xffff || 1;
    for (let pos = 0; pos < steps; pos++) {
      const logits = forward(ck, s, token, pos, MAX_SEQ, note);
      // walk a plausible path rather than one token over and over
      rng = (rng * 1103515245 + 12345) & 0x7fffffff;
      let best = 0;
      let bestV = -Infinity;
      for (let i = 0; i < logits.length; i++) {
        const jitter = logits[i]! + ((((rng >> (i % 16)) & 15) - 7) / 32) * 4;
        if (jitter > bestV) {
          bestV = jitter;
          best = i;
        }
      }
      token = best;
    }
  }

  const at = (site: string): number => maxima.get(site) ?? 1;
  const layers = Array.from({ length: c.nLayers }, (_, l) => ({
    aq: expFor(at(`q.${l}`), 127),
    ak: expFor(at(`k.${l}`), 127),
    av: expFor(at(`v.${l}`), 127),
    axo: expFor(at(`attout.${l}`), 127),
    az: expFor(at(`z.${l}`), 127),
    a3: expFor(at(`w3.${l}`), 127),
    ah: expFor(at(`h.${l}`), 127),
  }));
  return { ares: expFor(at("res"), 16384), layers, maxima };
}

/* ---- the drive image ---- */

export function layoutFor(c: Config): Layout {
  const align = (n: number): number => (n + 127) & ~127;
  const row = (n: number): number => ROW_HEADER + n;
  const vec = (n: number): number => 1 + n; // exponent, then the weights
  const lut = HEADER_BYTES;
  const rope = lut + LUT_ENTRIES;
  const gumbel = rope + MAX_SEQ * c.headSize;
  const exps = gumbel + GUMBEL_ENTRIES * 2;
  const text = align(exps + c.nLayers * EXPS_PER_LAYER);
  const kCache = text + c.vocabSize * TEXT_STRIDE;
  const vCache = kCache + c.nLayers * c.nKvHeads * MAX_SEQ * row(c.headSize);
  const afterCache = vCache + c.nLayers * c.nKvHeads * c.headSize * row(MAX_SEQ);
  if (afterCache > WEIGHT_BASE) throw new Error(`bank 0 overflows: ${afterCache} bytes`);
  const embed = WEIGHT_BASE;
  const layers = embed + c.vocabSize * vec(c.dim);
  const layerStride =
    vec(c.dim) +
    (2 * c.dim + 2 * c.kvDim) * row(c.dim) +
    vec(c.dim) +
    2 * c.hiddenDim * row(c.dim) +
    c.dim * row(c.hiddenDim);
  const rmsFinal = layers + c.nLayers * layerStride;
  const classifier = rmsFinal + vec(c.dim);
  return {
    lut, rope, gumbel, exps, text, kCache, vCache, embed, layers, layerStride, rmsFinal, classifier,
    bank0End: afterCache,
    bytes: classifier + c.vocabSize * row(c.dim),
  };
}

class Writer {
  readonly buf: Uint8Array;
  at = 0;
  constructor(size: number) {
    this.buf = new Uint8Array(size);
  }
  seek(to: number): void {
    this.at = to;
  }
  u8(v: number): void {
    this.buf[this.at++] = v & 0xff;
  }
  u16(v: number): void {
    this.u8(v);
    this.u8(v >> 8);
  }
  u32(v: number): void {
    this.u16(v);
    this.u16(v >>> 16);
  }
  exp(v: number): void {
    if (v + EXP_BIAS < 0 || v + EXP_BIAS > 255) throw new Error(`exponent out of range: ${v}`);
    this.u8(v + EXP_BIAS);
  }
  bytes(b: ArrayLike<number>): void {
    for (let i = 0; i < b.length; i++) this.u8(b[i]!);
  }
  /** A weight row: exponent, the sum that undoes the bias, then the bytes. */
  row(r: QRow): void {
    this.exp(r.exp);
    this.u16(r.sum);
    this.bytes(r.bytes);
  }
  /** A weight vector nothing multiplies by: no sum needed. */
  vec(r: QRow): void {
    this.exp(r.exp);
    this.bytes(r.bytes);
  }
}

export interface Image {
  bytes: Uint8Array;
  layout: Layout;
  calib: Calib;
  config: Config;
}

export function buildImage(ck: Checkpoint, tok: Tokenizer, calib: Calib): Image {
  const c = ck.config;
  const w = ck.weights;
  const lay = layoutFor(c);
  const out = new Writer(lay.bytes);

  /* the header, which is every address the program would otherwise guess */
  out.u16(MAGIC);
  out.u16(VERSION);
  out.u16(c.dim);
  out.u16(c.hiddenDim);
  out.u16(c.nLayers);
  out.u16(c.nHeads);
  out.u16(c.nKvHeads);
  out.u16(c.vocabSize);
  out.u16(MAX_SEQ);
  out.u16(calib.ares + EXP_BIAS);
  for (const a of [lay.lut, lay.rope, lay.gumbel, lay.exps, lay.text, lay.kCache, lay.vCache,
                   lay.embed, lay.layers, lay.layerStride, lay.rmsFinal, lay.classifier])
    out.u32(a);
  // appended, so an older program reads the zero padding and simply does not
  // warm up rather than reading someone else's field
  out.u16(WARM_TOKENS);

  /* exp(-i/32), which is softmax, sigmoid and nothing else */
  out.seek(lay.lut);
  for (let i = 0; i < LUT_ENTRIES; i++) out.u8(Math.round(LUT_ONE * Math.exp(-i / (1 << SCORE_BITS))));

  /* RoPE's cosines and sines, in 1/127ths, already biased */
  out.seek(lay.rope);
  const half = c.headSize / 2;
  for (let p = 0; p < MAX_SEQ; p++)
    for (let j = 0; j < half; j++) {
      out.u8(clamp8(Math.round(w.freqReal[p * half + j]! * 127)) + 128);
      out.u8(clamp8(Math.round(w.freqImag[p * half + j]! * 127)) + 128);
    }

  /* the Gumbel, in 32nds, one quantile per entry. Adding one of these to
     every logit and taking the largest is exactly a draw from the softmax,
     which is how the machine samples without ever forming the distribution. */
  out.seek(lay.gumbel);
  for (let i = 0; i < GUMBEL_ENTRIES; i++) {
    const u = (i + 0.5) / GUMBEL_ENTRIES;
    out.u16(Math.round(-Math.log(-Math.log(u)) * (1 << SCORE_BITS)) & 0xffff);
  }

  /* the calibration itself */
  out.seek(lay.exps);
  for (const L of calib.layers) {
    out.exp(L.aq);
    out.exp(L.ak);
    out.exp(L.av);
    out.exp(L.axo);
    out.exp(L.az);
    out.exp(L.a3);
    out.exp(L.ah);
    out.u8(0);
  }

  /* what each token prints — sentencepiece unwrapped down to the machine's
     own character set, because the screen has no others */
  for (let t = 0; t < c.vocabSize; t++) {
    const keep: number[] = [];
    for (const ch of pieceText(tok.pieces[t]!)) {
      const v = ch.charCodeAt(0);
      if (v === 10 || (v >= 32 && v < 127)) keep.push(v);
      if (keep.length === TEXT_STRIDE - 1) break;
    }
    out.seek(lay.text + t * TEXT_STRIDE);
    out.u8(keep.length);
    out.bytes(keep);
  }

  /* the cache is formatted here rather than at boot: every row in it is one
     the same matvec routine reads, so every row needs the three bytes in
     front, and only the exponent is ever anything but zero. */
  for (let i = 0; i < c.nLayers * c.nKvHeads * MAX_SEQ; i++) {
    out.seek(lay.kCache + i * (ROW_HEADER + c.headSize));
    out.exp(0);
  }
  for (let i = 0; i < c.nLayers * c.nKvHeads * c.headSize; i++) {
    out.seek(lay.vCache + i * (ROW_HEADER + MAX_SEQ));
    out.exp(0);
  }

  /* the embedding table, read one row at a time as a token arrives */
  out.seek(lay.embed);
  for (let t = 0; t < c.vocabSize; t++) out.vec(quantRow(w.tokenEmbedding, t * c.dim, c.dim));

  const invRootHead = 1 / Math.sqrt(c.headSize);
  for (let l = 0; l < c.nLayers; l++) {
    out.seek(lay.layers + l * lay.layerStride);
    out.vec(quantRow(w.rmsAtt[l]!, 0, c.dim));
    // 1/sqrt(headSize) rides in wq, so a score is a plain dot product
    for (let j = 0; j < c.dim; j++) out.row(quantRow(w.wq[l]!, j * c.dim, c.dim, invRootHead));
    for (let j = 0; j < c.kvDim; j++) out.row(quantRow(w.wk[l]!, j * c.dim, c.dim));
    for (let j = 0; j < c.kvDim; j++) out.row(quantRow(w.wv[l]!, j * c.dim, c.dim));
    for (let j = 0; j < c.dim; j++) out.row(quantRow(w.wo[l]!, j * c.dim, c.dim));
    out.vec(quantRow(w.rmsFfn[l]!, 0, c.dim));
    for (let j = 0; j < c.hiddenDim; j++) {
      out.row(quantRow(w.w1[l]!, j * c.dim, c.dim));
      out.row(quantRow(w.w3[l]!, j * c.dim, c.dim));
    }
    for (let j = 0; j < c.dim; j++) out.row(quantRow(w.w2[l]!, j * c.hiddenDim, c.hiddenDim));
  }

  out.seek(lay.rmsFinal);
  out.vec(quantRow(w.rmsFinal, 0, c.dim));
  out.seek(lay.classifier);
  // temperature rides here. Scaling a row by 1/T leaves the bytes alone and
  // moves its exponent by exactly log2(T), which is the whole trick.
  for (let t = 0; t < c.vocabSize; t++) out.row(quantRow(w.wcls, t * c.dim, c.dim, 1 / TEMPERATURE));

  return { bytes: out.buf, layout: lay, calib, config: c };
}
