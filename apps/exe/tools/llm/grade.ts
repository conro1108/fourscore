/**
 * How much did the machine's arithmetic cost us? Teacher-force both
 * pipelines down the same token sequence and compare the distributions they
 * would sample from. Vibes off a generated paragraph cannot tell a numeric
 * bug from the quantisation that was always going to happen; these numbers
 * can, and they are what any change to pack.ts has to be argued against.
 *
 *   npx vite-node apps/exe/tools/llm/grade.ts
 */

import { forward, loadCheckpoint, loadTokenizer, makeRng, makeState, sampleFloat } from "./checkpoint.js";
import { buildImage, calibrate, MAX_SEQ, SCORE_BITS, TEMPERATURE } from "./pack.js";
import { Machine } from "./intref.js";

const ck = loadCheckpoint(".cache/stories260K.bin");
const tok = loadTokenizer(".cache/tok512.bin", ck.config.vocabSize);
const calib = calibrate(ck, [1, 7, 99], 48);
const image = buildImage(ck, tok, calib);
const drive = new Uint8Array(image.bytes.length);

/** A token path to walk, sampled from the float model so it stays on-distribution. */
function floatPath(seed: number, steps: number): number[] {
  const s = makeState(ck.config, MAX_SEQ);
  const rand = makeRng(seed);
  const path = [1];
  for (let pos = 0; pos < steps; pos++) {
    const next = sampleFloat(forward(ck, s, path[pos]!, pos, MAX_SEQ), TEMPERATURE, rand);
    path.push(next);
    if (next === 1 || next === 2) break;
  }
  return path;
}

const softmaxOf = (logits: ArrayLike<number>, temp: number): Float64Array => {
  const n = logits.length;
  const p = new Float64Array(n);
  let max = -Infinity;
  for (let i = 0; i < n; i++) if (logits[i]! / temp > max) max = logits[i]! / temp;
  let sum = 0;
  for (let i = 0; i < n; i++) {
    p[i] = Math.exp(logits[i]! / temp - max);
    sum += p[i]!;
  }
  for (let i = 0; i < n; i++) p[i]! /= sum;
  return p;
};

const argmax = (a: ArrayLike<number>): number => {
  let b = 0;
  for (let i = 1; i < a.length; i++) if (a[i]! > a[b]!) b = i;
  return b;
};

let top1 = 0;
let top5 = 0;
let steps = 0;
let klSum = 0;
let clips = 0;
for (const seed of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]) {
  const path = floatPath(seed, 64);
  const fs = makeState(ck.config, MAX_SEQ);
  drive.set(image.bytes);
  const m = new Machine(drive);
  for (let pos = 0; pos + 1 < path.length; pos++) {
    const flog = Float32Array.from(forward(ck, fs, path[pos]!, pos, MAX_SEQ));
    m.forward(path[pos]!, pos, () => 0);
    const ilog = new Float64Array(ck.config.vocabSize);
    m.logitsFor(ilog);
    // held as (logit / temperature) in 1/32nds; put it back in logit units
    for (let t = 0; t < ilog.length; t++) ilog[t] = (ilog[t]! / (1 << SCORE_BITS)) * TEMPERATURE;
    const pf = softmaxOf(flog, TEMPERATURE);
    const pi = softmaxOf(ilog, TEMPERATURE);
    const best = argmax(flog);
    if (argmax(ilog) === best) top1++;
    const order = [...ilog.keys()].sort((a, b) => ilog[b]! - ilog[a]!).slice(0, 5);
    if (order.includes(best)) top5++;
    for (let t = 0; t < pf.length; t++) if (pf[t]! > 1e-9) klSum += pf[t]! * Math.log(pf[t]! / Math.max(pi[t]!, 1e-12));
    steps++;
  }
  clips += m.saturations;
}

console.log(
  `${steps} positions | top-1 ${((100 * top1) / steps).toFixed(1)}% | float-best in int top-5 ${((100 * top5) / steps).toFixed(1)}% | KL(float||int) ${(klSum / steps).toFixed(4)} nats | ${clips} clips`,
);
