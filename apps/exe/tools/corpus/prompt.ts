/**
 * What the generating model is told. Measured parts (the fence: `ABSENT`
 * from verify.ts, `c.txt` off the disk) are kept apart from decided parts
 * (`HEADERS`, `EDITS`). The header comment is the trained model's *entire*
 * conditioning channel — filename is the family key, the tail is noise — so
 * changing HEADERS after a corpus exists means regenerating it.
 */

import { SEED_FILES } from "../../src/copy.js";
import { ABSENT, type Candidate, type Tier } from "./verify.js";

/** The dialect's manual off the disk, so prompt and grader can't drift. */
const C_TXT = SEED_FILES.find((f) => f.name.endsWith("c.txt"))!.text;

/** Refusals that aren't a single word (not catchable by `ABSENT`'s lexical
    scan). Measured the same way — 54 constructs through `compileC`. */
const ABSENT_SHAPES = [
  "function prototypes — `int f(int);` before the body; call it anyway, order doesn't matter",
  "declarations inside a for header — `for (int i = 0; ...)`",
  "two-dimensional arrays — `int g[3][3];`",
  "arrays of structs — use an array of pointers",
  "function pointers",
  "the comma operator",
  "string arrays — `char *msgs[] = {\"a\", \"b\"};`",
  "`#define` with anything but a bare number — `#define N (2+3)` is refused, and a fold",
  "  only works inside an expression, never in an array bound (`int a[N+2]` is refused)",
];

/** In the manual, real, and not for these programs. `asm("...")` passes V2
    but would spend a tiny model's capacity on a second language; the drive
    reads as zeros with nothing in the bay, so grades clean doing nothing. */
const OUT_OF_SCOPE = [
  'asm("...") — the escape hatch to raw assembly. It works. Don\'t use it;',
  "  these programs are C all the way down.",
  "dpos(a) dbank(a) dget() dput(v) — the drive. There is nothing in the bay.",
];

/** What it does have — a model told only refusals writes stunted C. */
const PRESENT = [
  "int and char are both one 16-bit word; pointers and arrays are word addresses",
  "struct, with every field one word; `x.f` and `p->f`; `sizeof(struct S)`",
  "`int a, b;` on one line, declarations mid-block, and initialisers at the declaration",
  "if/else, while, do/while, for, break, continue, return, `?:`, `op=`, `++`/`--`",
  "`&&` and `||` short-circuit; `&x`; pointer arithmetic; recursion",
  "`int a[] = {1, 2, 3};` with constants, and `#define NAME 123`",
  "/* comments */ and // comments",
];

const BUILTINS = [
  "putc(c) putn(n) puts(s)   print a character, a signed number, a string",
  "getc()                    wait for a key and return it",
  "key()                     the key if one is waiting, else 0",
  "rand()                    16 random bits — signed, so mask before %",
  "vpos(p) vput(c)           aim the 40x24 screen at cell row*40+col, print there",
  "vsync()                   rest until the next frame; about sixty a second",
  "malloc(n) free(p)         n words, arriving zeroed; free does nothing",
];

/** Comma list folded to a width; readability of the fence is the point. */
const wrap = (words: readonly string[], width: number): string[] => {
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    const next = line ? `${line}, ${w}` : w;
    if (next.length > width) {
      lines.push(`  ${line},`);
      line = w;
    } else line = next;
  }
  if (line) lines.push(`  ${line}`);
  return lines;
};

const SYSTEM = [
  "You write C for a 1995 machine that compiles it with its own compiler, CC.",
  "CC is not C. It is a small dialect on a 16-bit processor with 3,840 words of",
  "memory for the whole program, and its manual is this:",
  "",
  C_TXT,
  "",
  "WHAT CC DOES NOT HAVE. None of these compile, and reaching for them is the",
  "single most common way to waste a program:",
  "",
  ...wrap(ABSENT, 66),
  "  #include, and any library at all — there is no stdio and no string.h",
  ...ABSENT_SHAPES.map((s) => `  ${s}`),
  "",
  "IN THE MANUAL ABOVE, AND NOT FOR THESE PROGRAMS:",
  ...OUT_OF_SCOPE.map((x) => `  ${x}`),
  "",
  "WHAT IT DOES HAVE:",
  ...PRESENT.map((s) => `  ${s}`),
  "",
  "THE HARDWARE, WEARING C:",
  ...BUILTINS.map((s) => `  ${s}`),
  "",
  "RULES THAT ARE NOT STYLE:",
  "  A program that draws must call vsync() once every time round its main loop.",
  "  One that doesn't never rests, and the machine hangs on it.",
  "  Drain the keyboard with `k = key(); while (k) { ...; k = key(); }` — key()",
  "  returns 0 when nothing is waiting, and that 0 is what ends the loop.",
  "  The whole program, code and globals together, must fit in 3,840 words.",
  "  The screen is 40 columns by 24 rows and nothing scrolls.",
  "",
  "Reply with the program and nothing else. No explanation, no markdown fence.",
  "Start with the header comment you are given, exactly as given.",
].join("\n");

/* ---- decided, not measured ---- */

/** The conditioning channel: name is the family, tail is noise. */
export const HEADERS: Record<Tier, string[]> = {
  1: [
    "/* sum.c — a number the machine works out and says. */",
    "/* count.c — counting, and the rule it follows. */",
    "/* table.c — a column of numbers, worked out in order. */",
    "/* wrap.c — sixteen bits, and what happens at the edge. */",
    "/* fizz.c — the machine counts and follows the rules. */",
    "/* bits.c — shifts and masks, printed as it goes. */",
  ],
  2: [
    "/* guess.c — the machine thinks of a number and you go and find it. */",
    "/* guess.c — a number, some tries, and a verdict. */",
    "/* hilo.c — higher or lower, until you have it. */",
    "/* quiz.c — it asks, you answer, it keeps score. */",
    "/* dice.c — rolls, a running total, and one key to stop. */",
  ],
  3: [
    "/* bounce.c — a character with somewhere to be. */",
    "/* marquee.c — a line of text, going past. */",
    "/* stars.c — a sky the machine keeps redrawing. */",
    "/* clock.c — frames counted out where you can see them. */",
    "/* snake.c — it grows, and the keys turn it. */",
    "/* rain.c — something falling, and something catching it. */",
  ],
  4: [
    "/* pong.c — the television game, on this machine's own screen. */",
    "/* pong.c — two paddles, one ball, first to a number. */",
    "/* pong.c — the oldest one there is, in forty by twenty-four. */",
    "/* pong.c — a court, a rally, and a score along the top. */",
    "/* pong.c — the machine plays, and it is beatable. */",
    "/* pong.c — bat the ball back. W and S move you. */",
    "/* pong.c — the television game, and the machine takes the far side. */",
    "/* pong.c — a ball that will not stay still. */",
  ],
};

/** Mutation edits: synthesis re-rolls constants; only these move the shape. */
export const EDITS: Record<Tier, string[]> = {
  1: [
    "Do a different arithmetic job, and print it in a different shape.",
    "Rewrite it with a helper function doing the work the loop did inline.",
    "Use a while or a do/while where this uses a for, and rename everything.",
    "Make the numbers big enough that 16 bits wrap, and print what happens.",
  ],
  2: [
    "Change what it asks for and how it answers, keeping the same input shape.",
    "Give it a limited number of tries, and a different verdict for running out.",
    "Read one character at a time instead of a number, or the other way round.",
    "Restructure it: pull the input loop into its own function, rename everything.",
  ],
  3: [
    "Change what moves and what it looks like, keeping the same control keys.",
    "Add a border and a line of text, and keep the animation inside it.",
    "Make two things move at different speeds off different frame counters.",
    "Restructure it into draw/update/input functions and rename everything.",
  ],
  4: [
    "Change the court: different border glyphs, a different message along the bottom.",
    "Change the paddles: a different height, a different column, a different glyph.",
    "Restructure: pull the ball's bounce off the walls into its own function.",
    "Make it two players — the far paddle answers keys instead of the machine.",
    "Change the pace: ball and machine moving on different frame counters.",
    "Change the win score, and draw the score somewhere else on the screen.",
    "Rename everything in a different style and reorder the functions.",
    "Give the paddle edges english: where the ball lands decides the new angle.",
  ],
};

/** Constraints the graders enforce, said out loud. */
const TIER_NOTES: Record<Tier, string[]> = {
  1: ["It must print something and then return from main."],
  2: [
    "It must read the keyboard with getc() and what it prints must depend on",
    "what was typed. It has to finish: a run where the player types every",
    "number from 1 to 100 must reach the end and return.",
  ],
  3: [
    "It must draw on the screen with vpos/vput, call vsync() every frame, and",
    "something on the screen has to change as it runs.",
  ],
  4: [
    "The ball needs a glyph of its own that nothing else on the screen uses —",
    "one 'O' on the court, not an 'O' that is also a paddle. W moves the",
    "player's paddle up and S moves it down. The score is drawn as digits and",
    "goes up when a point is won, and the game ends when someone reaches the",
    "winning score.",
  ],
};

/* ---- assembling one request ---- */

export interface Msg {
  role: "system" | "user" | "assistant";
  content: string;
}

/** A header for a program that arrived without one we chose. */
const headerFor = (c: Candidate): string => HEADERS[c.tier][0]!;

export interface Spec {
  tier: Tier;
  kind: "freestyle" | "mutate";
  header: string;
  /** Worked examples, as real turns (teaches the output format too). */
  shots: readonly Candidate[];
  /** Source B only: the verified program being varied, and how. */
  parent?: Candidate;
  edit?: string;
}

const ask = (spec: Spec): string =>
  [
    `Write this program:`,
    ``,
    spec.header,
    ``,
    ...TIER_NOTES[spec.tier],
  ].join("\n");

export function buildMessages(spec: Spec): Msg[] {
  const msgs: Msg[] = [{ role: "system", content: SYSTEM }];
  // Shots are shown in the answer's format: one-line header in, program
  // starting with it out.
  for (const [i, shot] of spec.shots.entries()) {
    const header = HEADERS[shot.tier][i % HEADERS[shot.tier].length]!;
    msgs.push({ role: "user", content: `Write this program:\n\n${header}` });
    msgs.push({ role: "assistant", content: stampHeader(shot.text, header) });
  }
  if (spec.kind === "mutate" && spec.parent) {
    msgs.push({
      role: "user",
      content: [
        "Here is a program that works on this machine:",
        "",
        stampHeader(spec.parent.text, headerFor(spec.parent)),
        "",
        `Write a different one like it. ${spec.edit ?? ""}`.trim(),
        "",
        "Keep everything else about it working. Its header comment becomes:",
        "",
        spec.header,
        "",
        ...TIER_NOTES[spec.tier],
      ].join("\n"),
    });
  } else {
    msgs.push({ role: "user", content: ask(spec) });
  }
  return msgs;
}

/**
 * Replace whatever header a program had with the asked-for one. The header
 * is exactly one line, by decision: header and body must correspond exactly
 * or the model learns the request is a hint. Change this and the corpus
 * format changes with it.
 */
export const stampHeader = (text: string, header: string): string => {
  const body = text
    .replace(/^\s*\/\*[\s\S]*?\*\/\s*/, "")
    .replace(/^(?:\s*\/\/[^\n]*\n)+/, "")
    .trimStart();
  return `${header}\n\n${body}`;
};

/** Fisher-Yates. `sort(() => r() - 0.5)` is not a shuffle: V8 leaves long
    runs in place, so a big pool reads in insertion order. */
const shuffled = <T,>(xs: readonly T[], pick: () => number): T[] => {
  const out = [...xs];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(pick() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
};

/**
 * Few-shots, stratified and rationed. `uses` is carried across a run so the
 * pool can't converge on one favourite. The cap rations being *shown*
 * only — a mutation's parent is not counted, or tier 4 (one seed) would stop
 * mutating after the fortieth. At the cap, least-used are used anyway:
 * returning no examples is the worse, silent failure.
 */
export function pickShots(
  pool: readonly Candidate[],
  tier: Tier,
  n: number,
  pick: () => number,
  uses: Map<string, number>,
  cap = 40,
  exclude?: string,
): Candidate[] {
  // The mutation's parent is already in the prompt in full.
  const usable = pool.filter((c) => c.id !== exclude);
  const under = usable.filter((c) => (uses.get(c.id) ?? 0) < cap);
  const eligible = under.length
    ? under
    : [...usable].sort((a, b) => (uses.get(a.id) ?? 0) - (uses.get(b.id) ?? 0)).slice(0, Math.max(n, 8));
  const near = shuffled(eligible.filter((c) => c.tier === tier), pick);
  const far = shuffled(eligible.filter((c) => c.tier !== tier), pick);
  const out: Candidate[] = [];
  // The last slot goes to another tier when one is spare (a prompt that has
  // only seen pong writes pong). `out.length > 0` keeps that from eating the
  // *only* slot when n is 1 — `every` on an empty array is true.
  for (const c of [...near, ...far]) {
    if (out.length >= n) break;
    if (out.length > 0 && out.length === n - 1 && far.length && out.every((o) => o.tier === tier)) {
      const other = far[Math.floor(pick() * far.length)];
      if (other && !out.includes(other)) {
        out.push(other);
        continue;
      }
    }
    out.push(c);
  }
  for (const c of out) uses.set(c.id, (uses.get(c.id) ?? 0) + 1);
  return out;
}

/** For `--dry`: what the model would actually see. */
export const renderMessages = (msgs: readonly Msg[]): string =>
  msgs.map((m) => `${"=".repeat(20)} ${m.role}\n${m.content}`).join("\n\n");

export { SYSTEM };
