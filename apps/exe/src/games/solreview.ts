/**
 * SOL.EXE's review: was the deal winnable, and was it still winnable where you stopped?
 * Depth-first search over legal Klondike (draw one, unlimited passes), budgeted.
 * `won` is proven (it holds a legal line). `unknown` is never a loss: the search
 * can run out of budget and never takes a card back off a foundation. Never turn
 * `unknown` into a verdict. Winnability along the played line is monotone, which
 * is what makes the bisection in `reviewGame` legitimate.
 */

import { isRed, type Card, type SolState } from "./solstate.js";

/** `unknown` is not a loss — see the header. */
export type Verdict = "won" | "unknown";

export interface SolReview {
  /** Cards on the foundations where you stopped. */
  homed: number;
  /** Face-down cards you turned over. */
  flipped: number;
  /** Times you drew from the stock, and times the deck went all the way round. */
  draws: number;
  passes: number;
  /** Everything you did that wasn't a draw. */
  moves: number;
  won: boolean;
  /** Was the deal itself winnable? */
  deal: Verdict;
  /** Was there still a way through from where you stopped? */
  end: Verdict;
  /** Last state (journal index; draws count) proven winnable. `null` if never, or if still winnable. */
  lastWinnable: number | null;
  /** Whether the bisection closed on `lastWinnable`. Copy may name "the" losing play only when true. */
  converged: boolean;
  /** Ran out of budget somewhere. */
  spent: boolean;
}

/* search state: a card is one integer, (rank-1)*4+suit */

type C = number;
const RANK = (c: C): number => (c >> 2) + 1;
const SUIT = (c: C): number => c & 3;
const RED = (c: C): boolean => isRed(SUIT(c));
const enc = (c: Card): C => ((c.rank - 1) << 2) | c.suit;

interface S {
  stock: C[]; // face down; the end is the top
  waste: C[];
  found: number[]; // top rank per suit, 0 for empty
  down: C[][];
  up: C[][];
}

function pack(s: SolState): S {
  return {
    stock: s.stock.map(enc),
    waste: s.waste.map(enc),
    found: s.found.map((p) => (p.length ? p[p.length - 1]!.rank : 0)),
    down: s.tab.map((t) => t.down.map(enc)),
    up: s.tab.map((t) => t.up.map(enc)),
  };
}

const clone = (s: S): S => ({
  stock: [...s.stock],
  waste: [...s.waste],
  found: [...s.found],
  down: s.down.map((p) => [...p]),
  up: s.up.map((p) => [...p]),
});

const homeCount = (s: S): number => s.found[0]! + s.found[1]! + s.found[2]! + s.found[3]!;
const solved = (s: S): boolean => homeCount(s) === 52;

/* visited table: two 32-bit hashes in Int32Arrays with linear probing. Not a Set:
   at a few hundred thousand entries a Set cost a ten-second GC mid-solve that no
   budget can see. Per-pile hashes are summed so column permutations are one entry.
   A collision only prunes a branch, i.e. can only turn `won` into `unknown`. */

const SEEN_SIZE = 1 << 20;
const SEEN_MASK = SEEN_SIZE - 1;
/** Past this the table stops taking entries rather than probing forever. */
const SEEN_FULL = SEEN_SIZE * 0.7;

/* One module-level table, cleared per solve: allocating 8MB per solve spent 4/5 of
   a 40-deal sweep in GC. Solves never overlap (one review at a time per worker). */
const SEEN_LO = new Int32Array(SEEN_SIZE);
const SEEN_HI = new Int32Array(SEEN_SIZE);

class Seen {
  private n = 0;

  constructor() {
    SEEN_LO.fill(0);
    SEEN_HI.fill(0);
  }

  /** Remember this position; true if it was already known. */
  add(a: number, b: number): boolean {
    // (0,0) is the empty slot
    if (a === 0 && b === 0) return false;
    let i = (a ^ (b << 5)) & SEEN_MASK;
    for (;;) {
      const la = SEEN_LO[i]!;
      if (la === 0 && SEEN_HI[i] === 0) {
        if (this.n >= SEEN_FULL) return false;
        SEEN_LO[i] = a;
        SEEN_HI[i] = b;
        this.n++;
        return false;
      }
      if (la === a && SEEN_HI[i] === b) return true;
      i = (i + 1) & SEEN_MASK;
    }
  }
}

/** `key` writes here rather than allocating a pair. */
const kOut = new Int32Array(2);

function key(s: S): void {
  let a = 2166136261;
  let b = 5381;
  const mix = (v: number): void => {
    a = Math.imul(a ^ v, 16777619);
    b = (Math.imul(b, 33) + v) | 0;
  };
  for (const c of s.stock) mix(c + 1);
  mix(97);
  for (const c of s.waste) mix(c + 1);
  mix(101);
  for (let i = 0; i < 4; i++) mix(s.found[i]! + 103);
  // per-pile hashes summed: column order is irrelevant
  let piles = 0;
  for (let i = 0; i < 7; i++) {
    let p = 374761393;
    for (const c of s.down[i]!) p = Math.imul(p ^ (c + 1), 2246822519);
    p = Math.imul(p ^ 107, 2246822519);
    for (const c of s.up[i]!) p = Math.imul(p ^ (c + 1), 2246822519);
    piles = (piles + p) | 0;
  }
  mix(piles & 0xffff);
  mix((piles >>> 16) & 0xffff);
  kOut[0] = a | 0;
  kOut[1] = b | 0;
}

/** Hash and remember; true if already seen. */
function seenBefore(seen: Seen, s: S): boolean {
  key(s);
  return seen.add(kOut[0]!, kOut[1]!);
}

/**
 * Safe auto-moves to foundation: both opposite-colour foundations at >= rank-1 and
 * same-colour other suit at >= rank-2 means nothing can still need the card.
 * Applied before branching; never costs a win.
 */
function autoSafe(s: S, line?: Mv[]): void {
  for (;;) {
    let again = false;
    // -1 is the waste; 0..6 the columns. Plain loop, not a generator: innermost
    // code in the search, and an iterator per pass was most of its time.
    for (let i = -1; i < 7 && !again; i++) {
      const pile = i < 0 ? s.waste : s.up[i]!;
      if (!pile.length) continue;
      const c = pile[pile.length - 1]!;
      const r = RANK(c);
      if (s.found[SUIT(c)] !== r - 1) continue;
      if (r > 2) {
        const red = RED(c);
        const o1 = red ? 0 : 1;
        const o2 = red ? 3 : 2;
        const same = red ? (SUIT(c) === 1 ? 2 : 1) : SUIT(c) === 0 ? 3 : 0;
        if (s.found[o1]! < r - 1 || s.found[o2]! < r - 1 || s.found[same]! < r - 2) continue;
      }
      s.found[SUIT(c)] = r;
      pile.pop();
      if (i >= 0) flip(s, i);
      line?.push(i < 0 ? { k: "wf" } : { k: "tf", from: i });
      again = true;
    }
    if (!again) return;
  }
}

/** Turn the next face-down card when a column's face-up pile empties. */
function flip(s: S, i: number): void {
  if (!s.up[i]!.length && s.down[i]!.length) s.up[i]!.push(s.down[i]!.pop()!);
}

/**
 * A move as an instruction, not a position. Generating positions instead kept
 * every frame's fan-out alive and cost 20s GC pauses on deep lines.
 */
export type Mv =
  | { k: "draw" }
  | { k: "wf" }
  | { k: "wt"; to: number }
  | { k: "tf"; from: number }
  | { k: "tt"; from: number; at: number; to: number };

/**
 * Legal moves, best-first (flips and column-emptying first, draw last).
 * Deliberately omitted: foundation-to-tableau (costly, buys a handful of deals)
 * and moving a lone king to another empty column (a pure loop).
 */
function moves(s: S): Mv[] {
  const out: { m: Mv; score: number }[] = [];
  const add = (m: Mv, score: number): void => void out.push({ m, score });

  const stackable = (c: C, i: number): boolean => {
    const pile = s.up[i]!;
    if (!pile.length) return s.down[i]!.length === 0 && RANK(c) === 13;
    const t = pile[pile.length - 1]!;
    return RANK(t) === RANK(c) + 1 && RED(t) !== RED(c);
  };

  if (s.waste.length) {
    const c = s.waste[s.waste.length - 1]!;
    if (s.found[SUIT(c)] === RANK(c) - 1) add({ k: "wf" }, 60);
    for (let i = 0; i < 7; i++) if (stackable(c, i)) add({ k: "wt", to: i }, 40);
  }

  for (let i = 0; i < 7; i++) {
    const pile = s.up[i]!;
    if (!pile.length) continue;
    const t = pile[pile.length - 1]!;
    if (s.found[SUIT(t)] === RANK(t) - 1)
      add({ k: "tf", from: i }, pile.length === 1 && s.down[i]!.length ? 70 : 50);
    // any suffix of an up-pile is a legal run by construction
    for (let j = 0; j < pile.length; j++) {
      const head = pile[j]!;
      if (j === 0 && !s.down[i]!.length && RANK(head) === 13) continue;
      for (let k = 0; k < 7; k++) {
        if (k === i || !stackable(head, k)) continue;
        add({ k: "tt", from: i, at: j, to: k }, j === 0 && s.down[i]!.length ? 65 : j === 0 ? 45 : 30);
      }
    }
  }

  if (s.stock.length || s.waste.length) add({ k: "draw" }, s.stock.length ? 20 : 10);

  out.sort((a, b) => b.score - a.score);
  return out.map((x) => x.m);
}

/** Apply a move to a copy. */
function apply(s: S, m: Mv): S {
  const n = clone(s);
  if (m.k === "draw") {
    if (n.stock.length) n.waste.push(n.stock.pop()!);
    else {
      n.stock = n.waste.reverse();
      n.waste = [];
    }
    return n;
  }
  if (m.k === "wf") {
    const c = n.waste.pop()!;
    n.found[SUIT(c)] = RANK(c);
    return n;
  }
  if (m.k === "wt") {
    n.up[m.to]!.push(n.waste.pop()!);
    return n;
  }
  if (m.k === "tf") {
    const c = n.up[m.from]!.pop()!;
    n.found[SUIT(c)] = RANK(c);
    flip(n, m.from);
    return n;
  }
  n.up[m.to]!.push(...n.up[m.from]!.splice(m.at));
  flip(n, m.from);
  return n;
}

// Max line length. Draws are moves, so real lines run to hundreds; 400 cut off winnable deals.
const MAX_DEPTH = 3000;

export interface SolveResult {
  verdict: Verdict;
  /** States expanded. */
  nodes: number;
  ms: number;
  /** On `won`, the winning line (the proof; the test replays it). */
  line: Mv[];
}

/** Whichever is hit first stops the solve. */
export interface Budget {
  nodes: number;
  ms: number;
}
export const BUDGET: Budget = { nodes: 400_000, ms: 3000 };

/**
 * Can this state still be won? The wall clock is a real bound, not belt-and-braces:
 * one deal in twenty takes 20x as long per node as the rest.
 */
export function solve(state: SolState, budget: Budget = BUDGET): SolveResult {
  const seen = new Seen();
  const t0 = Date.now();
  let nodes = 0;
  let out = false;

  // Clock checked every 256 *checks*, not nodes: a search stuck at the depth cap
  // expands nothing but still burns time.
  let ticks = 0;
  const spent = (): boolean => {
    if (out) return true;
    if (nodes >= budget.nodes) return (out = true);
    if ((++ticks & 255) === 0 && Date.now() - t0 >= budget.ms) return (out = true);
    return false;
  };

  const line: Mv[] = [];

  const walk = (s: S, depth: number): boolean => {
    if (solved(s)) return true;
    if (spent() || depth > MAX_DEPTH) return false;
    nodes++;
    for (const m of moves(s)) {
      const mark = line.length;
      const next = apply(s, m);
      line.push(m);
      autoSafe(next, line);
      if (solved(next)) return true;
      if (!seenBefore(seen, next) && walk(next, depth + 1)) return true;
      line.length = mark;
      if (spent()) return false;
    }
    return false;
  };

  const root = pack(state);
  autoSafe(root, line);
  seenBefore(seen, root);
  const won = walk(root, 0);
  return { verdict: won ? "won" : "unknown", nodes, ms: Date.now() - t0, line: won ? line : [] };
}

/**
 * Review a journal (every state the game passed through). Counts come off the
 * journal; verdicts and turning point are searched under one shared budget.
 * The player waits on this: ten seconds reads as thinking, thirty as a hang.
 */
export function reviewGame(
  journal: readonly SolState[],
  budget: Budget = { nodes: 2_000_000, ms: 12_000 },
): SolReview {
  const first = journal[0]!;
  const last = journal[journal.length - 1]!;
  const homed = (s: SolState): number => s.found.reduce((n, p) => n + p.length, 0);
  const faceDown = (s: SolState): number => s.tab.reduce((n, t) => n + t.down.length, 0);

  let draws = 0;
  let passes = 0;
  let acts = 0;
  for (let i = 1; i < journal.length; i++) {
    const a = journal[i - 1]!;
    const b = journal[i]!;
    acts++;
    if (b.waste.length === a.waste.length + 1 && b.stock.length === a.stock.length - 1) draws++;
    else if (a.stock.length === 0 && b.stock.length > 0) passes++;
  }

  const out: SolReview = {
    homed: homed(last),
    flipped: faceDown(first) - faceDown(last),
    draws,
    passes,
    moves: acts - draws - passes,
    won: homed(last) === 52,
    deal: "unknown",
    end: "unknown",
    lastWinnable: null,
    converged: false,
    spent: false,
  };
  if (out.won) {
    out.deal = "won";
    out.end = "won";
    out.converged = true;
    return out;
  }

  let nodesLeft = budget.nodes;
  let msLeft = budget.ms;
  const ask = (s: SolState): Verdict => {
    if (nodesLeft <= 0 || msLeft <= 0) {
      out.spent = true;
      return "unknown";
    }
    const per = {
      nodes: Math.min(BUDGET.nodes, nodesLeft),
      ms: Math.min(BUDGET.ms, msLeft),
    };
    const r = solve(s, per);
    nodesLeft -= r.nodes;
    msLeft -= r.ms;
    if (r.verdict === "unknown" && (r.nodes >= per.nodes || r.ms >= per.ms)) out.spent = true;
    return r.verdict;
  };

  out.deal = ask(first);
  if (journal.length < 2) {
    out.end = out.deal;
    out.converged = true;
    return out;
  }
  if (out.deal !== "won") return out;
  out.end = ask(last);
  if (out.end === "won") {
    out.converged = true;
    return out;
  }

  // Bisect for the last winnable state. `lo` is always proven won. If the loop
  // stops on budget, `lo` is only the last state proved, hence `converged`.
  let lo = 0;
  let hi = journal.length - 1;
  while (hi - lo > 1 && nodesLeft > 0 && msLeft > 0) {
    const mid = (lo + hi) >> 1;
    if (ask(journal[mid]!) === "won") lo = mid;
    else hi = mid;
  }
  out.lastWinnable = lo;
  out.converged = hi - lo === 1;
  return out;
}
