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

describe("functions", () => {
  it("recurses", () => {
    expect(runC(`int fib(int n) { if (n < 2) return n; return fib(n - 1) + fib(n - 2); }
      int main() { putn(fib(15)); }`)).toBe("610");
    expect(runC(`int fact(int n) { return n < 2 ? 1 : n * fact(n - 1); }
      int main() { putn(fact(7)); }`)).toBe("5040");
  });
});

describe("the heap", () => {
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
});

describe("expressions, at random", () => {
  const U = (v: number): number => v & 0xffff;
  const S = (v: number): number => (v & 0x8000 ? (v & 0xffff) - 0x10000 : v & 0xffff);
  const G = 1234;
  const L = 7;
  const ARR = [10, 20, 30, 40];
  const NAMES: [string, number][] = [["g", G], ["l", L], ["a[2]", ARR[2]!]];
  const BIN = ["+", "-", "*", "&", "|", "^", "<<", ">>", "==", "!=", "<", ">", "<=", ">=", "&&", "||"];

  let seed = 12345;
  const rnd = (n: number): number => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed % n;
  };

  /** A random expression, and what a 16-bit machine owes for it. */
  function gen(depth: number): { c: string; v: number } {
    const pick = rnd(depth <= 0 ? 2 : 12);
    if (pick < 1) {
      // the sign boundary is where imm(), the compare bias and FOLD all
      // change their minds, and a uniform draw over 65536 rarely lands there
      const EDGES = [0, 1, 2, 15, 16, 31, 32, 127, 128, 0x7fff, 0x8000, 0x8001, 0xfffe, 0xffff];
      const n = rnd(3) ? rnd(0x10000) : EDGES[rnd(EDGES.length)]!;
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
    if (pick < 5) {
      // an index the compiler cannot see through, off an array and off a
      // pointer at the same array — the two go down different peepholes
      const e = gen(depth - 1);
      const name = rnd(2) ? "a" : "p";
      return { c: `${name}[(${e.c}) & 3]`, v: ARR[e.v & 3]! };
    }
    if (pick < 6) {
      // a call, so that fixed frames get filled from expressions that are
      // themselves calls
      const a = gen(depth - 1);
      if (rnd(2)) return { c: `id(${a.c})`, v: a.v };
      const b = gen(depth - 1);
      return { c: `sum(${a.c}, ${b.c})`, v: U(a.v + b.v) };
    }
    if (pick < 7) {
      // a conditional as an operand puts emitBranch's labels and jumps
      // inside whatever window the enclosing operator has opened
      const c = gen(depth - 1);
      const t = gen(depth - 1);
      const f = gen(depth - 1);
      return { c: `(${c.c}) ? (${t.c}) : (${f.c})`, v: c.v !== 0 ? t.v : f.v };
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

  const PRELUDE =
    `int g = ${G};\nint a[] = {${ARR.join(", ")}};\nint *p;\n` +
    `int id(int v) { return v; }\nint sum(int x, int y) { return x + y; }\n`;

  /** The same work in a frame that stacks. The self-call never runs — it is
      there to put `say` on a cycle of the call graph, so its locals go on the
      data stack and the frame-pointer half of the compiler gets exercised at
      all. Without it every name in this test resolves to a fixed address. */
  const HARNESSES = [
    (body: string): string => `${PRELUDE}int main() { int l; l = ${L}; p = a;\n  ${body}\n}`,
    (body: string): string =>
      `${PRELUDE}int say(int n) { int l; l = ${L}; p = a;\n` +
      `  if (n > 30000) return say(n - 1);\n  ${body}\n  return 0; }\n` +
      `int main() { say(0); }`,
  ];

  it("come out the same on the processor as on paper, framed either way", () => {
    for (let round = 0; round < 3; round++) {
      const es = Array.from({ length: 30 }, () => gen(3));
      const body = es
        .map((e) => `putn(${e.c}); putc(44); if (${e.c}) putc(84); else putc(70); putc(59);`)
        .join("\n  ");
      for (const [h, harness] of HARNESSES.entries()) {
        const src = harness(body);
        if (h === 1) expect(compileC(src)).toMatchObject({ ok: true });
        const out = runC(src, { maxSteps: 8_000_000 });
        const got = out.split(";").filter((x) => x.length);
        es.forEach((e, i) => {
          expect(`[${h}] ${e.c} => ${got[i]}`).toBe(`[${h}] ${e.c} => ${S(e.v)},${e.v !== 0 ? "T" : "F"}`);
        });
      }
    }
  });
});

describe("the seed", () => {
  it("list.c compiles, runs and goes both ways", () => {
    const src = SEED_FILES.find((f) => f.name.endsWith("list.c"))!.text;
    const out = runC(src);
    expect(out).toBe("25 16 9 4 1 \n1 4 9 16 25 \nTHE LIST WENT BOTH WAYS.\n");
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

  it("maze.c, tetris.c and c4.c compile, draw and take a key", () => {
    const seed = (n: string): string => SEED_FILES.find((f) => f.name.endsWith(n))!.text;
    const play = (n: string, keys: number[], frames: number): string[] => {
      const vm = vmOf(seed(n), { keys, rand: 12345 });
      for (let f = 0; f < frames; f++) vm.run(STEPS);
      expect(vm.fault).toBeNull();
      return screenRows(vm);
    };
    const maze = play("maze.c", ["d".charCodeAt(0)], 400);
    expect(maze[0]).toContain("#######");
    expect(maze[21]![37]).toBe("*");
    expect(maze[1]!.includes("@")).toBe(true);
    const tetris = play("tetris.c", [" ".charCodeAt(0)], 40);
    expect(tetris[22]!.slice(14, 26)).toBe("============");
    expect(tetris.join("")).toContain("#"); // the dropped piece became floor
    const c4 = play("c4.c", ["4".charCodeAt(0)], 120);
    expect(c4[15]![24]).toBe("O");
    expect(c4.join("")).toContain("X"); // the machine has answered
  });
});
