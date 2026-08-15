/**
 * The fever director, exe's lighter derivation of fever's (DIRECTION.md says
 * port or derive; this desktop needs one number and its tier, not a feed).
 *
 * Two mechanisms, deliberately not mixed — the same split fever's director
 * makes, because they answer different questions:
 *
 * - **fever** is a smoothed, continuous read of how sharp the position is.
 *   The axis is the OS degrading as the position sharpens. Crossing a *tier*
 *   is a discrete state change of the desktop, and there are only four of them
 *   in a whole game.
 * - **beats** are discrete spikes answering what just happened — a move, a
 *   live threat, the room changing. Four tier crossings over two minutes is
 *   escalation with nothing inside it; the beats are what the desktop does
 *   between them, and every one of them is an answer to a ply rather than
 *   something the screen decided to do on its own.
 *
 * An end-of-game shove is a moment, not a state. It holds its target long
 * enough to be the biggest thing the machine has announced, and then the
 * desktop is allowed to come down — otherwise a sharp game leaves you parked
 * at tier 4 with the screensaver on top of the next one.
 *
 * Pure — no DOM, no timers of its own — so it's testable and the subsystems
 * that read it stay honest (they read, they never match state). `tools/trace.ts`
 * is the other half of that: it replays real games through this file at real
 * wall-clock rates and prints the tier timeline, because a wrong curve does not
 * fail a test, it just looks like a mood.
 */

export interface DirectorSnapshot {
  fever: number;
  tier: number;
}

export type FeverEvent = "win" | "loss" | "draw" | "forfeit" | "newGame";

/**
 * What the desktop answers between tier crossings. `by` is always from the
 * player's point of view — "you" or the opponent — because every reaction
 * hanging off one is addressed to the person at the keyboard.
 */
export type Beat =
  | { kind: "move"; by: "you" | "bot"; grade: MoveGrade }
  | { kind: "threat"; by: "you" | "bot" }
  | { kind: "swing"; direction: "rising" | "collapsing" };

export type MoveGrade = "brilliant" | "fine" | "dubious" | "blunder";

export const tierOf = (fever: number): number =>
  fever >= 1 ? 4 : fever >= 0.75 ? 3 : fever >= 0.5 ? 2 : fever >= 0.25 ? 1 : 0;

/** How fast fever climbs and cools, per second. While a game is live rising is
    easier by design; once it's over the desktop cools at COOL instead, which is
    the only rate fast enough to read as the fever letting go.

    RISE was 0.035, which put a hard 21s floor under the climb to tier 3 and a
    29s one under tier 4 — slower than the target ever moved, so the rate rather
    than the position was setting the pace of the whole game. */
const RISE = 0.06;
const FALL = 0.012;
const COOL = 0.05;
const BASE = 0.08;

/**
 * The live feed's actual range, and the reason this constant has to exist.
 *
 * `engine/worker.ts` scores every mid-game position as `estimated`, and
 * `advantageOf` caps an estimate at `ESTIMATE_CEILING` — 0.5 — with a forced
 * win the evaluator can see but hasn't proved sitting just above it. So
 * `|advantage|` is a 0..0.5 axis and never once a 0..1 one. Reading it as if it
 * were 0..1 (which this file did) spent half the sharpness budget on values the
 * feed cannot produce, and the measured result was two games in three peaking
 * at fever 0.38 — one tier crossing, then nothing until the endgame.
 *
 * fever's director calls the same constant `sharpnessRef` and divides by it for
 * the same reason. This is that, under a shorter name.
 */
const SHARP_REF = 0.5;

/**
 * Gamma on sharpness, so the *median* ply reads as quiet.
 *
 * Measured over bot games at `estimateDepth`, |advantage| runs p50 0.15, p75
 * 0.28, p90 0.40. Straight through `SHARP_REF` that makes the median position
 * 0.3 of the way up the sharpness axis, which is a lot of heat for "nothing has
 * happened yet". The gamma pulls the middle of the distribution down without
 * touching the top: p50 lands at 0.16, p90 stays at 0.72.
 */
const SHARP_GAMMA = 1.5;

/**
 * The disc-count ramp, and it is linear on purpose.
 *
 * This is the thing that makes a long, level game escalate anyway. It was
 * `0.3 * progress ** 1.5`, which is the shape fever's director tried first and
 * threw out — its comment records the whole history: 1.6 was "nothing happens,
 * then the finale", 0.85/0.45 was "a game that only escalated if the eval
 * agreed", and linear-to-0.75 is what it settled on because progress is then a
 * ramp you can feel by itself. exe had inherited the rejected curve and shrunk
 * its ceiling by half on top.
 *
 * It raises the base rather than adding to the drive, so a full board can't push
 * the target past 1 and sharpness keeps its whole range at every stage of the
 * game. 0.62 rather than fever's 0.75 because tier 4 here is the screensaver
 * winning the desktop, and that belongs to the endgame shove — a game that fills
 * the board should arrive at tier 3, not pre-empt its own ending.
 */
const FLOOR_MAX = 0.62;

/**
 * The ceiling on a *live* target, and the reason it can't be 1.
 *
 * Tier 4 is the screensaver taking the desktop, and it belongs to the endgame
 * shove — `event()` is the only thing allowed to ask for 1. `FLOOR_MAX` says
 * as much about the disc ramp, but the ramp was never the way in: sharpness is
 * the way in. `advantageOf` scores a forced win the evaluator can *see* at
 * 0.50-0.56 and `SHARP_REF` is 0.5, so the first ply where the search finds a
 * mate — several plies before the game actually ends — pins sharpness at 1,
 * which drives the target to exactly 1 whatever the floor is. The desktop then
 * pre-empted its own ending: full-screen fire over a board still being played
 * on, with the game's real result still to come.
 *
 * High tier 3 rather than a round number, because a live game that has gone
 * decisive should be sitting right under the ceiling, not comfortably inside.
 */
const LIVE_MAX = 0.95;

/** Seconds an end-of-game target stands before the desktop starts cooling.
    A win holds through its cascade and its screensaver; a loss holds long
    enough that stewing on it still escalates. */
const HOLD: Record<Exclude<FeverEvent, "newGame">, number> = {
  win: 12,
  loss: 22,
  draw: 6,
  forfeit: 6,
};

/**
 * Beat thresholds, on the same -1..1 axis as `advantage`.
 *
 * `loss` is the mover's advantage before their move minus their advantage
 * after it — the value of the move played against the best available — so it is
 * ~0 for a best move and cannot go usefully negative. "Brilliant" is therefore
 * not "better than best" but "gave up nothing while the game swung your way",
 * which is what a good move looks like from the outside.
 */
const BLUNDER_LOSS = 0.3;
const DUBIOUS_LOSS = 0.18;
const BRILLIANT_SWING = 0.18;
const BRILLIANT_SLACK = 0.05;

/**
 * How far fever has to pull away from its own slow trail to count as a swing,
 * and how long before it can say so again. The raw derivative fires on every
 * frame of a rise; the gap against a baseline is a change you can actually feel.
 */
const SWING_DELTA = 0.11;
const SWING_COOLDOWN = 14;
const BASELINE_TAU = 9;
/** A player can only be told about the same live threat so often. */
const THREAT_COOLDOWN = 8;
/**
 * Nothing answers a ply within this of the last answer — the desktop is allowed
 * to be busy, not to machine-gun.
 *
 * Two windows, because one indiscriminate window is worse than none: an
 * ordinary move fires on ~40% of plies, so a single 4s gate meant a `fine` beat
 * three seconds ago could swallow the moment you were one move from losing.
 * Everything except `fine` is something that actually happened, and gets the
 * short window; `fine` is the filler and waits its turn.
 */
const BEAT_QUIET = 5;
const BEAT_QUIET_URGENT = 1.5;

const isUrgent = (b: Beat): boolean => b.kind !== "move" || b.grade !== "fine";

/**
 * Tiers are sticky on the way down.
 *
 * Fever wanders across a boundary in a level game — a traced draw crossed 0.25
 * five times in twenty seconds — and each crossing re-drifts the clock and
 * re-shifts the icons. A tier is a *state* of the desktop; it should take a
 * real retreat to leave one, not a wobble. Rising has no margin, because the
 * desktop getting worse is allowed to be sudden.
 */
const TIER_FLOOR = [0, 0.25, 0.5, 0.75, 1] as const;
const TIER_HYSTERESIS = 0.05;

export interface PlyInput {
  mover: "you" | "bot";
  /** Winning columns the player to move could play *right now*. */
  threats: number;
}

export interface Director {
  /** The live eval feed: red-POV advantage after `ply` of `cells` moves.
      `source` is the engine's own distinction and it is load-bearing here —
      see the grading note below. */
  feedEval(advantage: number, ply: number, cells: number, source?: "proven" | "estimated"): void;
  /** Called the instant a ply commits, before its eval lands. */
  feedPly(input: PlyInput): void;
  event(e: FeverEvent): void;
  /** Advance time. Returns the snapshot if fever or tier moved. */
  step(dtSeconds: number): DirectorSnapshot | null;
  /** Drain the beats raised since the last call. */
  takeBeats(): Beat[];
  /** Harness override: pin fever to a value (null unpins). */
  pin(fever: number | null): void;
  snapshot(): DirectorSnapshot;
}

export function makeDirector(): Director {
  let fever = 0;
  let target = BASE;
  let pinned: number | null = null;
  /** The tier the desktop is actually in — sticky on the way down. */
  let heldTier = 0;
  /** Seconds the current end-of-game target still stands. */
  let hold = 0;
  /** Above where we should be now that the game is over — come down fast. */
  let cooling = false;

  /** The director's own clock, accumulated by `step`, so beats can have
      cooldowns without this file ever reading a wall clock. */
  let time = 0;
  let queue: Beat[] = [];
  /** Slow trail of fever; a `swing` is fever pulling away from it. */
  let baseline = 0;
  let lastBeatAt = -Infinity;
  let lastSwingAt = -Infinity;
  const lastThreatAt: Record<"you" | "bot", number> = { you: -Infinity, bot: -Infinity };
  /** The previous ply's estimate, for grading. Null until one has landed. */
  let prevAdvantage: number | null = null;
  /** The estimate as of the mover's previous turn, for the brilliant swing. */
  let priorAdvantage: number | null = null;
  let lastMover: "you" | "bot" | null = null;
  let over = false;

  const clamp = (v: number): number => Math.max(0, Math.min(1, v));

  /** Move `heldTier` to where `fever` now says it should be, with the drop
      margin applied. Rising is immediate; falling has to mean it. */
  function settleTier(): void {
    while (heldTier < 4 && fever >= TIER_FLOOR[heldTier + 1]!) heldTier++;
    while (heldTier > 0 && fever < TIER_FLOOR[heldTier]! - TIER_HYSTERESIS) heldTier--;
  }

  function snapshot(): DirectorSnapshot {
    // A pinned fever is the harness asking for an exact tier, so it bypasses
    // the stickiness — `?fever=` walks the tiers on purpose.
    if (pinned !== null) return { fever: pinned, tier: tierOf(pinned) };
    return { fever, tier: heldTier };
  }

  /** Raise a beat unless the desktop has only just finished answering. */
  function raise(b: Beat): void {
    if (over) return;
    if (time - lastBeatAt < (isUrgent(b) ? BEAT_QUIET_URGENT : BEAT_QUIET)) return;
    lastBeatAt = time;
    queue.push(b);
  }

  /** A new board is a new world: nothing the last game did throttles this one.
      `time` keeps running, so every cooldown is cleared rather than rewound. */
  function resetGame(): void {
    queue = [];
    baseline = fever;
    prevAdvantage = null;
    priorAdvantage = null;
    lastMover = null;
    lastBeatAt = -Infinity;
    lastSwingAt = -Infinity;
    lastThreatAt.you = -Infinity;
    lastThreatAt.bot = -Infinity;
    over = false;
  }

  return {
    feedEval(advantage, ply, cells, source = "estimated") {
      // A finished game is scored `proven` (±1), and the proven band starts
      // above anything an estimate can reach — on purpose, it is the repo's
      // confidence law. Subtracting across the two would be arithmetic on
      // different scales, so the last ply of a game is never graded; the
      // endgame is already the biggest thing on screen and does not need a
      // move beat underneath it.
      if (source === "proven") {
        prevAdvantage = null;
        priorAdvantage = null;
        return;
      }

      if (prevAdvantage !== null && lastMover !== null) {
        // ply N was played by red when N is odd, and `advantage` is red-POV.
        const sign = ply % 2 === 1 ? 1 : -1;
        const loss = sign * (prevAdvantage - advantage);
        const swing = priorAdvantage !== null ? sign * (advantage - priorAdvantage) : 0;
        let grade: MoveGrade = "fine";
        if (loss >= BLUNDER_LOSS) grade = "blunder";
        else if (loss >= DUBIOUS_LOSS) grade = "dubious";
        else if (loss <= BRILLIANT_SLACK && swing >= BRILLIANT_SWING) grade = "brilliant";
        raise({ kind: "move", by: lastMover, grade });
      }
      priorAdvantage = prevAdvantage;
      prevAdvantage = advantage;

      if (hold > 0) return; // the endgame owns the target while it holds
      const sharp = Math.pow(Math.min(1, Math.abs(advantage) / SHARP_REF), SHARP_GAMMA);
      const progress = cells > 0 ? ply / cells : 0;
      const floor = FLOOR_MAX * progress;
      const drive = BASE + (1 - BASE) * sharp;
      target = Math.min(LIVE_MAX, clamp(floor + (1 - floor) * drive));
    },

    feedPly({ mover, threats: count }) {
      lastMover = mover;
      // The dramatic reading of "a live threat": not a run that could exist
      // eventually, one that lands next turn unless it's answered. So it
      // belongs to whoever is *about* to move, which after your move is the
      // opponent. A threat that survives a turn is still a threat, and the
      // cooldown rather than an edge test is what stops it repeating — being
      // one move from losing for three plies running should keep saying so.
      const waiting = mover === "you" ? "bot" : "you";
      if (count > 0 && time - lastThreatAt[waiting] >= THREAT_COOLDOWN) {
        lastThreatAt[waiting] = time;
        raise({ kind: "threat", by: waiting });
      }
    },

    event(e) {
      switch (e) {
        case "win":
          fever = Math.max(fever, 0.8);
          target = 1;
          hold = HOLD.win;
          over = true;
          break;
        case "loss":
          // losing goes low, not loud: coals now, escalation only if you stew
          fever = Math.max(fever, 0.45);
          target = 0.85;
          hold = HOLD.loss;
          over = true;
          break;
        case "draw":
        case "forfeit":
          target = Math.min(target, 0.4);
          hold = HOLD[e];
          over = true;
          break;
        case "newGame":
          target = BASE;
          hold = 0;
          cooling = true; // a fresh board doesn't inherit the last one's fever
          resetGame();
          break;
      }
      settleTier();
    },

    step(dt) {
      time += dt;
      const before = snapshot();
      if (hold > 0) {
        hold = Math.max(0, hold - dt);
        if (hold === 0) {
          target = BASE;
          cooling = true;
        }
      }
      // cooling is self-limiting: once we're back down to the target the
      // normal, reluctant rules resume
      if (cooling && fever <= target) cooling = false;
      const d = target - fever;
      const fall = cooling ? COOL : FALL;
      fever = clamp(fever + Math.max(-fall * dt, Math.min(RISE * dt, d)));

      // The room changing, measured against fever's own slow trail. Emitting
      // consumes the gap, so the next one needs a fresh move of the same size.
      baseline = baseline + (fever - baseline) * (1 - Math.exp(-dt / BASELINE_TAU));
      const gap = fever - baseline;
      if (Math.abs(gap) >= SWING_DELTA && time - lastSwingAt >= SWING_COOLDOWN) {
        lastSwingAt = time;
        baseline = fever;
        raise({ kind: "swing", direction: gap > 0 ? "rising" : "collapsing" });
      }

      settleTier();
      const after = snapshot();
      const moved = after.fever !== before.fever || after.tier !== before.tier;
      return moved ? after : null;
    },

    takeBeats() {
      const out = queue;
      queue = [];
      return out;
    },

    pin(f) {
      pinned = f;
    },
    snapshot,
  };
}
