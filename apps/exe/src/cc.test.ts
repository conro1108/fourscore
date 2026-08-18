/**
 * The C compiler's tests. Every program here is compiled to real assembly,
 * assembled to real words and run on the real CPU — the whole toolchain in
 * one bite, which is the only honest way to test a compiler. The .c seed on
 * the disk compiles and runs here too, so c.txt, fizz.c and cc.ts can't
 * drift apart without a test going red.
 */

import { describe, expect, it } from "vitest";
import { assemble, makeVm, SCREEN_H, SCREEN_W, type Vm, type VmIO } from "./vm.js";
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

/** Compile and hand back the machine itself — for programs that draw, which
    runC's console string can't see. The caller drives run() frame by frame. */
function vmOf(src: string, opts: { keys?: number[]; rand?: number } = {}): Vm {
  const cc = compileC(src);
  if (!cc.ok) throw new Error(cc.errors.map((e) => `line ${e.line}: ${e.msg}`).join("; "));
  const res = assemble(cc.asm);
  if (!res.ok) throw new Error("CC emitted bad asm");
  const io: VmIO = {
    putChar: () => {},
    putNum: () => {},
    key: () => opts.keys?.shift() ?? 0,
    rand: () => opts.rand ?? 0,
  };
  return makeVm(res.words, io);
}

/** The screen the way the terminal would draw it: 24 strings of 40. */
const screenRows = (vm: Vm): string[] => {
  const rows: string[] = [];
  for (let y = 0; y < SCREEN_H; y++) {
    let row = "";
    for (let x = 0; x < SCREEN_W; x++) {
      const v = vm.screen[y * SCREEN_W + x]!;
      row += v >= 32 && v < 127 ? String.fromCharCode(v) : " ";
    }
    rows.push(row);
  }
  return rows;
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

describe("structs, the heap and initialiser lists", () => {
  it("reads and writes fields through values and pointers alike", () => {
    expect(
      runC(`
        struct Point { int x; int y; };
        int main() {
          struct Point p;
          struct Point *q;
          p.x = 3; p.y = 4;
          q = &p;
          putn(q->x * q->x + q->y * q->y);
          q->y = 10;
          putn(p.y);
        }`),
    ).toBe("2510");
  });

  it("builds and walks a linked list on the heap", () => {
    expect(
      runC(`
        struct Node { int val; struct Node *next; };
        struct Node *push(struct Node *head, int v) {
          struct Node *n;
          n = malloc(sizeof(struct Node));
          n->val = v;
          n->next = head;
          return n;
        }
        int main() {
          struct Node *head;
          struct Node *p;
          int i;
          head = 0;
          for (i = 1; i <= 4; i++) head = push(head, i);
          for (p = head; p; p = p->next) putn(p->val);
          putn(head->next->val); // the chain types itself
          putn(push(0, 9)->val); // and so does a call
        }`),
    ).toBe("432139");
  });

  it("hands out distinct zeroed blocks, and free is a courtesy", () => {
    expect(
      runC(`
        int main() {
          int *a;
          int *b;
          a = malloc(3);
          b = malloc(2);
          putn(b - a);
          putn(a[0] + a[1] + a[2]);
          a[0] = 7;
          putn(b[0]);
          free(a);
          putn(a[0]);
        }`),
    ).toBe("3007");
  });

  it("sizeof counts words", () => {
    expect(
      runC(`
        struct Pair { int a; int b; };
        int main() {
          putn(sizeof(struct Pair));
          putn(sizeof(int));
          putn(sizeof(struct Pair *));
        }`),
    ).toBe("211");
  });

  it("fills arrays from initialiser lists, global and local, padding with zeros", () => {
    expect(
      runC(`
        int g[] = {2, 7, 11, 15};
        int h[6] = {1, 2, 3};
        int main() {
          int a[4] = {5, 6};
          int m[] = {-4, 'A'};
          putn(g[0] + g[1] + g[2] + g[3]);
          putn(h[2] + h[5]);
          putn(a[0] + a[1] + a[2] + a[3]);
          putn(m[0]);
          putc(m[1]);
        }`),
    ).toBe("35311-4A");
  });

  it("complains usefully about struct mistakes", () => {
    expect(
      errorsOf(`struct P { int x; }; int main() { struct P p; putn(p.z); }`),
    ).toContainEqual(expect.stringContaining("No field z"));
    expect(errorsOf(`struct P { struct P inner; }; int main() {}`)).toContainEqual(
      expect.stringContaining("use a pointer"),
    );
    expect(errorsOf(`struct P { int x; }; int main() { struct P a[3]; }`)).toContainEqual(
      expect.stringContaining("wants pointers"),
    );
    expect(errorsOf(`int main() { struct Ghost *p; }`)).toContainEqual(
      expect.stringContaining("define it before"),
    );
    expect(errorsOf(`int main() { putn(sizeof(3)); }`)).toContainEqual(
      expect.stringContaining("sizeof wants a type"),
    );
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

describe("the screen, wearing C", () => {
  it("vpos aims and vput lands characters", () => {
    const vm = vmOf(
      `int main() { vpos(0); vput('H'); vput('I'); vpos(3 * 40 + 5); vput('!'); return 0; }`,
    );
    vm.run(100_000);
    expect(vm.halted).toBe(true);
    expect(vm.screenOn).toBe(true);
    const rows = screenRows(vm);
    expect(rows[0]!.startsWith("HI")).toBe(true);
    expect(rows[3]![5]).toBe("!");
  });

  it("vsync paces a loop to one pass per frame", () => {
    const vm = vmOf(
      `int main() { int i; for (i = 0; i < 3; i++) { vsync(); vpos(i); vput('X'); } return 0; }`,
    );
    vm.run(30_000); // frame 1: the program reaches its first rest, draws nothing
    expect(vm.screen[0]).toBe(0);
    vm.run(30_000); // frame 2: one X
    expect(String.fromCharCode(vm.screen[0]!)).toBe("X");
    expect(vm.screen[1]).toBe(0);
    vm.run(30_000);
    vm.run(30_000);
    expect(vm.halted).toBe(true);
    expect(String.fromCharCode(vm.screen[2]!)).toBe("X");
  });
});

describe("the drive, wearing C", () => {
  const media = Uint8Array.from({ length: 70000 }, (_, i) => (i * 3 + 1) & 0xff);

  /** Like runC, but with something in the drive bay. */
  const runDrive = (src: string, bytes: Uint8Array): string => {
    const cc = compileC(src);
    if (!cc.ok) throw new Error(cc.errors.map((e) => `line ${e.line}: ${e.msg}`).join("; "));
    const res = assemble(cc.asm);
    if (!res.ok) throw new Error("CC emitted bad asm");
    let out = "";
    const vm = makeVm(res.words, {
      putChar: (c) => (out += String.fromCharCode(c)),
      putNum: (n) => (out += String(n)),
      key: () => 0,
      rand: () => 0,
      drive: () => bytes,
    });
    vm.run(500_000);
    if (vm.fault) throw new Error(vm.fault);
    return out;
  };

  it("aims the head, reads bytes, and writes them back", () => {
    expect(
      runDrive(
        `int main() {
           dpos(4); putn(dget()); putn(dget());
           dpos(4); dput(99); dpos(4); putn(dget());
         }`,
        Uint8Array.from(media),
      ),
    ).toBe("131699");
  });

  it("addresses past a bank, and the head carries into it", () => {
    expect(
      runDrive(
        `int main() {
           dbank(1); dpos(2); putn(dget());
           dbank(0); dpos(0xffff); dget(); putn(dbank_read());
         }`.replace("dbank_read()", "0"),
        Uint8Array.from(media),
      ),
    ).toBe(`${(65538 * 3 + 1) & 0xff}0`);
  });
});

describe("what the compiler makes of it", () => {
  it("works sums of constants out while compiling", () => {
    expect(runC(`#define A 7\n#define B 6\nint main() { putn(A * B + 1 << 1); }`)).toBe("86");
    // and the folded program is shorter than the one that adds at run time
    const folded = compileC(`int main() { putn(2 * 3 * 4 * 5); }`);
    const live = compileC(`int main() { int a; a = 2; putn(a * 3 * 4 * 5); }`);
    if (!folded.ok || !live.ok) throw new Error("both should compile");
    expect(assemble(folded.asm)).toMatchObject({ ok: true });
    expect(folded.asm.split("\n").length).toBeLessThan(live.asm.split("\n").length);
  });

  it("keeps a function's locals at fixed addresses unless it recurses", () => {
    const flat = compileC(`int f(int a) { int b; b = a + 1; return b; } int main() { putn(f(41)); }`);
    const deep = compileC(`int f(int a) { if (a < 2) return a; return f(a - 1) + f(a - 2); }
      int main() { putn(f(10)); }`);
    if (!flat.ok || !deep.ok) throw new Error("both should compile");
    expect(flat.asm).toContain("v_f_0");
    expect(flat.asm).not.toContain("[recurses]");
    expect(deep.asm).toContain("[recurses]");
    expect(deep.asm).not.toContain("v_f_0");
    // and both still give the right answer
    expect(runC(`int f(int a) { int b; b = a + 1; return b; } int main() { putn(f(41)); }`)).toBe("42");
    expect(runC(`int f(int a) { if (a < 2) return a; return f(a - 1) + f(a - 2); }
      int main() { putn(f(10)); }`)).toBe("55");
  });

  it("does not let a nested call tread on the frame being filled", () => {
    // f(x, f(y, z)) re-enters f without f calling itself, so there is no
    // cycle in the call graph to notice and f keeps its fixed frame — but
    // the inner call would write the very slots the outer one has filled.
    expect(runC(`int f(int a, int b) { return a * 100 + b; }
      int main() { putn(f(7, f(1, 2))); }`)).toBe("802");
    // and the same thing one step removed, through another function
    expect(runC(`int f(int a, int b) { return a * 100 + b; }
      int g(int v) { return f(v, 0); }
      int main() { putn(f(7, g(1))); }`)).toBe("800");
    // the first argument is safe either way: it is done before anything is
    // written, so this one must not pay for the stack
    expect(runC(`int f(int a, int b) { return a * 100 + b; }
      int main() { putn(f(f(1, 2), 7)); }`)).toBe("10207");
    const safe = compileC(`int f(int a, int b) { return a + b; }
      int g(int v) { return v; } int main() { putn(f(1, g(2))); }`);
    if (!safe.ok) throw new Error("should compile");
    expect(safe.asm).not.toContain("push r0\n        push r0");
  });

  it("spots recursion that goes the long way round", () => {
    // f and g are each other's, which no amount of looking at one shows
    const cc = compileC(`int f(int n) { return n > 0 ? g(n - 1) : 0; }
      int g(int n) { return f(n); } int main() { putn(f(3)); }`);
    if (!cc.ok) throw new Error(cc.errors.map((e) => e.msg).join("; "));
    expect(cc.asm).toContain("[recurses]");
  });

  it("only puts a string in the image if something points at it", () => {
    // every asm() is a string literal too; a program that leans on the
    // escape hatch used to carry a copy of its own assembly
    const cc = compileC(`int main() { asm("mov r0, 65"); asm("st r0, [con]"); }`);
    if (!cc.ok) throw new Error("should compile");
    expect(cc.asm).not.toContain(".str");
    expect(runC(`int main() { asm("mov r0, 65"); asm("st r0, [con]"); }`)).toBe("A");
  });

  it("lets asm name a global, a function, and its own arguments", () => {
    expect(
      runC(`int total;
        void add() { asm("ld r0, [$total]"); asm("add r0, 1"); asm("st r0, [$total]"); }
        int twice(int v) { asm("ld r0, [$v]"); asm("add r0, r0"); asm("st r0, [$v]"); return v; }
        int main() { asm("call $add"); asm("call $add"); putn(total); putn(twice(21)); }`),
    ).toBe("242");
  });

  it("says so when asm names something it cannot reach", () => {
    expect(errorsOf(`int main() { asm("ld r0, [$ghost]"); }`)).toContainEqual(
      expect.stringContaining("Unknown name: ghost"),
    );
    expect(
      errorsOf(`int f(int n) { asm("ld r0, [$n]"); return n < 1 ? 0 : f(n - 1); } int main() { f(2); }`),
    ).toContainEqual(expect.stringContaining("cannot name something on the stack"));
  });
});

/**
 * The peepholes are the kind of thing that passes every case anyone thinks to
 * write and then fails quietly on one shape nobody did — a constant on the
 * left of a shift, a comparison used as a value rather than as a branch, an
 * operand that had to go through the stack after all. So: three hundred
 * random expressions, worked out once by a 16-bit reference here and once by
 * the real processor, each of them both printed and branched on.
 * board.test.ts fuzzes the bitboard for the same reason.
 */
describe("expressions, at random", () => {
  const U = (v: number): number => v & 0xffff;
  const S = (v: number): number => (v & 0x8000 ? (v & 0xffff) - 0x10000 : v & 0xffff);
  const G = 1234;
  const L = 7;
  const A2 = 30;
  const NAMES: [string, number][] = [["g", G], ["l", L], ["a[2]", A2]];
  const BIN = ["+", "-", "*", "&", "|", "^", "<<", ">>", "==", "!=", "<", ">", "<=", ">=", "&&", "||"];

  let seed = 12345;
  const rnd = (n: number): number => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed % n;
  };

  /** A random expression, and what a 16-bit machine owes for it. */
  function gen(depth: number): { c: string; v: number } {
    const pick = rnd(depth <= 0 ? 2 : 10);
    if (pick < 1) {
      const n = rnd(0x10000);
      return { c: String(n), v: n };
    }
    if (pick < 2) {
      const [c, v] = NAMES[rnd(NAMES.length)]!;
      return { c, v };
    }
    if (pick < 3) {
      const e = gen(depth - 1);
      const op = ["-", "~", "!"][rnd(3)]!;
      return { c: `${op}(${e.c})`, v: op === "-" ? U(-e.v) : op === "~" ? U(~e.v) : e.v === 0 ? 1 : 0 };
    }
    if (pick < 4) {
      // only ever by a literal that is not zero, so nothing has to fault
      const e = gen(depth - 1);
      const k = 1 + rnd(200);
      const op = rnd(2) ? "/" : "%";
      const q = Math.trunc(S(e.v) / k);
      return { c: `(${e.c}) ${op} ${k}`, v: op === "/" ? U(q) : U(S(e.v) - q * k) };
    }
    const a = gen(depth - 1);
    const b = gen(depth - 1);
    const op = BIN[rnd(BIN.length)]!;
    const sh = b.v & 31;
    const v = {
      "+": () => U(a.v + b.v),
      "-": () => U(a.v - b.v),
      "*": () => U(a.v * b.v),
      "&": () => U(a.v & b.v),
      "|": () => U(a.v | b.v),
      "^": () => U(a.v ^ b.v),
      "<<": () => (sh >= 16 ? 0 : U(a.v << sh)),
      ">>": () => (sh >= 16 ? 0 : a.v >>> sh),
      "==": () => (a.v === b.v ? 1 : 0),
      "!=": () => (a.v !== b.v ? 1 : 0),
      "<": () => (S(a.v) < S(b.v) ? 1 : 0),
      ">": () => (S(a.v) > S(b.v) ? 1 : 0),
      "<=": () => (S(a.v) <= S(b.v) ? 1 : 0),
      ">=": () => (S(a.v) >= S(b.v) ? 1 : 0),
      "&&": () => (a.v !== 0 && b.v !== 0 ? 1 : 0),
      "||": () => (a.v !== 0 || b.v !== 0 ? 1 : 0),
    }[op]!();
    return { c: `(${a.c}) ${op} (${b.c})`, v };
  }

  it("come out the same on the processor as on paper", () => {
    for (let round = 0; round < 10; round++) {
      const es = Array.from({ length: 30 }, () => gen(3));
      const body = es
        .map((e) => `putn(${e.c}); putc(44); if (${e.c}) putc(84); else putc(70); putc(59);`)
        .join("\n  ");
      const out = runC(
        `int g = ${G};\nint a[4] = {0, 0, ${A2}, 0};\nint main() { int l; l = ${L};\n  ${body}\n}`,
        { maxSteps: 4_000_000 },
      );
      const got = out.split(";").filter((x) => x.length);
      es.forEach((e, i) => {
        expect(`${e.c} => ${got[i]}`).toBe(`${e.c} => ${S(e.v)},${e.v !== 0 ? "T" : "F"}`);
      });
    }
  });
});

describe("the seed", () => {
  it("list.c compiles, runs and goes both ways", () => {
    const src = SEED_FILES.find((f) => f.name.endsWith("list.c"))!.text;
    const out = runC(src);
    expect(out).toBe("25 16 9 4 1 \n1 4 9 16 25 \nTHE LIST WENT BOTH WAYS.\n");
  });

  it("map.c compiles, runs and finds both pairs", () => {
    const src = SEED_FILES.find((f) => f.name.endsWith("map.c"))!.text;
    const out = runC(src);
    expect(out).toBe(
      "TWO SUM. TARGET 9.\n2 + 7 (slots 0 and 1)\n1 + 8 (slots 4 and 5)\nTHE MAP REMEMBERS WHAT IT WAS TOLD.\n",
    );
  });

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

  const pongSrc = (): string => SEED_FILES.find((f) => f.name.endsWith("pong.c"))!.text;
  const STEPS = 30_000; // the terminal's per-frame budget

  it("pong.c compiles and puts up a court", () => {
    const vm = vmOf(pongSrc());
    for (let f = 0; f < 10; f++) vm.run(STEPS);
    expect(vm.fault).toBeNull();
    expect(vm.screenOn).toBe(true);
    const rows = screenRows(vm);
    expect(rows[0]!.slice(0, 18)).toBe("==================");
    expect(rows[0]!.slice(18, 21)).toBe("0:0");
    expect(rows[0]!.slice(21)).toBe("===================");
    expect(rows[23]).toContain(" W AND S ");
    expect(rows[11]![20]).toBe("O"); // the serve, resting
    expect(rows.filter((r) => r[2] === "|").length).toBe(4);
    expect(rows.filter((r) => r[37] === "|").length).toBe(4);
  });

  it("pong.c: W moves your paddle, and the ball leaves the serve", () => {
    const vm = vmOf(pongSrc(), { keys: [119, 119, 119] }); // w, w, w
    for (let f = 0; f < 120; f++) vm.run(STEPS);
    expect(vm.fault).toBeNull();
    const tops = screenRows(vm)
      .map((r, y) => (r[2] === "|" ? y : -1))
      .filter((y) => y >= 0);
    expect(tops).toEqual([7, 8, 9, 10]); // three taps up from 10
    // the ball is one ball, and it does not sit still for 60 frames
    const seen = new Set<string>();
    for (let f = 0; f < 60; f++) {
      vm.run(STEPS);
      const cells: number[] = [];
      screenRows(vm).forEach((r, y) => {
        for (let x = 0; x < SCREEN_W; x++) if (r[x] === "O") cells.push(y * SCREEN_W + x);
      });
      expect(cells.length).toBe(1);
      seen.add(String(cells[0]));
    }
    expect(seen.size).toBeGreaterThan(1);
  });

  it("pong.c: a rally ends and the score moves", () => {
    // park the paddle at the bottom and let the rally resolve itself. The
    // run is deterministic (rand is stubbed), and it happens to be the
    // machine that misses first — the machine is honestly beatable.
    const vm = vmOf(pongSrc(), { keys: Array(30).fill(115) }); // s, held
    let scored = "";
    for (let f = 0; f < 3000 && !scored; f++) {
      vm.run(STEPS);
      if (vm.fault) throw new Error(vm.fault);
      const top = screenRows(vm)[0]!.slice(18, 21);
      if (top !== "0:0") scored = top;
    }
    expect(scored).toBe("1:0");
  });
});
