export {
  BOARD_MASK,
  CELLS,
  COLUMN_MASKS,
  CONNECT4,
  CONNECT5,
  HEIGHT,
  MOVE_ORDER,
  PLAYERS,
  Position,
  VARIANTS,
  WIDTH,
  alignment,
  canonical,
  computeAlignmentSpots,
  makeVariant,
  mirror,
  popcount,
  variantById,
  type Cell,
  type Player,
  type Variant,
  type VariantSpec,
} from "./board.js";

export {
  BALANCED_WEIGHTS,
  WIN_SCORE,
  evaluate,
  isDecisive,
  searchHeuristic,
  type EvalWeights,
  type HeuristicResult,
} from "./evaluate.js";

export {
  MAX_SCORE,
  MIN_SCORE,
  SearchAborted,
  TranspositionTable,
  analyze,
  maxScoreOf,
  solveScore,
  solveScoreWithStats,
  type Analysis,
  type MoveScore,
} from "./solver.js";

export {
  BotBrain,
  ROSTER,
  byId,
  exactnessNote,
  legalColumns,
  type BotDecision,
  type BotProfile,
  type Mood,
} from "./bots.js";

export {
  Match,
  advantageOf,
  estimateDepth,
  gradeMove,
  reviewMatch,
  type CurvePoint,
  type MatchStatus,
  type Grade,
  type MatchResult,
  type PlyRecord,
  type Review,
  type ScoreSource,
} from "./match.js";
