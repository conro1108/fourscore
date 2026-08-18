/**
 * The graders' own test set: programs known to work, and programs broken on
 * purpose with the taxonomy key each one is supposed to earn.
 *
 * llm_training.md's day-one warning is that **a grader that rejects nothing
 * is the failure mode**, and the only defence is a set of things it has to
 * reject. Every mutant below is one letter of one line away from a program
 * that passes, which is the interesting distance — a grader that catches
 * garbage but waves through a pong whose paddle is wired to nothing has not
 * caught the thing that will actually come out of a 27B.
 *
 * The known-good set is the four `/src` C programs that stand alone, plus a
 * tier-2 and a tier-3 reference written here because the disk has none — the
 * seeded `guess.asm` is assembly, and there is no screen toy smaller than
 * pong. Those two double as the tier's first few-shot examples. `llm.c` is
 * the fifth `/src` program and is deliberately not here: it needs its drive
 * mounted to do anything, and it belongs to no curriculum tier.
 */

import { SEED_FILES } from "../../src/copy.js";
import type { Candidate } from "./verify.js";

const seed = (name: string): string => SEED_FILES.find((f) => f.name.endsWith(name))!.text;

/* ---- references the disk doesn't carry ---- */

/** Tier 2's reference: loops, `getc`, `rand`, a transcript that depends on
    what you typed. Reads a number a digit at a time and stops at anything
    else, so a script of lines or of bare digits both drive it. */
export const GUESS_C = [
  "/* guess.c — the machine thinks of a number and you go and find it. */",
  "",
  "int readnum() {",
  "    int n;  int c;",
  "    n = 0;",
  "    c = getc();",
  "    while (c >= '0' && c <= '9') {",
  "        n = n * 10 + (c - '0');",
  "        c = getc();",
  "    }",
  "    return n;",
  "}",
  "",
  "int main() {",
  "    int secret;  int guess;  int tries;",
  "    secret = ((rand() & 0x7FFF) % 100) + 1;",
  "    tries = 0;",
  '    puts("I AM THINKING OF A NUMBER, 1 TO 100.\\n");',
  "    while (1) {",
  '        puts("YOUR GUESS? ");',
  "        guess = readnum();",
  "        tries++;",
  "        if (guess == secret) break;",
  '        if (guess < secret) puts("HIGHER.\\n");',
  '        else puts("LOWER.\\n");',
  "    }",
  '    puts("YES. IT TOOK YOU ");',
  "    putn(tries);",
  '    puts(" TRIES.\\n");',
  "    return 0;",
  "}",
].join("\n");

/** Tier 3's reference: the screen ports, animation, and keys that steer. */
export const BOUNCE_C = [
  "/* bounce.c — a character with somewhere to be. A and D turn it around. */",
  "",
  "int x = 5;   int y = 5;",
  "int dx = 1;  int dy = 1;",
  "",
  "void draw(int cx, int cy, int c) {",
  "    vpos(cy * 40 + cx);",
  "    vput(c);",
  "}",
  "",
  "int main() {",
  "    int k;  int t;",
  "    for (t = 0; t < 40; t++) { draw(t, 0, '-'); draw(t, 23, '-'); }",
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
  "        if (t == 2) {",
  "            t = 0;",
  "            draw(x, y, ' ');",
  "            x = x + dx;  y = y + dy;",
  "            if (x < 1)  { x = 1;  dx = 1; }",
  "            if (x > 38) { x = 38; dx = -1; }",
  "            if (y < 1)  { y = 1;  dy = 1; }",
  "            if (y > 22) { y = 22; dy = -1; }",
  "            draw(x, y, '*');",
  "        }",
  "    }",
  "}",
].join("\n");

/** Tier 1's reference for the *exact* path: the producer knows what it
    prints, which is the strongest grade available and the one synthesis gets
    for free. */
export const SUM_C = [
  "/* sum.c — the first ten squares, and what they come to. */",
  "",
  "int main() {",
  "    int i;  int total;",
  "    total = 0;",
  "    for (i = 1; i <= 10; i++) {",
  "        total = total + i * i;",
  "        putn(i * i);",
  "        putc(' ');",
  "    }",
  '    puts("= ");',
  "    putn(total);",
  "    putc('\\n');",
  "    return 0;",
  "}",
].join("\n");

const SUM_OUT = "1 4 9 16 25 36 49 64 81 100 = 385\n";

/* ---- what has to pass ---- */

export const GOOD: readonly Candidate[] = [
  { id: "good/sum", tier: 1, text: SUM_C, expect: SUM_OUT },
  { id: "good/fizz", tier: 1, text: seed("fizz.c") },
  { id: "good/list", tier: 1, text: seed("list.c") },
  { id: "good/map", tier: 1, text: seed("map.c") },
  { id: "good/guess", tier: 2, text: GUESS_C },
  { id: "good/bounce", tier: 3, text: BOUNCE_C },
  { id: "good/pong", tier: 4, text: seed("pong.c") },
];

/* ---- what has to fail, and with which key ---- */

export interface Mutant extends Candidate {
  /** The taxonomy key this break is supposed to earn. */
  expectFail: string;
  why: string;
}

/** One substitution against a known-good program, so a mutant stays one
    edit away from passing. Throws rather than silently mutating nothing —
    a mutant that didn't take is a test that stops testing. */
const bend = (src: string, from: string, to: string): string => {
  if (!src.includes(from)) throw new Error(`mutant anchor missing: ${from}`);
  return src.replace(from, to);
};

const pong = seed("pong.c");

export const MUTANTS: readonly Mutant[] = [
  /* --- V0: it never gets off the ground --- */
  {
    id: "bad/switch",
    tier: 1,
    text: bend(SUM_C, "        putn(i * i);", "        switch (i) { case 1: putn(1); break; }"),
    expectFail: "v0:absent:switch",
    why: "the construct a host model reaches for first",
  },
  {
    id: "bad/printf",
    tier: 1,
    text: bend(SUM_C, '    puts("= ");', '    printf("= %d", total);'),
    expectFail: "v0:absent:printf",
    why: "the library that isn't there",
  },
  {
    id: "bad/semicolon",
    tier: 1,
    text: bend(SUM_C, "    total = 0;", "    total = 0"),
    expectFail: "v0:syntax",
    why: "ordinary sloppiness, and it must not read as a missing keyword",
  },
  {
    id: "bad/huge",
    tier: 1,
    text: bend(SUM_C, "int main() {", "int fat[3500];\nint fatter[3500];\n\nint main() {"),
    expectFail: "v0:too-large",
    why: "the 3,840-word ceiling, which V0 gets from the assembler for free",
  },

  /* --- V1: it runs, badly --- */
  {
    id: "bad/spin",
    tier: 1,
    text: "int main() { while (1) ; }",
    expectFail: "v1:hang",
    why: "never halts, never rests — the definition of hung",
  },
  {
    id: "bad/busy",
    tier: 4,
    text: pong.split("vsync();").join(""),
    expectFail: "v1:no-vsync",
    why:
      "a game that never rests. It still halts — our own key policy ends it —" +
      " so the hang test doesn't catch it and the tier's own does",
  },
  {
    id: "bad/wild",
    tier: 1,
    text: bend(SUM_C, "    total = 0;", "    int *p;\n    total = 0;\n    p = 30000;\n    *p = 1;"),
    expectFail: "v1:fault:memory",
    why: "off the end of a 4,096-word machine",
  },
  {
    id: "bad/zero",
    tier: 1,
    text: bend(SUM_C, "        total = total + i * i;", "        total = total + i / (i - i);"),
    expectFail: "v1:fault:divide",
    why: "the ALU's one refusal",
  },
  {
    id: "bad/quiet",
    tier: 1,
    text: "int main() { int i; i = 1 + 2; return 0; }",
    expectFail: "v1:silent",
    why: "clean, quick, and no use to anybody",
  },

  /* --- V2 tier 1: it runs and says the wrong thing --- */
  {
    id: "bad/offbyone",
    tier: 1,
    text: bend(SUM_C, "for (i = 1; i <= 10; i++)", "for (i = 1; i < 10; i++)"),
    expect: SUM_OUT,
    expectFail: "v2:wrong-output",
    why: "the producer knew the answer; this isn't it",
  },

  /* --- V2 tier 2: it runs and ignores you --- */
  {
    id: "bad/monologue",
    tier: 2,
    text: [
      "int main() {",
      '    puts("I AM THINKING OF A NUMBER, 1 TO 100.\\n");',
      '    puts("YES. IT TOOK YOU 3 TRIES.\\n");',
      "    return 0;",
      "}",
    ].join("\n"),
    expectFail: "v2:ignores-input",
    why: "the shape of the transcript with none of the game",
  },
  {
    id: "bad/deafguess",
    tier: 2,
    text: [
      "int main() {",
      "    int i;  int c;",
      '    puts("I AM THINKING OF A NUMBER, 1 TO 100.\\n");',
      "    for (i = 0; i < 3; i++) {",
      '        puts("YOUR GUESS? ");',
      "        c = getc();",
      '        puts("HIGHER.\\n");',
      "    }",
      '    puts("YES. IT TOOK YOU 3 TRIES.\\n");',
      "    return 0;",
      "}",
    ].join("\n"),
    expectFail: "v2:input-inert",
    why: "it reads you and pays no attention — two scripts, one transcript",
  },

  /* --- V2 tier 3: it runs and sits there --- */
  {
    id: "bad/console",
    tier: 3,
    text: [
      "int main() {",
      "    int i;",
      '    for (i = 0; i < 3; i++) { puts("TICK\\n"); vsync(); }',
      "    while (1) vsync();",
      "}",
    ].join("\n"),
    expectFail: "v2:dark",
    why: "a teletype program filed as a screen toy",
  },
  {
    id: "bad/frozen",
    tier: 3,
    text: bend(BOUNCE_C, "        t++;\n", ""),
    expectFail: "v2:static",
    why: "it draws a room and then nothing happens in it",
  },

  /* --- V2 tier 4: it runs and it isn't pong --- */
  {
    id: "bad/deaf",
    tier: 4,
    text: bend(
      pong,
      "            if (k == 'w' || k == 'W') player(-1);\n            if (k == 's' || k == 'S') player(1);\n",
      "",
    ),
    expectFail: "v2:deaf",
    why: "the one that matters: it looks exactly right and the paddle is wired to nothing",
  },
  {
    id: "bad/still",
    tier: 4,
    text: bend(pong, "        if (bt == 3) { bt = 0; moveball(); }", "        if (bt == 3) { bt = 0; }"),
    expectFail: "v2:no-ball",
    why: "a court, a paddle, and a ball that never leaves the serve",
  },
  {
    id: "bad/twins",
    tier: 4,
    text: bend(pong, "    pause = 45;\n    draw(bx, by, 'O');", "    pause = 45;\n    draw(bx, by, 'O');\n    draw(8, 4, 'O');"),
    expectFail: "v2:no-ball",
    why: "two balls is no ball — the singleton is what makes it findable",
  },
  {
    id: "bad/nil",
    tier: 4,
    text: bend(
      pong,
      "    if (bx < 1) { as++; score(); serve(1); return; }\n    if (bx > 38) { ps++; score(); serve(-1); return; }",
      "    if (bx < 1) { serve(1); return; }\n    if (bx > 38) { serve(-1); return; }",
    ),
    expectFail: "v2:no-score",
    why: "rallies forever, settles nothing",
  },
];
