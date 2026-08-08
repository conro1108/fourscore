/**
 * The Director. Game truth in, spectacle instructions out.
 *
 * Pure and synchronous by law: no DOM, no clock, no store. Time arrives as a
 * `dt` and everything else as a `DirectorInput`, which is what makes the fever
 * curve and the event debouncing testable at all — and testable is the only way
 * either of them stays honest, because on screen a wrong curve just looks like
 * a mood.
 *
 * Two separate mechanisms, deliberately not mixed:
 *
 * - **fever** is a smoothed, continuous read of how sharp the position is. It
 *   never jumps (the one exception is a win, which is allowed to snap because
 *   the game genuinely did).
 * - **events** are discrete spikes. Every kind is debounced here so subsystems
 *   can fire a gag per event without each of them reinventing a cooldown.
 *
 * Every constant lives in `TUNING` so the whole curve can be re-felt in one
 * place against real play (phase 9's job), and so the debug panel can show what
 * it's actually looking at.
 */

import type { MatchStatus, Player } from "@fourscore/engine";
import type { EvalPoint } from "./feed.js";
import type { DirectorFrame, SpectacleEvent, StageMode } from "./types.js";

export interface DirectorTuning {
  /**
   * The estimated band of `advantageOf` — a forced win this engine can see, but
   * hasn't proved, sits at 0.55. Dividing by it makes "as decided as an estimate
   * can say" equal full sharpness, instead of leaving the top half of the fever
   * range reachable only by the solver.
   */
  sharpnessRef: number;
  /** How much of the fever drive comes from |advantage| vs. how much it moves. */
  sharpnessWeight: number;
  volatilityWeight: number;
  /** Plies of eval history averaged for volatility. */
  volatilityWindow: number;
  /** Per-ply advantage swing that counts as maximally volatile. */
  volatilityRef: number;
  /** Ceiling of the disc-count floor, and how late it arrives. */
  floorMax: number;
  floorCurve: number;
  /** Exponential approach constants, in ms. Fever rises fast and lingers. */
  riseTau: number;
  fallTau: number;
  /** Time constant of the slow baseline that `tension-shift` is measured against. */
  baselineTau: number;
  /** Fever distance from that baseline that counts as a shift. */
  shiftDelta: number;
  shiftCooldown: number;
  /** How long a move waits for its eval before firing ungraded, in ms. */
  gradeWait: number;
  /** Mover-POV advantage given up, on the -1..1 axis, per quality band. */
  blunderLoss: number;
  dubiousLoss: number;
  /** A brilliant move gives up nothing *and* swings this much since your last turn. */
  brilliantSwing: number;
  brilliantSlack: number;
  /** Minimum gap between `threat` events for the same player, in ms. */
  threatCooldown: number;
  /** Idle beats: this often, but only after this long with nothing else happening. */
  idlePeriod: number;
  idleQuiet: number;
  /**
   * Idle period on the menu, where idle beats are the entire show. A lane
   * screen with nothing to react to still isn't blank (VISION.md), and at the
   * in-match rate the menu was one sprinkler every eight seconds.
   */
  attractIdlePeriod: number;
}

export const TUNING: DirectorTuning = {
  sharpnessRef: 0.55,
  sharpnessWeight: 0.6,
  volatilityWeight: 0.4,
  volatilityWindow: 4,
  volatilityRef: 0.25,
  floorMax: 0.75,
  // Linear, and high: the disc count alone should walk the world from cold to
  // nearly-boiling over the length of a game, so that late moves feel late even
  // in a position nothing has happened in. It started at 1.6 (nothing happens,
  // then the finale), then 0.85/0.45 — still a game that only escalated if the
  // eval agreed. At 1.0/0.75 progress is a ramp you can feel by itself and the
  // position's sharpness rides on top of it.
  floorCurve: 1,
  riseTau: 320,
  fallTau: 1600,
  baselineTau: 4000,
  shiftDelta: 0.12,
  shiftCooldown: 6000,
  gradeWait: 600,
  blunderLoss: 0.28,
  dubiousLoss: 0.1,
  brilliantSwing: 0.18,
  brilliantSlack: 0.03,
  threatCooldown: 3000,
  idlePeriod: 7000,
  idleQuiet: 3000,
  attractIdlePeriod: 1800,
};

export interface DirectorInput {
  /** Bumped by the match store on every new game; a change resets the Director. */
  generation: number;
  moves: readonly number[];
  /** Indexed by plies played, sparse while searches are in flight. */
  points: readonly (EvalPoint | undefined)[];
  status: MatchStatus;
  winner: Player | null;
  /** Cells of the winning line as `row * width + col`. Empty unless won. */
  winningLine: readonly number[];
  /**
   * Winning cells each player could play *right now*. The dramatic reading of
   * "a live threat": not a run that could exist eventually, one that lands next
   * turn unless it's answered.
   */
  immediateThreats: Record<Player, number>;
  /** `variant.cells`, so the disc-count floor is geometry-derived, not 42. */
  cells: number;
  /** Menu or match; only the idle rate reads it. See `StageMode`. */
  mode: StageMode;
}

interface PendingMove {
  /** Index into `moves` of the move that was played. */
  ply: number;
  player: Player;
  col: number;
  /** Director time the move was noticed, for the grading wait. */
  since: number;
}

export interface DirectorState {
  generation: number;
  /** Accumulated ms. The Director's own clock, so tests need no wall clock. */
  time: number;
  fever: number;
  /** Slow trail of fever; `tension-shift` is fever pulling away from this. */
  baseline: number;
  moveCount: number;
  pending: PendingMove | null;
  threats: Record<Player, number>;
  lastThreatAt: Record<Player, number>;
  lastShiftAt: number;
  /** Any non-idle event, so idle beats stay out of a busy moment. */
  lastEventAt: number;
  lastIdleAt: number;
  /** Win and draw fire once per game, however many ticks see the final board. */
  ended: boolean;
}

export function initialDirectorState(generation = 0): DirectorState {
  return {
    generation,
    time: 0,
    fever: 0,
    baseline: 0,
    moveCount: 0,
    pending: null,
    threats: { red: 0, yellow: 0 },
    lastThreatAt: { red: -Infinity, yellow: -Infinity },
    lastShiftAt: -Infinity,
    lastEventAt: -Infinity,
    lastIdleAt: 0,
    ended: false,
  };
}

/** Where fever is heading, before smoothing. */
export function feverTarget(input: DirectorInput, t: DirectorTuning = TUNING): number {
  const known: number[] = [];
  for (let n = 0; n <= input.moves.length; n++) {
    const p = input.points[n];
    if (p) known.push(p.advantage);
  }

  const latest = known.length > 0 ? known[known.length - 1]! : 0;
  const sharpness = clamp01(Math.abs(latest) / t.sharpnessRef);

  // Volatility over the recent past, not the whole game: a wild opening
  // shouldn't still be raising the temperature twenty plies later.
  const window = known.slice(-(t.volatilityWindow + 1));
  let swing = 0;
  for (let i = 1; i < window.length; i++) swing += Math.abs(window[i]! - window[i - 1]!);
  const volatility =
    window.length > 1 ? clamp01(swing / (window.length - 1) / t.volatilityRef) : 0;

  // The floor is what makes a long, level game escalate anyway: a straight ramp
  // in disc count, so every game heats up roughly linearly whatever the eval
  // says. It raises the base rather than adding on top, so a full board can't
  // push past 1 and the drive keeps its whole range at every stage of the game.
  const progress = input.cells > 0 ? clamp01(input.moves.length / input.cells) : 0;
  const floor = t.floorMax * Math.pow(progress, t.floorCurve);

  const drive = clamp01(t.sharpnessWeight * sharpness + t.volatilityWeight * volatility);
  return clamp01(floor + (1 - floor) * drive);
}

/**
 * One tick. Returns the new state and the frame to publish.
 *
 * `dt` is milliseconds since the last call; the caller supplies it, so a test
 * can step 16ms sixty times or 1000ms once and get the same physics.
 */
export function advance(
  state: DirectorState,
  input: DirectorInput,
  dt: number,
  t: DirectorTuning = TUNING,
): { state: DirectorState; frame: DirectorFrame } {
  // A new game is a new world. Adopt the board as it stands rather than firing
  // events for the difference between the old game and this one.
  if (state.generation !== input.generation) {
    const fresh = initialDirectorState(input.generation);
    fresh.threats = { ...input.immediateThreats };
    return { state: fresh, frame: { fever: fresh.fever, events: [], mode: input.mode } };
  }

  const s: DirectorState = {
    ...state,
    time: state.time + dt,
    threats: { ...state.threats },
    lastThreatAt: { ...state.lastThreatAt },
  };
  const now = s.time;
  const events: SpectacleEvent[] = [];

  // -- moves -----------------------------------------------------------------
  // A move is noticed the instant it commits, but held until its eval lands so
  // the gag knows what kind of move it was. Held, not dropped: a search that
  // never answers still gets a move event, just an ungraded one.
  if (input.moves.length > s.moveCount) {
    if (s.pending) events.push(moveEvent(s.pending, input, t));
    const ply = input.moves.length - 1;
    s.pending = {
      ply,
      player: ply % 2 === 0 ? "red" : "yellow",
      col: input.moves[ply]!,
      since: now,
    };
    s.moveCount = input.moves.length;
  }
  if (s.pending) {
    const graded = input.points[s.pending.ply] && input.points[s.pending.ply + 1];
    if (graded || now - s.pending.since >= t.gradeWait) {
      events.push(moveEvent(s.pending, input, t));
      s.pending = null;
    }
  }

  // -- threats ---------------------------------------------------------------
  for (const player of ["red", "yellow"] as const) {
    const count = input.immediateThreats[player];
    const rose = count > s.threats[player];
    s.threats[player] = count;
    if (rose && now - s.lastThreatAt[player] >= t.threatCooldown) {
      s.lastThreatAt[player] = now;
      events.push({ kind: "threat", player });
    }
  }

  // -- fever -----------------------------------------------------------------
  const target = feverTarget(input, t);
  const tau = target > s.fever ? t.riseTau : t.fallTau;
  s.fever = clamp01(s.fever + (target - s.fever) * approach(dt, tau));
  s.baseline = s.baseline + (s.fever - s.baseline) * approach(dt, t.baselineTau);

  // -- tension shift ---------------------------------------------------------
  // Fever pulling away from its own slow trail, which is a shift the player can
  // feel; the raw derivative just fires on every frame of a rise. Emitting
  // consumes the gap, so the next one needs a fresh move of the same size.
  const gap = s.fever - s.baseline;
  if (Math.abs(gap) >= t.shiftDelta && now - s.lastShiftAt >= t.shiftCooldown) {
    s.lastShiftAt = now;
    s.baseline = s.fever;
    events.push({ kind: "tension-shift", direction: gap > 0 ? "rising" : "collapsing" });
  }

  // -- the end ---------------------------------------------------------------
  if (!s.ended && input.status !== "playing") {
    s.ended = true;
    if (input.status === "won" && input.winner) {
      // The one sanctioned discontinuity. Everything else about the frame is
      // smoothed; a win is not a mood shift, it's an ending.
      s.fever = 1;
      s.baseline = 1;
      events.push({ kind: "win", player: input.winner, line: [...input.winningLine] });
    } else {
      events.push({ kind: "draw" });
    }
  }

  // -- idle ------------------------------------------------------------------
  // Ambient gags get a hook, but only in the quiet — an idle beat landing on
  // top of a blunder reaction is two gags fighting over one moment.
  if (events.length > 0) s.lastEventAt = now;
  const idlePeriod = input.mode === "attract" ? t.attractIdlePeriod : t.idlePeriod;
  if (
    events.length === 0 &&
    now - s.lastIdleAt >= idlePeriod &&
    now - s.lastEventAt >= t.idleQuiet
  ) {
    s.lastIdleAt = now;
    events.push({ kind: "idle-beat" });
  }

  return { state: s, frame: { fever: s.fever, events, mode: input.mode } };
}

/**
 * Grade a move by what it gave up, on the same axis the review grades drops.
 *
 * `loss` is the mover's advantage before their move minus their advantage
 * after it, which is the value of the move played against the best available —
 * so it's ~0 for a best move and can't go usefully negative. "Brilliant" is
 * therefore not "better than best" but "gave up nothing while the game swung
 * your way since your last turn", which is what a good move actually looks like
 * from the outside.
 *
 * The grade is `estimated` in every live game (the feed only proves a finished
 * one), so per PLAN.md's product truths a gag hanging off `quality` may hedge
 * but may never declare that a move lost the game.
 */
function moveEvent(
  pending: PendingMove,
  input: DirectorInput,
  t: DirectorTuning,
): SpectacleEvent {
  const sign = pending.player === "red" ? 1 : -1;
  const before = input.points[pending.ply];
  const after = input.points[pending.ply + 1];
  const previous = input.points[pending.ply - 1];

  let quality: "brilliant" | "fine" | "dubious" | "blunder" = "fine";
  if (before && after && before.source !== after.source) {
    // The move ended the game: an estimate on one side, a fact on the other.
    // Subtracting across the two would be arithmetic on different scales — the
    // proven band starts above anything an estimate can reach, on purpose — so
    // read the outcome instead of the difference.
    quality = sign * after.advantage > 0 ? "brilliant" : "fine";
  } else if (before && after) {
    const loss = sign * (before.advantage - after.advantage);
    const swing = previous ? sign * (after.advantage - previous.advantage) : 0;
    if (loss >= t.blunderLoss) quality = "blunder";
    else if (loss >= t.dubiousLoss) quality = "dubious";
    else if (loss <= t.brilliantSlack && swing >= t.brilliantSwing) quality = "brilliant";
  }

  return { kind: "move", player: pending.player, col: pending.col, quality };
}

/** Fraction of the remaining distance to cover in `dt`, for time constant `tau`. */
const approach = (dt: number, tau: number): number =>
  tau <= 0 ? 1 : 1 - Math.exp(-Math.max(0, dt) / tau);

const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x);
