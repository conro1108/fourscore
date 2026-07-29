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

import { HEIGHT, Position, WIDTH, type Cell, type Player } from "./board.js";
import { SearchAborted, TranspositionTable, analyze } from "./solver.js";

export type MatchStatus = "playing" | "won" | "draw";

/** A cell on the display grid, row 0 being the top. */
export interface Coord {
  row: number;
  col: number;
}

export class Match {
  position = new Position();
  readonly history: number[] = [];
  winner: Player | null = null;
  winningCells: Coord[] = [];

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
      this.winningCells = findWinningLine(this.position.grid(), mover);
    }
    return true;
  }

  /** A copy of the position as it stood after `ply` moves. */
  positionAt(ply: number): Position {
    return Position.fromMoves(this.history.slice(0, ply));
  }

  static fromMoves(cols: readonly number[]): Match {
    const m = new Match();
    for (const c of cols) {
      if (!m.play(c)) throw new Error(`illegal move: column ${c}`);
    }
    return m;
  }
}

/** The four-or-more cells that won it, for highlighting. */
export function findWinningLine(grid: Cell[][], player: Player): Coord[] {
  const dirs = [
    [1, 0],
    [0, 1],
    [1, 1],
    [1, -1],
  ] as const;

  for (let row = 0; row < HEIGHT; row++) {
    for (let col = 0; col < WIDTH; col++) {
      if (grid[row]![col] !== player) continue;
      for (const [dc, dr] of dirs) {
        const line: Coord[] = [{ row, col }];
        let r = row + dr;
        let c = col + dc;
        while (r >= 0 && r < HEIGHT && c >= 0 && c < WIDTH && grid[r]![c] === player) {
          line.push({ row: r, col: c });
          r += dr;
          c += dc;
        }
        if (line.length >= 4) return line;
      }
    }
  }
  return [];
}

export type Grade = "best" | "good" | "inaccuracy" | "mistake" | "blunder" | "unknown";

/** Win, draw or loss — the only distinctions that actually decide a game. */
type Outcome = -1 | 0 | 1;
const outcomeOf = (score: number): Outcome => (score > 0 ? 1 : score < 0 ? -1 : 0);

export interface PlyRecord {
  ply: number;
  player: Player;
  col: number;
  /** Best score available to the mover before playing, or null if unproven. */
  bestScore: number | null;
  /** Score of the move actually played. */
  playedScore: number | null;
  /** Columns that would have achieved `bestScore`. */
  bestCols: number[];
  grade: Grade;
  /**
   * True if this move dropped the mover to a strictly worse outcome — the move
   * that actually lost (or drew) a game that was won.
   */
  turningPoint: boolean;
}

export interface Review {
  plies: PlyRecord[];
  /** The first move that cost the reviewed player the game, if any. */
  turningPoint: PlyRecord | null;
  /** How many plies the solver couldn't prove in budget. */
  skipped: number;
}

export interface ReviewOptions {
  /** Only grade this player's moves. Defaults to grading both. */
  forPlayer?: Player;
  /** Nodes per position before giving up and grading `unknown`. */
  nodeLimit?: number;
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
  const { forPlayer, nodeLimit = 2_000_000 } = opts;
  const table = new TranspositionTable(23);
  const plies: PlyRecord[] = [];
  let skipped = 0;
  let giveUp = false;

  for (let ply = history.length - 1; ply >= 0; ply--) {
    const before = Position.fromMoves(history.slice(0, ply));
    const player = before.turn;
    const col = history[ply]!;

    if (forPlayer && player !== forPlayer) continue;

    let record: PlyRecord = {
      ply,
      player,
      col,
      bestScore: null,
      playedScore: null,
      bestCols: [],
      grade: "unknown",
      turningPoint: false,
    };

    if (giveUp) {
      skipped++;
      plies.push(record);
      continue;
    }

    try {
      const a = analyze(before, { table, nodeLimit });
      const played = a.moves.find((m) => m.col === col)?.score ?? null;
      if (played !== null) {
        record = {
          ...record,
          bestScore: a.best,
          playedScore: played,
          bestCols: a.bestCols,
          grade: gradeMove(a.best, played),
          turningPoint: outcomeOf(played) < outcomeOf(a.best),
        };
      }
    } catch (e) {
      if (!(e instanceof SearchAborted)) throw e;
      skipped++;
      if (STOP_AFTER_FIRST_ABORT) giveUp = true;
    }

    plies.push(record);
  }

  plies.reverse();

  // The earliest one is the one worth showing: later drops are usually just the
  // position being already lost, and telling someone they blundered on move 30
  // when the game was decided on move 12 is worse than saying nothing.
  const turningPoint = plies.find((p) => p.turningPoint) ?? null;

  return { plies, turningPoint, skipped };
}

export interface MatchResult {
  winner: Player | null;
  history: readonly number[];
}
