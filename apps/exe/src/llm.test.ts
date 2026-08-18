/**
 * The whole of llm_llm_llm Phase 2, end to end: llm.c compiled by CC,
 * assembled to machine words, and run on the real processor against the real
 * drive image, with its output checked token for token against the integer
 * oracle in tools/llm/intref.ts.
 *
 * That comparison is the point. The oracle and the machine are two
 * independent transcriptions of the same fixed-point scheme — one in
 * TypeScript reading the image byte by byte, one in C and hand assembly
 * reading it through the ports — and the only way a bug in either survives
 * is by being in both, identically. It has already caught one: a K cache
 * whose stride left out its own row headers, which read as English for a
 * while before anyone looked at the numbers.
 *
 * The size assertion matters as much. The program has to fit in 4096 words
 * *with* its heap, and the compiler and the program have both been shaped
 * around that; a change that quietly overflows it would fault a long way
 * from wherever it was made.
 */

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { assemble, makeVm, MEM_SIZE, MMIO_BASE, type VmIO } from "./vm.js";
import { compileC } from "./cc.js";
import { LLM_C } from "./llmc.js";
import { SEED_FILES } from "./copy.js";
import { mount, setMedia } from "./drive.js";
import { Machine } from "../tools/llm/intref.js";
import { makeRng } from "../tools/llm/checkpoint.js";

/** What llm.c asks malloc for: the seven buffers, two of which share. */
const HEAP_WORDS = 64 + 64 + 172 + 64 + 32 + 32;
/** Return addresses and expression temporaries, generously. */
const STACK_WORDS = 32;

const image = new Uint8Array(readFileSync("apps/exe/public/WEIGHTS.BIN"));

const words = (): Uint16Array => {
  const cc = compileC(LLM_C);
  if (!cc.ok) throw new Error(cc.errors.map((e) => `line ${e.line}: ${e.msg}`).join("; "));
  const res = assemble(cc.asm);
  if (!res.ok) throw new Error(res.errors.map((e) => `line ${e.line}: ${e.msg}`).join("; "));
  return res.words;
};

/** Run the machine until it has said `tokens` tokens, or given up. */
function babble(tokens: number, seed: number, drive: Uint8Array | null): { text: string; steps: number; fault: string | null } {
  const rand = makeRng(seed);
  let out = "";
  const io: VmIO = {
    putChar: (c) => (out += String.fromCharCode(c)),
    putNum: (n) => (out += String(n)),
    key: () => 0,
    rand: () => rand(),
    drive: () => drive,
  };
  const vm = makeVm(words(), io);
  let steps = 0;
  // the banner ends with a blank line; everything after it is the story
  const story = (): string => out.split("\n\n")[1] ?? "";
  while (!vm.halted && vm.fault === null && steps < 200_000_000) {
    steps += vm.run(500_000);
    if (story().length >= tokens) break;
  }
  return { text: story(), steps, fault: vm.fault };
}

describe("the model on the processor", () => {
  it("fits in the machine, heap and stack and all", () => {
    const image = words().length;
    expect(image + HEAP_WORDS + STACK_WORDS).toBeLessThanOrEqual(MMIO_BASE);
    expect(MMIO_BASE).toBeLessThan(MEM_SIZE);
  });

  it("is the file on the disk", () => {
    expect(SEED_FILES.find((f) => f.name === "SRC\\llm.c")!.text).toBe(LLM_C);
  });

  it("hands every program the media it came with", () => {
    // llm.c keeps its whole key/value cache on the drive, so a second run
    // that inherited the first one's writes would quietly tell a different
    // story from the same seed
    setMedia(Uint8Array.from([1, 2, 3, 4]));
    const first = mount()!;
    first[0] = 99;
    expect([...mount()!]).toEqual([1, 2, 3, 4]);
    setMedia(null);
    expect(mount()).toBeNull();
  });

  it("says so when the drive is empty, instead of faulting", () => {
    const { text, fault } = babble(1, 1, null);
    expect(fault).toBeNull();
    expect(text).toBe("");
  });

  it("babbles, and says exactly what the integer reference says", () => {
    const CHARS = 60;
    const oracle = new Machine(Uint8Array.from(image));
    const orand = makeRng(1);
    let token = 1;
    let want = "";
    for (let pos = 0; pos < 128 && want.length < CHARS + 8; pos++) {
      const next = oracle.forward(token, pos, orand);
      if (next < 3) break;
      want += oracle.text(next);
      token = next;
    }

    const { text, fault, steps } = babble(CHARS, 1, Uint8Array.from(image));
    expect(fault).toBeNull();
    expect(text.length).toBeGreaterThanOrEqual(CHARS);
    expect(want.startsWith(text)).toBe(true);
    expect(text).toContain("Once upon a time");
    // and it costs what a machine reading 260,032 weights a token should
    expect(steps / text.split(" ").length).toBeGreaterThan(1_000_000);
  });
});
