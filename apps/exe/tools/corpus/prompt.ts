/**
 * What the 27B is told. Phase 3, station 1 (llm_training.md).
 *
 * Everything in this file is either measured or decided, and the two are
 * kept apart on purpose:
 *
 * - **Measured** is the fence. `ABSENT` is imported from `verify.ts` — the
 *   same list the failure histogram buckets by — so the thing being
 *   forbidden and the thing being counted can't drift. `c.txt` comes off the
 *   disk the programs will actually run on, for the same reason.
 * - **Decided** is `HEADERS` and `EDITS`, and those are calls somebody made
 *   rather than facts the machine reported. The headers matter most: the
 *   header comment is the *entire* conditioning channel — there is no
 *   instruction/response split in the trained model — so Phase 5's "write me
 *   PONG.C" is literally one of these strings, and it works because the
 *   model saw it thousands of times. Change them freely now; changing them
 *   after a corpus exists means regenerating it.
 *
 * The filename in the header is the family key and the phrase after it is
 * the variation: every tier-4 document says `pong.c`, and the eight tails
 * are what teach the model that the tail doesn't matter.
 *
 * Few-shots come from the verified pool, which is why quality compounds —
 * and why `pickShots` caps how often any one program can be shown. A pool
 * that feeds on its own favourites converges on one program by morning.
 */

import { SEED_FILES } from "../../src/copy.js";
import { ABSENT, type Candidate, type Tier } from "./verify.js";

/** The dialect's manual, straight off the disk, so the prompt cannot
    describe a compiler different from the one that grades it. */
const C_TXT = SEED_FILES.find((f) => f.name.endsWith("c.txt"))!.text;

/** The refusals that aren't a single word, so they can't be caught by the
    lexical scan `ABSENT` does. Measured the same way — 54 constructs through
    `compileC`. */
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

/**
 * In the manual, real, and not for these programs. `c.txt` is pasted above
 * this and documents both, so saying nothing leaves the model to guess and
 * the prompt contradicting itself.
 *
 * `asm("...")` is the one that matters: it compiles, it runs, it passes V2,
 * and a corpus with raw 16-bit assembly in it spends a 1-2.5M model's
 * capacity on a second language — and hands Phase 4's grammar masker a
 * sub-language to mask. The drive is milder: with nothing in the bay it
 * reads as zeros, so a drive program grades clean while doing nothing.
 */
const OUT_OF_SCOPE = [
  'asm("...") — the escape hatch to raw assembly. It works. Don\'t use it;',
  "  these programs are C all the way down.",
  "dpos(a) dbank(a) dget() dput(v) — the drive. There is nothing in the bay.",
];

/** What it does have, because a model told only what's forbidden writes
    timid, stunted C. */
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

/** A comma-separated list, folded to a width, indented. Keeping the fence
    readable is not decoration: it is what the model is meant to notice. */
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

/**
 * The conditioning channel. The name is the family; the tail is the noise
 * the model learns to see past. Phase 5 will type one of these.
 */
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

/**
 * What source B asks for. These are the axes structure varies along —
 * synthesis can re-roll a constant, but only an edit like these moves the
 * *shape*, which is the whole reason the model is in the loop at all.
 */
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

/** Constraints the graders enforce, said out loud so a batch doesn't spend a
    night failing them. Tier 4 has two; the rest inherit the general ones. */
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
  /** Shown as worked examples, as real turns rather than pasted into the
      system prompt — it teaches the output format at the same time. */
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
  // Every shot is shown in the format the answer has to arrive in: asked for
  // by a one-line header, answered with a program that starts with it. A
  // shot carrying its own six-line header would teach the opposite.
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
 * Put the asked-for header on a program and take off whatever it had.
 *
 * A DECISION, not a measurement: the header is **exactly one line**. The
 * hand-written `pong.c` opens with six — a title, how to run it, which keys
 * — and that charm is lost here on purpose. The header is the conditioning
 * channel, so header and body must correspond exactly or the model learns
 * that the request is only a hint, and a one-line header is the only shape
 * that can be guaranteed identical across twenty thousand documents. The
 * reference program on the disk keeps its six lines; the corpus doesn't.
 *
 * Change this and the corpus format changes with it.
 */
export const stampHeader = (text: string, header: string): string => {
  const body = text
    .replace(/^\s*\/\*[\s\S]*?\*\/\s*/, "")
    .replace(/^(?:\s*\/\/[^\n]*\n)+/, "")
    .trimStart();
  return `${header}\n\n${body}`;
};

/** Fisher-Yates. `sort(() => r() - 0.5)` is not a shuffle — with an
    inconsistent comparator V8's sort leaves long runs in place, so a pool of
    thousands gets read in insertion order and calling it stratified is a
    lie. */
const shuffled = <T,>(xs: readonly T[], pick: () => number): T[] => {
  const out = [...xs];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(pick() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
};

/**
 * Few-shots, stratified and rationed. `uses` is carried by the caller across
 * a whole run: without a cap the pool converges on whatever the model liked
 * at 11pm and by morning every program is that program.
 *
 * The cap rations **being shown as an example**, and nothing else. A
 * mutation's parent is deliberately not counted against it: tier 4 starts
 * with exactly one verified program, so a cap on parents would stop
 * mutation dead after the fortieth one and there would be no second
 * generation to draw a pool from.
 *
 * When every candidate has hit the cap the least-used ones are used anyway.
 * Returning no examples at all is the worse failure and the silent one —
 * yield falls at 2am and nothing prints.
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
  // The parent of a mutation is already in the prompt in full; showing it
  // again as an example spends context on nothing.
  const usable = pool.filter((c) => c.id !== exclude);
  const under = usable.filter((c) => (uses.get(c.id) ?? 0) < cap);
  const eligible = under.length
    ? under
    : [...usable].sort((a, b) => (uses.get(a.id) ?? 0) - (uses.get(b.id) ?? 0)).slice(0, Math.max(n, 8));
  const near = shuffled(eligible.filter((c) => c.tier === tier), pick);
  const far = shuffled(eligible.filter((c) => c.tier !== tier), pick);
  const out: Candidate[] = [];
  // The last slot goes to a neighbouring tier when there is one to spare:
  // the dialect is one language, and a tier-4 prompt that has only ever seen
  // pong writes pong even when asked for something else. `out.length > 0`
  // is what keeps that from eating the *only* slot when n is 1 — `every` on
  // an empty array is true, so without it a one-shot tier-4 prompt gets a
  // fizzbuzz as its worked example and no pong at all.
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
