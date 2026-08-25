/**
 * Match state and the post-game review. Every ply carries a `source`: `proven`
 * is a fact, `estimated` is this engine's read. An estimated ply may never set
 * `turningPoint`, and the advantage axis keeps proven strictly above estimated.
 * See CLAUDE.md § say what the solver actually knows.
 */

import { CONNECT4, Position, type Cell, type Player, type Variant } from "./board.js";
import { BALANCED_WEIGHTS, WIN_SCORE, isDecisive, searchHeuristic } from "./evaluate.js";
import { SearchAborted, TranspositionTable, analyze, maxScoreOf } from "./solver.js";

export type MatchStatus = "playing" | "won" | "draw";

/** A cell on the display grid, row 0 being the top. */
export interface Coord {
  row: number;
  col: number;
}

export class Match {
  readonly variant: Variant;
  position: Position;
  readonly history: number[] = [];
  winner: Player | null = null;
  winningCells: Coord[] = [];

  constructor(variant: Variant = CONNECT4) {
    this.variant = variant;
    this.position = new Position(0n, 0n, 0, variant);
  }

  get status(): MatchStatus {
    if (this.winner) return "won";
    if (this.position.isDraw()) return "draw";
    return "playing";
  }

  get turn(): Player {
    return this.position.turn;
  }

  grid(): Cell[][] {
    return this.position.grid();
  }

  canPlay(col: number): boolean {
    return this.status === "playing" && this.position.canPlay(col);
  }

  /** Drop a disc; false if illegal, so the UI can call it on a stray click. */
  play(col: number): boolean {
    if (!this.canPlay(col)) return false;

    const winning = this.position.isWinningMove(col);
    const mover = this.position.turn;

    this.history.push(col);
    this.position.play(col);

    if (winning) {
      this.winner = mover;
      this.winningCells = findWinningLine(this.position.grid(), mover, this.variant);
    }
    return true;
  }

  /** A copy of the position as it stood after `ply` moves. */
  positionAt(ply: number): Position {
    return Position.fromMoves(this.history.slice(0, ply), this.variant);
  }

  static fromMoves(cols: readonly number[], variant: Variant = CONNECT4): Match {
    const m = new Match(variant);
    for (const c of cols) {
      if (!m.play(c)) throw new Error(`illegal move: column ${c}`);
    }
    return m;
  }
}

/** The cells that won it, for highlighting. */
export function findWinningLine(
  grid: Cell[][],
  player: Player,
  v: Variant = CONNECT4,
): Coord[] {
  const dirs = [
    [1, 0],
    [0, 1],
    [1, 1],
    [1, -1],
  ] as const;

  const { width, height, run } = v;

  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) {
      if (grid[row]![col] !== player) continue;
      for (const [dc, dr] of dirs) {
        const line: Coord[] = [{ row, col }];
        let r = row + dr;
        let c = col + dc;
        while (r >= 0 && r < height && c >= 0 && c < width && grid[r]![c] === player) {
          line.push({ row: r, col: c });
          r += dr;
          c += dc;
        }
        if (line.length >= run) return line;
      }
    }
  }
  return [];
}

export type Grade = "best" | "good" | "inaccuracy" | "mistake" | "blunder" | "unknown";

/** `proven` is a fact about the game; `estimated` is this engine's read. */
export type ScoreSource = "proven" | "estimated";

/**
 * Estimating depth. Alternate plies search one deeper on purpose: constant
 * absolute leaf parity turns the evaluator's tempo bias into an offset instead
 * of a zigzag. Live clients must use this same parity or their numbers zigzag.
 */
const REVIEW_DEPTH = 6;
export const estimateDepth = (ply: number): number => REVIEW_DEPTH + (ply % 2);

/**
 * Advantage axis bands: estimates in 0..ESTIMATE_CEILING, seen-but-unproven
 * wins just above, proven from PROVEN_FLOOR up (must stay strictly above).
 * ESTIMATE_SCALE is measured: |score| at `estimateDepth` runs p50 24, p90 106,
 * max ~194; 80 puts the median ply at 0.15.
 */
const ESTIMATE_SCALE = 80;
const ESTIMATE_CEILING = 0.5;
const DECISIVE_FLOOR = 0.5;
const DECISIVE_SPAN = 0.06;
const PROVEN_FLOOR = 0.6;

/**
 * Estimated-drop bands in `PlyRecord.drop` units (must share `dropOf`, or the
 * grade and the printed number disagree). Measured mix: best 76 / good 12 /
 * inaccuracy 6 / mistake 4 / blunder 2 %.
 */
const ESTIMATE_DROP = { good: 0.06, inaccuracy: 0.15, mistake: 0.32 };

/** Advantage from red's point of view, -1..1. The one axis for review and live client alike. */
export function advantageOf(
  scoreForMover: number,
  moverIsRed: boolean,
  source: ScoreSource,
  v: Variant = CONNECT4,
): number {
  let a: number;
  if (source === "proven") {
    // Outcome first, margin inside the band; linear would draw "won by two" at 0.11.
    a =
      scoreForMover === 0
        ? 0
        : Math.sign(scoreForMover) *
          (PROVEN_FLOOR +
            (1 - PROVEN_FLOOR) * Math.min(1, Math.abs(scoreForMover) / maxScoreOf(v)));
  } else if (isDecisive(scoreForMover, v)) {
    // Seen win: below the proven band, on a narrow ramp by when it lands so the line still moves.
    const winsAt = WIN_SCORE - Math.abs(scoreForMover);
    const spare = Math.min(1, Math.max(0, (v.cells - winsAt) / v.cells));
    a = Math.sign(scoreForMover) * (DECISIVE_FLOOR + DECISIVE_SPAN * spare);
  } else {
    a = Math.tanh(scoreForMover / ESTIMATE_SCALE) * ESTIMATE_CEILING;
  }
  return moverIsRed ? a : -a;
}

/** One point on the game's advantage curve. */
export interface CurvePoint {
  /** Plies played. Point 0 is the empty board. */
  ply: number;
  /** Advantage from red's point of view, -1..1. */
  advantage: number;
  source: ScoreSource;
}

/** Win, draw or loss — the only distinctions that actually decide a game. */
type Outcome = -1 | 0 | 1;
const outcomeOf = (score: number): Outcome => (score > 0 ? 1 : score < 0 ? -1 : 0);

export interface PlyRecord {
  ply: number;
  player: Player;
  col: number;
  /** Best score available to the mover before playing. */
  bestScore: number | null;
  /** Score of the move actually played. */
  playedScore: number | null;
  /** Columns that would have achieved `bestScore`. */
  bestCols: number[];
  grade: Grade;
  /** Whether the scores above are proven or this engine's estimate. */
  source: ScoreSource;
  /** Dropped the mover to a strictly worse outcome. Only ever set from proven scores. */
  turningPoint: boolean;
  /** How much advantage this move cost the mover, in 0..2. */
  drop: number;
}

export interface Review {
  plies: PlyRecord[];
  /** The first move that cost the reviewed player the game, if any. */
  turningPoint: PlyRecord | null;
  /** Worst estimated drop, for when nothing was proven. A lead, not a verdict. */
  biggestSwing: PlyRecord | null;
  /** Advantage from red's point of view across the whole game. */
  curve: CurvePoint[];
  /** How many plies the solver couldn't prove in budget. */
  skipped: number;
}

export interface ReviewOptions {
  /** Only grade this player's moves. Defaults to grading both. */
  forPlayer?: Player;
  /** Nodes per position before giving up and grading `unknown`. */
  nodeLimit?: number;
  variant?: Variant;
}

// Walking back toward the opening only gets harder; trying past the first abort turned seconds into minutes.
const STOP_AFTER_FIRST_ABORT = true;

export function gradeMove(bestScore: number, playedScore: number): Grade {
  if (playedScore === bestScore) return "best";

  const before = outcomeOf(bestScore);
  const after = outcomeOf(playedScore);

  // Changing the result outranks any numeric drop.
  if (after < before) return before === 1 && after === -1 ? "blunder" : "mistake";

  const drop = bestScore - playedScore;
  if (drop <= 1) return "good";
  if (drop <= 4) return "inaccuracy";
  return "mistake";
}

/** Score every ply of a finished game. */
export function reviewMatch(history: readonly number[], opts: ReviewOptions = {}): Review {
  const { forPlayer, nodeLimit = 2_000_000, variant = CONNECT4 } = opts;

  // Pass one: estimate every ply at a consistent depth.
  const byPly = new Map<number, PlyRecord>();
  for (let ply = 0; ply < history.length; ply++) {
    const before = Position.fromMoves(history.slice(0, ply), variant);
    const col = history[ply]!;
    const r = searchHeuristic(before, estimateDepth(ply), BALANCED_WEIGHTS);
    const played = r.moves.find((m) => m.col === col)?.score ?? 0;

    byPly.set(ply, {
      ply,
      player: before.turn,
      col,
      bestScore: r.best,
      playedScore: played,
      bestCols: r.bestCols,
      grade: gradeEstimate(r.best, played, variant),
      source: "estimated",
      turningPoint: false,
      drop: dropOf(r.best, played, before.turn === "red", "estimated", variant),
    });
  }

  // Pass two: prove what's affordable, walking backwards — late positions are
  // cheap and seed the shared table with the subtrees earlier ones need.
  const table = new TranspositionTable(23);
  let skipped = 0;
  let giveUp = false;

  // Every ply, not just `forPlayer`'s: mixing proven and estimated points on the
  // curve renders as a sawtooth. Near free — the opponent's position is a child already in the table.
  for (let ply = history.length - 1; ply >= 0; ply--) {
    const record = byPly.get(ply)!;

    if (giveUp) {
      skipped++;
      continue;
    }

    const before = Position.fromMoves(history.slice(0, ply), variant);
    try {
      const a = analyze(before, { table, nodeLimit });
      const played = a.moves.find((m) => m.col === record.col)?.score ?? null;
      if (played !== null) {
        byPly.set(ply, {
          ...record,
          bestScore: a.best,
          playedScore: played,
          bestCols: a.bestCols,
          grade: gradeMove(a.best, played),
          source: "proven",
          turningPoint: outcomeOf(played) < outcomeOf(a.best),
          drop: dropOf(a.best, played, record.player === "red", "proven", variant),
        });
      }
    } catch (e) {
      if (!(e instanceof SearchAborted)) throw e;
      skipped++;
      if (STOP_AFTER_FIRST_ABORT) giveUp = true;
    }
  }

  const all = [...byPly.values()].sort((a, b) => a.ply - b.ply);
  const plies = forPlayer ? all.filter((p) => p.player === forPlayer) : all;

  // Whole game regardless of `forPlayer`. Point 0 is the empty board.
  const curve: CurvePoint[] = [{ ply: 0, advantage: 0, source: "estimated" }];
  for (const p of all) {
    curve.push({
      ply: p.ply + 1,
      advantage: advantageOf(p.playedScore ?? 0, p.player === "red", p.source, variant),
      source: p.source,
    });
  }

  // Earliest, not worst: later drops are usually the position already being lost.
  const turningPoint = plies.find((p) => p.turningPoint) ?? null;

  // Largest, not earliest, and gated at "at least a mistake" — the grade's own
  // threshold, so the lead can't point at a move the list calls an inaccuracy.
  const swings = plies.filter(
    (p) => p.source === "estimated" && p.drop > ESTIMATE_DROP.inaccuracy,
  );
  const biggestSwing =
    swings.length > 0 ? swings.reduce((m, p) => (p.drop > m.drop ? p : m)) : null;

  return { plies, turningPoint, biggestSwing, curve, skipped };
}

/** How much advantage a move gave up, on the -1..1 scale, so 0..2. */
function dropOf(
  best: number,
  played: number,
  moverIsRed: boolean,
  source: ScoreSource,
  v: Variant,
): number {
  const a = advantageOf(best, moverIsRed, source, v);
  const b = advantageOf(played, moverIsRed, source, v);
  return Math.abs(a - b);
}

/** Grade an estimated move by ground given up; never claims a result changed. Loose on purpose. */
function gradeEstimate(best: number, played: number, v: Variant): Grade {
  if (played === best) return "best";
  if (isDecisive(best, v) && !isDecisive(played, v)) return "blunder";

  // Point of view is irrelevant: the drop is a magnitude.
  const drop = dropOf(best, played, true, "estimated", v);
  if (drop <= ESTIMATE_DROP.good) return "good";
  if (drop <= ESTIMATE_DROP.inaccuracy) return "inaccuracy";
  if (drop <= ESTIMATE_DROP.mistake) return "mistake";
  return "blunder";
}

export interface MatchResult {
  winner: Player | null;
  history: readonly number[];
}
