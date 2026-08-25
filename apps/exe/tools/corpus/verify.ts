/**
 * The graders: V0 compiles and fits, V1 runs without faulting or hanging,
 * V2 does what its tier is for — all through the real CC, assembler and VM.
 * Never hold a key down: a key source that never returns 0 hangs any
 * `while (k) { ...; k = key(); }` drain loop, hence `keyEvery`. Whole games
 * are ~5ms, so V2 grades whole games. `Verdict.fail` is a small fixed
 * vocabulary; its histogram is what steers the next batch's prompts.
 */

import { compileC } from "../../src/cc.js";
import { assemble, makeVm, SCREEN_H, SCREEN_W, type Vm, type VmIO } from "../../src/vm.js";

/** terminal.ts's per-frame budget — a frame here must mean what it means there. */
export const STEPS_PER_FRAME = 30_000;

/** Console programs get one long turn: `getc` is a three-instruction spin on
    the KEY port and must get its key the moment it asks. */
export const CONSOLE_STEPS = 5_000_000;

export type Tier = 1 | 2 | 3 | 4;

export interface Candidate {
  id: string;
  tier: Tier;
  text: string;
  /** Predicted output: ground truth when synthesised, absent when model-written. */
  expect?: string;
  /** A key script the producer knows finishes the program (tier 2). */
  keys?: number[];
  /** What the skeleton rolled; graders read `up`/`down` from here. */
  axes?: Record<string, string | number>;
}

export interface Verdict {
  id: string;
  tier: Tier;
  ok: boolean;
  /** null when it passed; otherwise the taxonomy key. This is the histogram. */
  fail: string | null;
  /** Parser message, faulting address — what you read when a bucket is large. */
  detail?: string;
  chars: number;
  words?: number;
  notes?: Record<string, unknown>;
}

/* ---- the probe: one compiled program, many runs of it ---- */

export interface Trial {
  /** "console" is one long turn with keys served on demand; "frames" is
      run() calls of STEPS_PER_FRAME with keys typed sparsely. */
  mode: "console" | "frames";
  keys?: number[];
  /** Frame mode: at most one key, every Nth frame. Never hold a key down. */
  keyEvery?: number;
  seed?: number;
  /** Frame mode: how many run() calls to make. */
  frames?: number;
  /** Frame mode: called after every frame, for graders that watch motion. */
  onFrame?: (vm: Vm, frame: number) => void;
}

export interface Trace {
  out: string;
  /** run() calls actually made — fewer than asked when it halted or faulted. */
  frames: number;
  /** Frames that ended on a VSYNC read: the program rested. */
  yielded: number;
  /** Frames that consumed the whole budget without resting or halting. */
  burned: number;
  steps: number;
  halted: boolean;
  fault: string | null;
  screenOn: boolean;
  keysLeft: number;
  /** The last screen, 24 rows of 40. */
  screen: string[];
}

export type Probe = (t: Trial) => Trace;

/** xorshift16. The synthesiser predicts rand() transcripts from this exact stream. */
export const makeRng = (seed: number): (() => number) => {
  let s = (seed & 0xffff) || 0x1234;
  return () => {
    s ^= (s << 7) & 0xffff;
    s ^= s >> 9;
    s ^= (s << 8) & 0xffff;
    return s & 0xffff;
  };
};

/** The screen the way the terminal would draw it. */
export const screenRows = (vm: Vm): string[] => {
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

export function makeProbe(words: Uint16Array): Probe {
  return (t) => {
    const queue = [...(t.keys ?? [])];
    const every = Math.max(1, t.keyEvery ?? 3);
    const rng = makeRng(t.seed ?? 1);
    let frame = 0;
    let servedOn = -1;
    let out = "";
    const io: VmIO = {
      putChar: (c) => {
        out += String.fromCharCode(c);
      },
      putNum: (n) => {
        out += String(n);
      },
      key: () => {
        if (t.mode === "console") return queue.shift() ?? 0;
        if (frame % every !== 0 || servedOn === frame) return 0;
        const k = queue.shift();
        if (k === undefined) return 0;
        servedOn = frame;
        return k;
      },
      rand: () => rng(),
    };
    const vm = makeVm(words, io);
    const budget = t.mode === "console" ? CONSOLE_STEPS : STEPS_PER_FRAME;
    const want = t.mode === "console" ? 1 : (t.frames ?? 600);
    let yielded = 0;
    let burned = 0;
    let steps = 0;
    for (; frame < want && !vm.halted && vm.fault === null; frame++) {
      const ran = vm.run(budget);
      steps += ran;
      if (ran >= budget) burned++;
      else if (!vm.halted && vm.fault === null) yielded++;
      t.onFrame?.(vm, frame);
    }
    return {
      out,
      frames: frame,
      yielded,
      burned,
      steps,
      halted: vm.halted,
      fault: vm.fault,
      screenOn: vm.screenOn,
      keysLeft: queue.length,
      screen: screenRows(vm),
    };
  };
}

/* ---- V0: it compiles, it assembles, it fits ---- */

/**
 * Things CC lacks that a host model reaches for. Diagnostic only (`compileC`
 * is the gate); `prompt.ts` builds its fence from this same list so the
 * forbidden and the counted can't drift.
 */
export const ABSENT = [
  "switch", "case", "typedef", "enum", "union", "static", "const", "extern",
  "volatile", "register", "unsigned", "signed", "short", "long", "float",
  "double", "bool", "goto", "printf", "sprintf", "scanf", "strlen", "strcpy",
  "strcmp", "memset", "memcpy", "exit", "NULL", "true", "false",
];

/** Comments and literals removed, so printing "switch" isn't using it. */
const stripText = (src: string): string =>
  src
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/\/\/[^\n]*/g, " ")
    .replace(/"(?:[^"\\]|\\.)*"/g, '""')
    .replace(/'(?:[^'\\]|\\.)*'/g, "''");

const absentReach = (src: string): string | null => {
  const bare = stripText(src);
  if (/#\s*include/.test(bare)) return "include";
  for (const kw of ABSENT) if (new RegExp(`\\b${kw}\\b`).test(bare)) return kw;
  return null;
};

const ccBucket = (msg: string): string => {
  if (/#define/.test(msg)) return "v0:define";
  if (/struct|initialiser/i.test(msg)) return "v0:struct";
  if (/^Unknown|not declared|Undefined|no such/i.test(msg)) return "v0:undefined";
  if (/^Expected/.test(msg)) return "v0:syntax";
  return "v0:other";
};

export type V0Result =
  | { ok: true; words: Uint16Array }
  | { ok: false; fail: string; detail: string };

export function v0(text: string): V0Result {
  const cc = compileC(text);
  if (!cc.ok) {
    const e = cc.errors[0]!;
    const reach = absentReach(text);
    return {
      ok: false,
      fail: reach ? `v0:absent:${reach}` : ccBucket(e.msg),
      detail: `line ${e.line}: ${e.msg}`,
    };
  }
  const res = assemble(cc.asm);
  if (!res.ok) {
    const msg = res.errors[0]!.msg;
    return { ok: false, fail: /too large/i.test(msg) ? "v0:too-large" : "v0:asm", detail: msg };
  }
  return { ok: true, words: res.words };
}

/* ---- V1: it runs, without faulting and without hanging ---- */

const faultKind = (f: string): string =>
  /Memory/.test(f) ? "memory" : /Stack/.test(f) ? "stack" : /opcode/.test(f) ? "opcode" : "divide";

/** Plausible keys, minus ESC — the terminal handles ESC and would end runs early. */
const KEY_POOL = [..."wsadWSAD ny0123456789\n"].map((c) => c.charCodeAt(0));

export const codes = (s: string): number[] => [...s].map((c) => c.charCodeAt(0));

export const randomKeys = (seed: number, n: number): number[] => {
  const rng = makeRng(seed);
  return Array.from({ length: n }, () => KEY_POOL[rng() % KEY_POOL.length]!);
};

/** 1..100 and 100..1: finishes any in-range guess-the-number. `getc` blocks,
    so noise doesn't fail a console program, it *waits*, indistinguishable
    from a hang. Fallback when the producer has no script. */
export const COUNT_UP = codes(Array.from({ length: 100 }, (_, i) => `${i + 1}\n`).join(""));
export const COUNT_DOWN = codes(Array.from({ length: 100 }, (_, i) => `${100 - i}\n`).join(""));

export interface V1Result {
  ok: boolean;
  fail?: string;
  detail?: string;
  trace: Trace;
}

/**
 * Did it fault, did it hang, did it do anything. A program hangs when it
 * never halts and never rests. Starved (stuck in `getc` having read every
 * key) looks identical from outside and gets its own key — the fix may be
 * the script, not the program.
 */
export function v1(probe: Probe, c: Candidate, seed = 1): V1Result {
  const console_ = c.tier <= 2;
  const script = c.keys ?? (c.tier === 2 ? COUNT_UP : []);
  const trace = probe(
    console_
      ? { mode: "console", keys: script, seed }
      : { mode: "frames", frames: 600, keys: randomKeys(seed, 200), keyEvery: 3, seed },
  );
  if (trace.fault)
    return { ok: false, fail: `v1:fault:${faultKind(trace.fault)}`, detail: trace.fault, trace };
  if (!trace.halted && trace.yielded === 0) {
    const read = script.length - trace.keysLeft;
    const starved = read > 0 && trace.keysLeft === 0;
    return {
      ok: false,
      fail: starved ? "v1:starved" : "v1:hang",
      detail: starved
        ? `read all ${read} keys and wanted more`
        : `${trace.steps} steps, never rested`,
      trace,
    };
  }
  if (console_ && !trace.halted) return { ok: false, fail: "v1:no-halt", trace };
  if (!console_ && trace.yielded === 0) return { ok: false, fail: "v1:no-vsync", trace };
  if (!/\S/.test(trace.out) && !trace.screenOn) return { ok: false, fail: "v1:silent", trace };
  return { ok: true, trace };
}

/* ---- V2: it does what its tier is for ---- */

export interface GradeResult {
  ok: boolean;
  fail?: string;
  detail?: string;
  notes?: Record<string, unknown>;
}

export type Grader = (probe: Probe, c: Candidate) => GradeResult;

/** Filled in by graders.ts (which imports this module), so verify() needn't import it. */
export const GRADERS = new Map<Tier, Grader>();

/** The whole ladder for one candidate; stops at the first failing level. */
export function verify(c: Candidate): Verdict {
  const base = { id: c.id, tier: c.tier, chars: c.text.length };
  const built = v0(c.text);
  if (!built.ok) return { ...base, ok: false, fail: built.fail, detail: built.detail };

  const words = built.words.length;
  const probe = makeProbe(built.words);
  const live = v1(probe, c);
  if (!live.ok) return { ...base, ok: false, words, fail: live.fail!, detail: live.detail };

  const grader = GRADERS.get(c.tier);
  if (!grader) return { ...base, ok: false, words, fail: "v2:no-grader" };
  const g = grader(probe, c);
  return {
    ...base,
    ok: g.ok,
    words,
    fail: g.ok ? null : (g.fail ?? "v2:other"),
    detail: g.detail,
    notes: g.notes,
  };
}

/** Which failures, how many, worst first. */
export const histogram = (vs: readonly Verdict[]): [string, number][] => {
  const counts = new Map<string, number>();
  for (const v of vs) {
    const k = v.fail ?? "pass";
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  return [...counts].sort((a, b) => b[1] - a[1]);
};
