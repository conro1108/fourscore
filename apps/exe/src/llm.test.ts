/** llm.c must fit in 4096 words *with* heap and stack; an overflow would fault
 * far from the change that caused it. Token-for-token oracle comparison is
 * `tools/llm/compare.ts`, run by hand. */

import { describe, expect, it } from "vitest";
import { assemble, MEM_SIZE, MMIO_BASE } from "./vm.js";
import { compileC } from "./cc.js";
import { LLM_C } from "./llmc.js";

/** What llm.c asks malloc for: the seven buffers, two of which share. */
const HEAP_WORDS = 64 + 64 + 172 + 64 + 32 + 32;
/** Return addresses and expression temporaries, generously. */
const STACK_WORDS = 32;

const words = (): Uint16Array => {
  const cc = compileC(LLM_C);
  if (!cc.ok) throw new Error(cc.errors.map((e) => `line ${e.line}: ${e.msg}`).join("; "));
  const res = assemble(cc.asm);
  if (!res.ok) throw new Error(res.errors.map((e) => `line ${e.line}: ${e.msg}`).join("; "));
  return res.words;
};

describe("the model on the processor", () => {
  it("fits in the machine, heap and stack and all", () => {
    const image = words().length;
    expect(image + HEAP_WORDS + STACK_WORDS).toBeLessThanOrEqual(MMIO_BASE);
    expect(MMIO_BASE).toBeLessThan(MEM_SIZE);
  });
});
