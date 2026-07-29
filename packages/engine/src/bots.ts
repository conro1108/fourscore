/**
 * The opponents.
 *
 * A ladder that only varies search depth produces one bot wearing seven hats —
 * every rung plays the same moves, just fewer of them well. So each bot here is
 * a weight vector as well as a depth, and the weights are what you actually
 * feel across the table: Bramble stacks up threats it can't cash because it
 * scores threats highly and parity not at all, while Vane plays the slow
 * positional game because for it parity outweighs everything else.
 *
 * Two other knobs do the rest of the work:
 *
 *   - `slipRate` — how often it declines to play its own best move. This is
 *     what makes the low rungs beatable in a way that reads as fallible rather
 *     than broken, because a slip is still a legal, plausible-looking move.
 *   - `exactFrom` — the ply at which it stops guessing and starts solving. Past
 *     this point the bot is not playing well, it is playing perfectly, and no
 *     amount of cleverness gets a win back.
 */

import { Position, WIDTH } from "./board.js";
import { BALANCED_WEIGHTS, isDecisive, searchHeuristic, type EvalWeights } from "./evaluate.js";
import {
  MAX_SCORE,
  SearchAborted,
  TranspositionTable,
  analyze,
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
  depth: number;
  weights: EvalWeights;
  slipRate: number;
  /** Ply from which it solves exactly. `Infinity` means never. */
  exactFrom: number;
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
      "Knows that four in a row wins and is thrilled about it. Has not yet " +
      "considered that you also get to move.",
    tier: 1,
    perfect: false,
    depth: 1,
    weights: w({ parity: 0, center: 2, immediate: 4 }),
    slipRate: 0.5,
    exactFrom: Infinity,
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
    slipRate: 0.3,
    exactFrom: Infinity,
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
    // A weight sweep against Pebble showed centre weight barely moves the
    // win rate at all — which is the useful kind of result, because it means
    // Moss's whole personality is close to free. Its rung on the ladder is
    // bought with the slip rate below, not with how much it loves the middle.
    weights: w({ center: 12, threat: 14, parity: 3 }),
    slipRate: 0.08,
    exactFrom: Infinity,
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
    slipRate: 0.035,
    exactFrom: Infinity,
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
    slipRate: 0.015,
    exactFrom: Infinity,
    bluffs: false,
    colors: { body: "#d4762a", shade: "#96501a" },
  },
  {
    id: "vane",
    name: "Vane",
    title: "plays the quiet game, and lies",
    blurb:
      "Understands that Connect 4 is decided by which rows your threats sit on, " +
      "and plays accordingly. Its face is not a reliable narrator.",
    tier: 6,
    perfect: false,
    depth: 9,
    weights: w({ parity: 40, threat: 16, immediate: 26, center: 7 }),
    slipRate: 0.004,
    exactFrom: Infinity,
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
    slipRate: 0,
    exactFrom: 16,
    bluffs: false,
    colors: { body: "#3f8fa8", shade: "#2a6274" },
  },
  {
    id: "oracle",
    name: "The Oracle",
    title: "perfect from the midgame on",
    blurb:
      "Solves the position exactly from ten discs onward — not strong play, " +
      "proven play. Before that it estimates like everyone else, so the opening " +
      "is the only place you exist. Nothing you do after it starts solving will " +
      "change the result it has already read.",
    tier: 8,
    perfect: true,
    depth: 10,
    weights: w({ parity: 36, threat: 18, immediate: 30, center: 10 }),
    slipRate: 0,
    exactFrom: 10,
    bluffs: false,
    colors: { body: "#d8d2c4", shade: "#9d9483" },
  },
];

export const byId = (id: string): BotProfile => {
  const bot = ROSTER.find((b) => b.id === id);
  if (!bot) throw new Error(`no such bot: ${id}`);
  return bot;
};

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
    // Kept across the whole match on purpose: positions the bot proved on an
    // earlier turn are still proved, so its searches get cheaper as the game
    // goes on — which is exactly when it wants to be searching hardest.
    this.table = new TranspositionTable(profile.perfect ? 23 : 20);
  }

  decide(p: Position): BotDecision {
    const { profile } = this;

    let scores: { col: number; score: number }[];
    let best: number;
    let bestCols: number[];
    let exact = false;
    let nodes = 0;

    if (p.moves >= profile.exactFrom) {
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

    const { col, slipped } = this.pick(scores, bestCols, best, exact);
    const conviction = this.convictionOf(scores, col, exact);
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
    const r = searchHeuristic(p, this.profile.depth, this.profile.weights);
    return { scores: r.moves, best: r.best, bestCols: r.bestCols, nodes: r.nodes };
  }

  /**
   * Choose among the scored moves, allowing for the bot's fallibility.
   *
   * A slip picks uniformly from the moves that aren't best — never an illegal
   * or absurd one — so a weak bot looks like it misjudged the position rather
   * than like it glitched. Bots above the bottom rung won't slip away a win or
   * a loss they can actually see; missing a four already on the board is a
   * beginner's mistake and it should stay Acorn's alone.
   */
  private pick(
    scores: { col: number; score: number }[],
    bestCols: number[],
    best: number,
    exact: boolean,
  ): { col: number; slipped: boolean } {
    const chooseBest = () => ({
      col: bestCols[Math.floor(this.rng() * bestCols.length)] ?? bestCols[0]!,
      slipped: false,
    });

    if (this.profile.slipRate === 0) return chooseBest();

    const decisive = exact ? Math.abs(best) > 0 : isDecisive(best);
    if (decisive && this.profile.tier >= 2) return chooseBest();

    if (this.rng() >= this.profile.slipRate) return chooseBest();

    const others = scores.filter((m) => !bestCols.includes(m.col));
    if (others.length === 0) return chooseBest();

    return { col: others[Math.floor(this.rng() * others.length)]!.col, slipped: true };
  }

  /** How well the bot thinks it's doing after the move it chose, in -1..1. */
  private convictionOf(
    scores: { col: number; score: number }[],
    col: number,
    exact: boolean,
  ): number {
    const score = scores.find((m) => m.col === col)?.score ?? 0;
    if (exact) return clamp(score / MAX_SCORE, -1, 1);
    if (isDecisive(score)) return Math.sign(score);
    return Math.tanh(score / 260);
  }
}

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

/**
 * The face for a given conviction.
 *
 * `alarmed` overrides the rest: a bot that has just been handed two unanswerable
 * threats should look startled even if its score hasn't caught up, because from
 * the player's side of the board that's the moment worth reacting to.
 */
function moodFor(p: Position, col: number, conviction: number, exact: boolean): Mood {
  const after = p.clone();
  if (after.canPlay(col)) after.play(col);

  // `after` is from the human's point of view now, so their winning cells are
  // the ones to count.
  const theirThreats = after.winningPositions() & after.possibleMoves();
  if (theirThreats !== 0n && (theirThreats & (theirThreats - 1n)) !== 0n) return "alarmed";

  if (conviction >= 0.75) return exact ? "smug" : "pleased";
  if (conviction >= 0.2) return "pleased";
  if (conviction <= -0.75) return "resigned";
  if (conviction <= -0.2) return "worried";
  return "idle";
}

/**
 * Vane's tell, which is a lie.
 *
 * It doesn't invert the mood — a bot that beams while losing every single time
 * is a tell you read once and then own forever. It shows the honest face most
 * of the time and overplays its hand occasionally, so the information is real
 * but not free.
 */
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
  Array.from({ length: WIDTH }, (_, c) => c).filter((c) => p.canPlay(c));
