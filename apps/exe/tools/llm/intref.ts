/**
 * The integer pipeline, in TypeScript, reading the same drive image the
 * 16-bit machine will read, through the same byte-at-a-time port discipline.
 *
 * This is not a second implementation for its own sake — it is the oracle.
 * Every arithmetic step here is one the machine can do (a 16-bit multiply of
 * two bytes, a 32-bit accumulate through the carry flag, shifts, an unsigned
 * divide, a table lookup), so if this babbles then llm.c babbling is a matter
 * of transcription, and when llm.c disagrees with this, this says what the
 * right answer was. Nothing here uses a float.
 *
 * `row()` is the shape the whole thing is built out of: three header bytes,
 * then n bytes off the drive multiplied into n words of RAM, then the bias
 * subtracted back out and the result shifted to its exponent. A weight row, a
 * cached key, and a cached value's history down the sequence are all that
 * same shape, which is why the machine has one inner loop and not three.
 */

import {
  ATT_BITS, EXPS_PER_LAYER, EXP_BIAS, GUMBEL_ENTRIES, LUT_ENTRIES, MAGIC, ROW_HEADER,
  LUT_ONE, SCORE_BITS, TEXT_STRIDE,
} from "./pack.js";

export interface Head {
  dim: number;
  hidden: number;
  layers: number;
  heads: number;
  kvHeads: number;
  vocab: number;
  maxSeq: number;
  ares: number;
  lut: number;
  rope: number;
  gumbel: number;
  exps: number;
  text: number;
  kCache: number;
  vCache: number;
  embed: number;
  layerBase: number;
  layerStride: number;
  rmsFinal: number;
  classifier: number;
  headSize: number;
  kvDim: number;
  kvMul: number;
}

export interface LayerExp {
  aq: number;
  ak: number;
  av: number;
  axo: number;
  az: number;
  a3: number;
  ah: number;
}

/** Arithmetic shift right, or left when the count is negative — the machine
    has both and the exponent arithmetic can land either way. */
const shift = (v: number, s: number): number =>
  s >= 0 ? Math.floor(v / Math.pow(2, s)) : v * Math.pow(2, -s);
/** The same, rounded rather than floored: half a step added before the
    shift. Truncation drags every value toward negative infinity, which on an
    eight-bit number is a bias and not a rounding error — measured, it is
    worth about 0.2 nats of agreement with the float model, for one
    instruction per output. */
const rshift = (v: number, s: number): number =>
  s > 0 ? Math.floor((v + Math.pow(2, s - 1)) / Math.pow(2, s)) : shift(v, s);
const sat8 = (v: number): number => (v < -127 ? -127 : v > 127 ? 127 : v);
const sat16 = (v: number): number => (v < -32768 ? -32768 : v > 32767 ? 32767 : v);

/** Integer square root, the way the machine does it: two bits at a time, no
    floats and no division. */
export function isqrt(n: number): number {
  let rem = n;
  let root = 0;
  for (let bit = 1 << 14; bit; bit >>= 2) {
    const t = root + bit;
    root >>= 1;
    if (rem >= t) {
      rem -= t;
      root += bit;
    }
  }
  return root;
}

export class Machine {
  readonly h: Head;
  readonly exps: LayerExp[];
  private readonly lut = new Uint8Array(LUT_ENTRIES);
  /** The residual stream: int16 words at the exponent the header names. */
  private readonly x: Int16Array;
  /** Quantised activations, biased by 128, as the row loop wants them. */
  private readonly xq: Uint8Array;
  private readonly hq: Uint8Array;
  private readonly q8: Int16Array;
  private readonly k8: Int16Array;
  private readonly v8: Int16Array;
  /** Scores, then the table's answer, then the weights: one array, because
      the machine has 128 words to spare exactly once. */
  private readonly att: Int16Array;
  private readonly xb: Int16Array;
  /** The normalised vector, before it is squeezed into eight bits. */
  private readonly norm: Int16Array;
  /** What a token cost, so the machine's clock can be believed. */
  macs = 0;
  saturations = 0;

  constructor(readonly drive: Uint8Array) {
    const u16 = (a: number): number => drive[a]! | (drive[a + 1]! << 8);
    const u32 = (a: number): number => (u16(a) | (u16(a + 2) << 16)) >>> 0;
    if (u16(0) !== MAGIC) throw new Error("that is not a model");
    const dim = u16(4);
    const heads = u16(10);
    const kvHeads = u16(12);
    this.h = {
      dim,
      hidden: u16(6),
      layers: u16(8),
      heads,
      kvHeads,
      vocab: u16(14),
      maxSeq: u16(16),
      ares: u16(18) - EXP_BIAS,
      lut: u32(20),
      rope: u32(24),
      gumbel: u32(28),
      exps: u32(32),
      text: u32(36),
      kCache: u32(40),
      vCache: u32(44),
      embed: u32(48),
      layerBase: u32(52),
      layerStride: u32(56),
      rmsFinal: u32(60),
      classifier: u32(64),
      headSize: dim / heads,
      kvDim: (dim * kvHeads) / heads,
      kvMul: heads / kvHeads,
    };
    this.lut.set(drive.subarray(this.h.lut, this.h.lut + LUT_ENTRIES));
    const e = (l: number, i: number): number =>
      drive[this.h.exps + l * EXPS_PER_LAYER + i]! - EXP_BIAS;
    this.exps = Array.from({ length: this.h.layers }, (_, l) => ({
      aq: e(l, 0), ak: e(l, 1), av: e(l, 2), axo: e(l, 3), az: e(l, 4), a3: e(l, 5), ah: e(l, 6),
    }));
    this.x = new Int16Array(dim);
    this.xq = new Uint8Array(dim);
    this.hq = new Uint8Array(this.h.hidden);
    this.q8 = new Int16Array(dim);
    this.k8 = new Int16Array(this.h.kvDim);
    this.v8 = new Int16Array(this.h.kvDim);
    this.att = new Int16Array(this.h.maxSeq);
    this.xb = new Int16Array(dim);
    this.norm = new Int16Array(dim);
  }

  /* ---- the drive, one byte at a time ---- */
  private addr = 0;
  private seek(a: number): void {
    this.addr = a;
  }
  private next(): number {
    return this.drive[this.addr++]!;
  }
  private put(v: number): void {
    this.drive[this.addr++] = v & 0xff;
  }

  /**
   * The inner loop, and everything wrapped around it.
   *
   *   sum(w'a') = sum(wa) + 128*sum(a) + 128*sum(w')
   *
   * `sa` is the sum of the unbiased words in `a`, worked out once per matrix;
   * the row's own sum comes off the drive in front of it. `base` is the part
   * of the shift the row does not know: ax - ay. Returns the result already
   * at exponent ay, saturated to sixteen bits.
   */
  private row(a: ArrayLike<number>, at: number, n: number, sa: number, base: number): number {
    const exp = this.next() - EXP_BIAS;
    const sumwb = this.next() | (this.next() << 8);
    let s = 0;
    for (let i = 0; i < n; i++) s += this.next() * a[at + i]!;
    this.macs += n;
    return sat16(rshift(s - 128 * sa - 128 * sumwb, base + exp));
  }

  /** Sum of the unbiased words — the other half of undoing the bias. */
  private static unbiasedSum(a: ArrayLike<number>, at: number, n: number): number {
    let s = 0;
    for (let i = 0; i < n; i++) s += a[at + i]!;
    return s - 128 * n;
  }

  private clamp8(v: number): number {
    if (v < -127 || v > 127) this.saturations++;
    return sat8(v);
  }

  /**
   * RMSNorm and the quantisation after it, which are one pass: the normalised
   * vector is exactly what the next matvec wants in int8. Scale free, so the
   * residual's own exponent never enters — x goes down to seven bits first
   * (any wider and t*t leaves the low half of a 16-bit multiply) and the
   * division puts the scale back. Returns the output's exponent, measured
   * here rather than calibrated.
   */
  private normQuant(vecAddr: number, out: Uint8Array): number {
    const n = this.h.dim;
    const x = this.x;
    let max = 0;
    for (let i = 0; i < n; i++) {
      const m = x[i]! < 0 ? -x[i]! : x[i]!;
      if (m > max) max = m;
    }
    let sx = 0;
    while (max >> sx > 127) sx++;
    // the mean of the squares, accumulated already divided: 64 terms of at
    // most 16129/64 stay inside one unsigned word, so no carry chain here
    const t = this.norm;
    const lg = Math.log2(n);
    let mean = 0;
    for (let i = 0; i < n; i++) {
      t[i] = shift(x[i]!, sx);
      mean += shift(t[i]! * t[i]!, lg);
    }
    let r = isqrt(mean);
    if (r < 1) r = 1;
    this.seek(vecAddr);
    const ag = this.next() - EXP_BIAS;
    const half = r >> 1;
    let omax = 0;
    for (let i = 0; i < n; i++) {
      const num = t[i]! * (this.next() - 128);
      t[i] = num < 0 ? -Math.floor((half - num) / r) : Math.floor((num + half) / r);
      const m = t[i]! < 0 ? -t[i]! : t[i]!;
      if (m > omax) omax = m;
    }
    let sn = 0;
    while (omax >> sn > 127) sn++;
    for (let i = 0; i < n; i++) out[i] = rshift(t[i]!, sn) + 128;
    return ag - sn;
  }

  /** 1/(1+e^-z) in 256ths, out of the same table softmax uses. */
  private sigmoid(z8: number, az: number): number {
    const i = shift(z8 < 0 ? -z8 : z8, az - SCORE_BITS);
    const u = i > LUT_ENTRIES - 1 ? 0 : this.lut[i]!;
    return z8 >= 0 ? Math.floor((128 * LUT_ONE) / (LUT_ONE + u)) : Math.floor((128 * u) / (LUT_ONE + u));
  }

  /** One token in, the next token out. `rand` gives sixteen bits, the way
      the RND port does. */
  forward(token: number, pos: number, rand: () => number): number {
    const { dim, hidden, kvDim, headSize, heads, kvMul, maxSeq, ares } = this.h;
    const x = this.x;
    const kRow = ROW_HEADER + headSize;
    const vRow = ROW_HEADER + maxSeq;
    const kLayer = this.h.kvHeads * maxSeq * kRow;
    const vLayer = this.h.kvHeads * headSize * vRow;

    // the embedding is the residual stream's first value
    this.seek(this.h.embed + token * (1 + dim));
    const aemb = this.next() - EXP_BIAS;
    for (let i = 0; i < dim; i++) x[i] = sat16(rshift(this.next() - 128, aemb - ares));

    for (let l = 0; l < this.h.layers; l++) {
      const E = this.exps[l]!;
      const base = this.h.layerBase + l * this.h.layerStride;
      const an = this.normQuant(base, this.xq);
      const sa = Machine.unbiasedSum(this.xq, 0, dim);
      const q = this.q8;
      const k = this.k8;
      const v = this.v8;

      // q, k and v come off one stream, in that order
      this.seek(base + 1 + dim);
      for (let j = 0; j < dim; j++) q[j] = this.clamp8(this.row(this.xq, 0, dim, sa, an - E.aq));
      for (let j = 0; j < kvDim; j++) k[j] = this.clamp8(this.row(this.xq, 0, dim, sa, an - E.ak));
      for (let j = 0; j < kvDim; j++) v[j] = this.clamp8(this.row(this.xq, 0, dim, sa, an - E.av));

      // RoPE, on the quantised vectors, from the table of cosines
      this.seek(this.h.rope + pos * headSize);
      for (let j = 0; j < headSize / 2; j++) {
        const cr = this.next() - 128;
        const ci = this.next() - 128;
        for (let o = j * 2; o < dim; o += headSize) {
          const a0 = q[o]!;
          const a1 = q[o + 1]!;
          q[o] = this.clamp8(rshift(a0 * cr - a1 * ci, 7));
          q[o + 1] = this.clamp8(rshift(a0 * ci + a1 * cr, 7));
          if (o < kvDim) {
            const b0 = k[o]!;
            const b1 = k[o + 1]!;
            k[o] = this.clamp8(rshift(b0 * cr - b1 * ci, 7));
            k[o + 1] = this.clamp8(rshift(b0 * ci + b1 * cr, 7));
          }
        }
      }

      // into the cache, each in the shape it will be read back in: a key as a
      // row of its own, sum in front, so the score loop is the row loop; a
      // value spread down its component's run so the weighted sum streams
      for (let g = 0; g < this.h.kvHeads; g++) {
        this.seek(this.h.kCache + l * kLayer + (g * maxSeq + pos) * kRow + 1);
        let sum = 0;
        for (let i = 0; i < headSize; i++) sum += k[g * headSize + i]! + 128;
        this.put(sum);
        this.put(sum >> 8);
        for (let i = 0; i < headSize; i++) this.put(k[g * headSize + i]! + 128);
        for (let i = 0; i < headSize; i++) {
          this.seek(this.h.vCache + l * vLayer + (g * headSize + i) * vRow + ROW_HEADER + pos);
          this.put(v[g * headSize + i]! + 128);
        }
      }

      for (let hh = 0; hh < heads; hh++) {
        const qo = hh * headSize;
        const g = Math.floor(hh / kvMul);
        for (let i = 0; i < headSize; i++) q[qo + i]! += 128;
        const sq = Machine.unbiasedSum(q, qo, headSize);
        this.seek(this.h.kCache + l * kLayer + g * maxSeq * kRow);
        let maxs = -32768;
        for (let t = 0; t <= pos; t++) {
          const sc = this.row(q, qo, headSize, sq, E.aq + E.ak - SCORE_BITS);
          this.att[t] = sc;
          if (sc > maxs) maxs = sc;
        }
        // softmax out of the table, then the weights in 256ths
        let esum = 0;
        for (let t = 0; t <= pos; t++) {
          const i = maxs - this.att[t]!;
          const e = i > LUT_ENTRIES - 1 ? 0 : this.lut[i]!;
          this.att[t] = e;
          esum += e;
        }
        let psum = 0;
        for (let t = 0; t <= pos; t++) {
          const p = Math.floor((this.att[t]! << ATT_BITS) / esum);
          this.att[t] = p;
          psum += p;
        }
        for (let i = 0; i < headSize; i++) {
          this.seek(this.h.vCache + l * vLayer + (g * headSize + i) * vRow);
          this.xb[qo + i] = this.clamp8(
            this.row(this.att, 0, pos + 1, psum, ATT_BITS + E.av - E.axo),
          );
        }
      }

      // out projection, straight into the residual
      for (let i = 0; i < dim; i++) this.xq[i] = this.xb[i]! + 128;
      const so = Machine.unbiasedSum(this.xq, 0, dim);
      this.seek(base + 1 + dim + (dim + 2 * kvDim) * (ROW_HEADER + dim));
      for (let j = 0; j < dim; j++)
        x[j] = sat16(x[j]! + this.row(this.xq, 0, dim, so, E.axo - ares));

      // the feed-forward half. w1 and w3 alternate down one stream, so a
      // hidden unit is finished — gated, multiplied and requantised — before
      // the next one starts, and 172 words of scratch never have to exist.
      const ffn = base + 1 + dim + (2 * dim + 2 * kvDim) * (ROW_HEADER + dim);
      const anf = this.normQuant(ffn, this.xq);
      const sf = Machine.unbiasedSum(this.xq, 0, dim);
      this.seek(ffn + 1 + dim);
      for (let i = 0; i < hidden; i++) {
        const z = this.clamp8(this.row(this.xq, 0, dim, sf, anf - E.az));
        const t3 = this.clamp8(this.row(this.xq, 0, dim, sf, anf - E.a3));
        const s = rshift(z * this.sigmoid(z, E.az), 7);
        this.hq[i] = this.clamp8(rshift(s * t3, E.az + E.a3 - E.ah)) + 128;
      }
      const sh = Machine.unbiasedSum(this.hq, 0, hidden);
      for (let j = 0; j < dim; j++)
        x[j] = sat16(x[j]! + this.row(this.hq, 0, hidden, sh, E.ah - ares));
    }

    const anl = this.normQuant(this.h.rmsFinal, this.xq);
    this.lastNormExp = anl;
    const sl = Machine.unbiasedSum(this.xq, 0, dim);
    this.seek(this.h.classifier);
    // Gumbel-max: the largest logit-plus-noise is a draw from the softmax, so
    // the machine samples in the same pass that computes the logits and never
    // has to hold 512 of them or add them up
    let best = 0;
    let bestV = -0x8000;
    for (let t = 0; t < this.h.vocab; t++) {
      const logit = this.row(this.xq, 0, dim, sl, anl - SCORE_BITS);
      const g = this.h.gumbel + (rand() & (GUMBEL_ENTRIES - 1)) * 2;
      const raw = this.drive[g]! | (this.drive[g + 1]! << 8);
      const v = logit + (raw >= 0x8000 ? raw - 0x10000 : raw);
      if (v > bestV) {
        bestV = v;
        best = t;
      }
    }
    return best;
  }

  /** The logits of the last forward(), for grading. Sampling does not need
      them kept, so this recomputes the classifier rather than the machine
      growing 512 words it has nowhere to put. */
  logitsFor(out: Float64Array): void {
    const sl = Machine.unbiasedSum(this.xq, 0, this.h.dim);
    const anl = this.lastNormExp;
    this.seek(this.h.classifier);
    for (let t = 0; t < this.h.vocab; t++)
      out[t] = this.row(this.xq, 0, this.h.dim, sl, anl - SCORE_BITS);
  }
  private lastNormExp = 0;

  /** What a token prints, from the table on the drive. */
  text(token: number): string {
    const at = this.h.text + token * TEXT_STRIDE;
    let s = "";
    for (let i = 0; i < this.drive[at]!; i++) s += String.fromCharCode(this.drive[at + 1 + i]!);
    return s;
  }
}
