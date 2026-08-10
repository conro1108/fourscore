/**
 * Which act answers which event — as a weighted draw rather than a lookup.
 *
 * This is the lane screen's actual mechanic (VISION.md pillar 2): the screen
 * has a small library of canned clips, it picks one for what you just did, and
 * it does not care whether that clip fits. A single fixed gag per event kind
 * made the game readable in a way a lane screen never is — the third blunder
 * launched the same rocket as the first, so the rocket stopped being a
 * reaction and became a status light.
 *
 * The taste law's randomness rule survives intact and is the reason this file
 * exists at all: **randomness picks which gag fires, never how a gag looks.**
 * Every act is still fixed choreography; all that varies is which one you get.
 * `rng` is injected so the picker is deterministic under test — the app hands
 * it `Math.random`, and nothing else in the prop system is allowed to be
 * random at all.
 *
 * What is *not* random: the ending. `win` and `draw` are the only facts on the
 * bus (`director/types.ts`), so they have exactly one act each and it is the
 * same one every time. A game does not end with a draw from a hat.
 */

import { signatureMatches, type BotIdentity } from "../bots/identity.js";
import type { SpectacleEvent, StageMode } from "../director/types.js";
import { PROP_ACTS, type PropAct } from "./registry.js";

export interface Candidate {
  /**
   * The act to play, or `null` for "the screen does nothing this time".
   *
   * A null entry is how a pool holds a *chance* of a reaction rather than a
   * certainty, and it is only how, because probability has to live in the same
   * draw as the choice: a coin flipped before the draw would decide whether to
   * react before knowing what the reaction would have been, and then a berth
   * veto could turn a reaction the screen already committed to into silence.
   */
  name: string | null;
  /** Relative frequency within its pool. Integers, and they mean nothing alone. */
  weight: number;
}

const w = (name: string | null, weight: number): Candidate => ({ name, weight });

/**
 * The attract loop: what plays on the menu, where there is nothing to react to.
 *
 * A lane screen is never blank between throws, and this is the pool it runs
 * from — weighted toward the quiet acts, because the loud ones are only loud
 * if they're rare. The mascot turning up to celebrate *nothing* is the most
 * on-reference thing in here, and it is deliberately common.
 */
const ATTRACT_IDLE: Candidate[] = [
  w("mascot-cheer", 3),
  w("deep-space", 3),
  w("cherub-visit", 2),
  w("callout-still-here", 2),
  w("truck-lap", 2),
  w("stare-down", 2),
  w("mascot-flop", 1),
  w("rocket-fizzle", 1),
  // The full-frame acts are the best things in the roster and the menu is where
  // they are the *content* rather than punctuation, so they carry real weight
  // here. Two at a time, in two different berths, is what the attract loop is.
  //
  // All six of them, and that took a fix: `window-washer` shipped into the
  // blunder pool only, which made it the one full-frame act the menu never
  // played — an act that exists to fill the frame, shown only to a player who
  // has just lost ground. It joins at the lower tier because `cannon-shot`
  // already holds `left` at 3 and two acts in one berth is what the berth rule
  // is for; the veto would eat the draw more often than it is worth.
  w("cannon-shot", 3),
  w("wrecking-ball", 3),
  w("foam-finger", 2),
  w("mirror-ball", 2),
  w("piano-drop", 2),
  w("window-washer", 2),
];

/**
 * There is no in-match idle pool, and that is the point.
 *
 * The screen used to perform on its own schedule as well as yours — a quiet
 * stretch in a game would break itself with an interlude — and the Director no
 * longer emits `idle-beat` outside the menu at all (`director.ts`). The pool
 * went with it: everything the stage does in a match is now an answer to
 * something you or the opponent did.
 *
 * The consequence to keep an eye on is opponent identity. Three signatures used
 * to hang off `idle-beat`, which made them the thing you saw in a quiet game;
 * they hang off move grades and threats now (`bots/identity.ts`), because a
 * signature that only fires on a beat that no longer exists is an opponent
 * nobody can tell apart.
 */
const MATCH_IDLE: readonly Candidate[] = [];

/**
 * One pool per move grade. A grade with more than one answer is the whole
 * point: three blunders in a game should not be three identical rockets.
 *
 * **`fine` is the pool this file exists for now.** An ordinary move used to get
 * nothing at all, which made the props a readout — something on screen meant
 * the engine had an opinion about you, and nothing on screen meant it didn't.
 * That is the opposite of the reference. A lane screen reacts to *throws*, not
 * to quality; it has no idea whether what you did was good and it goes off
 * anyway. So an ordinary move now draws from a pool that is mostly silence and
 * is otherwise the acts that cannot be read as a verdict — an interlude about
 * nothing, and words that are enthusiastic, bored and self-regarding about
 * nothing.
 *
 * The weights are the tuning: `fine` is ~85% of moves in a real game, so the
 * silence weight is what keeps this a surprise rather than a metronome. It was
 * 26 of 31 — 84% — and a whole match went by with the stage empty, which is the
 * *other* failure of the readout: a screen that only reacts when it is
 * impressed and a screen that never reacts are both screens you stop watching.
 * 60% is the number now, and the band it has to stay inside (55-65%) is in
 * `gags.test.ts` rather than the literal weights, because what matters is the
 * share. Not lower: an act every move is exhausting and the stage's 1.6s quiet
 * window is already throttling on top of this.
 *
 * The totals are kept around 30 rather than reduced to the smallest integers
 * that hit 60%, because Moss's signature hangs off `fine` at `SIGNATURE_WEIGHT`
 * and a smaller pool would silently make the mower twice as frequent. Shrinking
 * a pool is a change to every signature riding it.
 */
const MOVES: Record<"brilliant" | "fine" | "dubious" | "blunder", Candidate[]> = {
  brilliant: [
    w("mascot-cheer", 3),
    w("truck-lap", 2),
    w("callout-nice", 2),
    w("cannon-shot", 3),
    w("foam-finger", 3),
  ],
  blunder: [
    w("mascot-flop", 3),
    w("rocket-fizzle", 3),
    w("callout-oof", 2),
    w("piano-drop", 3),
    w("window-washer", 2),
  ],
  // The stare answers a questionable move by declining to comment on it,
  // which is the closest thing this roster has to a raised eyebrow. It took
  // the slot `sign-hmm` held: a sign on a stick waggling at the edge of the
  // frame is somebody in a crowd reacting, and a lane screen has no crowd in
  // it — it is the thing the crowd is looking at.
  // The cherub sits here with the stare: both are something arriving to
  // consider what you did and declining to say. Neither claims a result.
  dubious: [w("stare-down", 2), w("callout-huh", 2), w("mirror-ball", 2), w("cherub-visit", 2)],
  // `deep-space` leads the acts because it is the only one of them that is a
  // clip rather than a comment — VISION.md's fourth trait, the screen leaving
  // the venue for no reason, which cannot be misread as an opinion about a move
  // because it does not know you made one.
  //
  // `callout-still-here` was stranded: it only sat in the attract pool, and a
  // match emits no idle beats, so the best deadpan line in the callout gallery
  // could never fire in a game. It answers an ordinary move honestly — the
  // software volunteering that it has not gone anywhere is exactly a screen
  // reacting to the fact that you moved and nothing else. Lowest weight of the
  // four: it is the one that is about the software rather than the game, and
  // that joke thins out fast.
  fine: [
    w(null, 18),
    w("deep-space", 4),
    w("callout-incredible", 3),
    w("callout-a-move", 3),
    w("callout-still-here", 2),
  ],
};

/** Every act that may answer this event, with how often it should. */
export function candidatesFor(
  event: SpectacleEvent,
  mode: StageMode = "match",
): readonly Candidate[] {
  switch (event.kind) {
    case "move":
      return MOVES[event.quality];
    // The busiest cue on the bus, and three of the eight opponents also hang
    // their signature here — so a weight of 1 in this pool is not "rare", it is
    // roughly never. `callout-heat` was that 1 (one in sixteen on Pebble,
    // Bramble, Quill and the Oracle), which is a strange thing to do to the one
    // act in the roster whose actual words are HEATING UP. It sits in the pool's
    // band now rather than at the bottom of it. Not 4: `beacon-drop` and
    // `wrecking-ball` are what a threat *looks* like, and the word is
    // punctuation on them.
    case "threat":
      return [
        w("beacon-drop", 4),
        w("stare-down", 2),
        w("callout-heat", 3),
        w("wrecking-ball", 4),
      ];
    // A collapse is the rarest thing the Director says, and it used to be a pool
    // of one — so the only time you ever saw it, you saw the same word, and on
    // Vane's stage you mostly didn't see it at all: `score-lie` hangs off
    // `tension-shift` at `SIGNATURE_WEIGHT`, which made it 5:1 over the entire
    // rest of the pool. Three answers now, at 8 against the signature's 5.
    //
    // The two additions are honest about a collapse in the way a lane screen is
    // honest — neither claims a result, and both read as the tension leaving the
    // room rather than as a verdict on it. The mascot going over is the cast
    // deflating; the rocket failing to get up is the beat that was building and
    // then wasn't. `NEVERMIND` still leads by a clear margin because it is the
    // best line in the game and this is the only event that plays it.
    case "tension-shift":
      return event.direction === "rising"
        ? [w("callout-heat", 2), w("callout-happening", 2), w("mirror-ball", 3)]
        : [w("callout-nevermind", 4), w("mascot-flop", 2), w("rocket-fizzle", 2)];
    case "win":
      return [w("win-detonation", 1)];
    case "draw":
      return [w("callout-draw", 1)];
    case "idle-beat":
      return mode === "attract" ? ATTRACT_IDLE : MATCH_IDLE;
  }
}

/**
 * How heavily an opponent's signature outweighs the general library.
 *
 * The pools a signature can land in sum to 8-13, so at 5 the signature is the
 * most likely single answer without being the only one — which is the balance
 * the whole file is about. Make it exclusive and the opponent's clip becomes a
 * status light again; leave it at parity and nobody can tell whose stage they
 * are standing on, which is this phase's accept criterion.
 *
 * `fine` is the exception at 30, and it is not one: three fifths of that pool is
 * silence, so Moss's mower is still the likeliest *act* on an ordinary move.
 * This is also why rebalancing `fine` held its total near 30 — a pool's sum is
 * a shared constant with every signature hanging off it.
 *
 * A signature also joins the *menu's* idle pool at a smaller weight, so the
 * opponent under the cursor is already dressing the stage behind the roster
 * window. It no longer joins an in-match one, because there is no longer an
 * in-match one — see `MATCH_IDLE`.
 */
const SIGNATURE_WEIGHT = 5;
/**
 * And on the menu's idle beat, where a signature rides along so the opponent
 * you have highlighted is visible behind the roster window before you have
 * played a move against them. Smaller, because the attract loop is a library
 * and not a portrait.
 */
const SIGNATURE_ATTRACT_WEIGHT = 3;

export interface PickOptions {
  /** The act that just played. Skipped when the pool has anything else. */
  avoid?: string;
  /** Veto — the stage uses it to keep two acts out of one berth. */
  eligible?: (act: PropAct) => boolean;
  /** Whose stage this is. Their signature joins the pool; see below. */
  bot?: BotIdentity | null;
  /** Menu or match. Only the idle pool differs, and it differs a lot. */
  mode?: StageMode;
}

/**
 * The pool for this event on this opponent's stage.
 *
 * The signature is *added*, never substituted: the general library still
 * answers everything it answered before, so an opponent is a bias on the
 * screen's clip list rather than a different screen. And it is added subject
 * to the claims law — an act that declares a result can never be pulled in
 * this way, because a signature hangs off a grade or a threat and both of
 * those are the Director's estimate (`director/types.ts`). No identity in the
 * roster names a declaring act; this makes that a property of the code rather
 * than of the roster staying careful.
 */
function poolFor(
  event: SpectacleEvent,
  bot: BotIdentity | null | undefined,
  mode: StageMode,
): Candidate[] {
  // Copy the entries, not just the array: the pools above are module constants
  // and the signature raises a weight in place further down.
  const pool = candidatesFor(event, mode).map((c) => ({ ...c }));
  if (!bot) return pool;

  const { act, on } = bot.signature;
  // An act that doesn't exist and an act that declares a result are refused
  // the same way: silently, leaving the general library to answer.
  const entry = PROP_ACTS[act];
  if (!entry || entry.declares) return pool;

  const own = signatureMatches(on, event);
  // The attract loop is the one place a signature plays without its own event
  // having happened. In a match it answers what it is wired to and nothing
  // else — which is now the only way an opponent's clip reaches the stage at
  // all, since a match has no idle beats left.
  const rides = event.kind === "idle-beat" && mode === "attract";
  if (!own && !rides) return pool;

  const weight = own ? SIGNATURE_WEIGHT : SIGNATURE_ATTRACT_WEIGHT;
  // A signature may also be in the general pool for this event on its own
  // merits — Moss's used to be, in the days when it was a sprinkler and the
  // idle pool was one list. Raise that entry rather than listing it twice,
  // which would quietly double its odds.
  const existing = pool.find((c) => c.name === act);
  if (existing) existing.weight = Math.max(existing.weight, weight);
  else pool.push(w(act, weight));
  return pool;
}

/**
 * Draw an act for this event, or null if nothing can answer it.
 *
 * Two rules on top of the weights, both about how it feels over a whole game
 * rather than in one moment:
 *
 * - **Never twice running.** Weighted draws clump, and a clump reads as the
 *   game being broken rather than as chance. The last act is dropped from the
 *   pool whenever there is anything else to play.
 * - **Vetoes lose the draw, not the event.** If the stage can't take the act
 *   that was drawn, the pool is filtered *first* and re-drawn — so a busy
 *   berth costs you that act, not the reaction.
 *
 * A pool's silence entry survives both rules: it is never the act that just
 * played and no berth can veto it, so "nothing happens" keeps its share of the
 * draw however busy the stage is. That is the point of it — an event whose
 * pool is mostly silence should stay mostly silent under every condition, not
 * become talkative on a quiet stage.
 */
export function pickGag(
  event: SpectacleEvent,
  rng: () => number,
  options: PickOptions = {},
): string | null {
  const pool = poolFor(event, options.bot, options.mode ?? "match").filter((c) => {
    if (c.name === null) return true;
    const act = PROP_ACTS[c.name];
    return act !== undefined && (options.eligible?.(act) ?? true);
  });
  if (pool.length === 0) return null;

  const fresh = pool.filter((c) => c.name === null || c.name !== options.avoid);
  return weighted(fresh.length > 0 ? fresh : pool, rng);
}

function weighted(pool: readonly Candidate[], rng: () => number): string | null {
  const total = pool.reduce((sum, c) => sum + c.weight, 0);
  let r = rng() * total;
  for (const c of pool) {
    r -= c.weight;
    if (r < 0) return c.name;
  }
  // Only reachable if rng() returns exactly 1, which the contract allows.
  return pool[pool.length - 1]!.name;
}
