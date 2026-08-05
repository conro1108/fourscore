/**
 * The heuristic evaluator, and the depth-limited search that uses it.
 *
 * The exact solver in solver.ts is the truth, but it's only affordable from
 * about ten discs on. Everything before that — and every bot that isn't
 * supposed to be perfect — runs on this instead.
 *
 * The point of a weighted evaluation here isn't only strength. It's *style*:
 * the same search with a different weight vector produces a visibly different
 * opponent. A bot that scores threats highly and ignores parity plays like an
 * over-eager attacker; one that weights parity plays the quiet positional game
 * that wins Connect 4 between good players. That's what makes the ladder feel
 * like seven opponents rather than one opponent at seven depths.
 */

import { CONNECT4, Position, type Variant, computeAlignmentSpots, popcount } from "./board.js";

export interface EvalWeights {
  /** Value of holding the middle columns, where more lines cross. */
  center: number;
  /** Value of each cell that would complete a four. */
  threat: number;
  /**
   * Value of holding threats on the rows that suit you.
   *
   * Connect 4's deepest positional idea: because the players alternate and
   * discs stack, the first player naturally wins races decided on odd rows
   * (counting from the bottom) and the second player on even rows. A threat on
   * the wrong row for you is often worthless; on the right one it can be the
   * whole game. Bots that weight this play a recognisably more patient game.
   */
  parity: number;
  /** Value of a threat that can actually be played into right now. */
  immediate: number;
}

/** Sensible middle-of-the-road weights; the roster tunes around these. */
export const BALANCED_WEIGHTS: EvalWeights = {
  center: 6,
  threat: 14,
  parity: 18,
  immediate: 30,
};

/** A win is worth more than any positional consideration can add up to. */
export const WIN_SCORE = 100_000;

/**
 * The lookup tables `evaluate` needs, derived from a board geometry.
 *
 * Cached per variant rather than rebuilt: these are pure functions of the
 * geometry, and `evaluate` runs at every leaf of every bot's search.
 */
interface EvalTables {
  /** Rows indexed from the bottom, so row 0 is the first row and counts as odd. */
  oddRows: bigint;
  evenRows: bigint;
  /** Columns grouped by centre value, so scoring the centre costs a popcount per group. */
  centerGroups: readonly { value: number; mask: bigint }[];
}

const TABLES = new WeakMap<Variant, EvalTables>();

function tablesFor(v: Variant): EvalTables {
  let t = TABLES.get(v);
  if (t) return t;

  const rowsMask = (pick: (row: number) => boolean): bigint => {
    let m = 0n;
    for (let col = 0; col < v.width; col++) {
      for (let row = 0; row < v.height; row++) {
        if (pick(row)) m |= 1n << (BigInt(col) * v.h1 + BigInt(row));
      }
    }
    return m;
  };

  // Roughly how many of the possible lines pass through each column: it rises
  // linearly from each edge and flattens once a full run fits on both sides.
  // For 7-wide Connect 4 that reproduces the old hand-written [1,2,3,4,3,2,1].
  const centerValue = (col: number): number =>
    Math.min(col + 1, v.width - col, v.width - v.run + 1);

  const byValue = new Map<number, bigint>();
  for (let col = 0; col < v.width; col++) {
    const value = centerValue(col);
    byValue.set(value, (byValue.get(value) ?? 0n) | v.columnMasks[col]!);
  }

  t = {
    oddRows: rowsMask((row) => row % 2 === 0),
    evenRows: rowsMask((row) => row % 2 === 1),
    centerGroups: [...byValue].map(([value, mask]) => ({ value, mask })),
  };
  TABLES.set(v, t);
  return t;
}

/**
 * Score `p` from the point of view of the player to move.
 *
 * Positive is good for the mover. Terminal positions are not detected here —
 * the search handles those, because it knows whose move produced them.
 */
export function evaluate(p: Position, w: EvalWeights): number {
  const v = p.variant;
  const t = tablesFor(v);
  const mine = p.position;
  const theirs = p.position ^ p.mask;
  const playable = p.possibleMoves();

  const myThreats = computeAlignmentSpots(mine, p.mask, v);
  const theirThreats = computeAlignmentSpots(theirs, p.mask, v);

  // Red moves on even plies, and red is the player who wants odd rows.
  const myRows = p.moves % 2 === 0 ? t.oddRows : t.evenRows;
  const theirRows = p.moves % 2 === 0 ? t.evenRows : t.oddRows;

  let score = 0;

  score += w.threat * (popcount(myThreats) - popcount(theirThreats));
  score += w.parity * (popcount(myThreats & myRows) - popcount(theirThreats & theirRows));
  score += w.immediate * (popcount(myThreats & playable) - popcount(theirThreats & playable));

  for (const { value, mask } of t.centerGroups) {
    score += w.center * value * (popcount(mine & mask) - popcount(theirs & mask));
  }

  return score;
}

export interface HeuristicMoveScore {
  col: number;
  score: number;
}

export interface HeuristicResult {
  moves: HeuristicMoveScore[];
  best: number;
  bestCols: number[];
  nodes: number;
}

/**
 * Depth-limited negamax with alpha-beta, returning a score for every legal move.
 *
 * Wins and losses are detected exactly and scored by distance, so even a
 * shallow bot converts a win it can see and prefers the quicker of two wins.
 * Everything the search can't reach falls back to `evaluate`.
 */
export function searchHeuristic(
  p: Position,
  depth: number,
  w: EvalWeights,
  nodeLimit = 400_000,
): HeuristicResult {
  const ctx = { nodes: 0, limit: nodeLimit };
  const moves: HeuristicMoveScore[] = [];

  for (const col of p.variant.moveOrder) {
    if (!p.canPlay(col)) continue;
    if (p.isWinningMove(col)) {
      moves.push({ col, score: WIN_SCORE - p.moves });
      continue;
    }
    const child = p.clone();
    child.play(col);
    if (child.isDraw()) {
      moves.push({ col, score: 0 });
      continue;
    }
    moves.push({ col, score: -negamax(child, depth - 1, -Infinity, Infinity, w, ctx) });
  }

  moves.sort((a, b) => a.col - b.col);
  const best = moves.reduce((m, x) => Math.max(m, x.score), -Infinity);

  return {
    moves,
    best,
    bestCols: moves.filter((m) => m.score === best).map((m) => m.col),
    nodes: ctx.nodes,
  };
}

function negamax(
  p: Position,
  depth: number,
  alpha: number,
  beta: number,
  w: EvalWeights,
  ctx: { nodes: number; limit: number },
): number {
  ctx.nodes++;

  // An immediate win ends it. Subtracting the ply count makes a win now worth
  // more than the same win later, so a winning bot actually closes the game out
  // instead of shuffling around in a position it has already won.
  for (const col of p.variant.moveOrder) {
    if (p.canPlay(col) && p.isWinningMove(col)) return WIN_SCORE - p.moves;
  }

  if (p.isDraw()) return 0;
  if (depth <= 0 || ctx.nodes > ctx.limit) return evaluate(p, w);

  let value = -Infinity;
  for (const col of p.variant.moveOrder) {
    if (!p.canPlay(col)) continue;
    const child = p.clone();
    child.play(col);
    const score = -negamax(child, depth - 1, -beta, -alpha, w, ctx);
    if (score > value) value = score;
    if (value > alpha) alpha = value;
    if (alpha >= beta) break;
  }

  // No legal move at all means the board filled up.
  return value === -Infinity ? 0 : value;
}

/** True if the score came from a proven win or loss rather than the evaluator. */
export function isDecisive(score: number, v: Variant = CONNECT4): boolean {
  return Math.abs(score) > WIN_SCORE - v.cells - 1;
}
