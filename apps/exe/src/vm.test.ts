/** CPU tests. The seeded .asm files are assembled and run here so the manual,
 * the seeds and the CPU can't drift apart. */

import { describe, expect, it } from "vitest";
import { assemble, makeVm, type Vm, type VmIO } from "./vm.js";
import { SEED_FILES } from "./copy.js";

interface Run {
  vm: Vm;
  out: string;
}

function run(
  src: string,
  opts: { keys?: string; rand?: number; maxSteps?: number; drive?: Uint8Array | null } = {},
): Run {
  const res = assemble(src);
  if (!res.ok) throw new Error(res.errors.map((e) => `line ${e.line}: ${e.msg}`).join("; "));
  let out = "";
  const keys = [...(opts.keys ?? "")].map((c) => c.charCodeAt(0));
  const io: VmIO = {
    putChar: (c) => (out += String.fromCharCode(c)),
    putNum: (n) => (out += String(n)),
    key: () => keys.shift() ?? 0,
    rand: () => opts.rand ?? 0,
    drive: () => opts.drive ?? null,
  };
  const vm = makeVm(res.words, io);
  vm.run(opts.maxSteps ?? 200_000);
  return { vm, out };
}

const seed = (name: string): string =>
  SEED_FILES.find((f) => f.name.toLowerCase().endsWith(name.toLowerCase()))!.text;

describe("cpu", () => {
  it("computes and prints", () => {
    const { vm, out } = run("mov r0, 6\nmul r0, 7\nst r0, [num]\nhlt");
    expect(out).toBe("42");
    expect(vm.halted).toBe(true);
  });


  it("faults like the period: divide, invalid opcode, memory, stack", () => {
    expect(run("mov r0, 1\nmov r1, 0\ndiv r0, r1").vm.fault).toBe("Divide overflow");
    expect(run(".word 0xFFFF").vm.fault).toContain("Invalid opcode");
    expect(run("ld r0, [0x2000]").vm.fault).toContain("Memory fault");
    expect(run("ret").vm.fault).toBe("Stack fault");
    expect(run("pop r0").vm.fault).toBe("Stack fault");
  });

});

describe("the shipped programs", () => {
  it("hello.asm prints its line and halts", () => {
    const { vm, out } = run(seed("hello.asm"));
    expect(out).toBe("HELLO FROM THE DISK.\n");
    expect(vm.halted).toBe(true);
  });

  it("guess.asm plays a real round", () => {
    // rand 41 → the number is 42. Guess 50 (too high), then 42.
    const { vm, out } = run(seed("guess.asm"), { rand: 41, keys: "50\r42\r", maxSteps: 500_000 });
    expect(out).toContain("GUESS THE NUMBER");
    expect(out).toContain("LOWER.");
    expect(out).toContain("YES. THAT IS THE NUMBER.");
    expect(vm.halted).toBe(true);
  });
});
