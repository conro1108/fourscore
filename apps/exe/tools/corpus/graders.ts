/**
 * The V2 graders, one per curriculum tier. They grade invariants, not
 * positions: the ball is "a glyph alone on screen that keeps moving", the
 * paddle "a vertical run on the player's side that answers the up key", the
 * score "some digit that changes". Nothing here may know where anything is.
 * Consequence for the prompt: the ball needs its own glyph, or `v2:no-ball`.
 */

import { SCREEN_H, SCREEN_W } from "../../src/vm.js";
import {
  COUNT_DOWN,
  COUNT_UP,
  GRADERS,
  codes,
  screenRows,
  type Candidate,
  type GradeResult,
  type Grader,
  type Probe,
  type Trial,
} from "./verify.js";

const fail = (key: string, detail?: string): GradeResult => ({ ok: false, fail: key, detail });
const pass = (notes?: Record<string, unknown>): GradeResult => ({ ok: true, notes });

/* ---- looking at the screen ---- */

/** Every non-space cell, by the character in it. */
const byChar = (rows: readonly string[]): Map<string, number[]> => {
  const at = new Map<string, number[]>();
  for (let y = 0; y < SCREEN_H; y++)
    for (let x = 0; x < SCREEN_W; x++) {
      const ch = rows[y]![x]!;
      if (ch === " ") continue;
      const list = at.get(ch);
      if (list) list.push(y * SCREEN_W + x);
      else at.set(ch, [y * SCREEN_W + x]);
    }
  return at;
};

/** Longest vertical run of one glyph in columns 0..maxCol — a paddle, from outside. */
interface Run {
  ch: string;
  col: number;
  top: number;
  len: number;
}
const vertRun = (rows: readonly string[], maxCol: number): Run | null => {
  let best: Run | null = null;
  for (let x = 0; x <= maxCol; x++)
    for (let y = 0; y < SCREEN_H; ) {
      const ch = rows[y]![x]!;
      if (ch === " ") {
        y++;
        continue;
      }
      let end = y;
      while (end + 1 < SCREEN_H && rows[end + 1]![x] === ch) end++;
      const len = end - y + 1;
      if (len >= 2 && (!best || len > best.len)) best = { ch, col: x, top: y, len };
      y = end + 1;
    }
  return best;
};

/** Digits and where they are, as one comparable string. */
const digitPrint = (rows: readonly string[]): string => {
  const out: string[] = [];
  for (let y = 0; y < SCREEN_H; y++)
    for (let x = 0; x < SCREEN_W; x++) {
      const ch = rows[y]![x]!;
      if (ch >= "0" && ch <= "9") out.push(`${y * SCREEN_W + x}${ch}`);
    }
  return out.join(",");
};

/** Watch a run: which glyphs were ever alone and where, and which cells changed. */
interface Motion {
  frames: number;
  solo: Map<string, { frames: number; cells: Set<number> }>;
  changed: Set<number>;
  lit: Set<number>;
}
const watch = (probe: Probe, trial: Trial): { motion: Motion; screen: string[] } => {
  const m: Motion = { frames: 0, solo: new Map(), changed: new Set(), lit: new Set() };
  let prev: string[] | null = null;
  const trace = probe({
    ...trial,
    onFrame: (vm) => {
      const rows = screenRows(vm);
      m.frames++;
      const at = byChar(rows);
      for (const [ch, cells] of at) {
        for (const c of cells) m.lit.add(c);
        if (cells.length !== 1) continue;
        let rec = m.solo.get(ch);
        if (!rec) m.solo.set(ch, (rec = { frames: 0, cells: new Set() }));
        rec.frames++;
        rec.cells.add(cells[0]!);
      }
      if (prev)
        for (let y = 0; y < SCREEN_H; y++)
          for (let x = 0; x < SCREEN_W; x++)
            if (rows[y]![x] !== prev[y]![x]) m.changed.add(y * SCREEN_W + x);
      prev = rows;
    },
  });
  return { motion: m, screen: trace.screen };
};

/** The moving singleton: alone ≥80% of frames, visits ≥3 cells. */
const findBall = (m: Motion): { ch: string; cells: number } | null => {
  for (const [ch, rec] of m.solo)
    if (rec.frames >= m.frames * 0.8 && rec.cells.size >= 3)
      return { ch, cells: rec.cells.size };
  return null;
};

/* ---- tier 1: expression soup ---- */

/** Synthesised soup carries `expect` (exact); model-written has no ground
    truth, so only: halted and said something. */
const gradeSoup: Grader = (probe, c) => {
  const t = probe({ mode: "console" });
  if (!t.halted) return fail("v2:no-halt");
  if (c.expect !== undefined && t.out !== c.expect)
    return fail("v2:wrong-output", `wanted ${JSON.stringify(c.expect)}, got ${JSON.stringify(t.out)}`);
  if (!/\S/.test(t.out)) return fail("v2:silent");
  return pass({ out: t.out.length, graded: c.expect !== undefined ? "exact" : "loose" });
};

/* ---- tier 2: the console family ---- */

const gradeConsole: Grader = (probe, c) => {
  const script = c.keys ?? COUNT_UP;
  const a = probe({ mode: "console", keys: script });
  if (!a.halted) return fail("v2:no-halt");
  if (a.keysLeft === script.length) return fail("v2:ignores-input");
  if (c.expect !== undefined && a.out !== c.expect)
    return fail("v2:wrong-output", `wanted ${JSON.stringify(c.expect)}, got ${JSON.stringify(a.out)}`);
  const b = probe({ mode: "console", keys: COUNT_DOWN });
  if (b.out === a.out) return fail("v2:input-inert", "two different scripts, one transcript");
  return pass({ read: script.length - a.keysLeft, out: a.out.length });
};

/* ---- tier 3: screen toys ---- */

/** Light, draw, change. Answering keys is recorded, not required — a
    marquee or a clock never reads one. */
const gradeScreen: Grader = (probe) => {
  const idle = watch(probe, { mode: "frames", frames: 300 });
  if (idle.motion.lit.size === 0) return fail("v2:dark");
  if (idle.motion.lit.size < 8) return fail("v2:blank", `${idle.motion.lit.size} cells ever lit`);
  if (idle.motion.changed.size < 4)
    return fail("v2:static", `${idle.motion.changed.size} cells ever changed`);
  const typed = watch(probe, {
    mode: "frames",
    frames: 300,
    keys: codes("wsadwsadwsadwsad "),
    keyEvery: 5,
  });
  return pass({
    lit: idle.motion.lit.size,
    moving: idle.motion.changed.size,
    answersKeys: typed.screen.join("\n") !== idle.screen.join("\n"),
  });
};

/* ---- tier 4: pong ---- */

const PADDLE_COLS = 6; // the player's side, generously

const gradePong: Grader = (probe, c) => {
  const up = String(c.axes?.up ?? "w").charCodeAt(0);
  const down = String(c.axes?.down ?? "s").charCodeAt(0);

  const idle = watch(probe, { mode: "frames", frames: 240 });
  const ball = findBall(idle.motion);
  if (!ball) return fail("v2:no-ball", "nothing on screen is alone and moving");

  const rest = vertRun(idle.screen, PADDLE_COLS);
  if (!rest) return fail("v2:no-paddle", `no vertical run in columns 0..${PADDLE_COLS}`);

  const upRun = vertRun(probe({ mode: "frames", frames: 90, keys: Array(30).fill(up), keyEvery: 3 }).screen, PADDLE_COLS);
  const downRun = vertRun(probe({ mode: "frames", frames: 90, keys: Array(30).fill(down), keyEvery: 3 }).screen, PADDLE_COLS);
  if (!upRun || upRun.top >= rest.top)
    return fail("v2:deaf", `paddle sat at ${rest.top} through 30 taps of the up key`);
  if (!downRun || downRun.top <= rest.top)
    return fail("v2:one-way", "it goes up but not down");

  // The whole game (~5ms). The tap feeds the drain loop and answers the
  // "any key" a game's end waits on.
  let scoredAt = -1;
  let opening = "";
  const game = probe({
    mode: "frames",
    frames: 6_000,
    keys: Array(2_000).fill(up),
    keyEvery: 7,
    onFrame: (vm, f) => {
      if (scoredAt >= 0) return;
      const print = digitPrint(screenRows(vm));
      if (!opening) opening = print;
      else if (print !== opening) scoredAt = f;
    },
  });
  if (scoredAt < 0) return fail("v2:no-score", "no digit on screen ever changed");
  if (!game.halted) return fail("v2:no-end", `still playing after ${game.frames} frames`);

  return pass({
    ball: ball.ch,
    ballCells: ball.cells,
    paddle: rest.ch,
    paddleLen: rest.len,
    scoredAt,
    gameFrames: game.frames,
  });
};

GRADERS.set(1, gradeSoup);
GRADERS.set(2, gradeConsole);
GRADERS.set(3, gradeScreen);
GRADERS.set(4, gradePong);

/** Importing this module registers the graders; call this to say so explicitly. */
export const registerGraders = (): void => void 0;

export type { Candidate };
