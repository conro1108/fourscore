/** Generate from the float checkpoint, to see what the machine is aiming at. */

import { forward, loadCheckpoint, loadTokenizer, makeRng, makeState, pieceText, sampleFloat } from "./checkpoint.js";

const ck = loadCheckpoint(".cache/stories260K.bin");
const tok = loadTokenizer(".cache/tok512.bin", ck.config.vocabSize);
console.log(ck.config);

const MAXSEQ = 128;
const temp = Number(process.argv[2] ?? 0.9);
for (const seed of [1, 2, 3]) {
  const s = makeState(ck.config, MAXSEQ);
  const rand = makeRng(seed);
  let token = 1; // BOS
  let out = "";
  for (let pos = 0; pos < MAXSEQ; pos++) {
    const logits = forward(ck, s, token, pos, MAXSEQ);
    const next = sampleFloat(logits, temp, rand);
    if (next === 1 || next === 2) break;
    out += pieceText(tok.pieces[next]!);
    token = next;
  }
  console.log(`--- seed ${seed} (temp ${temp}) ---\n${out.trim()}`);
}
