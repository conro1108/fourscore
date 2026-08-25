/**
 * Quantise a float checkpoint into the drive image (see llm_llm_llm.md).
 * Scheme: every weight row and activation is int8 with a power-of-two
 * exponent, so out = acc >> (ax + aw - ay); both operands stored biased by
 * 128 so products are unsigned, with the bias undone once per row:
 *     sum(w'a') = sum(wa) + 128*sum(a) + 128*sum(w')
 * Softmax/sigmoid are one exp(-i/32) table; sampling is Gumbel-max from a
 * second; temperature is folded into the classifier exponent (so power of 2).
 * Layout is stream order: each matrix read once front to back per token.
 */

import type { Checkpoint, Config, Tokenizer } from "./checkpoint.js";
import { forward, makeState, pieceText } from "./checkpoint.js";

export const MAGIC = 0x4d4c; // 'L','M'
export const VERSION = 2; // 2 appended WARM_TOKENS
export const HEADER_BYTES = 128;
/** Context length; the K/V cache is sized from it. */
export const MAX_SEQ = 128;
/** exp(-i/32) table, shared by softmax and sigmoid. */
export const LUT_ENTRIES = 256;
/** The table's 1.0. Not 255: attention divides by the table total and 127
    keeps that numerator inside the signed word the machine's divide needs. */
export const LUT_ONE = 127;
/** Fixed-point bits for attention scores and logits: 1/32 of a logit. */
export const SCORE_BITS = 5;
/** Attention weights in 256ths — as fine as a 16-bit numerator allows. */
export const ATT_BITS = 8;
/** Gumbel quantiles the sampler draws from. */
export const GUMBEL_ENTRIES = 512;
/** Sampling temperature. A power of two, because it is folded into a shift. */
export const TEMPERATURE = 0.5;
/**
 * Tokens sampled at temperature 1 (one shift less) before settling to 0.5.
 * At 0.5 the model is 98.8% sure of "...there was a little girl named Lily".
 * Measured: 10 reaches past the girl-or-boy fork at token nine and gets 26
 * distinct openings of 40; 12 and 16 get the same 26 at more surprise
 * (0.64/0.68 nats vs 0.56), i.e. made-up words.
 */
export const WARM_TOKENS = 10;
/** Token text: length byte + up to seven characters. */
export const TEXT_STRIDE = 8;
/** Exponents are stored as byte + EXP_BIAS, so they can be negative. */
export const EXP_BIAS = 64;
/** Seven exponents per layer; eighth byte is padding. */
export const EXPS_PER_LAYER = 8;
/** Every multiplied row carries three header bytes: exponent, then byte sum (LE). */
export const ROW_HEADER = 3;
/** Weights start on a bank boundary; everything the machine writes lives
    below it, where the address latch's low word is the whole address. */
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
  /** Where the machine's writes stop. */
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

/** One int8 row: exponent, biased bytes, and their sum (to undo the bias). */
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
  /** Float-run maxima per site, for the report. */
  maxima: Map<string, number>;
}

/**
 * Worst-case activation maxima over several float generations (one sample
 * would clip on the next). Only sites the machine can't measure itself: the
 * three RMSNorm outputs are scaled per token on the machine instead.
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
      // jittered argmax: a plausible path, not one token repeated
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
  /** A vector nothing multiplies by: no sum. */
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

  /* header */
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
  // appended (v2): an older program reads zero padding and just doesn't warm up
  out.u16(WARM_TOKENS);

  /* exp(-i/32) table */
  out.seek(lay.lut);
  for (let i = 0; i < LUT_ENTRIES; i++) out.u8(Math.round(LUT_ONE * Math.exp(-i / (1 << SCORE_BITS))));

  /* RoPE cos/sin in 1/127ths, biased */
  out.seek(lay.rope);
  const half = c.headSize / 2;
  for (let p = 0; p < MAX_SEQ; p++)
    for (let j = 0; j < half; j++) {
      out.u8(clamp8(Math.round(w.freqReal[p * half + j]! * 127)) + 128);
      out.u8(clamp8(Math.round(w.freqImag[p * half + j]! * 127)) + 128);
    }

  /* Gumbel quantiles in 32nds: argmax(logit + gumbel) is an exact softmax draw */
  out.seek(lay.gumbel);
  for (let i = 0; i < GUMBEL_ENTRIES; i++) {
    const u = (i + 0.5) / GUMBEL_ENTRIES;
    out.u16(Math.round(-Math.log(-Math.log(u)) * (1 << SCORE_BITS)) & 0xffff);
  }

  /* per-layer exponents */
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

  /* token text, restricted to the machine's character set (\n, 32..126) */
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

  /* K/V cache rows are read by the same matvec routine, so each needs its
     header; formatted here rather than at boot (only the exponent is nonzero) */
  for (let i = 0; i < c.nLayers * c.nKvHeads * MAX_SEQ; i++) {
    out.seek(lay.kCache + i * (ROW_HEADER + c.headSize));
    out.exp(0);
  }
  for (let i = 0; i < c.nLayers * c.nKvHeads * c.headSize; i++) {
    out.seek(lay.vCache + i * (ROW_HEADER + MAX_SEQ));
    out.exp(0);
  }

  /* embedding table */
  out.seek(lay.embed);
  for (let t = 0; t < c.vocabSize; t++) out.vec(quantRow(w.tokenEmbedding, t * c.dim, c.dim));

  const invRootHead = 1 / Math.sqrt(c.headSize);
  for (let l = 0; l < c.nLayers; l++) {
    out.seek(lay.layers + l * lay.layerStride);
    out.vec(quantRow(w.rmsAtt[l]!, 0, c.dim));
    // 1/sqrt(headSize) folded into wq, so a score is a plain dot product
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
  // temperature folded in: scaling by 1/T leaves the bytes alone and moves
  // the exponent by log2(T)
  for (let t = 0; t < c.vocabSize; t++) out.row(quantRow(w.wcls, t * c.dim, c.dim, 1 / TEMPERATURE));

  return { bytes: out.buf, layout: lay, calib, config: c };
}
