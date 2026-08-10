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
 *     The schedule decays roughly geometrically up the ladder (0.5, 0.34, 0.18,
 *     0.08, 0.05, 0.02, 0.008, 0) rather than falling off a cliff: an earlier
 *     version dropped 0.30 to 0.08 between tiers 2 and 3 — a 3.75x fall at the
 *     same rung where the depth doubled, so both strength knobs jumped at once
 *     at exactly the rung most casual players stop at, and the ladder read as
 *     getting hard far too fast. Keeping a real, non-zero rate up into tiers 6
 *     and 7 is the other half of it: above Vane the only lever left was depth,
 *     and depth alone reads as "never makes a mistake" rather than as a
 *     stronger opponent.
 *   - `exactFrom` — the ply at which it stops guessing and starts solving. Past
 *     this point the bot is not playing well, it is playing perfectly, and no
 *     amount of cleverness gets a win back.
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
  /**
   * Search depth on Connect 4. Other boards derive from it — see `depthFor`.
   */
  depth: number;
  /** Explicit per-variant depth, where the derived one measured badly. */
  depthByVariant?: Record<string, number>;
  weights: EvalWeights;
  /**
   * Per-variant weights, for bots whose vector is a strength knob rather than a
   * personality. Use sparingly — for most of the roster the weights *are* the
   * character, and changing them per board makes the bot a different opponent.
   */
  weightsByVariant?: Record<string, EvalWeights>;
  slipRate: number;
  /**
   * Ply from which it solves exactly, per variant. `Infinity` means never.
   *
   * This has to be per-variant because it's a statement about what's affordable,
   * not about the bot's character, and affordability moves enormously with the
   * board: the same node budget that reaches ply 10 on Connect 4's 42 cells
   * reaches nowhere near that on Connect 5's 72.
   *
   * Measured with `packages/engine/tools/measure-solve.ts live <variant>`, which
   * times the bot's *first* exact move — a cold `analyze`, one solve per legal
   * column — because that's the one the player sits and waits through. Taking
   * the worst case across games rather than the median, since a bot that stalls
   * on the unlucky match is the failure people actually notice.
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
    // Slightly worse than it used to be, on purpose. This is the rung a casual
    // player actually sits on, and the gap from here to Moss was the steepest
    // step in the whole ladder; part of closing it was Moss slipping more and
    // part was Pebble slipping a little more too.
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
    // A weight sweep against Pebble showed centre weight barely moves the
    // win rate at all — which is the useful kind of result, because it means
    // Moss's whole personality is close to free. Its rung on the ladder is
    // bought with the slip rate below, not with how much it loves the middle.
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
    // 0.004 was a slip every few hundred moves, which is nobody's experience of
    // playing it — from here up the ladder used to be "flawless, then deeper".
    // 0.02 is roughly one slip a game, which is what a strong human is.
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
    // Quill is the one bot whose weights aren't its personality — its character
    // is "strong opening, then solves outright", so the vector is free to be a
    // strength knob. It needs to be, on Connect 5: parity dominates even harder
    // on a taller board with longer runs, and at Connect 4's weights Quill lost
    // the rung to Vane no matter how deep it searched.
    // Parity 46 and 52 both measure 56% against Vane; the effect plateaus, so
    // this takes the smaller change. See the note on the Connect 5 ladder in
    // CLAUDE.md — this rung is known soft and is not fixed by weights, depth or
    // an earlier crossover.
    weightsByVariant: {
      connect5: w({ parity: 46, threat: 18, immediate: 30, center: 9 }),
      // The taller the board, the harder parity dominates — same medicine as
      // Connect 5, same measured plateau (see the dead-end note there).
      connect6: w({ parity: 46, threat: 18, immediate: 30, center: 9 }),
      connect7: w({ parity: 46, threat: 18, immediate: 30, center: 9 }),
    },
    // Fallible while it is still estimating, and only then: `pick` never slips
    // a move that came out of the exact solver, so "from there it does not make
    // mistakes" stays literally true. A rate this low is a slip every few games
    // in the opening — enough that the rung below the Oracle is a person you
    // can catch out rather than a second unbeatable machine.
    slipRate: 0.008,
    // Six plies after the Oracle's measured crossover on every board, same as
    // the gap Connect 4 and Connect 5 shipped with: Quill solving later than
    // the Oracle is part of the rung, not a measurement of its own.
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
    // Measured with `measure-solve.ts live <variant>`, worst case across
    // games: Connect 6 crosses at 82 discs of 110 (six games, 77-82), Connect 7
    // at 127 of 156 (five games, 125-127). Both are past half the board, so
    // `exactnessNote` adds the "usually over first" caveat by itself.
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

/**
 * How deep this bot searches on a given board.
 *
 * A depth means different amounts of work on different boards: the tree grows
 * as the width to the power of the depth, so Connect 4's depth 10 costs 332k
 * nodes at 7 wide and about 4.4M at 9 wide. That matters more than it sounds,
 * because `searchHeuristic` shares one node budget across all root moves — blow
 * it on the first column and every remaining column falls back to a static
 * evaluation. The bot doesn't play worse gracefully, it plays almost blind.
 *
 * That is exactly what happened when Connect 5 was added: Quill (depth 10) lost
 * every single game to Vane (depth 9), because only Quill was over the budget.
 * The ladder inverted at the top and the weights had nothing to do with it.
 *
 * So depth is normalised to keep the tree roughly the same size: raising the
 * width from 7 to 9 divides the depth by log 9 / log 7. That keeps the rungs
 * ordered on any board without hand-tuning each one, which is what makes
 * Connect N a config change rather than a retune.
 */
/** The weight vector this bot plays with on a given board. */
export const weightsFor = (bot: BotProfile, v: Variant): EvalWeights =>
  bot.weightsByVariant?.[v.id] ?? bot.weights;

export function depthFor(bot: BotProfile, v: Variant): number {
  const override = bot.depthByVariant?.[v.id];
  if (override !== undefined) return override;
  if (v.width === CONNECT4.width) return bot.depth;
  const scaled = (bot.depth * Math.log(CONNECT4.width)) / Math.log(v.width);
  return Math.max(1, Math.round(scaled));
}

/**
 * Nodes a heuristic bot may spend on one move.
 *
 * Scaled with the board for the same reason as the depth: the budget is meant
 * to bound how long a move takes, and a fixed number quietly means "at most
 * this deep on a 7-wide board".
 *
 * Both factors are real. A bigger board holds more plies, so searches run
 * deeper into the game before terminal positions prune them, and a wider board
 * branches harder at every one of those plies. Connect 4 comes out at exactly
 * the original 400k, since both ratios are 1 there.
 *
 * The headroom matters as much as the scaling: a budget that lands just under
 * what the top rung needs is the same bug as no scaling at all, only harder to
 * spot. Connect 5's deepest intended search measures ~704k against a 882k
 * budget.
 */
export const heuristicBudget = (v: Variant): number =>
  Math.round(400_000 * (v.cells / CONNECT4.cells) * (v.width / CONNECT4.width));

/**
 * What this bot can actually prove on this board, in a sentence, or null if it
 * never solves at all.
 *
 * Generated rather than written down, because "solves exactly from ten discs"
 * is a fact about Connect 4's 42 cells and becomes a lie on any other board.
 * The UI shows this instead of a hardcoded claim so the two can't drift apart.
 *
 * The second sentence is the one that matters on the bigger boards. Connect 5's
 * crossover sits so late that a decisive game is usually over before the solver
 * ever gets there — saying "perfect from the midgame" there would be selling
 * something that mostly doesn't happen.
 */
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
    // Kept across the whole match on purpose: positions the bot proved on an
    // earlier turn are still proved, so its searches get cheaper as the game
    // goes on — which is exactly when it wants to be searching hardest.
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
   * Choose among the scored moves, allowing for the bot's fallibility.
   *
   * A slip is the bot's *second thought*, not a random one. The moves that
   * aren't best are ranked by their own search score and drawn from with
   * geometrically decaying weight, so the near-miss is far likelier than the
   * blunder. Picking uniformly — which is what this used to do — makes a
   * slipping bot look drunk rather than weak: it answers a fight over the
   * centre by dropping a disc on the far edge, which no human of any strength
   * does. Plausible slips also cost less strength per slip than uniform ones,
   * which is the trade that lets the rates above be several times higher.
   *
   * Two things it will not do. It never slips a move that came out of the exact
   * solver: past its crossover a bot is reading the game, not guessing at it,
   * and a "mistake" there would be the machinery showing. And bots above the
   * bottom rung won't slip away a win or a loss they can actually see — missing
   * a four already on the board is a beginner's mistake and it stays Acorn's
   * alone.
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

    // A seen *loss* has to be filtered here rather than guarded above, because
    // the bot isn't losing on the move it was going to play: `best` is a
    // perfectly ordinary score in a position where one column hands over a four.
    // Above the bottom rung a slip is a worse move, never a suicidal one — and
    // when every alternative loses, that means not slipping at all.
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

/**
 * How much less likely each step down the ranking is when a bot slips.
 *
 * Ranked rather than proportional to the scores themselves, because the two
 * things that produce those scores are on wildly different scales — a heuristic
 * score is hundreds, a solved one is single digits — and a softmax tuned for
 * one is meaningless on the other. Rank is the same currency everywhere.
 *
 * At 0.5 the second-best move takes about half of all slips and the worst of
 * six alternatives takes about one in sixty, which is roughly the shape of a
 * weaker player's errors: usually the reasonable-looking alternative,
 * occasionally something worse, almost never the worst move on the board.
 */
const SLIP_DECAY = 0.5;

/**
 * Draw one of the non-best moves, favouring the ones the bot rated highest.
 *
 * Moves with equal scores share a rank, so a bot that genuinely can't tell two
 * moves apart doesn't quietly prefer the left-hand one.
 */
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
  Array.from({ length: p.variant.width }, (_, c) => c).filter((c) => p.canPlay(c));
