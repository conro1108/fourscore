/**
 * Exact solver: negamax, alpha-beta, transposition table, null-window binary
 * search over the score range. Score units are discs-to-spare for the player to
 * move: >0 wins with `score` cells unplayed, 0 draw, <0 loses. Bigger magnitude
 * = faster.
 */

import {
  CONNECT4,
  Position,
  VARIANTS,
  type Variant,
  computeAlignmentSpots,
  popcount,
} from "./board.js";

/** Beyond any real score, for "no result yet". */
export const SCORE_UNKNOWN = 127;

/** Best possible score: win at ply `2 * run - 1`, rest unplayed. */
export const maxScoreOf = (v: Variant): number => Math.floor(v.cells / 2) - v.run + 1;

/** Connect 4's bounds, for callers that only deal with the default board. */
export const MAX_SCORE = maxScoreOf(CONNECT4);
export const MIN_SCORE = -MAX_SCORE;

const FLAG_EMPTY = 0;
const FLAG_UPPER = 1;
const FLAG_LOWER = 2;

const LANE_MASK = 0xffffffffn;
const LANE_SHIFT = 32n;

/** Widest `key()` the table compares exactly: four 32-bit lanes + 53 float64 bits. Connect 7 needs 169. */
export const TT_MAX_KEY_BITS = 4 * 32 + 53;

/**
 * Fixed-size transposition table. Keys are split across lanes because a single
 * float64 rounds silently past 53 bits and the solver then returns wrong scores
 * with no error. Collisions overwrite (a wrong hit only costs a re-search) —
 * safe only while the key comparison is exact. See CLAUDE.md § TT key.
 */
export class TranspositionTable {
  private readonly size: number;
  private readonly keysA: Uint32Array;
  private readonly keysB: Uint32Array;
  private readonly keysC: Uint32Array;
  private readonly keysD: Uint32Array;
  private readonly keysE: Float64Array;
  private readonly vals: Int8Array;
  private readonly flags: Uint8Array;

  constructor(sizeLog2 = 20) {
    this.size = 1 << sizeLog2;
    this.keysA = new Uint32Array(this.size);
    this.keysB = new Uint32Array(this.size);
    this.keysC = new Uint32Array(this.size);
    this.keysD = new Uint32Array(this.size);
    this.keysE = new Float64Array(this.size);
    this.vals = new Int8Array(this.size);
    this.flags = new Uint8Array(this.size);
  }

  get(key: bigint): { value: number; flag: number } | null {
    const a = Number(key & LANE_MASK);
    let rest = key >> LANE_SHIFT;
    const b = Number(rest & LANE_MASK);
    rest >>= LANE_SHIFT;
    const c = Number(rest & LANE_MASK);
    rest >>= LANE_SHIFT;
    const d = Number(rest & LANE_MASK);
    const e = Number(rest >> LANE_SHIFT);
    // Mix all lanes: low bits alone cluster siblings. XOR truncating `e` is fine; the comparison below is exact.
    const i = (a ^ b ^ c ^ d ^ e) & (this.size - 1);
    if (
      this.flags[i] === FLAG_EMPTY ||
      this.keysA[i] !== a ||
      this.keysB[i] !== b ||
      this.keysC[i] !== c ||
      this.keysD[i] !== d ||
      this.keysE[i] !== e
    ) {
      return null;
    }
    return { value: this.vals[i]!, flag: this.flags[i]! };
  }

  put(key: bigint, value: number, flag: number): void {
    const a = Number(key & LANE_MASK);
    let rest = key >> LANE_SHIFT;
    const b = Number(rest & LANE_MASK);
    rest >>= LANE_SHIFT;
    const c = Number(rest & LANE_MASK);
    rest >>= LANE_SHIFT;
    const d = Number(rest & LANE_MASK);
    const e = Number(rest >> LANE_SHIFT);
    const i = (a ^ b ^ c ^ d ^ e) & (this.size - 1);
    this.keysA[i] = a;
    this.keysB[i] = b;
    this.keysC[i] = c;
    this.keysD[i] = d;
    this.keysE[i] = e;
    this.vals[i] = value;
    this.flags[i] = flag;
  }

  clear(): void {
    this.flags.fill(FLAG_EMPTY);
  }
}

export interface SearchContext {
  table: TranspositionTable;
  nodes: number;
  /** Abort budget. Exceeding it throws `SearchAborted`. */
  nodeLimit: number;
}

export class SearchAborted extends Error {
  constructor() {
    super("search aborted");
    this.name = "SearchAborted";
  }
}

// Per-ply move-ordering scratch; never two frames at one depth, and per-node allocation costs more than the ordering.
const MAX_PLY = Math.max(...VARIANTS.map((v) => v.cells)) + 1;
const MAX_WIDTH = Math.max(...VARIANTS.map((v) => v.width));
const ORDER_MOVES: bigint[][] = Array.from({ length: MAX_PLY }, () => new Array<bigint>(MAX_WIDTH));
const ORDER_SCORES: Int32Array[] = Array.from(
  { length: MAX_PLY },
  () => new Int32Array(MAX_WIDTH),
);

/** Order moves best-first (by winning cells created) into scratch for `ply`; returns count. Insertion sort is right at this size. */
function orderMoves(p: Position, possible: bigint, ply: number): number {
  const moves = ORDER_MOVES[ply]!;
  const scores = ORDER_SCORES[ply]!;
  const v = p.variant;
  let n = 0;

  for (const col of v.moveOrder) {
    const move = possible & v.columnMasks[col]!;
    if (move === 0n) continue;
    const score = popcount(computeAlignmentSpots(p.position | move, p.mask | move, v));
    let i = n;
    while (i > 0 && scores[i - 1]! < score) {
      moves[i] = moves[i - 1]!;
      scores[i] = scores[i - 1]!;
      i--;
    }
    moves[i] = move;
    scores[i] = score;
    n++;
  }

  return n;
}

/** Exact if strictly inside `[alpha, beta)`, otherwise a bound in the failed direction. */
function negamax(p: Position, alpha: number, beta: number, ctx: SearchContext, ply = 0): number {
  if (++ctx.nodes > ctx.nodeLimit) throw new SearchAborted();

  const cells = p.variant.cells;
  const possible = p.nonLosingMoves();
  if (possible === 0n) {
    return -Math.floor((cells - p.moves) / 2);
  }

  if (p.moves >= cells - 2) return 0; // no room for anyone to win

  // No immediate win exists (handled above), so tighten to the soonest still-possible win.
  const min = -Math.floor((cells - 2 - p.moves) / 2);
  if (alpha < min) {
    alpha = min;
    if (alpha >= beta) return alpha;
  }
  let max = Math.floor((cells - 1 - p.moves) / 2);
  if (beta > max) {
    beta = max;
    if (alpha >= beta) return beta;
  }

  const key = p.key();
  const entry = ctx.table.get(key);
  if (entry) {
    if (entry.flag === FLAG_UPPER) {
      if (entry.value < beta) {
        beta = entry.value;
        if (alpha >= beta) return beta;
      }
    } else {
      if (entry.value > alpha) {
        alpha = entry.value;
        if (alpha >= beta) return alpha;
      }
    }
  }

  const count = orderMoves(p, possible, ply);
  const moves = ORDER_MOVES[ply]!;

  for (let i = 0; i < count; i++) {
    const move = moves[i]!;
    const child = new Position(p.position ^ p.mask, p.mask | move, p.moves + 1, p.variant);

    const score = -negamax(child, -beta, -alpha, ctx, ply + 1);
    if (score >= beta) {
      ctx.table.put(key, score, FLAG_LOWER);
      return score;
    }
    if (score > alpha) alpha = score;
  }

  ctx.table.put(key, alpha, FLAG_UPPER);
  return alpha;
}

export interface SolveOptions {
  table?: TranspositionTable;
  /** Nodes before the search gives up and throws. Default is generous. */
  nodeLimit?: number;
}

export interface SolveStats {
  nodes: number;
}

/** Exact score of `p` for the player to move, via null-window probes over the score range. */
export function solveScore(p: Position, opts: SolveOptions = {}): number {
  const { score } = solveScoreWithStats(p, opts);
  return score;
}

export function solveScoreWithStats(
  p: Position,
  opts: SolveOptions = {},
): { score: number; stats: SolveStats } {
  // Refuse rather than round: past this the TT key comparison is inexact.
  if (p.variant.keyBits > TT_MAX_KEY_BITS) {
    throw new Error(
      `board needs ${p.variant.keyBits}-bit keys; the table compares at most ${TT_MAX_KEY_BITS}`,
    );
  }

  const ctx: SearchContext = {
    table: opts.table ?? new TranspositionTable(),
    nodes: 0,
    nodeLimit: opts.nodeLimit ?? Number.MAX_SAFE_INTEGER,
  };

  const cells = p.variant.cells;

  for (const col of p.variant.moveOrder) {
    if (p.canPlay(col) && p.isWinningMove(col)) {
      return { score: Math.floor((cells + 1 - p.moves) / 2), stats: { nodes: 0 } };
    }
  }

  let min = -Math.floor((cells - p.moves) / 2);
  let max = Math.floor((cells + 1 - p.moves) / 2);

  while (min < max) {
    // Bias probes toward zero (near-draws dominate). Math.trunc, not floor: the
    // probe must stay inside [min, max) on the negative side.
    let med = min + Math.trunc((max - min) / 2);
    if (med <= 0 && Math.trunc(min / 2) < med) med = Math.trunc(min / 2);
    else if (med >= 0 && Math.trunc(max / 2) > med) med = Math.trunc(max / 2);

    const r = negamax(p, med, med + 1, ctx);
    if (r <= med) max = r;
    else min = r;
  }

  return { score: min, stats: { nodes: ctx.nodes } };
}

/** The exact score of every legal move, from the point of view of the mover. */
export interface MoveScore {
  col: number;
  /** Score for the player who plays it. Higher is better. */
  score: number;
}

export interface Analysis {
  moves: MoveScore[];
  /** Best score available to the player to move. */
  best: number;
  /** Every column that achieves `best`. */
  bestCols: number[];
}

/** Score every legal move exactly. */
export function analyze(p: Position, opts: SolveOptions = {}): Analysis {
  const table = opts.table ?? new TranspositionTable();
  const moves: MoveScore[] = [];

  for (let col = 0; col < p.variant.width; col++) {
    if (!p.canPlay(col)) continue;
    if (p.isWinningMove(col)) {
      moves.push({ col, score: Math.floor((p.variant.cells + 1 - p.moves) / 2) });
      continue;
    }
    const child = p.clone();
    child.play(col);
    if (child.isDraw()) {
      moves.push({ col, score: 0 });
      continue;
    }
    moves.push({ col, score: -solveScore(child, { ...opts, table }) });
  }

  const best = moves.reduce((m, x) => Math.max(m, x.score), -Infinity);
  return {
    moves,
    best,
    bestCols: moves.filter((m) => m.score === best).map((m) => m.col),
  };
}
