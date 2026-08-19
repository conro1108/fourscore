/**
 * The synthesiser: source A, ~70% of the corpus. Phase 3, station 2
 * (llm_training.md).
 *
 *   npx vite-node apps/exe/tools/corpus/synth.ts --tier 1 --n 500
 *   npx vite-node apps/exe/tools/corpus/synth.ts --tier 4 --n 100 --check
 *
 * Valid by construction: every program here is built from the fence rather
 * than guessed at it, so a reject coming off the farm is a bug in this file,
 * not a cost of doing business. The plan's exit criterion is that the farm
 * keeps close to 100% of what this emits, and synth.test.ts holds a sample
 * to exactly 100%.
 *
 * Tiers 1 and 2 carry their own answer. The emitter built the program, so
 * it knows what it prints (`expect`) and what to type at it (`keys`), which
 * hands V2 an exact-stdout grade no grader could infer. The arithmetic is
 * simulated in 16-bit — w16/mul16/shl16 below — because "the generator
 * knows the answer" is only true if it wraps where the machine wraps, and
 * programs that call rand() draw their prediction from verify.ts's own
 * makeRng, seeded the way the probe seeds it.
 *
 * What varies here is axes: constants, geometry, glyphs, copy, names, loop
 * shape. What does NOT vary is structure — a skeleton is one program shape,
 * and structural variety is source B's job (model mutation). That is also
 * why pong stays one-player: a two-player court with nobody at the far
 * paddle can, for some axis rolls, cycle forever without a score, and this
 * file is not allowed to emit rejects. The 2P edit lives in prompt.ts's
 * EDITS, where every attempt is verified individually and a rare reject is
 * just yield.
 */

import { writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import "./graders.js";
import { HEADERS } from "./prompt.js";
import { codes, histogram, makeRng, verify, type Candidate, type Tier } from "./verify.js";

/* ---- randomness for rolling axes (not the machine's rng) ---- */

const rng = (seed: number): (() => number) => {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) % 1_000_003) / 1_000_003;
  };
};
const pickOf = <T,>(xs: readonly T[], r: () => number): T => xs[Math.floor(r() * xs.length)]!;
const int = (r: () => number, lo: number, hi: number): number => lo + Math.floor(r() * (hi - lo + 1));

/* ---- 16-bit arithmetic, so expect wraps where the machine wraps ---- */

const w16 = (n: number): number => (((n | 0) & 0xffff) << 16) >> 16;
const add16 = (a: number, b: number): number => w16(a + b);
const mul16 = (a: number, b: number): number => w16(Math.imul(a, b));
const shl16 = (a: number, s: number): number => w16((a & 0xffff) << s);
/** c.txt: ">> shifts in zeros" — logical, over the 16-bit value. */
const shr16 = (a: number, s: number): number => w16((a & 0xffff) >>> s);

/* ---- what an emitter hands back ---- */

interface Doc {
  family: string;
  /** The program body, headerless — the header goes on in synthesize(). */
  text: string;
  axes: Record<string, string | number>;
  expect?: string;
  keys?: number[];
}
type Emitter = (r: () => number) => Doc;

/** Render one counted loop three ways. The body must not depend on which —
    the loop shape is an axis, not a semantic. */
const loopShape = (
  shape: string,
  iv: string,
  init: number,
  cond: string,
  bump: string,
  body: readonly string[],
): string[] => {
  if (shape === "for")
    return [`    for (${iv} = ${init}; ${cond}; ${bump}) {`, ...body, "    }"];
  if (shape === "while")
    return [`    ${iv} = ${init};`, `    while (${cond}) {`, ...body, `        ${bump};`, "    }"];
  return [`    ${iv} = ${init};`, "    do {", ...body, `        ${bump};`, `    } while (${cond});`];
};

const chr = (c: string): string => (c === "\n" ? "'\\n'" : c === "'" ? "'\\''" : `'${c}'`);

/* ================================================================
 * Tier 1 — expression soup. Every emitter computes its own expect.
 * ================================================================ */

const sumEmit: Emitter = (r) => {
  const start = int(r, 1, 3);
  const count = int(r, 6, 12);
  const term = pickOf(
    [
      { c: "i*i", f: (i: number) => mul16(i, i), name: "squares" },
      { c: "i*i*i", f: (i: number) => mul16(mul16(i, i), i), name: "cubes" },
      { c: "2*i+1", f: (i: number) => add16(mul16(2, i), 1), name: "odds" },
      { c: "i*(i+1)", f: (i: number) => mul16(i, add16(i, 1)), name: "oblongs" },
    ],
    r,
  );
  const sep = pickOf([" ", ","], r);
  const shape = pickOf(["for", "while", "do"], r);
  const iv = pickOf(["i", "n", "k"], r);
  const tv = pickOf(["total", "sum", "acc"], r);
  const tail = pickOf(["= ", "MAKES ", "SUM "], r);
  const opEq = r() < 0.5;
  const end = start + count;

  const body = [
    `        t = ${term.c.replaceAll("i", iv)};`,
    opEq ? `        ${tv} += t;` : `        ${tv} = ${tv} + t;`,
    "        putn(t);",
    `        putc(${chr(sep)});`,
  ];
  const text = [
    "int main() {",
    `    int ${iv};  int ${tv};  int t;`,
    `    ${tv} = 0;`,
    ...loopShape(shape, iv, start, `${iv} < ${end}`, `${iv}++`, body),
    `    puts("${tail}");`,
    `    putn(${tv});`,
    "    putc('\\n');",
    "    return 0;",
    "}",
  ].join("\n");

  let total = 0;
  let out = "";
  for (let i = start; i < end; i++) {
    const t = term.f(i);
    total = add16(total, t);
    out += `${t}${sep}`;
  }
  out += `${tail}${total}\n`;
  return { family: "sum", text, expect: out, axes: { start, count, term: term.name, sep, shape, tail: tail.trim() || "=" } };
};

const countEmit: Emitter = (r) => {
  const up = r() < 0.5;
  const start = up ? int(r, 0, 10) : int(r, 30, 99);
  const step = pickOf([1, 2, 3, 5], r);
  const len = int(r, 8, 15);
  const sep = pickOf([" ", "\n"], r);
  const shape = pickOf(["for", "while", "do"], r);
  const iv = pickOf(["i", "n", "c"], r);
  const done = pickOf(["DONE", "END", "AND REST"], r);
  const bound = up ? start + len * step : start - len * step;
  const cond = up ? `${iv} < ${bound}` : `${iv} > ${bound}`;
  const bump = up ? `${iv} += ${step}` : `${iv} -= ${step}`;

  const body = ["        putn(" + iv + ");", `        putc(${chr(sep)});`];
  const text = [
    "int main() {",
    `    int ${iv};`,
    ...loopShape(shape, iv, start, cond, bump, body),
    `    puts("${done}\\n");`,
    "    return 0;",
    "}",
  ].join("\n");

  let out = "";
  for (let i = start; up ? i < bound : i > bound; i += up ? step : -step) out += `${i}${sep}`;
  out += `${done}\n`;
  return { family: "count", text, expect: out, axes: { dir: up ? "up" : "down", start, step, len, sep: sep === " " ? "sp" : "nl", shape } };
};

const tableEmit: Emitter = (r) => {
  const k = pickOf([2, 3, 4, 6, 7, 8, 9, 12], r);
  const n = int(r, 5, 10);
  const wide = r() < 0.5; // "3 x 4 = 12" vs "3x4=12"
  const shape = pickOf(["for", "while"], r);
  const iv = pickOf(["i", "row"], r);

  const body = wide
    ? [
        `        putn(${k});`,
        '        puts(" x ");',
        `        putn(${iv});`,
        '        puts(" = ");',
        `        putn(${k} * ${iv});`,
        "        putc('\\n');",
      ]
    : [
        `        putn(${k});`,
        "        putc('x');",
        `        putn(${iv});`,
        "        putc('=');",
        `        putn(${k} * ${iv});`,
        "        putc('\\n');",
      ];
  const text = [
    "int main() {",
    `    int ${iv};`,
    ...loopShape(shape, iv, 1, `${iv} <= ${n}`, `${iv}++`, body),
    "    return 0;",
    "}",
  ].join("\n");

  let out = "";
  for (let i = 1; i <= n; i++)
    out += wide ? `${k} x ${i} = ${mul16(k, i)}\n` : `${k}x${i}=${mul16(k, i)}\n`;
  return { family: "table", text, expect: out, axes: { k, n, format: wide ? "wide" : "tight", shape } };
};

const wrapEmit: Emitter = (r) => {
  const x0 = pickOf([32000, 30000, 25000, 28672], r);
  const dbl = r() < 0.4;
  const d = pickOf([500, 900, 1500, 2500], r);
  const m = int(r, 6, 10);
  const step = dbl ? "x = x * 2;" : `x = x + ${d};`;

  const text = [
    "int main() {",
    "    int x;  int i;",
    `    x = ${x0};`,
    `    for (i = 0; i < ${m}; i++) {`,
    "        putn(x);",
    "        putc('\\n');",
    `        ${step}`,
    "    }",
    "    putn(x);",
    "    putc('\\n');",
    "    return 0;",
    "}",
  ].join("\n");

  let out = "";
  let x = x0;
  for (let i = 0; i < m; i++) {
    out += `${x}\n`;
    x = dbl ? mul16(x, 2) : add16(x, d);
  }
  out += `${x}\n`;
  return { family: "wrap", text, expect: out, axes: { x0, op: dbl ? "double" : `add${d}`, m } };
};

const fizzEmit: Emitter = (r) => {
  const d1 = pickOf([3, 4], r);
  const d2 = pickOf([5, 7], r);
  const limit = pickOf([15, 20, 25, 30], r);
  const [a, b] = pickOf(
    [
      ["FIZZ", "BUZZ"],
      ["ZIP", "ZAP"],
      ["PING", "PONG"],
      ["TICK", "TOCK"],
    ],
    r,
  );
  const shape = pickOf(["for", "while"], r);
  const iv = pickOf(["i", "n"], r);

  const body = [
    `        if (${iv} % ${d1} == 0 && ${iv} % ${d2} == 0) puts("${a}${b}\\n");`,
    `        else if (${iv} % ${d1} == 0) puts("${a}\\n");`,
    `        else if (${iv} % ${d2} == 0) puts("${b}\\n");`,
    `        else { putn(${iv}); putc('\\n'); }`,
  ];
  const text = [
    "int main() {",
    `    int ${iv};`,
    ...loopShape(shape, iv, 1, `${iv} <= ${limit}`, `${iv}++`, body),
    "    return 0;",
    "}",
  ].join("\n");

  let out = "";
  for (let i = 1; i <= limit; i++) {
    if (i % d1 === 0 && i % d2 === 0) out += `${a}${b}\n`;
    else if (i % d1 === 0) out += `${a}\n`;
    else if (i % d2 === 0) out += `${b}\n`;
    else out += `${i}\n`;
  }
  return { family: "fizz", text, expect: out, axes: { d1, d2, limit, words: a + b, shape } };
};

const bitsEmit: Emitter = (r) => {
  const left = r() < 0.6;
  const b = left ? pickOf([1, 3, 5, 7], r) : pickOf([0x4000, 0x7000, 0x5500], r);
  const n = int(r, 10, 14);
  const op = left ? "x = x << 1;" : "x = x >> 1;";

  const text = [
    "int main() {",
    "    int x;  int i;",
    `    x = ${b};`,
    `    for (i = 0; i < ${n}; i++) {`,
    "        putn(x);",
    "        putc(' ');",
    `        ${op}`,
    "    }",
    "    putc('\\n');",
    "    return 0;",
    "}",
  ].join("\n");

  let out = "";
  let x = b;
  for (let i = 0; i < n; i++) {
    out += `${x} `;
    x = left ? shl16(x, 1) : shr16(x, 1);
  }
  out += "\n";
  return { family: "bits", text, expect: out, axes: { start: b, dir: left ? "shl" : "shr", n } };
};

/* ================================================================
 * Tier 2 — the console family. expect AND keys: the emitter knows the
 * winning script because it knows the secret, and it knows the secret
 * because it draws from the probe's own rand stream (seed 1 — the
 * default every grading probe uses).
 * ================================================================ */

/** The digit-at-a-time reader every tier-2 skeleton shares — the same shape
    as GUESS_C's, so scripts of "42\n" lines drive all of them. */
const READNUM = (name: string): string[] => [
  `int ${name}() {`,
  "    int n;  int c;",
  "    n = 0;",
  "    c = getc();",
  "    while (c >= '0' && c <= '9') {",
  "        n = n * 10 + (c - '0');",
  "        c = getc();",
  "    }",
  "    return n;",
  "}",
];

const guessEmit: Emitter = (r) => {
  const range = pickOf([50, 64, 100], r);
  const limited = r() < 0.4; // the "hilo" shape: a try budget and a lose path
  const outcome = limited && r() < 0.5 ? "lose" : "win";
  const title = pickOf(
    [
      `I AM THINKING OF A NUMBER, 1 TO ${range}.`,
      `A NUMBER HIDES, 1 TO ${range}.`,
      `GUESS MY NUMBER, 1 TO ${range}.`,
    ],
    r,
  );
  const ask = pickOf(["YOUR GUESS? ", "GUESS? ", "WELL? "], r);
  const [low, high] = pickOf(
    [
      ["HIGHER.", "LOWER."],
      ["TOO LOW.", "TOO HIGH."],
      ["GO UP.", "GO DOWN."],
    ],
    r,
  );
  const [winA, winB] = pickOf(
    [
      ["YES. IT TOOK YOU ", " TRIES."],
      ["GOT IT. ", " TRIES."],
      ["THAT IS IT, IN ", "."],
    ],
    r,
  );
  const loseA = pickOf(["NO MORE TRIES. IT WAS ", "OUT OF TRIES. IT WAS "], r);
  // Echo forces the transcript to depend on the typed digits, which is what
  // keeps two different losing scripts from producing one transcript — the
  // grader's input-inert check probes exactly that.
  const echo = outcome === "lose" || r() < 0.4;
  const gv = pickOf(["g", "guess"], r);
  const reader = pickOf(["readnum", "getnum"], r);

  // The secret, from the probe's own stream.
  const secret = ((makeRng(1)() & 0x7fff) % range) + 1;

  // The script: a binary search that wins, or distinct wrong guesses that
  // run out the try budget.
  const guesses: number[] = [];
  if (outcome === "win") {
    let lo = 1;
    let hi = range;
    for (;;) {
      const mid = (lo + hi) >> 1;
      guesses.push(mid);
      if (mid === secret) break;
      if (mid < secret) lo = mid + 1;
      else hi = mid - 1;
    }
  }
  const tries = outcome === "lose" ? int(r, 3, 5) : guesses.length + int(r, 1, 3);
  if (outcome === "lose")
    for (let j = 0; guesses.length < tries; j++) {
      const g = ((secret + j) % range) + 1; // distinct, never equal to secret
      if (g !== secret) guesses.push(g);
    }

  const text = [
    ...READNUM(reader),
    "",
    "int main() {",
    `    int secret;  int ${gv};  int tries;`,
    `    secret = ((rand() & 0x7FFF) % ${range}) + 1;`,
    "    tries = 0;",
    `    puts("${title}\\n");`,
    "    while (1) {",
    `        puts("${ask}");`,
    `        ${gv} = ${reader}();`,
    "        tries++;",
    ...(echo ? [`        puts("YOU SAID ");`, `        putn(${gv});`, `        puts(". ");`] : []),
    `        if (${gv} == secret) break;`,
    ...(limited
      ? [
          `        if (tries == ${tries}) {`,
          `            puts("${loseA}");`,
          "            putn(secret);",
          '            puts(".\\n");',
          "            return 0;",
          "        }",
        ]
      : []),
    `        if (${gv} < secret) puts("${low}\\n");`,
    `        else puts("${high}\\n");`,
    "    }",
    `    puts("${winA}");`,
    "    putn(tries);",
    `    puts("${winB}\\n");`,
    "    return 0;",
    "}",
  ].join("\n");

  let out = `${title}\n`;
  for (let t = 0; t < guesses.length; t++) {
    const g = guesses[t]!;
    out += ask;
    if (echo) out += `YOU SAID ${g}. `;
    if (g === secret) {
      out += `${winA}${t + 1}${winB}\n`;
      break;
    }
    if (limited && t + 1 === tries) {
      out += `${loseA}${secret}.\n`;
      break;
    }
    out += g < secret ? `${low}\n` : `${high}\n`;
  }
  return {
    family: limited ? "hilo" : "guess",
    text,
    expect: out,
    keys: codes(guesses.map((g) => `${g}\n`).join("")),
    axes: { range, outcome, tries: limited ? tries : 0, echo: echo ? 1 : 0, copy: low },
  };
};

const quizEmit: Emitter = (r) => {
  const q = int(r, 3, 5);
  const mul = r() < 0.4;
  const qa = Array.from({ length: q }, () => int(r, 2, 12));
  const qb = Array.from({ length: q }, () => int(r, 2, 12));
  const title = pickOf(["THE MACHINE ASKS.", "ARITHMETIC. NO PAPER.", "QUIZ TIME."], r);
  const right = pickOf(["RIGHT.", "YES.", "CORRECT."], r);
  const wrong = pickOf(["WRONG.", "NO.", "NOT THAT."], r);
  const tally = pickOf(["SCORE ", "YOU GOT "], r);
  const reader = pickOf(["readnum", "answer"], r);

  // At least one right and, when there's room, one wrong — an all-wrong
  // script risks matching the fallback script's transcript (input-inert).
  const rightAt = new Set<number>([int(r, 0, q - 1)]);
  for (let i = 0; i < q; i++) if (r() < 0.6) rightAt.add(i);
  if (rightAt.size === q && q > 1) rightAt.delete([...rightAt][int(r, 0, q - 1)]!);

  const ans = (i: number): number => (mul ? mul16(qa[i]!, qb[i]!) : qa[i]! + qb[i]!);
  const given = Array.from({ length: q }, (_, i) => (rightAt.has(i) ? ans(i) : ans(i) + int(r, 1, 3)));

  const text = [
    `int qa[] = {${qa.join(", ")}};`,
    `int qb[] = {${qb.join(", ")}};`,
    "",
    ...READNUM(reader),
    "",
    "int main() {",
    "    int i;  int score;  int a;",
    "    score = 0;",
    `    puts("${title}\\n");`,
    `    for (i = 0; i < ${q}; i++) {`,
    '        puts("WHAT IS ");',
    "        putn(qa[i]);",
    `        puts(" ${mul ? "*" : "+"} ");`,
    "        putn(qb[i]);",
    '        puts("? ");',
    `        a = ${reader}();`,
    `        if (a == qa[i] ${mul ? "*" : "+"} qb[i]) { puts("${right}\\n"); score++; }`,
    `        else puts("${wrong}\\n");`,
    "    }",
    `    puts("${tally}");`,
    "    putn(score);",
    '    puts(" OF ");',
    `    putn(${q});`,
    "    putc('\\n');",
    "    return 0;",
    "}",
  ].join("\n");

  let out = `${title}\n`;
  let score = 0;
  for (let i = 0; i < q; i++) {
    out += `WHAT IS ${qa[i]} ${mul ? "*" : "+"} ${qb[i]}? `;
    if (given[i] === ans(i)) {
      out += `${right}\n`;
      score++;
    } else out += `${wrong}\n`;
  }
  out += `${tally}${score} OF ${q}\n`;
  return {
    family: "quiz",
    text,
    expect: out,
    keys: codes(given.map((g) => `${g}\n`).join("")),
    axes: { q, op: mul ? "mul" : "add", rights: score, copy: right },
  };
};

const diceEmit: Emitter = (r) => {
  const sides = pickOf([6, 8, 12, 20], r);
  const rolls = int(r, 3, 6);
  const stop = pickOf(["q", "x"], r);
  const title = pickOf(["THE DICE.", "ROLL UP.", "CHANCE, IN A CUP."], r);
  const rollWord = pickOf(["ROLL: ", "IT SAYS "], r);
  const totalWord = pickOf(["  TOTAL: ", "  SO FAR "], r);
  const leave = pickOf(["YOU LEAVE WITH ", "THE NIGHT ENDS AT "], r);

  const text = [
    "int main() {",
    "    int total;  int roll;  int k;",
    "    total = 0;",
    `    puts("${title}\\n");`,
    `    puts("ANY KEY ROLLS A D${sides}. ${stop.toUpperCase()} STOPS.\\n");`,
    "    k = getc();",
    `    while (k != '${stop}' && k != '${stop.toUpperCase()}') {`,
    `        roll = ((rand() & 0x7FFF) % ${sides}) + 1;`,
    `        puts("${rollWord}");`,
    "        putn(roll);",
    `        puts("${totalWord}");`,
    "        total = total + roll;",
    "        putn(total);",
    "        putc('\\n');",
    "        k = getc();",
    "    }",
    `    puts("${leave}");`,
    "    putn(total);",
    '    puts(".\\n");',
    "    return 0;",
    "}",
  ].join("\n");

  const rr = makeRng(1);
  let out = `${title}\nANY KEY ROLLS A D${sides}. ${stop.toUpperCase()} STOPS.\n`;
  let total = 0;
  for (let i = 0; i < rolls; i++) {
    const roll = ((rr() & 0x7fff) % sides) + 1;
    total += roll;
    out += `${rollWord}${roll}${totalWord}${total}\n`;
  }
  out += `${leave}${total}.\n`;
  return {
    family: "dice",
    text,
    expect: out,
    keys: codes("r".repeat(rolls) + stop),
    axes: { sides, rolls, stop, copy: rollWord.trim() },
  };
};

/* ================================================================
 * Tier 3 — screen toys. No expect: the grader watches for life, and
 * these are alive by construction.
 * ================================================================ */

const bounceEmit: Emitter = (r) => {
  const glyph = pickOf(["*", "@", "o", "+", "#"], r);
  const div = pickOf([1, 2, 3], r);
  const border = pickOf(["none", "rails", "frame"], r);
  const bg = pickOf(["-", "=", "."], r);
  const x0 = int(r, 3, 30);
  const y0 = int(r, 3, 18);
  const dx0 = pickOf([1, -1], r);
  const dy0 = pickOf([1, -1], r);
  const fn = pickOf(["draw", "plot", "put"], r);
  const lo = border === "none" ? 0 : 1;
  const hix = border === "none" ? 39 : 38;
  const hiy = border === "none" ? 23 : 22;

  const rails = [
    "    int i;",
    `    for (i = 0; i < 40; i++) { ${fn}(i, 0, '${bg}'); ${fn}(i, 23, '${bg}'); }`,
  ];
  const frame = [
    ...rails,
    `    for (i = 0; i < 24; i++) { ${fn}(0, i, '${bg}'); ${fn}(39, i, '${bg}'); }`,
  ];

  const text = [
    `void ${fn}(int x, int y, int c) {`,
    "    vpos(y * 40 + x);",
    "    vput(c);",
    "}",
    "",
    "int main() {",
    "    int x;  int y;  int dx;  int dy;  int k;  int t;",
    ...(border === "rails" ? rails : border === "frame" ? frame : []),
    `    x = ${x0};  y = ${y0};`,
    `    dx = ${dx0};  dy = ${dy0};`,
    "    t = 0;",
    "    while (1) {",
    "        vsync();",
    "        k = key();",
    "        while (k) {",
    "            if (k == 'a' || k == 'A') dx = -1;",
    "            if (k == 'd' || k == 'D') dx = 1;",
    "            k = key();",
    "        }",
    "        t++;",
    `        if (t == ${div}) {`,
    "            t = 0;",
    `            ${fn}(x, y, ' ');`,
    "            x = x + dx;  y = y + dy;",
    `            if (x < ${lo})  { x = ${lo};  dx = 1; }`,
    `            if (x > ${hix}) { x = ${hix}; dx = -1; }`,
    `            if (y < ${lo})  { y = ${lo};  dy = 1; }`,
    `            if (y > ${hiy}) { y = ${hiy}; dy = -1; }`,
    `            ${fn}(x, y, '${glyph}');`,
    "        }",
    "    }",
    "}",
  ].join("\n");
  return { family: "bounce", text, axes: { glyph, div, border, x0, y0 } };
};

const marqueeEmit: Emitter = (r) => {
  const msg = pickOf(
    ["HELLO WORLD   ", "GOOD EVENING   ", "THE MACHINE SPEAKS   ", "FOURSCORE   "],
    r,
  );
  const row = pickOf([4, 11, 19], r);
  const div = pickOf([2, 3, 4], r);
  const rails = r() < 0.5;
  const rg = pickOf(["-", "="], r);
  const rightward = r() < 0.5;
  const len = msg.length;

  const text = [
    "int main() {",
    "    char *m;  int off;  int i;  int t;",
    `    m = "${msg}";`,
    "    off = 0;  t = 0;",
    ...(rails
      ? [
          `    for (i = 0; i < 40; i++) { vpos(${row - 1} * 40 + i); vput('${rg}'); }`,
          `    for (i = 0; i < 40; i++) { vpos(${row + 1} * 40 + i); vput('${rg}'); }`,
        ]
      : []),
    "    while (1) {",
    "        vsync();",
    "        t++;",
    `        if (t == ${div}) {`,
    "            t = 0;",
    "            for (i = 0; i < 40; i++) {",
    `                vpos(${row} * 40 + i);`,
    `                vput(m[(i + off) % ${len}]);`,
    "            }",
    ...(rightward
      ? [`            off = off - 1;`, `            if (off < 0) off = ${len - 1};`]
      : [`            off = (off + 1) % ${len};`]),
    "        }",
    "    }",
    "}",
  ].join("\n");
  return { family: "marquee", text, axes: { msg: msg.trim(), row, div, rails: rails ? 1 : 0, dir: rightward ? "right" : "left" } };
};

/** Stars fall; rain falls onto a ground line. One skeleton, two families. */
const fallEmit: Emitter = (r) => {
  const rain = r() < 0.5;
  const glyph = rain ? pickOf(["|", "!", ":"], r) : pickOf(["*", ".", "+"], r);
  const n = int(r, 5, 8);
  const div = pickOf([1, 2, 3], r);
  const ground = pickOf(["_", "="], r);
  const maxy = rain ? 22 : 23;

  const text = [
    `int sx[${n}];`,
    `int sy[${n}];`,
    "",
    "int main() {",
    "    int i;  int t;",
    `    for (i = 0; i < ${n}; i++) {`,
    "        sx[i] = (rand() & 0x7FFF) % 40;",
    `        sy[i] = (rand() & 0x7FFF) % ${maxy + 1};`,
    "    }",
    ...(rain ? [`    for (i = 0; i < 40; i++) { vpos(23 * 40 + i); vput('${ground}'); }`] : []),
    "    t = 0;",
    "    while (1) {",
    "        vsync();",
    "        t++;",
    `        if (t == ${div}) {`,
    "            t = 0;",
    `            for (i = 0; i < ${n}; i++) {`,
    "                vpos(sy[i] * 40 + sx[i]);",
    "                vput(' ');",
    "                sy[i] = sy[i] + 1;",
    `                if (sy[i] > ${maxy}) { sy[i] = 0; sx[i] = (rand() & 0x7FFF) % 40; }`,
    "                vpos(sy[i] * 40 + sx[i]);",
    `                vput('${glyph}');`,
    "            }",
    "        }",
    "    }",
    "}",
  ].join("\n");
  return { family: rain ? "rain" : "stars", text, axes: { glyph, n, div } };
};

const clockEmit: Emitter = (r) => {
  const row = pickOf([2, 6, 11], r);
  const col = pickOf([10, 17, 24], r);
  const label = pickOf(["TIME ", "SO FAR ", "UPTIME "], r);
  const tick = pickOf([".", "-", "*"], r);
  const tickRow = row + pickOf([3, 5], r);
  const tickEvery = pickOf([4, 5, 6], r);
  const pos = row * 40 + col;

  const text = [
    "void digits(int m, int s) {",
    `    vpos(${pos + label.length});`,
    "    vput('0' + m / 10);",
    "    vput('0' + m % 10);",
    "    vput(':');",
    "    vput('0' + s / 10);",
    "    vput('0' + s % 10);",
    "}",
    "",
    "int main() {",
    "    char *l;  int f;  int s;  int m;  int p;  int t;",
    `    l = "${label}";`,
    `    vpos(${pos});`,
    "    while (*l) { vput(*l); l++; }",
    "    f = 0;  s = 0;  m = 0;  p = 0;  t = 0;",
    "    digits(0, 0);",
    "    while (1) {",
    "        vsync();",
    "        f++;",
    "        if (f == 60) {",
    "            f = 0;",
    "            s++;",
    "            if (s == 60) { s = 0; m++; if (m == 60) m = 0; }",
    "            digits(m, s);",
    "        }",
    "        t++;",
    `        if (t == ${tickEvery}) {`,
    "            t = 0;",
    `            vpos(${tickRow} * 40 + p);`,
    `            vput('${tick}');`,
    "            p++;",
    "            if (p == 40) {",
    "                p = 0;",
    `                vpos(${tickRow} * 40);`,
    "                while (p < 40) { vput(' '); p++; }",
    "                p = 0;",
    "            }",
    "        }",
    "    }",
    "}",
  ].join("\n");
  return { family: "clock", text, axes: { row, col, label: label.trim(), tick, tickEvery } };
};

/* ================================================================
 * Tier 4 — pong. One skeleton, many constants; the structure is the
 * reference program's, because the reference is what the graders were
 * proven against. Structural pong variety is the model's job.
 * ================================================================ */

const pongEmit: Emitter = (r) => {
  const h = int(r, 3, 6); // paddle height
  const win = int(r, 3, 7);
  // The grader plays the whole game inside 6,000 frames; win * ballDiv is
  // what stretches a game, so it stays under the measured ceiling.
  const ballDiv = pickOf([2, 3, 4, 5].filter((d) => win * d <= 28), r);
  const aiDiv = int(r, 3, 6);
  const courtG = pickOf(["=", "-", "#", "."], r);
  const paddleG = pickOf(["|", "]", "I"], r);
  const ballG = pickOf(["O", "o", "@", "*"], r);
  const sep = pickOf([":", "-"], r);
  const pause = pickOf([30, 45, 60], r);
  const wasd = r() < 0.75;
  const [up, down] = wasd ? ["w", "s"] : ["i", "k"];
  const english = r() < 0.6;
  const serveScorer = r() < 0.5; // who the ball leaves toward after a point
  const pcol = pickOf([2, 3], r);
  const acol = 39 - pcol;
  const scoreCol = pickOf([14, 18, 24], r);
  // The ball must be the screen's one singleton, so the bottom line avoids
  // every ball glyph (including the letter O).
  const bottom = pickOf(
    wasd ? [" W AND S ", " BAT AND BALL ", " KEEP IT IN PLAY "] : [" I AND K ", " THE RALLY ", " KEEP IT IN PLAY "],
    r,
  );
  const [winMsg, loseMsg] = pickOf(
    [
      ["THE MACHINE CONCEDES.", "THE MACHINE WINS. OF COURSE."],
      ["YOU HAVE IT.", "IT HAS YOU."],
      ["FLESH 1, METAL 0.", "METAL PREVAILS."],
    ],
    r,
  );
  const nm = pickOf(
    [
      { draw: "draw", text: "text", bar: "bar", court: "court", score: "score", serve: "serve", player: "player", machine: "machine", moveball: "moveball", py: "py", ay: "ay", bx: "bx", by: "by", dx: "dx", dy: "dy", ps: "ps", as: "as" },
      { draw: "plot", text: "label", bar: "strip", court: "arena", score: "tally", serve: "launch", player: "you", machine: "foe", moveball: "step", py: "my", ay: "fy", bx: "ballx", by: "bally", dx: "vx", dy: "vy", ps: "mine", as: "theirs" },
      { draw: "drawAt", text: "writeAt", bar: "drawBar", court: "drawCourt", score: "drawScore", serve: "serveBall", player: "movePlayer", machine: "moveFoe", moveball: "stepBall", py: "pTop", ay: "aTop", bx: "ballX", by: "ballY", dx: "dirX", dy: "dirY", ps: "pScore", as: "aScore" },
    ],
    r,
  );
  const hi = 23 - h; // paddle top's clamp
  const mid = h >> 1;
  const bcol = Math.floor((40 - bottom.length) / 2);

  const text = [
    `int ${nm.py} = 10;`,
    `int ${nm.ay} = 10;`,
    `int ${nm.bx};  int ${nm.by};`,
    `int ${nm.dx};  int ${nm.dy};`,
    `int ${nm.ps} = 0;  int ${nm.as} = 0;`,
    "int pause = 0;",
    "",
    `void ${nm.draw}(int x, int y, int c) {`,
    "    vpos(y * 40 + x);",
    "    vput(c);",
    "}",
    "",
    `void ${nm.text}(int x, int y, char *s) {`,
    "    vpos(y * 40 + x);",
    "    while (*s) { vput(*s); s++; }",
    "}",
    "",
    `void ${nm.bar}(int x, int top, int c) {`,
    "    int i;",
    `    for (i = 0; i < ${h}; i++) ${nm.draw}(x, top + i, c);`,
    "}",
    "",
    `void ${nm.court}() {`,
    "    int i;",
    `    for (i = 0; i < 40; i++) { ${nm.draw}(i, 0, '${courtG}'); ${nm.draw}(i, 23, '${courtG}'); }`,
    `    ${nm.text}(${bcol}, 23, "${bottom}");`,
    "}",
    "",
    `void ${nm.score}() {`,
    `    ${nm.draw}(${scoreCol}, 0, '0' + ${nm.ps});`,
    `    ${nm.draw}(${scoreCol + 1}, 0, '${sep}');`,
    `    ${nm.draw}(${scoreCol + 2}, 0, '0' + ${nm.as});`,
    "}",
    "",
    `void ${nm.serve}(int toward) {`,
    `    ${nm.bx} = 20;  ${nm.by} = 11;`,
    `    ${nm.dx} = toward;`,
    `    ${nm.dy} = (rand() & 1) ? 1 : -1;`,
    `    pause = ${pause};`,
    `    ${nm.draw}(${nm.bx}, ${nm.by}, '${ballG}');`,
    "}",
    "",
    `void ${nm.player}(int d) {`,
    "    int ny;",
    `    ny = ${nm.py} + d;`,
    "    if (ny < 1) ny = 1;",
    `    if (ny > ${hi}) ny = ${hi};`,
    `    if (ny != ${nm.py}) { ${nm.bar}(${pcol}, ${nm.py}, ' '); ${nm.py} = ny; ${nm.bar}(${pcol}, ${nm.py}, '${paddleG}'); }`,
    "}",
    "",
    `void ${nm.machine}() {`,
    `    if (${nm.by} > ${nm.ay} + ${mid} && ${nm.ay} < ${hi}) { ${nm.bar}(${acol}, ${nm.ay}, ' '); ${nm.ay}++; ${nm.bar}(${acol}, ${nm.ay}, '${paddleG}'); }`,
    `    if (${nm.by} < ${nm.ay} + ${mid - 1 === 0 ? "0" : mid - 1} && ${nm.ay} > 1) { ${nm.bar}(${acol}, ${nm.ay}, ' '); ${nm.ay}--; ${nm.bar}(${acol}, ${nm.ay}, '${paddleG}'); }`,
    "}",
    "",
    `void ${nm.moveball}() {`,
    "    int ny;",
    `    ${nm.draw}(${nm.bx}, ${nm.by}, ' ');`,
    `    ny = ${nm.by} + ${nm.dy};`,
    `    if (ny == 0) { ${nm.dy} = 1; ny = 2; }`,
    `    if (ny == 23) { ${nm.dy} = -1; ny = 21; }`,
    `    ${nm.by} = ny;`,
    `    ${nm.bx} = ${nm.bx} + ${nm.dx};`,
    `    if (${nm.bx} == ${pcol} && ${nm.dx} < 0 && ${nm.by} >= ${nm.py} && ${nm.by} <= ${nm.py} + ${h - 1}) {`,
    `        ${nm.dx} = 1;  ${nm.bx} = ${pcol + 1};`,
    ...(english
      ? [`        if (${nm.by} == ${nm.py}) ${nm.dy} = -1;`, `        if (${nm.by} == ${nm.py} + ${h - 1}) ${nm.dy} = 1;`]
      : []),
    "    }",
    `    if (${nm.bx} == ${acol} && ${nm.dx} > 0 && ${nm.by} >= ${nm.ay} && ${nm.by} <= ${nm.ay} + ${h - 1}) {`,
    `        ${nm.dx} = -1;  ${nm.bx} = ${acol - 1};`,
    ...(english
      ? [`        if (${nm.by} == ${nm.ay}) ${nm.dy} = -1;`, `        if (${nm.by} == ${nm.ay} + ${h - 1}) ${nm.dy} = 1;`]
      : []),
    "    }",
    `    if (${nm.bx} < ${pcol - 1}) { ${nm.as}++; ${nm.score}(); ${nm.serve}(${serveScorer ? 1 : -1}); return; }`,
    `    if (${nm.bx} > ${acol + 1}) { ${nm.ps}++; ${nm.score}(); ${nm.serve}(${serveScorer ? -1 : 1}); return; }`,
    `    ${nm.draw}(${nm.bx}, ${nm.by}, '${ballG}');`,
    "}",
    "",
    "int main() {",
    "    int k;  int bt;  int mt;",
    `    ${nm.court}();`,
    `    ${nm.bar}(${pcol}, ${nm.py}, '${paddleG}');`,
    `    ${nm.bar}(${acol}, ${nm.ay}, '${paddleG}');`,
    `    ${nm.score}();`,
    `    ${nm.serve}(1);`,
    "    bt = 0;  mt = 0;",
    `    while (${nm.ps} < ${win} && ${nm.as} < ${win}) {`,
    "        vsync();",
    "        k = key();",
    "        while (k) {",
    `            if (k == '${up}' || k == '${up.toUpperCase()}') ${nm.player}(-1);`,
    `            if (k == '${down}' || k == '${down.toUpperCase()}') ${nm.player}(1);`,
    "            k = key();",
    "        }",
    "        if (pause) { pause--; continue; }",
    "        bt++;",
    `        if (bt == ${ballDiv}) { bt = 0; ${nm.moveball}(); }`,
    "        mt++;",
    `        if (mt == ${aiDiv}) { mt = 0; ${nm.machine}(); }`,
    "    }",
    `    if (${nm.ps} > ${nm.as}) ${nm.text}(${Math.floor((40 - winMsg.length) / 2)}, 11, "${winMsg}");`,
    `    else ${nm.text}(${Math.floor((40 - loseMsg.length) / 2)}, 11, "${loseMsg}");`,
    `    ${nm.text}(16, 13, "ANY KEY.");`,
    "    while (key()) ;",
    "    while (!key()) vsync();",
    "    return 0;",
    "}",
  ].join("\n");

  return {
    family: "pong",
    text,
    axes: {
      paddle: h,
      win,
      ballDiv,
      aiDiv,
      glyph: `${courtG}${paddleG}${ballG}`,
      up,
      down,
      english: english ? 1 : 0,
      serve: serveScorer ? "scorer" : "loser",
      pcol,
      pause,
      names: nm.draw,
    },
  };
};

/* ---- putting a batch together ---- */

const EMITTERS: Record<Tier, Emitter[]> = {
  1: [sumEmit, countEmit, tableEmit, wrapEmit, fizzEmit, bitsEmit],
  2: [guessEmit, quizEmit, diceEmit],
  3: [bounceEmit, marqueeEmit, fallEmit, clockEmit],
  4: [pongEmit],
};

/** The header whose filename matches the family — the filename is the
    family key, and a header that mismatches its body teaches the model
    that the request is only a hint. */
const headerFor = (tier: Tier, family: string, r: () => number): string => {
  const match = HEADERS[tier].filter((x) => x.startsWith(`/* ${family}.`));
  return pickOf(match.length ? match : HEADERS[tier], r);
};

/**
 * n candidates for a tier, deterministic in the seed. Identical axis rolls
 * are re-rolled rather than emitted twice — synthesis that repeats itself
 * is corpus that lies about its size. (Real dedup policy — caps per
 * skeleton, held-out axis cells — is station 3's job, on the whole pool.)
 */
export function synthesize(tier: Tier, n: number, seed: number): Candidate[] {
  const r = rng(seed * 2_654_435 + tier);
  const seen = new Set<string>();
  const out: Candidate[] = [];
  for (let i = 0; i < n; i++) {
    let doc: Doc | null = null;
    for (let tries = 0; tries < 25; tries++) {
      const d = pickOf(EMITTERS[tier], r)(r);
      const sig = d.family + JSON.stringify(d.axes);
      if (!seen.has(sig)) {
        seen.add(sig);
        doc = d;
        break;
      }
    }
    if (!doc) continue; // the axis space is exhausted at this n; emit fewer
    const header = headerFor(tier, doc.family, r);
    out.push({
      id: `t${tier}/synth/${seed}-${i}`,
      tier,
      text: `${header}\n\n${doc.text}\n`,
      ...(doc.expect !== undefined ? { expect: doc.expect } : {}),
      ...(doc.keys ? { keys: doc.keys } : {}),
      axes: { family: doc.family, ...doc.axes },
    });
  }
  return out;
}

/* ---- cli ---- */

const flag = (name: string, fallback: string): string => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1]! : fallback;
};

if (!process.env.VITEST) {
  const tier = Number(flag("tier", "1")) as Tier;
  const n = Number(flag("n", "100"));
  const seed = Number(flag("seed", "1"));
  const out = flag("out", `data/corpus/raw/t${tier}-synth.jsonl`);
  const cands = synthesize(tier, n, seed);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, cands.map((c) => JSON.stringify(c)).join("\n") + "\n");
  console.log(`${cands.length} candidates → ${out}`);

  if (process.argv.includes("--check")) {
    // Inline and single-threaded: fine for a few hundred. A real batch goes
    // through farm.ts, which is the same graders across every core.
    const t0 = Date.now();
    const verdicts = cands.map(verify);
    const kept = verdicts.filter((v) => v.ok).length;
    console.log(`\n${kept}/${verdicts.length} kept (${((100 * kept) / verdicts.length).toFixed(1)}%), ${((Date.now() - t0) / 1000).toFixed(1)}s`);
    for (const [key, count] of histogram(verdicts)) console.log(`  ${String(count).padStart(5)}  ${key}`);
    for (const v of verdicts.filter((x) => !x.ok).slice(0, 5))
      console.log(`  e.g. ${v.id}: ${v.fail} ${v.detail ?? ""}`);
  }
}
