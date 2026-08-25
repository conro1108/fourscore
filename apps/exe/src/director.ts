/**
 * Fever director: one smoothed number (fever) and its tier, plus discrete
 * beats answering each ply. Pure — no DOM, no timers — so `tools/trace.ts`
 * can replay real games through it at wall-clock rates. Subsystems read it;
 * they never match state themselves. See DIRECTION.md § fever.
 */

export interface DirectorSnapshot {
  fever: number;
  tier: number;
}

/** `dismissed` and `newGame` both end the endgame shove; `newGame` also
    wipes the last game's throttles. */
export type FeverEvent = "win" | "loss" | "draw" | "forfeit" | "newGame" | "dismissed";

/** Beats between tier crossings. `by` is always from the player's POV. */
export type Beat =
  | { kind: "move"; by: "you" | "bot"; grade: MoveGrade }
  | { kind: "threat"; by: "you" | "bot" }
  | { kind: "swing"; direction: "rising" | "collapsing" };

export type MoveGrade = "brilliant" | "fine" | "dubious" | "blunder";

export const tierOf = (fever: number): number =>
  fever >= 1 ? 4 : fever >= 0.75 ? 3 : fever >= 0.5 ? 2 : fever >= 0.25 ? 1 : 0;

/** Rates per second. Rising is easier than falling while live; after the game
    the desktop cools at COOL. RISE 0.035 put a 21s floor under tier 3 and 29s
    under tier 4, slower than the target ever moved — don't lower it. */
const RISE = 0.06;
const FALL = 0.012;
const COOL = 0.05;
const BASE = 0.08;

/** Mid-game `|advantage|` is a 0..0.5 axis (`advantageOf` caps estimates at
    `ESTIMATE_CEILING`); reading it as 0..1 left two games in three peaking at
    fever 0.38. */
const SHARP_REF = 0.5;

/** Gamma so the median ply reads quiet. Measured |advantage| p50 0.15 / p75
    0.28 / p90 0.40; gamma puts p50 at 0.16 sharpness, p90 at 0.72. */
const SHARP_GAMMA = 1.5;

/** Disc-count ramp, linear on purpose (power curves made a level game not
    escalate). Raises the base rather than adding to drive, so a full board
    can't push past 1. 0.62 so a filled board lands in tier 3 — tier 4 belongs
    to the endgame shove. */
const FLOOR_MAX = 0.62;

/** Live-target ceiling. Only `event()` may ask for 1: a seen-but-unproved
    mate scores 0.50-0.56, which pins sharpness at 1 plies before the game
    ends, and tier 4 mid-game is fire over a board still being played. */
const LIVE_MAX = 0.95;

/** Seconds an end-of-game target holds before cooling on its own — a
    backstop for a player who walks away; `dismissed` cuts it short. */
const HOLD: Record<Exclude<FeverEvent, "newGame" | "dismissed">, number> = {
  win: 12,
  loss: 22,
  draw: 6,
  forfeit: 6,
};

/** Beat thresholds on the -1..1 `advantage` axis. `loss` is ~0 for a best
    move and never usefully negative, so "brilliant" = gave up nothing while
    the game swung your way. */
const BLUNDER_LOSS = 0.3;
const DUBIOUS_LOSS = 0.18;
const BRILLIANT_SWING = 0.18;
const BRILLIANT_SLACK = 0.05;

/** Swing = fever's gap from its slow trail (the raw derivative fires every
    frame of a rise). */
const SWING_DELTA = 0.11;
const SWING_COOLDOWN = 14;
const BASELINE_TAU = 9;
const THREAT_COOLDOWN = 8;
/** Min gap between beats. Two windows: `fine` fires on ~40% of plies, and a
    single gate let it swallow a threat beat. */
const BEAT_QUIET = 5;
const BEAT_QUIET_URGENT = 1.5;

const isUrgent = (b: Beat): boolean => b.kind !== "move" || b.grade !== "fine";

/** Tiers are sticky on the way down (a traced draw crossed 0.25 five times in
    20s); rising has no margin. */
const TIER_FLOOR = [0, 0.25, 0.5, 0.75, 1] as const;
const TIER_HYSTERESIS = 0.05;

export interface PlyInput {
  mover: "you" | "bot";
  /** Winning columns the player to move could play *right now*. */
  threats: number;
}

export interface Director {
  /** Red-POV advantage after `ply` of `cells` moves. `source` is load-bearing:
      proven plies are never graded. */
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
  let heldTier = 0;
  /** Seconds the current end-of-game target still stands. */
  let hold = 0;
  /** Game over and above target — come down at COOL. */
  let cooling = false;

  /** Own clock from `step`; never reads a wall clock. */
  let time = 0;
  let queue: Beat[] = [];
  let baseline = 0;
  let lastBeatAt = -Infinity;
  let lastSwingAt = -Infinity;
  const lastThreatAt: Record<"you" | "bot", number> = { you: -Infinity, bot: -Infinity };
  let prevAdvantage: number | null = null;
  /** Estimate as of the mover's previous turn, for the brilliant swing. */
  let priorAdvantage: number | null = null;
  let lastMover: "you" | "bot" | null = null;
  let over = false;

  const clamp = (v: number): number => Math.max(0, Math.min(1, v));

  function settleTier(): void {
    while (heldTier < 4 && fever >= TIER_FLOOR[heldTier + 1]!) heldTier++;
    while (heldTier > 0 && fever < TIER_FLOOR[heldTier]! - TIER_HYSTERESIS) heldTier--;
  }

  function snapshot(): DirectorSnapshot {
    // Pinned bypasses stickiness — `?fever=` walks exact tiers.
    if (pinned !== null) return { fever: pinned, tier: tierOf(pinned) };
    return { fever, tier: heldTier };
  }

  function raise(b: Beat): void {
    if (over) return;
    if (time - lastBeatAt < (isUrgent(b) ? BEAT_QUIET_URGENT : BEAT_QUIET)) return;
    lastBeatAt = time;
    queue.push(b);
  }

  /** `time` keeps running, so cooldowns are cleared, not rewound. */
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
      // Proven (±1) sits above the estimate band; subtracting across scales is
      // meaningless, so the last ply is never graded.
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

      if (hold > 0) return; // endgame owns the target
      const sharp = Math.pow(Math.min(1, Math.abs(advantage) / SHARP_REF), SHARP_GAMMA);
      const progress = cells > 0 ? ply / cells : 0;
      const floor = FLOOR_MAX * progress;
      const drive = BASE + (1 - BASE) * sharp;
      target = Math.min(LIVE_MAX, clamp(floor + (1 - floor) * drive));
    },

    feedPly({ mover, threats: count }) {
      lastMover = mover;
      // A live threat belongs to whoever is about to move. Cooldown, not an
      // edge test, throttles repeats — a threat that survives is still one.
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
          // losing goes low, not loud
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
        case "dismissed":
          // Mid-game a stray dismissal must not cool a live position.
          if (!over) break;
          hold = 0;
          target = BASE;
          cooling = true;
          break;
        case "newGame":
          target = BASE;
          hold = 0;
          cooling = true;
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
      if (cooling && fever <= target) cooling = false;
      const d = target - fever;
      const fall = cooling ? COOL : FALL;
      fever = clamp(fever + Math.max(-fall * dt, Math.min(RISE * dt, d)));

      // Emitting a swing consumes the gap.
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
