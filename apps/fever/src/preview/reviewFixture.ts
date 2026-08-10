/**
 * A real review of a real game, frozen.
 *
 * Not invented numbers. This is `reviewMatch`'s own output for the game below —
 * Acorn losing to Cinder in twenty plies — captured once and pasted in, because
 * running the review for real costs about six seconds of solving and the preview
 * harness renders every state on one page. Hand-writing plausible numbers
 * instead would have made the one thing these states exist to judge (does the
 * copy's confidence match the number's) a fiction.
 *
 * Two captures of the same game, which is the point:
 *
 * - `PROVEN` is the full review. The end of the game is solved, ply 18 is a
 *   turning point, and the headline is allowed to say so flatly.
 * - `ESTIMATED` is the same game reviewed with a node budget of one, so nothing
 *   is proven. Same blunder, same board, and every sentence has to hedge. It is
 *   what a long game looks like when the solver never gets there — which on
 *   Connect 5 is most of them.
 *
 * To recapture: call `reviewMatch(REVIEW_MOVES, { forPlayer: "red", variant:
 * CONNECT4 })` (and again with `nodeLimit: 1`) and paste the tuples back.
 */

import type { CurvePoint, Grade, PlyRecord, Review, ScoreSource } from "@fourscore/engine";

/** The game itself, so the board behind the window is the one being reviewed. */
export const REVIEW_MOVES = [3, 3, 3, 2, 3, 4, 1, 2, 3, 3, 2, 1, 4, 2, 4, 1, 2, 0, 1, 0];

type PlyTuple = [
  ply: number,
  col: number,
  bestScore: number,
  playedScore: number,
  bestCols: number[],
  grade: Grade,
  source: ScoreSource,
  turningPoint: boolean,
  drop: number,
];

const plies = (rows: PlyTuple[]): PlyRecord[] =>
  rows.map(([ply, col, bestScore, playedScore, bestCols, grade, source, turningPoint, drop]) => ({
    ply,
    // Red throughout: the review is scoped to the human, who moved first.
    player: "red",
    col,
    bestScore,
    playedScore,
    bestCols,
    grade,
    source,
    turningPoint,
    drop,
  }));

const curve = (rows: [ply: number, advantage: number, source: ScoreSource][]): CurvePoint[] =>
  rows.map(([ply, advantage, source]) => ({ ply, advantage, source }));

export const PROVEN: Review = {
  plies: plies([
    [0, 3, 6, 6, [3], "best", "estimated", false, 0],
    [2, 3, 6, 6, [2, 3, 4], "best", "estimated", false, 0],
    [4, 3, 6, 6, [3], "best", "estimated", false, 0],
    [6, 1, -12, -26, [2, 3, 4], "inaccuracy", "estimated", false, 0.083],
    [8, 3, 4, 4, [2, 3, 4], "best", "proven", false, 0],
    [10, 2, 4, 4, [2, 4], "best", "proven", false, 0],
    [12, 4, 9, 9, [4], "best", "proven", false, 0],
    [14, 4, 9, 9, [4], "best", "proven", false, 0],
    [16, 2, 9, 9, [1, 2], "best", "proven", false, 0],
    [18, 1, 9, -12, [0], "blunder", "proven", true, 1.667],
  ]),
  turningPoint: null,
  biggestSwing: null,
  curve: curve([
    [0, 0, "estimated"],
    [1, 0.037, "estimated"],
    [2, 0.037, "estimated"],
    [3, 0.037, "estimated"],
    [4, 0.037, "estimated"],
    [5, 0.037, "estimated"],
    [6, -0.074, "estimated"],
    [7, -0.157, "estimated"],
    [8, 0.689, "proven"],
    [9, 0.689, "proven"],
    [10, 0.689, "proven"],
    [11, 0.689, "proven"],
    [12, 0.8, "proven"],
    [13, 0.8, "proven"],
    [14, 0.8, "proven"],
    [15, 0.8, "proven"],
    [16, 0.8, "proven"],
    [17, 0.8, "proven"],
    [18, 0.8, "proven"],
    [19, -0.867, "proven"],
    [20, -0.867, "proven"],
  ]),
  skipped: 7,
};
// The engine picks these off the ply list; doing the same here keeps the fixture
// one source of truth rather than three.
PROVEN.turningPoint = PROVEN.plies.find((p) => p.turningPoint) ?? null;

export const ESTIMATED: Review = {
  plies: plies([
    [0, 3, 6, 6, [3], "best", "estimated", false, 0],
    [2, 3, 6, 6, [2, 3, 4], "best", "estimated", false, 0],
    [4, 3, 6, 6, [3], "best", "estimated", false, 0],
    [6, 1, -12, -26, [2, 3, 4], "inaccuracy", "estimated", false, 0.083],
    [8, 3, -20, -44, [2, 4], "inaccuracy", "estimated", false, 0.128],
    [10, 2, -20, -20, [2, 4], "best", "estimated", false, 0],
    [12, 4, 18, 18, [4], "best", "estimated", false, 0],
    [14, 4, 40, 40, [4], "best", "estimated", false, 0],
    [16, 2, 134, 134, [2], "best", "estimated", false, 0],
    [18, 1, 99976, -99981, [0], "blunder", "estimated", false, 1.059],
  ]),
  turningPoint: null,
  biggestSwing: null,
  curve: curve([
    [0, 0, "estimated"],
    [1, 0.037, "estimated"],
    [2, 0.037, "estimated"],
    [3, 0.037, "estimated"],
    [4, 0.037, "estimated"],
    [5, 0.037, "estimated"],
    [6, -0.074, "estimated"],
    [7, -0.157, "estimated"],
    [8, -0.122, "estimated"],
    [9, -0.25, "estimated"],
    [10, -0.122, "estimated"],
    [11, -0.122, "estimated"],
    [12, 0.111, "estimated"],
    [13, 0.111, "estimated"],
    [14, 0.231, "estimated"],
    [15, 0.231, "estimated"],
    [16, 0.466, "estimated"],
    [17, 0.466, "estimated"],
    // The estimated-decisive band, and it is a ramp rather than a plateau: the
    // mate score says which disc the win lands on, and these two land on
    // different ones.
    [18, 0.526, "estimated"],
    [19, -0.533, "estimated"],
    [20, -0.533, "estimated"],
  ]),
  skipped: 20,
};
// `reviewMatch`'s own gate: the worst estimated drop, shown only if it was at
// least a mistake.
ESTIMATED.biggestSwing =
  ESTIMATED.plies.filter((p) => p.drop > 0.15).reduce((m, p) => (p.drop > m.drop ? p : m));
