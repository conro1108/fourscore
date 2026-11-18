/**
 * Build the drive image: calibrate on the float model, quantise, generate from
 * both pipelines side by side. Needs .cache/stories260K.bin + tok512.bin
 * (huggingface.co/karpathy/tinyllamas).
 *   npx vite-node apps/exe/tools/llm/build.ts [--write]   (--write ships WEIGHTS.BIN)
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { forward, loadCheckpoint, loadTokenizer, makeRng, makeState, pieceText, sampleFloat } from "./checkpoint.js";
import { buildImage, calibrate, MAX_SEQ, TEMPERATURE, WEIGHT_BASE } from "./pack.js";
import { Machine } from "./intref.js";
import { driveFor } from "../../src/drive.js";

const write = process.argv.includes("--write");
const ck = loadCheckpoint(".cache/stories260K.bin");
const tok = loadTokenizer(".cache/tok512.bin", ck.config.vocabSize);

const calib = calibrate(ck, [1, 7, 99], 48);
const image = buildImage(ck, tok, calib);
const lay = image.layout;

console.log(`image ${image.bytes.length} bytes | bank 0 ends ${lay.bank0End} of ${WEIGHT_BASE} | weights from ${WEIGHT_BASE}`);
console.log(`sections: lut ${lay.lut} rope ${lay.rope} gumbel ${lay.gumbel} exps ${lay.exps} text ${lay.text} kv ${lay.kvCache} (drive ${lay.driveBytes}) embed ${lay.embed} layers ${lay.layers} stride ${lay.layerStride} cls ${lay.classifier}`);
console.log("residual exponent", calib.ares, "| per layer:");
for (const [i, L] of calib.layers.entries()) console.log(` L${i}`, JSON.stringify(L));

// the float model only knows its training length (and only has RoPE rows for it)
const SHOW = Math.min(MAX_SEQ, ck.config.seqLen);
for (const seed of [1, 2, 3]) {
  const fs = makeState(ck.config, MAX_SEQ);
  const frand = makeRng(seed);
  let ftok = 1;
  let ftext = "";
  for (let pos = 0; pos < SHOW; pos++) {
    const next = sampleFloat(forward(ck, fs, ftok, pos, MAX_SEQ), TEMPERATURE, frand);
    if (next === 1 || next === 2) break;
    ftext += pieceText(tok.pieces[next]!);
    ftok = next;
  }

  const drive = driveFor(image.bytes);
  const m = new Machine(drive);
  const irand = makeRng(seed);
  let itok = 1;
  let itext = "";
  let n = 0;
  for (let pos = 0; pos < SHOW; pos++, n++) {
    const next = m.forward(itok, pos, irand);
    if (next === 1 || next === 2) break;
    itext += m.text(next);
    itok = next;
  }
  console.log(`\n--- seed ${seed} float ---\n${ftext.trim()}`);
  console.log(`--- seed ${seed} on the machine's arithmetic (${m.saturations} clips, ${Math.round(m.macs / Math.max(1, n) / 1000)}k macs/token) ---\n${itext.trim()}`);
}

if (write) {
  mkdirSync("apps/exe/public", { recursive: true });
  writeFileSync("apps/exe/public/WEIGHTS.BIN", image.bytes);
  console.log(`\nwrote apps/exe/public/WEIGHTS.BIN (${image.bytes.length} bytes)`);
}
