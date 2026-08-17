/**
 * Build the drive image and check it before shipping it: calibrate on the
 * float model, quantise, then generate from the integer pipeline and print
 * both, side by side. If the integer text has stopped being English this is
 * where it shows, long before any of it reaches the machine.
 *
 *   npx vite-node apps/exe/tools/llm/build.ts          look
 *   npx vite-node apps/exe/tools/llm/build.ts --write  ship it
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { forward, loadCheckpoint, loadTokenizer, makeRng, makeState, pieceText, sampleFloat } from "./checkpoint.js";
import { buildImage, calibrate, MAX_SEQ, TEMPERATURE, WEIGHT_BASE } from "./pack.js";
import { Machine } from "./intref.js";

const write = process.argv.includes("--write");
const ck = loadCheckpoint(".cache/stories260K.bin");
const tok = loadTokenizer(".cache/tok512.bin", ck.config.vocabSize);

const calib = calibrate(ck, [1, 7, 99], 48);
const image = buildImage(ck, tok, calib);
const lay = image.layout;

console.log(`image ${image.bytes.length} bytes | bank 0 ends ${lay.bank0End} of ${WEIGHT_BASE} | weights from ${WEIGHT_BASE}`);
console.log(`sections: lut ${lay.lut} rope ${lay.rope} gumbel ${lay.gumbel} exps ${lay.exps} text ${lay.text} k ${lay.kCache} v ${lay.vCache} embed ${lay.embed} layers ${lay.layers} stride ${lay.layerStride} cls ${lay.classifier}`);
console.log("residual exponent", calib.ares, "| per layer:");
for (const [i, L] of calib.layers.entries()) console.log(` L${i}`, JSON.stringify(L));

for (const seed of [1, 2, 3]) {
  const fs = makeState(ck.config, MAX_SEQ);
  const frand = makeRng(seed);
  let ftok = 1;
  let ftext = "";
  for (let pos = 0; pos < MAX_SEQ; pos++) {
    const next = sampleFloat(forward(ck, fs, ftok, pos, MAX_SEQ), TEMPERATURE, frand);
    if (next === 1 || next === 2) break;
    ftext += pieceText(tok.pieces[next]!);
    ftok = next;
  }

  const drive = Uint8Array.from(image.bytes);
  const m = new Machine(drive);
  const irand = makeRng(seed);
  let itok = 1;
  let itext = "";
  for (let pos = 0; pos < MAX_SEQ; pos++) {
    const next = m.forward(itok, pos, irand);
    if (next === 1 || next === 2) break;
    itext += m.text(next);
    itok = next;
  }
  console.log(`\n--- seed ${seed} float ---\n${ftext.trim()}`);
  console.log(`--- seed ${seed} on the machine's arithmetic (${m.saturations} clips, ${Math.round(m.macs / MAX_SEQ / 1000)}k macs/token) ---\n${itext.trim()}`);
}

if (write) {
  mkdirSync("apps/exe/public", { recursive: true });
  writeFileSync("apps/exe/public/WEIGHTS.BIN", image.bytes);
  console.log(`\nwrote apps/exe/public/WEIGHTS.BIN (${image.bytes.length} bytes)`);
}
