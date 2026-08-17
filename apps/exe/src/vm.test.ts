/**
 * The processor's tests. The two .asm files seeded onto every fresh disk are
 * assembled and run here, so the manual, the seeds and the CPU can't drift
 * apart without a test going red.
 */

import { describe, expect, it } from "vitest";
import { assemble, makeVm, MEM_SIZE, type Vm, type VmIO } from "./vm.js";
import { SEED_FILES } from "./copy.js";

interface Run {
  vm: Vm;
  out: string;
}

function run(src: string, opts: { keys?: string; rand?: number; maxSteps?: number } = {}): Run {
  const res = assemble(src);
  if (!res.ok) throw new Error(res.errors.map((e) => `line ${e.line}: ${e.msg}`).join("; "));
  let out = "";
  const keys = [...(opts.keys ?? "")].map((c) => c.charCodeAt(0));
  const io: VmIO = {
    putChar: (c) => (out += String.fromCharCode(c)),
    putNum: (n) => (out += String(n)),
    key: () => keys.shift() ?? 0,
    rand: () => opts.rand ?? 0,
  };
  const vm = makeVm(res.words, io);
  vm.run(opts.maxSteps ?? 200_000);
  return { vm, out };
}

const seed = (name: string): string =>
  SEED_FILES.find((f) => f.name.toLowerCase().endsWith(name.toLowerCase()))!.text;

describe("assembler", () => {
  it("reports unknown instructions with their line", () => {
    const res = assemble("mov r0, 1\nfeel r0, 2\nhlt");
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.errors[0]!.line).toBe(2);
      expect(res.errors[0]!.msg).toContain("FEEL");
    }
  });

  it("rejects a register where a value is needed, doubled labels, and bare ST", () => {
    for (const bad of ["mov r0, r9", "a: nop\na: nop", "st r0, con", "add r0", "pop 3"]) {
      expect(assemble(bad).ok, bad).toBe(false);
    }
  });

  it("accepts hex, negatives, chars and built-in port names", () => {
    const res = assemble("mov r0, 0x0F00\nmov r1, -1\nmov r2, 'A'\nmov r3, con\nhlt");
    expect(res.ok).toBe(true);
  });
});

describe("cpu", () => {
  it("computes and prints", () => {
    const { vm, out } = run("mov r0, 6\nmul r0, 7\nst r0, [num]\nhlt");
    expect(out).toBe("42");
    expect(vm.halted).toBe(true);
  });

  it("wraps at 16 bits and prints signed through NUM", () => {
    const { out } = run("mov r0, 0\nsub r0, 1\nst r0, [num]\nhlt");
    expect(out).toBe("-1");
  });

  it("JC after CMP is unsigned less-than", () => {
    const src = (a: number, b: number): string =>
      `mov r0, ${a}\ncmp r0, ${b}\njc less\nmov r1, 'G'\nst r1, [con]\nhlt\nless: mov r1, 'L'\nst r1, [con]\nhlt`;
    expect(run(src(3, 5)).out).toBe("L");
    expect(run(src(5, 3)).out).toBe("G");
    expect(run(src(0xfff0, 5)).out).toBe("G"); // unsigned: big beats small
  });

  it("CALL/RET nest through the stack, and PUSH/POP round-trip", () => {
    const { out, vm } = run(
      [
        "push 7",
        "call outer",
        "pop r0",
        "st r0, [num]",
        "hlt",
        "outer: call inner",
        "ret",
        "inner: mov r1, '.'",
        "st r1, [con]",
        "ret",
      ].join("\n"),
    );
    expect(out).toBe(".7");
    expect(vm.halted).toBe(true);
  });

  it("reads data placed by .word and .str", () => {
    const { out } = run("ld r0, [tab]\nld r1, [msg]\nst r1, [con]\nst r0, [num]\nhlt\ntab: .word 9\nmsg: .str \"X\"");
    expect(out).toBe("X9");
  });

  it("self-modifying code is just code", () => {
    // stores a HLT over the jump target before arriving there
    const { vm } = run("mov r0, 0\nst r0, [tgt]\ntgt: jmp tgt", { maxSteps: 100 });
    expect(vm.halted).toBe(true);
  });

  it("faults like the period: divide, invalid opcode, memory, stack", () => {
    expect(run("mov r0, 1\nmov r1, 0\ndiv r0, r1").vm.fault).toBe("Divide overflow");
    expect(run(".word 0xFFFF").vm.fault).toContain("Invalid opcode");
    expect(run("ld r0, [0x2000]").vm.fault).toContain("Memory fault");
    expect(run("ret").vm.fault).toBe("Stack fault");
    expect(run("pop r0").vm.fault).toBe("Stack fault");
  });

  it("an unhalted program just keeps running to its step budget", () => {
    const { vm } = run("loop: jmp loop", { maxSteps: 1000 });
    expect(vm.halted).toBe(false);
    expect(vm.fault).toBeNull();
  });

  it("KEY reads 0 on an empty queue and RND reads the port", () => {
    const { out } = run("ld r0, [key]\nst r0, [num]\nld r0, [rnd]\nst r0, [num]\nhlt", { rand: 777 });
    expect(out).toBe("0777");
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

  it("every .asm seed fits comfortably in RAM", () => {
    for (const f of SEED_FILES.filter((f) => f.name.endsWith(".asm"))) {
      const res = assemble(f.text);
      expect(res.ok, f.name).toBe(true);
      if (res.ok) expect(res.words.length).toBeLessThan(MEM_SIZE / 4);
    }
  });
});
