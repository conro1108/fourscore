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

  it("will not let a label shadow a port", () => {
    // a label called `key` once silently took the keyboard; every port name
    // is reserved now, and the drive's three are ports like any other
    for (const name of ["key", "con", "num", "rnd", "vpos", "vchr", "vsync", "dpos", "dbnk", "dsk"]) {
      const res = assemble(`${name}: mov r0, 1\nhlt`);
      expect(res.ok, name).toBe(false);
      if (!res.ok) expect(res.errors[0]!.msg).toContain("belongs to the hardware");
    }
    // and the names work as addresses without being declared
    expect(assemble(`mov r0, 65\nst r0, [con]\nld r0, [dsk]\nhlt`).ok).toBe(true);
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

  it("VPOS aims, VCHR lands and moves on, and both read back", () => {
    const { vm, out } = run(
      [
        "mov r0, 41", // row 1, column 1
        "st r0, [vpos]",
        "mov r1, 'A'",
        "st r1, [vchr]",
        "st r1, [vchr]", // the cursor moved on by itself
        "ld r2, [vpos]",
        "st r2, [num]",
        "mov r0, 41",
        "st r0, [vpos]",
        "ld r3, [vchr]", // reading answers the cell, and does not advance
        "st r3, [con]",
        "hlt",
      ].join("\n"),
    );
    expect(vm.screen[41]).toBe(65);
    expect(vm.screen[42]).toBe(65);
    expect(vm.screenOn).toBe(true);
    expect(out).toBe("43A");
  });

  it("the screen cursor wraps at 960 instead of faulting", () => {
    const { vm } = run(
      "mov r0, 959\nst r0, [vpos]\nmov r1, 'Z'\nst r1, [vchr]\nst r1, [vchr]\nhlt",
    );
    expect(vm.fault).toBeNull();
    expect(vm.screen[959]).toBe(90);
    expect(vm.screen[0]).toBe(90); // the write after the last cell is the first
  });

  it("the screen stays dark until something is drawn", () => {
    const { vm } = run("mov r0, 100\nst r0, [vpos]\nhlt");
    expect(vm.screenOn).toBe(false);
  });

  it("a VSYNC read rests the processor until the next run, and counts", () => {
    const res = assemble("loop: ld r0, [vsync]\nst r0, [num]\njmp loop");
    if (!res.ok) throw new Error("did not assemble");
    let out = "";
    const vm = makeVm(res.words, {
      putChar: () => {},
      putNum: (n) => (out += n),
      key: () => 0,
      rand: () => 0,
    });
    // each run is one frame; the read ends the turn with budget to spare
    expect(vm.run(10_000)).toBeLessThan(10);
    vm.run(10_000);
    vm.run(10_000);
    expect(out).toBe("12"); // frame 3's read has happened; its print is next frame
    expect(vm.halted).toBe(false);
    expect(vm.fault).toBeNull();
  });
});

describe("the drive", () => {
  const media = (): Uint8Array => Uint8Array.from({ length: 300 }, (_, i) => (i * 7) & 0xff);

  it("reads a byte and moves the head on", () => {
    const { out } = run(
      `mov r0, 5
       st r0, [dpos]
       ld r0, [dsk]
       st r0, [num]
       ld r0, [dsk]
       st r0, [num]
       hlt`,
      { drive: media() },
    );
    expect(out).toBe("3542"); // bytes 5 and 6 of the pattern
  });

  it("writes, and the write is there to read back", () => {
    const { out } = run(
      `mov r0, 9
       st r0, [dpos]
       mov r0, 200
       st r0, [dsk]
       mov r0, 9
       st r0, [dpos]
       ld r0, [dsk]
       st r0, [num]
       hlt`,
      { drive: media() },
    );
    expect(out).toBe("200");
  });

  it("carries from the low word of the address into the high one", () => {
    // park the head one byte below a bank boundary and step over it
    const { out } = run(
      `mov r0, 0xffff
       st r0, [dpos]
       ld r0, [dsk]
       ld r0, [dbnk]
       st r0, [num]
       ld r0, [dpos]
       st r0, [num]
       hlt`,
      { drive: media() },
    );
    expect(out).toBe("10");
  });

  it("keeps the two halves of the address apart", () => {
    const { out } = run(
      `mov r0, 3
       st r0, [dbnk]
       mov r0, 7
       st r0, [dpos]
       ld r0, [dbnk]
       st r0, [num]
       ld r0, [dpos]
       st r0, [num]
       hlt`,
      { drive: media() },
    );
    expect(out).toBe("37");
  });

  it("reads zero past the end of the media, and off an empty bay", () => {
    const past = `mov r0, 299
       st r0, [dpos]
       ld r0, [dsk]
       st r0, [num]
       ld r0, [dsk]
       st r0, [num]
       hlt`;
    expect(run(past, { drive: media() }).out).toBe("450"); // the last byte, then nothing
    expect(run(past, { drive: null }).out).toBe("00");
    expect(run(past, { drive: null }).vm.fault).toBeNull();
  });

  it("does not ask for the media until a program reaches for it", () => {
    let asked = 0;
    const io: VmIO = {
      putChar: () => {},
      putNum: () => {},
      key: () => 0,
      rand: () => 0,
      drive: () => {
        asked++;
        return media();
      },
    };
    const quiet = assemble(`mov r0, 1\nhlt`);
    const loud = assemble(`ld r0, [dsk]\nld r0, [dsk]\nhlt`);
    if (!quiet.ok || !loud.ok) throw new Error("bad test program");
    makeVm(quiet.words, io).run(100);
    expect(asked).toBe(0);
    makeVm(loud.words, io).run(100);
    expect(asked).toBe(1); // once, however many bytes it then reads
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
