/**
 * The C compiler's tests. Every program here is compiled to real assembly,
 * assembled to real words and run on the real CPU — the whole toolchain in
 * one bite, which is the only honest way to test a compiler. The .c seed on
 * the disk compiles and runs here too, so c.txt, fizz.c and cc.ts can't
 * drift apart without a test going red.
 */

import { describe, expect, it } from "vitest";
import { assemble, makeVm, type VmIO } from "./vm.js";
import { compileC } from "./cc.js";
import { SEED_FILES } from "./copy.js";

function runC(src: string, opts: { keys?: string; rand?: number; maxSteps?: number } = {}): string {
  const cc = compileC(src);
  if (!cc.ok) throw new Error(cc.errors.map((e) => `line ${e.line}: ${e.msg}`).join("; "));
  const res = assemble(cc.asm);
  if (!res.ok)
    throw new Error(
      `CC emitted bad asm: ${res.errors.map((e) => `line ${e.line}: ${e.msg}`).join("; ")}\n${cc.asm}`,
    );
  let out = "";
  const keys = [...(opts.keys ?? "")].map((c) => c.charCodeAt(0));
  const io: VmIO = {
    putChar: (c) => (out += String.fromCharCode(c)),
    putNum: (n) => (out += String(n)),
    key: () => keys.shift() ?? 0,
    rand: () => opts.rand ?? 0,
  };
  const vm = makeVm(res.words, io);
  vm.run(opts.maxSteps ?? 2_000_000);
  if (vm.fault) throw new Error(`fault: ${vm.fault}\n${cc.asm}`);
  if (!vm.halted) throw new Error("program did not halt");
  return out;
}

const errorsOf = (src: string): string[] => {
  const cc = compileC(src);
  if (cc.ok) throw new Error("expected errors, compiled clean");
  return cc.errors.map((e) => e.msg);
};

describe("expressions", () => {
  it("does arithmetic with C precedence", () => {
    expect(runC(`int main() { putn(2 + 3 * 4); return 0; }`)).toBe("14");
    expect(runC(`int main() { putn((2 + 3) * 4); }`)).toBe("20");
    expect(runC(`int main() { putn(100 - 7 * 9); }`)).toBe("37");
    expect(runC(`int main() { putn(1 << 4 | 3); }`)).toBe("19");
    expect(runC(`int main() { putn(0xff & 0x0f ^ 1); }`)).toBe("14");
  });

  it("divides and takes remainders with signs, like C", () => {
    expect(runC(`int main() { putn(17 / 5); }`)).toBe("3");
    expect(runC(`int main() { putn(-17 / 5); }`)).toBe("-3");
    expect(runC(`int main() { putn(17 / -5); }`)).toBe("-3");
    expect(runC(`int main() { putn(-17 / -5); }`)).toBe("3");
    expect(runC(`int main() { putn(17 % 5); }`)).toBe("2");
    expect(runC(`int main() { putn(-17 % 5); }`)).toBe("-2");
    expect(runC(`int main() { putn(17 % -5); }`)).toBe("2");
  });

  it("compares signed, not unsigned", () => {
    expect(runC(`int main() { putn(-1 < 1); }`)).toBe("1");
    expect(runC(`int main() { putn(-30000 < 30000); }`)).toBe("1");
    expect(runC(`int main() { putn(1 <= 1); putn(2 <= 1); }`)).toBe("10");
    expect(runC(`int main() { putn(5 > -5); putn(-5 >= 5); }`)).toBe("10");
    expect(runC(`int main() { putn(3 == 3); putn(3 != 3); }`)).toBe("10");
  });

  it("short-circuits && and ||", () => {
    // the guard: if || evaluated its right side, this would divide by zero
    expect(runC(`int main() { int z; z = 0; putn(z == 0 || 10 / z > 1); }`)).toBe("1");
    expect(runC(`int main() { int z; z = 0; putn(z != 0 && 10 / z > 1); }`)).toBe("0");
  });

  it("handles unary operators, ?: and op=", () => {
    expect(runC(`int main() { putn(!0); putn(!7); putn(-(-5)); }`)).toBe("105");
    expect(runC(`int main() { putn(~0 == -1); }`)).toBe("1");
    expect(runC(`int main() { putn(1 ? 10 : 20); putn(0 ? 10 : 20); }`)).toBe("1020");
    expect(runC(`int main() { int x; x = 10; x += 5; x *= 2; x -= 6; x /= 3; putn(x); }`)).toBe("8");
    expect(runC(`int main() { int x; x = 1; x <<= 4; x |= 2; putn(x); }`)).toBe("18");
  });

  it("increments and decrements, pre and post", () => {
    expect(runC(`int main() { int i; i = 5; putn(i++); putn(i); }`)).toBe("56");
    expect(runC(`int main() { int i; i = 5; putn(++i); putn(i--); putn(i); }`)).toBe("665");
  });
});

describe("control flow", () => {
  it("runs if/else chains", () => {
    const grade = `
      int grade(int n) {
        if (n > 89) return 'A';
        else if (n > 79) return 'B';
        else return 'F';
      }
      int main() { putc(grade(95)); putc(grade(80)); putc(grade(12)); }`;
    expect(runC(grade)).toBe("ABF");
  });

  it("runs while, do/while and for with break and continue", () => {
    expect(runC(`int main() { int i; i = 0; while (i < 5) { putn(i); i++; } }`)).toBe("01234");
    expect(runC(`int main() { int i; i = 9; do { putn(i); i++; } while (i < 9); }`)).toBe("9");
    expect(
      runC(`int main() { int i; for (i = 0; i < 10; i++) { if (i == 2) continue; if (i == 5) break; putn(i); } }`),
    ).toBe("0134");
    expect(runC(`int main() { int i; i = 0; for (;;) { if (++i > 3) break; putn(i); } }`)).toBe("123");
  });
});

describe("functions", () => {
  it("passes arguments and returns values", () => {
    expect(runC(`int add(int a, int b) { return a + b; } int main() { putn(add(20, 22)); }`)).toBe("42");
    expect(
      runC(`int max(int a, int b) { return a > b ? a : b; } int main() { putn(max(3, max(9, 7))); }`),
    ).toBe("9");
  });

  it("recurses", () => {
    expect(runC(`int fib(int n) { if (n < 2) return n; return fib(n - 1) + fib(n - 2); }
      int main() { putn(fib(15)); }`)).toBe("610");
    expect(runC(`int fact(int n) { return n < 2 ? 1 : n * fact(n - 1); }
      int main() { putn(fact(7)); }`)).toBe("5040");
  });

  it("calls forward — functions defined later in the file", () => {
    expect(runC(`int main() { putn(later(5)); } int later(int n) { return n * n; }`)).toBe("25");
  });
});

describe("memory", () => {
  it("reads and writes globals", () => {
    expect(runC(`int counter = 40; int main() { counter += 2; putn(counter); }`)).toBe("42");
    expect(runC(`int a, b = 7; int main() { a = b + 1; putn(a); putn(b); }`)).toBe("87");
  });

  it("indexes arrays, local and global", () => {
    expect(
      runC(`int g[5]; int main() { int i; for (i = 0; i < 5; i++) g[i] = i * i; putn(g[3]); }`),
    ).toBe("9");
    expect(
      runC(`int main() { int a[4]; int i; for (i = 0; i < 4; i++) a[i] = i + 1; putn(a[0] + a[3]); }`),
    ).toBe("5");
  });

  it("walks pointers", () => {
    expect(runC(`int main() { int x; int *p; x = 5; p = &x; *p = 9; putn(x); }`)).toBe("9");
    expect(
      runC(`int main() { int a[3]; int *p; a[0] = 1; a[1] = 2; a[2] = 3; p = a; putn(*(p + 2)); }`),
    ).toBe("3");
    expect(runC(`int set(int *p) { *p = 77; return 0; } int main() { int x; x = 0; set(&x); putn(x); }`)).toBe(
      "77",
    );
  });

  it("reads strings by the character", () => {
    expect(runC(`int main() { char *s; s = "AB"; putc(s[0]); putc(s[1]); putn(s[2]); }`)).toBe("AB0");
    expect(
      runC(`int len(char *s) { int n; n = 0; while (s[n]) n++; return n; }
        int main() { putn(len("HELLO")); }`),
    ).toBe("5");
  });
});

describe("the hardware, wearing C", () => {
  it("prints", () => {
    expect(runC(`int main() { puts("HI"); putc('\\n'); putn(-1); }`)).toBe("HI\n-1");
  });

  it("reads keys: key() does not wait, getc() does", () => {
    expect(runC(`int main() { putn(key()); }`)).toBe("0");
    expect(runC(`int main() { putc(getc()); }`, { keys: "Q" })).toBe("Q");
  });

  it("reads the random port", () => {
    expect(runC(`int main() { putn(rand() % 10); }`, { rand: 12347 })).toBe("7");
  });

  it("lets asm() through verbatim", () => {
    expect(runC(`int main() { asm("mov r0, 65\\nst r0, [con]"); }`)).toBe("A");
  });
});

describe("the preprocessor, all of it", () => {
  it("substitutes #define constants", () => {
    expect(runC(`#define WIDTH 7\n#define GAP 0x20\nint main() { putn(WIDTH * 2); putc(GAP); putn(WIDTH); }`)).toBe(
      "14 7",
    );
  });
});

describe("complaints", () => {
  it("wants a main", () => {
    expect(errorsOf(`int f() { return 1; }`)).toContainEqual(expect.stringContaining("main"));
  });

  it("reports unknown names with their line", () => {
    const cc = compileC(`int main() {\n  putn(ghost);\n}`);
    expect(cc.ok).toBe(false);
    if (!cc.ok) {
      expect(cc.errors[0]!.line).toBe(2);
      expect(cc.errors[0]!.msg).toContain("ghost");
    }
  });

  it("refuses to redefine the hardware", () => {
    expect(errorsOf(`int putc(int c) { return c; } int main() { return 0; }`)).toContainEqual(
      expect.stringContaining("belongs to the machine"),
    );
  });

  it("counts arguments", () => {
    expect(errorsOf(`int f(int a) { return a; } int main() { return f(1, 2); }`)).toContainEqual(
      expect.stringContaining("argument"),
    );
  });

  it("stops at unclosed things", () => {
    expect(errorsOf(`int main() { puts("never`)).toContainEqual(expect.stringContaining("never closed"));
    expect(errorsOf(`int main() { /* forever`)).toContainEqual(expect.stringContaining("never closed"));
  });
});

describe("the seed", () => {
  it("fizz.c compiles, runs and follows the rules", () => {
    const src = SEED_FILES.find((f) => f.name.endsWith("fizz.c"))!.text;
    const out = runC(src);
    const lines = out.split("\n");
    expect(lines[0]).toBe("1");
    expect(lines[2]).toBe("FIZZ");
    expect(lines[4]).toBe("BUZZ");
    expect(lines[14]).toBe("FIZZBUZZ");
    expect(lines[29]).toBe("FIZZBUZZ");
    expect(lines[30]).toBe("THE RULES HAVE BEEN FOLLOWED.");
  });
});
