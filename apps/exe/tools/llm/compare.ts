/**
 * The machine against the oracle, token for token: llm.c compiled by CC and
 * run on the VM vs intref.ts over the same WEIGHTS.BIN. Neither is the truth;
 * a bug survives only by being in both identically.
 *   npx vite-node apps/exe/tools/llm/compare.ts -- [chars=60] [seed=1]
 */

import { readFileSync } from "node:fs";
import { assemble, makeVm, type VmIO } from "../../src/vm.js";
import { compileC } from "../../src/cc.js";
import { LLM_C } from "../../src/llmc.js";
import { Machine } from "./intref.js";
import { makeRng } from "./checkpoint.js";

const args = process.argv.slice(2).filter((a) => a !== "--");
const CHARS = Number(args[0] ?? 60);
const SEED = Number(args[1] ?? 1);

const image = new Uint8Array(readFileSync(new URL("../../public/WEIGHTS.BIN", import.meta.url)));

const cc = compileC(LLM_C);
if (!cc.ok) throw new Error(cc.errors.map((e) => `line ${e.line}: ${e.msg}`).join("; "));
const res = assemble(cc.asm);
if (!res.ok) throw new Error(res.errors.map((e) => `line ${e.line}: ${e.msg}`).join("; "));

// the oracle
const oracle = new Machine(Uint8Array.from(image));
const orand = makeRng(SEED);
let token = 1;
let want = "";
for (let pos = 0; pos < 128 && want.length < CHARS + 8; pos++) {
  const next = oracle.forward(token, pos, orand);
  if (next < 3) break;
  want += oracle.text(next);
  token = next;
}

// the machine
const rand = makeRng(SEED);
let out = "";
const io: VmIO = {
  putChar: (c) => (out += String.fromCharCode(c)),
  putNum: (n) => (out += String(n)),
  key: () => 0,
  rand: () => rand(),
  drive: () => Uint8Array.from(image),
};
const vm = makeVm(res.words, io);
let steps = 0;
// the banner ends with a blank line; everything after it is the story
const story = (): string => out.split("\n\n")[1] ?? "";
const t0 = performance.now();
while (!vm.halted && vm.fault === null && steps < 200_000_000) {
  steps += vm.run(500_000);
  if (story().length >= CHARS) break;
}
const text = story();
const secs = (performance.now() - t0) / 1000;

console.log(`oracle:  ${JSON.stringify(want)}`);
console.log(`machine: ${JSON.stringify(text)}`);
console.log(`${steps} steps in ${secs.toFixed(1)}s, ${Math.round(steps / Math.max(1, text.split(" ").length))} steps/word`);
if (vm.fault) {
  console.log(`FAIL: machine faulted: ${vm.fault}`);
  process.exit(1);
}
if (!want.startsWith(text)) {
  let i = 0;
  while (i < text.length && text[i] === want[i]) i++;
  console.log(`FAIL: diverge at char ${i}: machine ${JSON.stringify(text.slice(i, i + 12))} vs oracle ${JSON.stringify(want.slice(i, i + 12))}`);
  process.exit(1);
}
console.log("ok: token for token");
