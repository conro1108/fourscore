/**
 * The exact solver — negamax with alpha-beta, a transposition table, and a
 * null-window binary search over the score range.
 *
 * Connect 4 is a solved game, so "exact" here means exact: the score returned
 * is not an estimate. Scores are measured in discs-to-spare rather than
 * material, which is the only scale that makes sense for a game whose only
 * outcomes are win, lose and draw:
 *
 *   score > 0   the player to move wins, with `score` discs left unplayed
 *   score = 0   the game is a draw with best play
 *   score < 0   the player to move loses, the opponent having `-score` to spare
 *
 * Bigger magnitudes therefore mean *faster*, and a bot that prefers the highest
 * score is a bot that goes for the throat rather than dawdling in a won game.
 *
 * The search proves a bound rather than computing a value: every recursive call
 * uses a null window (beta = alpha + 1), which prunes far harder than a wide
 * one, and `solveScore` binary-searches the range to pin the true score down.
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

/**
 * The best possible score on a board: winning as early as the run length
 * allows, which is ply `2 * run - 1`, with everything after it left unplayed.
 */
export const maxScoreOf = (v: Variant): number => Math.floor(v.cells / 2) - v.run + 1;

/** Connect 4's bounds, for callers that only deal with the default board. */
export const MAX_SCORE = maxScoreOf(CONNECT4);
export const MIN_SCORE = -MAX_SCORE;

const FLAG_EMPTY = 0;
const FLAG_UPPER = 1;
const FLAG_LOWER = 2;

const LO_MASK = 0xffffffffn;
const HI_SHIFT = 32n;

/**
 * Fixed-size open-addressed transposition table.
 *
 * Keys are stored as a 32-bit low half and whatever is left over, rather than
 * as one float64. On Connect 4 a `key()` is at most 49 bits and would fit in a
 * float64's 53 bits of exact integer, but the packing needs `width * (height +
 * 1)` bits and any board past 7x6 blows through that — Connect 5's 9x8 needs
 * 81. A float64 doesn't fail loudly there; it rounds, so two different
 * positions start comparing equal and the "exact" solver quietly returns wrong
 * scores. Splitting the key keeps the comparison exact at every board size.
 *
 * Collisions simply overwrite: a wrong hit costs a re-search, not a wrong
 * answer, because the stored value is always re-validated against the current
 * window. That is only true while the key comparison itself is exact, which is
 * the whole reason for the split.
 */
export class TranspositionTable {
  private readonly size: number;
  private readonly keysLo: Uint32Array;
  private readonly keysHi: Float64Array;
  private readonly vals: Int8Array;
  private readonly flags: Uint8Array;

  constructor(sizeLog2 = 20) {
    this.size = 1 << sizeLog2;
    this.keysLo = new Uint32Array(this.size);
    this.keysHi = new Float64Array(this.size);
    this.vals = new Int8Array(this.size);
    this.flags = new Uint8Array(this.size);
  }

  private index(lo: number, hi: number): number {
    // The low bits vary slowly between sibling positions, so a plain modulo by
    // a power of two would cluster badly. Mixing the high half down first is
    // what keeps the table spread out.
    return (lo ^ hi) & (this.size - 1);
  }

  get(key: bigint): { value: number; flag: number } | null {
    const lo = Number(key & LO_MASK);
    const hi = Number(key >> HI_SHIFT);
    const i = this.index(lo, hi);
    if (this.flags[i] === FLAG_EMPTY || this.keysLo[i] !== lo || this.keysHi[i] !== hi) return null;
    return { value: this.vals[i]!, flag: this.flags[i]! };
  }

  put(key: bigint, value: number, flag: number): void {
    const lo = Number(key & LO_MASK);
    const hi = Number(key >> HI_SHIFT);
    const i = this.index(lo, hi);
    this.keysLo[i] = lo;
    this.keysHi[i] = hi;
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

/**
 * Scratch space for move ordering, one slot per ply.
 *
 * The search never has two frames at the same depth live at once, so each depth
 * can reuse a single pair of arrays forever. Allocating them per node instead
 * costs more than the ordering itself — this is the innermost loop in the
 * program and it runs a few million times a second.
 */
const MAX_PLY = Math.max(...VARIANTS.map((v) => v.cells)) + 1;
const MAX_WIDTH = Math.max(...VARIANTS.map((v) => v.width));
const ORDER_MOVES: bigint[][] = Array.from({ length: MAX_PLY }, () => new Array<bigint>(MAX_WIDTH));
const ORDER_SCORES: Int32Array[] = Array.from(
  { length: MAX_PLY },
  () => new Int32Array(MAX_WIDTH),
);

/**
 * Order candidate moves best-first into the scratch arrays for `ply`, and
 * return how many there are.
 *
 * The heuristic is how many new winning cells a move creates: a move that
 * builds two threats at once is likely to be the refutation, and getting it
 * searched first is what makes the alpha-beta cutoffs cheap. Insertion sort
 * over at most seven entries beats any real sorting machinery here.
 */
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

/**
 * Prove whether the score for the player to move lies above or below the
 * `[alpha, beta)` window. Returns a value that is exact when it lands strictly
 * inside the window, and otherwise a bound in the direction it failed.
 */
function negamax(p: Position, alpha: number, beta: number, ctx: SearchContext, ply = 0): number {
  if (++ctx.nodes > ctx.nodeLimit) throw new SearchAborted();

  const cells = p.variant.cells;
  const possible = p.nonLosingMoves();
  if (possible === 0n) {
    // Every move loses immediately — the opponent wins as soon as they can.
    return -Math.floor((cells - p.moves) / 2);
  }

  if (p.moves >= cells - 2) return 0; // no room for anyone to win

  // Nobody can win on their very next move (we'd have returned already), so
  // tighten the window against the soonest win that is still possible. This is
  // pure profit: it often collapses the window to nothing without any search.
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
      // Stored value is an upper bound on the true score.
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
    // The child, built inline: XOR flips the perspective to the opponent, and
    // the move joins the shared mask.
    const child = new Position(p.position ^ p.mask, p.mask | move, p.moves + 1, p.variant);

    // Null window: we only need to know whether this child beats alpha, not by
    // how much. If it does, the wider re-search happens at the parent's parent.
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

/**
 * The exact score of `p` for the player to move.
 *
 * Rather than one wide-window search, this binary-searches the score range with
 * null-window probes. Each probe answers a yes/no question ("is the score above
 * n?"), which alpha-beta can settle far more cheaply than "what is the score",
 * and about six probes pin down the answer.
 */
export function solveScore(p: Position, opts: SolveOptions = {}): number {
  const { score } = solveScoreWithStats(p, opts);
  return score;
}

export function solveScoreWithStats(
  p: Position,
  opts: SolveOptions = {},
): { score: number; stats: SolveStats } {
  const ctx: SearchContext = {
    table: opts.table ?? new TranspositionTable(),
    nodes: 0,
    nodeLimit: opts.nodeLimit ?? Number.MAX_SAFE_INTEGER,
  };

  const cells = p.variant.cells;

  // An immediate win is worth checking before any of the machinery starts —
  // it's the single most common case in a real game.
  for (const col of p.variant.moveOrder) {
    if (p.canPlay(col) && p.isWinningMove(col)) {
      return { score: Math.floor((cells + 1 - p.moves) / 2), stats: { nodes: 0 } };
    }
  }

  let min = -Math.floor((cells - p.moves) / 2);
  let max = Math.floor((cells + 1 - p.moves) / 2);

  while (min < max) {
    // Bias the probe toward zero: draws and near-draws are much more common
    // than blowouts, so testing near the middle of the range wastes probes.
    // Halving truncates toward zero, not downward — the probe has to stay
    // inside [min, max) and Math.floor would push it out on the negative side.
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

/**
 * Score every legal move exactly.
 *
 * This is what the perfect bot picks from and what blunder analysis compares
 * against — being able to say "you were winning, then you weren't" needs a
 * number for the move played *and* for the move that was there instead.
 */
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
    // The child's score is from the opponent's point of view; negate it.
    moves.push({ col, score: -solveScore(child, { ...opts, table }) });
  }

  const best = moves.reduce((m, x) => Math.max(m, x.score), -Infinity);
  return {
    moves,
    best,
    bestCols: moves.filter((m) => m.score === best).map((m) => m.col),
  };
}
