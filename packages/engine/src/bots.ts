/**
 * The roster. Each bot is a weight vector (personality) plus depth, `slipRate`
 * and per-variant `exactFrom`. Slip schedule decays geometrically up the ladder
 * (0.5 … 0.008, 0); a cliff between adjacent rungs reads as "too hard too fast".
 * Retunes go through tools/ladder.ts — see CLAUDE.md § ladder.
 */

import { CONNECT4, Position, type Variant } from "./board.js";
import { BALANCED_WEIGHTS, isDecisive, searchHeuristic, type EvalWeights } from "./evaluate.js";
import {
  SearchAborted,
  TranspositionTable,
  analyze,
  maxScoreOf,
  type Analysis,
} from "./solver.js";

/** What the bot's face is doing. Not always what the bot is thinking. */
export type Mood = "idle" | "thinking" | "pleased" | "smug" | "worried" | "alarmed" | "resigned";

export interface BotProfile {
  id: string;
  name: string;
  /** One line, shown under the name on the select screen. */
  title: string;
  /** What it's like to play, in its own terms. */
  blurb: string;
  /** 1-7 up the ladder; the Oracle sits outside it. */
  tier: number;
  /** True only for the bot that is actually unbeatable once it starts solving. */
  perfect: boolean;
  /** Search depth on Connect 4; other boards derive via `depthFor`. */
  depth: number;
  /** Explicit per-variant depth, where the derived one measured badly. */
  depthByVariant?: Record<string, number>;
  weights: EvalWeights;
  /** Per-variant weights. Use sparingly: for most bots the weights are the character. */
  weightsByVariant?: Record<string, EvalWeights>;
  slipRate: number;
  /**
   * Ply from which it solves exactly, per variant; absent = never. Measured, not
   * chosen: `tools/measure-solve.ts live <variant>`, worst case across games.
   */
  exactFrom: Record<string, number>;
  /** Its face lies about how the game is going. */
  bluffs: boolean;
  /** Two-tone sprite colours. */
  colors: { body: string; shade: string };
}

const w = (over: Partial<EvalWeights>): EvalWeights => ({ ...BALANCED_WEIGHTS, ...over });

export const ROSTER: readonly BotProfile[] = [
  {
    id: "acorn",
    name: "Acorn",
    title: "has just learned the rules",
    blurb:
      "Knows that a row of them wins and is thrilled about it. Has not yet " +
      "considered that you also get to move.",
    tier: 1,
    perfect: false,
    depth: 1,
    weights: w({ parity: 0, center: 2, immediate: 4 }),
    slipRate: 0.5,
    exactFrom: {},
    bluffs: false,
    colors: { body: "#c9a227", shade: "#8f6f14" },
  },
  {
    id: "pebble",
    name: "Pebble",
    title: "blocks you, and that's it",
    blurb:
      "Will take a win it can see and stop a loss it can see. Beyond those two " +
      "reflexes there is nothing at all going on.",
    tier: 2,
    perfect: false,
    depth: 2,
    weights: w({ parity: 0, center: 3 }),
    slipRate: 0.34,
    exactFrom: {},
    bluffs: false,
    colors: { body: "#9aa5b1", shade: "#6b7684" },
  },
  {
    id: "moss",
    name: "Moss",
    title: "occupies the middle and waits",
    blurb:
      "Wants the centre columns more than it wants to win, which works out more " +
      "often than it has any right to.",
    tier: 3,
    perfect: false,
    depth: 4,
    // Centre weight barely moves the win rate (measured); the rung is bought with slipRate.
    weights: w({ center: 12, threat: 14, parity: 3 }),
    slipRate: 0.18,
    exactFrom: {},
    bluffs: false,
    colors: { body: "#6aa348", shade: "#47702f" },
  },
  {
    id: "bramble",
    name: "Bramble",
    title: "all offence, no follow-through",
    blurb:
      "Builds threats compulsively and cashes maybe half of them. Punishes slow " +
      "play and collapses the moment you make it defend.",
    tier: 4,
    perfect: false,
    depth: 6,
    weights: w({ threat: 30, immediate: 44, parity: 0, center: 4 }),
    slipRate: 0.08,
    exactFrom: {},
    bluffs: false,
    colors: { body: "#b5533f", shade: "#7e3427" },
  },
  {
    id: "cinder",
    name: "Cinder",
    title: "sets two traps, offers you one",
    blurb:
      "Plays for positions where every reply loses. You will usually see it " +
      "coming exactly one move after it stopped mattering.",
    tier: 5,
    perfect: false,
    depth: 7,
    weights: w({ threat: 24, immediate: 38, parity: 12, center: 8 }),
    slipRate: 0.05,
    exactFrom: {},
    bluffs: false,
    colors: { body: "#d4762a", shade: "#96501a" },
  },
  {
    id: "vane",
    name: "Vane",
    title: "plays the quiet game, and lies",
    blurb:
      "Understands that these games are decided by which rows your threats sit " +
      "on, and plays accordingly. Its face is not a reliable narrator.",
    tier: 6,
    perfect: false,
    depth: 9,
    weights: w({ parity: 40, threat: 16, immediate: 26, center: 7 }),
    // ~one slip a game; 0.004 read as flawless.
    slipRate: 0.02,
    exactFrom: {},
    bluffs: true,
    colors: { body: "#7b6bb5", shade: "#524689" },
  },
  {
    id: "quill",
    name: "Quill",
    title: "solves the endgame outright",
    blurb:
      "Plays a strong opening and then, once the board is full enough to be " +
      "computable, stops estimating. From there it does not make mistakes.",
    tier: 7,
    perfect: false,
    depth: 10,
    weights: w({ parity: 34, threat: 18, immediate: 30, center: 9 }),
    // Quill's weights are a strength knob, not personality. Parity 46 and 52 both
    // measure 56% vs Vane on Connect 5 (plateau); rung is known soft — CLAUDE.md § ladder.
    weightsByVariant: {
      connect5: w({ parity: 46, threat: 18, immediate: 30, center: 9 }),
      connect6: w({ parity: 46, threat: 18, immediate: 30, center: 9 }),
      connect7: w({ parity: 46, threat: 18, immediate: 30, center: 9 }),
    },
    // `pick` never slips an exact move, so the blurb stays literally true.
    slipRate: 0.008,
    // Oracle's crossover + 6 on every board; part of the rung, not measured separately.
    exactFrom: { connect4: 16, connect5: 50, connect6: 88, connect7: 133 },
    bluffs: false,
    colors: { body: "#3f8fa8", shade: "#2a6274" },
  },
  {
    id: "oracle",
    name: "The Oracle",
    title: "perfect from the midgame on",
    blurb:
      "Solves the position exactly once the board is small enough to be read to " +
      "the end — not strong play, proven play. Before that it estimates like " +
      "everyone else, so the opening is the only place you exist. Nothing you do " +
      "after it starts solving will change the result it has already read.",
    tier: 8,
    perfect: true,
    depth: 10,
    weights: w({ parity: 36, threat: 18, immediate: 30, center: 10 }),
    slipRate: 0,
    // Measured worst case (measure-solve.ts live): C6 77-82 of 110, C7 125-127 of 156.
    exactFrom: { connect4: 10, connect5: 44, connect6: 82, connect7: 127 },
    bluffs: false,
    colors: { body: "#d8d2c4", shade: "#9d9483" },
  },
];

export const byId = (id: string): BotProfile => {
  const bot = ROSTER.find((b) => b.id === id);
  if (!bot) throw new Error(`no such bot: ${id}`);
  return bot;
};

/** The weight vector this bot plays with on a given board. */
export const weightsFor = (bot: BotProfile, v: Variant): EvalWeights =>
  bot.weightsByVariant?.[v.id] ?? bot.weights;

/**
 * Depth normalised by log(width)/log(7) so the tree stays about the same size;
 * an unscaled depth blows the shared node budget and the bot goes nearly blind
 * (CLAUDE.md § depth is not portable). Identity on Connect 4.
 */
export function depthFor(bot: BotProfile, v: Variant): number {
  const override = bot.depthByVariant?.[v.id];
  if (override !== undefined) return override;
  if (v.width === CONNECT4.width) return bot.depth;
  const scaled = (bot.depth * Math.log(CONNECT4.width)) / Math.log(v.width);
  return Math.max(1, Math.round(scaled));
}

/**
 * Node budget per move, scaled by cells and width (400k on Connect 4). Needs
 * headroom over the top rung: Connect 5's deepest search measures ~704k vs 882k.
 */
export const heuristicBudget = (v: Variant): number =>
  Math.round(400_000 * (v.cells / CONNECT4.cells) * (v.width / CONNECT4.width));

/** The bot's proven-play claim for this board, generated from `exactFrom` so it can't drift; null if it never solves. */
export function exactnessNote(bot: BotProfile, v: Variant): string | null {
  const from = bot.exactFrom[v.id];
  if (from === undefined || !Number.isFinite(from)) return null;

  const note = `On ${v.name} it stops estimating and starts solving at ${from} discs of ${v.cells}.`;
  const late = from > v.cells * 0.5;
  return late
    ? `${note} That's late enough that a game which ends in a win is usually over first — ` +
        `expect proven play only in the long ones.`
    : note;
}

export interface BotDecision {
  col: number;
  /** The face it shows you. */
  mood: Mood;
  /** The face it would show if it were honest. Equal to `mood` unless it bluffs. */
  trueMood: Mood;
  /** How well it thinks it's doing, from -1 (lost) to 1 (won). */
  conviction: number;
  /** True if the move came from the exact solver rather than the evaluator. */
  exact: boolean;
  /** True if it knowingly declined its best move. */
  slipped: boolean;
  nodes: number;
}

/** Per-bot search state that's worth keeping between moves. */
export class BotBrain {
  readonly profile: BotProfile;
  private readonly table: TranspositionTable;
  private readonly rng: () => number;

  constructor(profile: BotProfile, rng: () => number = Math.random) {
    this.profile = profile;
    this.rng = rng;
    // Kept across the match: earlier proofs stay valid, so later solves get cheaper.
    this.table = new TranspositionTable(profile.perfect ? 23 : 20);
  }

  /** The ply this bot starts solving exactly on `v`, or Infinity if it never does. */
  exactFrom(v: Variant): number {
    return this.profile.exactFrom[v.id] ?? Infinity;
  }

  decide(p: Position): BotDecision {
    const { profile } = this;

    let scores: { col: number; score: number }[];
    let best: number;
    let bestCols: number[];
    let exact = false;
    let nodes = 0;

    if (p.moves >= this.exactFrom(p.variant)) {
      const solved = this.trySolve(p);
      if (solved) {
        scores = solved.moves;
        best = solved.best;
        bestCols = solved.bestCols;
        exact = true;
      } else {
        ({ scores, best, bestCols, nodes } = this.guess(p));
      }
    } else {
      ({ scores, best, bestCols, nodes } = this.guess(p));
    }

    const { col, slipped } = this.pick(scores, bestCols, best, exact, p.variant);
    const conviction = this.convictionOf(scores, col, exact, p.variant);
    const trueMood = moodFor(p, col, conviction, exact);
    const mood = profile.bluffs ? bluff(trueMood, this.rng) : trueMood;

    return { col, mood, trueMood, conviction, exact, slipped, nodes };
  }

  /** Exact search, or null if it blew the node budget. */
  private trySolve(p: Position): Analysis | null {
    try {
      return analyze(p, { table: this.table, nodeLimit: 12_000_000 });
    } catch (e) {
      if (e instanceof SearchAborted) return null;
      throw e;
    }
  }

  private guess(p: Position) {
    const r = searchHeuristic(
      p,
      depthFor(this.profile, p.variant),
      weightsFor(this.profile, p.variant),
      heuristicBudget(p.variant),
    );
    return { scores: r.moves, best: r.best, bestCols: r.bestCols, nodes: r.nodes };
  }

  /**
   * A slip draws from non-best moves by rank with geometric weight, never
   * uniformly (uniform reads as drunk and costs more strength per slip). Never
   * slips an exact move; above tier 1 never slips away a seen win or loss.
   */
  private pick(
    scores: { col: number; score: number }[],
    bestCols: number[],
    best: number,
    exact: boolean,
    v: Variant,
  ): { col: number; slipped: boolean } {
    const chooseBest = () => ({
      col: bestCols[Math.floor(this.rng() * bestCols.length)] ?? bestCols[0]!,
      slipped: false,
    });

    if (this.profile.slipRate === 0 || exact) return chooseBest();

    if (isDecisive(best, v) && this.profile.tier >= 2) return chooseBest();

    if (this.rng() >= this.profile.slipRate) return chooseBest();

    let others = scores.filter((m) => !bestCols.includes(m.col));

    // Filtered here, not guarded above: `best` is ordinary when only one column hands over a four.
    if (this.profile.tier >= 2) {
      others = others.filter((m) => !(m.score < 0 && isDecisive(m.score, v)));
    }

    if (others.length === 0) return chooseBest();

    return { col: plausibleSlip(others, this.rng()).col, slipped: true };
  }

  /** How well the bot thinks it's doing after the move it chose, in -1..1. */
  private convictionOf(
    scores: { col: number; score: number }[],
    col: number,
    exact: boolean,
    v: Variant,
  ): number {
    const score = scores.find((m) => m.col === col)?.score ?? 0;
    if (exact) return clamp(score / maxScoreOf(v), -1, 1);
    if (isDecisive(score, v)) return Math.sign(score);
    return Math.tanh(score / 260);
  }
}

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

/** Per-rank slip decay. Rank, not score: heuristic scores are hundreds, solved ones single digits. */
const SLIP_DECAY = 0.5;

/** Draw a non-best move by rank; equal scores share a rank. */
function plausibleSlip<T extends { score: number }>(others: readonly T[], r: number): T {
  const ranked = [...others].sort((a, b) => b.score - a.score);

  const weights: number[] = [];
  let rank = 0;
  let total = 0;
  for (let i = 0; i < ranked.length; i++) {
    if (i > 0 && ranked[i]!.score < ranked[i - 1]!.score) rank++;
    const weight = SLIP_DECAY ** rank;
    weights.push(weight);
    total += weight;
  }

  let x = r * total;
  for (let i = 0; i < ranked.length; i++) {
    x -= weights[i]!;
    if (x <= 0) return ranked[i]!;
  }
  return ranked[ranked.length - 1]!;
}

/** Face for a conviction; `alarmed` (two unanswerable threats) overrides the score. */
function moodFor(p: Position, col: number, conviction: number, exact: boolean): Mood {
  const after = p.clone();
  if (after.canPlay(col)) after.play(col);

  // `after` is from the human's point of view.
  const theirThreats = after.winningPositions() & after.possibleMoves();
  if (theirThreats !== 0n && (theirThreats & (theirThreats - 1n)) !== 0n) return "alarmed";

  if (conviction >= 0.75) return exact ? "smug" : "pleased";
  if (conviction >= 0.2) return "pleased";
  if (conviction <= -0.75) return "resigned";
  if (conviction <= -0.2) return "worried";
  return "idle";
}

/** Honest face 65% of the time, not inverted — an always-inverted tell is read once and owned. */
function bluff(mood: Mood, rng: () => number): Mood {
  if (rng() < 0.65) return mood;
  switch (mood) {
    case "worried":
    case "resigned":
      return "pleased";
    case "alarmed":
      return "idle";
    case "smug":
    case "pleased":
      return "worried";
    default:
      return rng() < 0.5 ? "pleased" : "worried";
  }
}

/** Legal columns, for callers that don't want to import the board directly. */
export const legalColumns = (p: Position): number[] =>
  Array.from({ length: p.variant.width }, (_, c) => c).filter((c) => p.canPlay(c));
