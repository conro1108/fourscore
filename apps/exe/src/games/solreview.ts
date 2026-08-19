/**
 * SOL.EXE's review — the two questions a Klondike player actually has.
 *
 * "Was that deal winnable?" and "was I still alive when I stopped?" Both are
 * answered by playing the rest of the game out: a depth-first search over
 * legal Klondike (draw one, unlimited passes), with a node budget, that stops
 * the moment it has a line to all fifty-two home.
 *
 * The asymmetry is the whole design, and it is the same confidence law the
 * board's review lives under. A "yes" is *proven* — the search held an actual
 * legal sequence in its hand when it said so — and the copy for it is flat.
 * A "no" is never proven: the search may have run out of budget, and it never
 * takes a card back off a foundation, so there are wins it cannot see. So
 * "no" is only ever "the machine couldn't find a way", and it is written that
 * way. Never turn `unknown` into a verdict.
 *
 * Winnability along the line you actually played is monotone: if the machine
 * can win from your state after move k, it can win from every state before it
 * (play your own moves, then its line). That is what makes the binary search
 * below legitimate, and it is the only reason a review costs eight solves
 * instead of one per move.
 */

import { isRed, type Card, type SolState } from "./solstate.js";

/** What the search found. `unknown` is not a loss — see the header. */
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
  /**
   * The last state the machine could still win from, as a count of your
   * actions — `null` when it never could, or when it still can. Proven: there
   * is a line out of that state.
   */
  lastWinnable: number | null;
  /** True if the search ran out of budget somewhere rather than settling it. */
  spent: boolean;
}

/* ---- the state, in a form a search can move through fast ----
   The window's SolState is arrays of card objects, which is right for a table
   you can drag cards on and wrong for a million-node search. Here a card is
   one integer, rank*4+suit, and a pile is an array of them. */

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

/* ---- the visited table ----
   Two 32-bit rolling hashes of the position, in a pair of Int32Arrays with
   linear probing. Not a Set of strings and not a Set of numbers: at a few
   hundred thousand entries either one is most of the search's memory, and a
   heap that size bought a ten-second garbage collection in the middle of a
   solve — a stall no node budget can see coming and no wall clock can
   interrupt. A typed table allocates once and never again.

   Columns are interchangeable in Klondike (nothing in the rules can tell pile
   3 from pile 5), so the seven per-pile hashes are summed rather than
   concatenated: every permutation of the same table is one entry, without
   sorting anything.

   A hash collision costs one pruned branch, which can only ever turn a `won`
   into an `unknown` — the direction this file is already honest about. */

const SEEN_SIZE = 1 << 20;
const SEEN_MASK = SEEN_SIZE - 1;
/** Past this the table stops taking entries rather than probing forever. */
const SEEN_FULL = SEEN_SIZE * 0.7;

/* One table for the whole module, cleared per solve rather than allocated per
   solve. Two eight-megabyte arrays a solve is nothing on its own and murder
   in a row of them: a sweep of forty deals spent four fifths of its wall
   clock not running, handing large arrays to the collector and taking them
   back. Solves never overlap — the review runs them one at a time, and the
   worker runs one review at a time — so one table is enough for all of it. */
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
    // (0,0) is the empty slot, so one position in four billion is never stored
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

/** `key` hands its two words back here rather than allocating a pair. */
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
  // per-pile hashes, summed: seven columns in any order are one position
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

/** Hash the position and remember it; true if it had been here before. */
function seenBefore(seen: Seen, s: S): boolean {
  key(s);
  return seen.add(kOut[0]!, kOut[1]!);
}

/**
 * The classic safety rule: a card can go home with no thought at all when
 * nothing on the table could still need it. Both opposite colors have to be
 * up to rank-1 (so no black 6 is waiting for this red 7), and 2s only need
 * their own ace down. Playing these automatically before branching is what
 * makes the search tractable, and it never costs a win.
 */
function autoSafe(s: S, line?: Mv[]): void {
  for (;;) {
    let again = false;
    // -1 is the waste; 0..6 are the columns. A plain loop, not a generator:
    // this is the innermost thing in the search and allocating an iterator
    // per pass was most of its time.
    for (let i = -1; i < 7 && !again; i++) {
      const pile = i < 0 ? s.waste : s.up[i]!;
      if (!pile.length) continue;
      const c = pile[pile.length - 1]!;
      const r = RANK(c);
      if (s.found[SUIT(c)] !== r - 1) continue;
      // the two of the other color have to be up to r-1 (nothing black is
      // still waiting for this red seven), and the other one of this color to
      // r-2 (nothing this color is waiting for the card that wants this one)
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

/** A column whose last face-up card just left turns its next face-down one. */
function flip(s: S, i: number): void {
  if (!s.up[i]!.length && s.down[i]!.length) s.up[i]!.push(s.down[i]!.pop()!);
}

/**
 * A move, as an instruction rather than a position. The search generates
 * these — small, and a few hundred bytes for a whole node's worth — and only
 * builds the state when it actually walks into it. Generating positions
 * instead kept every frame's entire fan-out alive at once, which on a deep
 * line is millions of live arrays and a garbage collector that takes twenty
 * seconds off the clock in a search that thinks it is doing nothing.
 */
export type Mv =
  | { k: "draw" }
  | { k: "wf" }
  | { k: "wt"; to: number }
  | { k: "tf"; from: number }
  | { k: "tt"; from: number; at: number; to: number };

/**
 * Everything legal from here, best-first: the moves that turn a card over or
 * empty a column come before the ones that only shuffle the table, and the
 * draw comes last because it is the move that does nothing on its own.
 *
 * Two things are deliberately not here. A card never comes back off a
 * foundation — it costs a great deal of search and buys a handful of deals —
 * and a king already alone in its column is never moved to another empty one,
 * which is a pure loop.
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
    // a run of any length -> another column. Every up-pile is a proper
    // descending alternating run by construction, so any suffix of it moves.
    for (let j = 0; j < pile.length; j++) {
      const head = pile[j]!;
      // moving a column of nothing but a king onto another empty one is the
      // same position again
      if (j === 0 && !s.down[i]!.length && RANK(head) === 13) continue;
      for (let k = 0; k < 7; k++) {
        if (k === i || !stackable(head, k)) continue;
        // turning a card over is progress; emptying a column outright is more
        add({ k: "tt", from: i, at: j, to: k }, j === 0 && s.down[i]!.length ? 65 : j === 0 ? 45 : 30);
      }
    }
  }

  // the draw, and the pass round the deck when the stock is out
  if (s.stock.length || s.waste.length) add({ k: "draw" }, s.stock.length ? 20 : 10);

  out.sort((a, b) => b.score - a.score);
  return out.map((x) => x.m);
}

/** The position that move leads to. The original is left alone. */
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

/* How long a line the search will follow before it gives up on it. A draw is
   a move, so a real Klondike line that cycles the deck a dozen times is
   hundreds of moves long — 400 was cutting off winnable deals, and this is
   still far short of what the recursion can carry. */
const MAX_DEPTH = 3000;

export interface SolveResult {
  verdict: Verdict;
  /** States expanded — what the caller spends its node budget in. */
  nodes: number;
  ms: number;
  /** On `won`, the line it found: the proof, and what the test replays. */
  line: Mv[];
}

/** A solve stops on whichever of these it reaches first. */
export interface Budget {
  nodes: number;
  ms: number;
}
export const BUDGET: Budget = { nodes: 400_000, ms: 3000 };

/**
 * Can this game still be won? Depth-first, visited set, best-first ordering,
 * and two budgets it will not exceed. `won` means the search actually held a
 * legal line to all fifty-two home; anything else is `unknown`.
 *
 * The clock is not a belt-and-braces node budget. A deep line holds every
 * frame's children alive at once, and one deal in twenty spends twenty times
 * as long on the same hundred thousand nodes as the rest — a wall clock is
 * the only bound that describes what the player is actually waiting through.
 */
export function solve(state: SolState, budget: Budget = BUDGET): SolveResult {
  const seen = new Seen();
  const t0 = Date.now();
  let nodes = 0;
  let out = false;

  /* Both budgets, the clock checked on a cadence of its own — Date.now() per
     node is not free, and counting the *checks* rather than the nodes is what
     keeps a search that is only hitting the depth cap (expanding nothing, and
     still working) from running the clock out unwatched. */
  let ticks = 0;
  const spent = (): boolean => {
    if (out) return true;
    if (nodes >= budget.nodes) return (out = true);
    if ((++ticks & 255) === 0 && Date.now() - t0 >= budget.ms) return (out = true);
    return false;
  };

  /* The line, kept as the search walks so a `won` can be handed back as the
     moves that win — `solreview.test.ts` replays it through the game's own
     rules, which is the only way "proven" is worth the word. */
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
 * The whole review, off one journal: every state your game passed through,
 * the deal first and where you stopped last.
 *
 * The counts are read off the journal (they are facts about your game); the
 * two verdicts and the turning point are searched for, inside one budget for
 * the lot. The binary search is what monotone winnability buys — eight solves
 * for a game of any length.
 *
 * The budget is a wall clock as much as a node count, because the review is
 * something a player is waiting on: ten seconds of "the machine is going back
 * over it" is a period machine thinking, and thirty is a hang.
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
    spent: false,
  };
  if (out.won) {
    // you did it; there is nothing left to search for
    out.deal = "won";
    out.end = "won";
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
    // it stopped because it ran out, not because it settled anything
    if (r.verdict === "unknown" && (r.nodes >= per.nodes || r.ms >= per.ms)) out.spent = true;
    return r.verdict;
  };

  out.deal = ask(first);
  if (out.deal !== "won" || journal.length < 2) return out;
  out.end = ask(last);
  if (out.end === "won") return out;

  /* Somewhere between the deal and here, the way out closed. Binary search
     for the last state it was still open — `lo` is always a state the machine
     has actually won from, so the number it reports is proven. */
  let lo = 0;
  let hi = journal.length - 1;
  while (hi - lo > 1 && nodesLeft > 0 && msLeft > 0) {
    const mid = (lo + hi) >> 1;
    if (ask(journal[mid]!) === "won") lo = mid;
    else hi = mid;
  }
  out.lastWinnable = lo;
  return out;
}
