/**
 * Match state, and the post-game review.
 *
 * The review is the reason this file is bigger than a move list needs to be.
 * Beating everyone you know means never finding out where your play actually
 * breaks, and "you lost" is not that information — the move that loses a game
 * of Connect 4 is usually eight plies before the position looks bad. So every
 * ply gets scored against what was available instead, and the one move that
 * turned a won or drawn game into a lost one gets called out by name.
 *
 * This is only honest where the solver is exact, which is the back half of the
 * game. Plies it can't prove within budget are graded `unknown` rather than
 * guessed at — an analysis feature that quietly makes things up is worse than
 * one that admits its range.
 */

import { CONNECT4, Position, type Cell, type Player, type Variant } from "./board.js";
import { BALANCED_WEIGHTS, isDecisive, searchHeuristic } from "./evaluate.js";
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

  /**
   * Drop a disc. Returns false if the move wasn't legal, so UI code can call
   * this on a stray click without checking first.
   */
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

/**
 * Where a ply's numbers came from.
 *
 * This is the whole honesty mechanism. The review used to emit nothing at all
 * for plies the solver couldn't reach, on the grounds that a guess presented as
 * a result is worse than silence — which is true, but silence was the crude fix.
 * The engine has an opinion about those positions; it just wasn't being asked.
 * So now it is asked, and the answer is labelled rather than withheld.
 *
 * Consumers must keep the two visibly distinct. `proven` is a fact about the
 * game. `estimated` is this engine's read, and a better engine could disagree.
 */
export type ScoreSource = "proven" | "estimated";

/**
 * Depth for the estimating pass. Consistency matters more than strength here.
 *
 * Alternate plies search one deeper. That looks like a wart and is the opposite:
 * a static evaluation quietly favours whoever is to move, so a fixed depth makes
 * every other leaf a tempo up and the curve comes out as a hard zigzag that's an
 * artifact of the evaluator, not the game. Searching to a constant *absolute*
 * ply parity puts every leaf on the same side to move and the tempo bias becomes
 * a constant offset instead of an oscillation.
 *
 * Exported for the same reason `advantageOf` is: a client estimating positions
 * live has to search to the same absolute parity as the review, or its numbers
 * zigzag against a curve that doesn't.
 */
const REVIEW_DEPTH = 6;
export const estimateDepth = (ply: number): number => REVIEW_DEPTH + (ply % 2);

/**
 * Advantage from red's point of view, in -1..1.
 *
 * Both scales collapse to the same axis so one curve can run the whole game:
 * proven scores are discs-to-spare over the maximum, estimated ones are squashed
 * through tanh the way bot conviction already is. They don't mean the same
 * thing — one is a distance to a proven result, the other a positional hunch —
 * which is exactly why the curve has to render them differently.
 *
 * Exported because a live client wants the same axis mid-game that the review
 * draws afterwards. Two implementations of "how good is this position, in -1..1"
 * would drift apart, and the proven-band separation is a product rule, not a
 * chart detail.
 */
export function advantageOf(
  scoreForMover: number,
  moverIsRed: boolean,
  source: ScoreSource,
  v: Variant = CONNECT4,
): number {
  let a: number;
  if (source === "proven") {
    // Outcome first, distance second. A proven win is a win, so it belongs at
    // the top of the chart with the margin modulating inside that band — mapping
    // it linearly instead puts "won, two discs to spare" at 0.11 out of 1, which
    // draws a lost game as a shrug.
    a =
      scoreForMover === 0
        ? 0
        : Math.sign(scoreForMover) *
          (0.6 + 0.4 * Math.min(1, Math.abs(scoreForMover) / maxScoreOf(v)));
  } else if (isDecisive(scoreForMover, v)) {
    // A forced win the evaluator can see is decisive, but it stays below the
    // proven band: the solver has the last word on this axis.
    a = Math.sign(scoreForMover) * 0.55;
  } else {
    a = Math.tanh(scoreForMover / 260) * 0.5;
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
  /**
   * True if this move dropped the mover to a strictly worse outcome — the move
   * that actually lost (or drew) a game that was won. Only ever set from proven
   * scores: calling an estimated dip "the move that lost it" would be exactly
   * the overclaim the `source` split exists to prevent.
   */
  turningPoint: boolean;
  /** How much advantage this move cost the mover, in 0..2. */
  drop: number;
}

export interface Review {
  plies: PlyRecord[];
  /** The first move that cost the reviewed player the game, if any. */
  turningPoint: PlyRecord | null;
  /**
   * The reviewed player's worst estimated drop, for when nothing was proven.
   * A lead, not a verdict.
   */
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

/**
 * Positions get monotonically harder as you walk back toward the opening, so
 * the first one that blows its budget is the last one worth attempting. Trying
 * anyway turned a review of a full game from seconds into minutes, all of it
 * spent failing.
 */
const STOP_AFTER_FIRST_ABORT = true;

export function gradeMove(bestScore: number, playedScore: number): Grade {
  if (playedScore === bestScore) return "best";

  const before = outcomeOf(bestScore);
  const after = outcomeOf(playedScore);

  // Changing the result of the game is categorically worse than playing a
  // slower version of the same result, however large the numeric drop.
  if (after < before) return before === 1 && after === -1 ? "blunder" : "mistake";

  const drop = bestScore - playedScore;
  if (drop <= 1) return "good";
  if (drop <= 4) return "inaccuracy";
  return "mistake";
}

/**
 * Score every ply of a finished game.
 *
 * Walks backwards from the final position on purpose. Late positions are cheap
 * to solve and they fill the shared transposition table with the subtrees the
 * earlier ones need, so going in reverse gets several plies deeper into the
 * opening for the same budget than going forwards would.
 */
export function reviewMatch(history: readonly number[], opts: ReviewOptions = {}): Review {
  const { forPlayer, nodeLimit = 2_000_000, variant = CONNECT4 } = opts;

  // Pass one: estimate every ply. Cheap, total, and the same depth throughout,
  // so the curve it produces is comparable along its whole length. This is what
  // fills the opening, where the solver has nothing to say and used to say so.
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

  // Pass two: prove what's affordable and upgrade those plies in place. Walks
  // backwards because late positions are cheap and fill the shared table with
  // the subtrees the earlier ones need.
  const table = new TranspositionTable(23);
  let skipped = 0;
  let giveUp = false;

  // Every ply, not just the reviewed player's. `forPlayer` decides whose moves
  // get *listed*, but the curve is a statement about the position, and mixing a
  // proven point next to an estimated one puts two different scales on one line
  // — it renders as a sawtooth that says nothing about the game.
  //
  // Close to free, as it turns out: grading one player's ply already solves
  // every child of that position, and the opponent's next position is one of
  // those children, so it's in the shared table by the time we ask for it.
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

  // The curve covers the whole game regardless of whose moves are being graded —
  // half a curve isn't a shape. Point 0 is the empty board, dead level.
  const curve: CurvePoint[] = [{ ply: 0, advantage: 0, source: "estimated" }];
  for (const p of all) {
    curve.push({
      ply: p.ply + 1,
      advantage: advantageOf(p.playedScore ?? 0, p.player === "red", p.source, variant),
      source: p.source,
    });
  }

  // The earliest one is the one worth showing: later drops are usually just the
  // position being already lost, and telling someone they blundered on move 30
  // when the game was decided on move 12 is worse than saying nothing.
  const turningPoint = plies.find((p) => p.turningPoint) ?? null;

  // A lead for when nothing was proven. Deliberately the largest drop rather
  // than the earliest: with no proof of what changed the result, "where did most
  // of your advantage go" is the honest question this can answer.
  const swings = plies.filter((p) => p.source === "estimated" && p.drop > 0.25);
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

/**
 * Grade an estimated move.
 *
 * Deliberately blunter than `gradeMove`. That one compares proven outcomes and
 * can say a move turned a won game into a lost one; this one is comparing two
 * hunches, so it grades on how much positional ground was given up and never
 * claims a result changed. The thresholds are loose on purpose — a depth-6
 * evaluator disagreeing with itself by a few points is noise, not a mistake.
 */
function gradeEstimate(best: number, played: number, v: Variant): Grade {
  if (played === best) return "best";
  if (isDecisive(best, v) && !isDecisive(played, v)) return "blunder";

  const drop = Math.abs(Math.tanh(best / 260) - Math.tanh(played / 260));
  if (drop <= 0.05) return "good";
  if (drop <= 0.15) return "inaccuracy";
  if (drop <= 0.35) return "mistake";
  return "blunder";
}

export interface MatchResult {
  winner: Player | null;
  history: readonly number[];
}
