/**
 * The factory's side of llm_llm_llm: reading someone else's checkpoint.
 *
 * stories260K is Karpathy's TinyStories llama2 in the original llama2.c
 * export — a 28-byte header of seven int32s and then float32 tensors in a
 * fixed order, RoPE's cos/sin already tabulated per position. Nothing here
 * runs on the 16-bit machine; this is the Mac, doing what the fake 1995
 * computer could never do, which is the whole division of labour in the plan.
 *
 * The float forward pass below is the reference the integer pipeline is
 * graded against. It is deliberately the dumbest possible transcription of
 * run.c: no fusing, no caching cleverness, so that when the quantised version
 * disagrees the disagreement is the quantisation and not a second bug.
 */

import { readFileSync } from "node:fs";

export interface Config {
  dim: number;
  hiddenDim: number;
  nLayers: number;
  nHeads: number;
  nKvHeads: number;
  vocabSize: number;
  seqLen: number;
  headSize: number;
  kvDim: number;
  /** How many query heads share one key/value head. */
  kvMul: number;
  sharedClassifier: boolean;
}

export interface Weights {
  /** vocab x dim */
  tokenEmbedding: Float32Array;
  /** layer -> dim */
  rmsAtt: Float32Array[];
  /** layer -> (dim x dim), row-major: out row j, in column i */
  wq: Float32Array[];
  /** layer -> (kvDim x dim) */
  wk: Float32Array[];
  wv: Float32Array[];
  /** layer -> (dim x dim) */
  wo: Float32Array[];
  rmsFfn: Float32Array[];
  /** layer -> (hiddenDim x dim) */
  w1: Float32Array[];
  /** layer -> (dim x hiddenDim) */
  w2: Float32Array[];
  w3: Float32Array[];
  rmsFinal: Float32Array;
  /** pos -> headSize/2 */
  freqReal: Float32Array;
  freqImag: Float32Array;
  /** vocab x dim — the same memory as tokenEmbedding when shared. */
  wcls: Float32Array;
}

export interface Checkpoint {
  config: Config;
  weights: Weights;
}

export function loadCheckpoint(path: string): Checkpoint {
  const buf = readFileSync(path);
  const head = new Int32Array(buf.buffer, buf.byteOffset, 7);
  const [dim, hiddenDim, nLayers, nHeads, rawKvHeads, rawVocab, seqLen] = head as unknown as number[];
  const nKvHeads = rawKvHeads!;
  const sharedClassifier = rawVocab! > 0;
  const vocabSize = Math.abs(rawVocab!);
  const config: Config = {
    dim: dim!,
    hiddenDim: hiddenDim!,
    nLayers: nLayers!,
    nHeads: nHeads!,
    nKvHeads,
    vocabSize,
    seqLen: seqLen!,
    headSize: dim! / nHeads!,
    kvDim: (dim! * nKvHeads) / nHeads!,
    kvMul: nHeads! / nKvHeads,
    sharedClassifier,
  };

  const floats = new Float32Array(buf.buffer, buf.byteOffset + 28, (buf.length - 28) / 4);
  let at = 0;
  const take = (n: number): Float32Array => floats.subarray(at, (at += n));
  const perLayer = (n: number): Float32Array[] =>
    Array.from({ length: config.nLayers }, () => take(n));

  const tokenEmbedding = take(config.vocabSize * config.dim);
  const rmsAtt = perLayer(config.dim);
  const wq = perLayer(config.dim * config.dim);
  const wk = perLayer(config.kvDim * config.dim);
  const wv = perLayer(config.kvDim * config.dim);
  const wo = perLayer(config.dim * config.dim);
  const rmsFfn = perLayer(config.dim);
  const w1 = perLayer(config.hiddenDim * config.dim);
  const w2 = perLayer(config.dim * config.hiddenDim);
  const w3 = perLayer(config.hiddenDim * config.dim);
  const rmsFinal = take(config.dim);
  const freqReal = take(config.seqLen * (config.headSize / 2));
  const freqImag = take(config.seqLen * (config.headSize / 2));
  const wcls = sharedClassifier ? tokenEmbedding : take(config.vocabSize * config.dim);
  if (at !== floats.length)
    throw new Error(`checkpoint has ${floats.length - at} floats left over — wrong layout?`);

  return {
    config,
    weights: { tokenEmbedding, rmsAtt, wq, wk, wv, wo, rmsFfn, w1, w2, w3, rmsFinal, freqReal, freqImag, wcls },
  };
}

/* ---- the tokenizer, only far enough to turn ids back into letters ---- */

export interface Tokenizer {
  /** id -> the bytes it stands for, already unwrapped from sentencepiece. */
  pieces: string[];
}

export function loadTokenizer(path: string, vocabSize: number): Tokenizer {
  const buf = readFileSync(path);
  const pieces: string[] = [];
  let at = 4; // max token length, which we do not need to decode
  for (let i = 0; i < vocabSize; i++) {
    at += 4; // the merge score, which only encoding needs
    const len = buf.readInt32LE(at);
    at += 4;
    pieces.push(buf.subarray(at, at + len).toString("utf8"));
    at += len;
  }
  return { pieces };
}

/** What a piece actually prints: U+2581 is sentencepiece for a space, and
    <0xNN> is a raw byte that never made it into the merge table. */
export function pieceText(piece: string): string {
  const byte = /^<0x([0-9A-Fa-f]{2})>$/.exec(piece);
  if (byte) return String.fromCharCode(parseInt(byte[1]!, 16));
  return piece.replace(/▁/g, " ");
}

/* ---- the float model, transcribed from run.c ---- */

export interface RunState {
  kCache: Float32Array; // layer -> pos -> kvDim
  vCache: Float32Array;
  logits: Float32Array;
}

export function makeState(c: Config, maxSeq = c.seqLen): RunState {
  return {
    kCache: new Float32Array(c.nLayers * maxSeq * c.kvDim),
    vCache: new Float32Array(c.nLayers * maxSeq * c.kvDim),
    logits: new Float32Array(c.vocabSize),
  };
}

function rmsnorm(out: Float32Array, x: Float32Array, weight: Float32Array): void {
  let ss = 0;
  for (let i = 0; i < x.length; i++) ss += x[i]! * x[i]!;
  ss = 1 / Math.sqrt(ss / x.length + 1e-5);
  for (let i = 0; i < x.length; i++) out[i] = weight[i]! * (ss * x[i]!);
}

function matmul(out: Float32Array, x: Float32Array, w: Float32Array, n: number, d: number): void {
  for (let j = 0; j < d; j++) {
    let sum = 0;
    for (let i = 0; i < n; i++) sum += w[j * n + i]! * x[i]!;
    out[j] = sum;
  }
}

function softmax(x: Float32Array, n: number): void {
  let max = x[0]!;
  for (let i = 1; i < n; i++) if (x[i]! > max) max = x[i]!;
  let sum = 0;
  for (let i = 0; i < n; i++) {
    x[i] = Math.exp(x[i]! - max);
    sum += x[i]!;
  }
  for (let i = 0; i < n; i++) x[i]! /= sum;
}

/** Every place the integer pipeline has to choose a fixed-point exponent.
    The float run reports what actually turns up there, which is the only way
    to pick a scale that neither clips nor throws away bits. */
export type SiteRecorder = (site: string, values: ArrayLike<number>) => void;

/** One token through the float model; the logits land in state.logits. */
export function forward(
  ck: Checkpoint,
  s: RunState,
  token: number,
  pos: number,
  maxSeq: number,
  rec: SiteRecorder = () => {},
): Float32Array {
  const c = ck.config;
  const w = ck.weights;
  const { dim, kvDim, headSize, nHeads, kvMul, hiddenDim } = c;
  const x = new Float32Array(w.tokenEmbedding.subarray(token * dim, token * dim + dim));
  const xb = new Float32Array(dim);
  const xb2 = new Float32Array(dim);
  const hb = new Float32Array(hiddenDim);
  const hb2 = new Float32Array(hiddenDim);
  const q = new Float32Array(dim);
  const att = new Float32Array(maxSeq);
  const invRootHead = 1 / Math.sqrt(headSize);
  rec("res", x);

  for (let l = 0; l < c.nLayers; l++) {
    rmsnorm(xb, x, w.rmsAtt[l]!);
    rec(`attnorm.${l}`, xb);
    const kBase = l * maxSeq * kvDim + pos * kvDim;
    const k = s.kCache.subarray(kBase, kBase + kvDim);
    const v = s.vCache.subarray(kBase, kBase + kvDim);
    matmul(q, xb, w.wq[l]!, dim, dim);
    matmul(k as Float32Array, xb, w.wk[l]!, dim, kvDim);
    matmul(v as Float32Array, xb, w.wv[l]!, dim, kvDim);
    // the machine folds 1/sqrt(headSize) into wq, so calibrate q where it lands
    rec(`q.${l}`, Array.from(q, (n) => n * invRootHead));
    rec(`k.${l}`, k);
    rec(`v.${l}`, v);

    // RoPE, from the tables the export baked in
    const fr = w.freqReal.subarray(pos * (headSize / 2), pos * (headSize / 2) + headSize / 2);
    const fi = w.freqImag.subarray(pos * (headSize / 2), pos * (headSize / 2) + headSize / 2);
    for (let i = 0; i < dim; i += 2) {
      const cr = fr[(i % headSize) / 2]!;
      const ci = fi[(i % headSize) / 2]!;
      const q0 = q[i]!;
      const q1 = q[i + 1]!;
      q[i] = q0 * cr - q1 * ci;
      q[i + 1] = q0 * ci + q1 * cr;
      if (i < kvDim) {
        const k0 = k[i]!;
        const k1 = k[i + 1]!;
        k[i] = k0 * cr - k1 * ci;
        k[i + 1] = k0 * ci + k1 * cr;
      }
    }

    xb.fill(0);
    for (let h = 0; h < nHeads; h++) {
      const qo = h * headSize;
      const ko = Math.floor(h / kvMul) * headSize;
      for (let t = 0; t <= pos; t++) {
        const kt = s.kCache.subarray(l * maxSeq * kvDim + t * kvDim + ko);
        let score = 0;
        for (let i = 0; i < headSize; i++) score += q[qo + i]! * kt[i]!;
        att[t] = score / Math.sqrt(headSize);
      }
      softmax(att, pos + 1);
      for (let t = 0; t <= pos; t++) {
        const vt = s.vCache.subarray(l * maxSeq * kvDim + t * kvDim + ko);
        const a = att[t]!;
        for (let i = 0; i < headSize; i++) xb[qo + i]! += a * vt[i]!;
      }
    }

    rec(`attout.${l}`, xb);
    matmul(xb2, xb, w.wo[l]!, dim, dim);
    for (let i = 0; i < dim; i++) x[i]! += xb2[i]!;
    rec("res", x);

    rmsnorm(xb, x, w.rmsFfn[l]!);
    rec(`ffnnorm.${l}`, xb);
    matmul(hb, xb, w.w1[l]!, dim, hiddenDim);
    matmul(hb2, xb, w.w3[l]!, dim, hiddenDim);
    rec(`z.${l}`, hb);
    rec(`w3.${l}`, hb2);
    for (let i = 0; i < hiddenDim; i++) hb[i] = (hb[i]! / (1 + Math.exp(-hb[i]!))) * hb2[i]!;
    rec(`h.${l}`, hb);
    matmul(xb2, hb, w.w2[l]!, hiddenDim, dim);
    for (let i = 0; i < dim; i++) x[i]! += xb2[i]!;
    rec("res", x);
  }

  rmsnorm(x, x, w.rmsFinal);
  rec("finnorm", x);
  matmul(s.logits, x, w.wcls, dim, c.vocabSize);
  return s.logits;
}

/** xorshift16 — the same generator the VM's RND port gets fed in tests, so a
    host run and a machine run can be asked to make the same choices. */
export function makeRng(seed: number): () => number {
  let s = seed & 0xffff || 1;
  return () => {
    s ^= (s << 7) & 0xffff;
    s ^= s >> 9;
    s ^= (s << 8) & 0xffff;
    return s;
  };
}

export function sampleFloat(logits: Float32Array, temperature: number, rand: () => number): number {
  const n = logits.length;
  const p = new Float32Array(n);
  let max = -Infinity;
  for (let i = 0; i < n; i++) {
    p[i] = logits[i]! / temperature;
    if (p[i]! > max) max = p[i]!;
  }
  let sum = 0;
  for (let i = 0; i < n; i++) {
    p[i] = Math.exp(p[i]! - max);
    sum += p[i]!;
  }
  let t = (rand() / 65536) * sum;
  for (let i = 0; i < n; i++) {
    t -= p[i]!;
    if (t < 0) return i;
  }
  return n - 1;
}
