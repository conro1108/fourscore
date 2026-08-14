/**
 * The fever director, exe's lighter derivation of fever's (DIRECTION.md says
 * port or derive; this desktop needs one number and its tier, not a feed).
 *
 * One fever value 0..1 drives every degradation. The axis is the OS degrading
 * as the position sharpens: the eval feed's |advantage| is most of the
 * target, game progress leans on it, and the endgame events shove it. The
 * value moves continuously (the fires scale continuously by law); *tiers* are
 * the discrete states of the desktop, and crossing one is an event.
 *
 * An end-of-game shove is a moment, not a state. It holds its target long
 * enough to be the biggest thing the machine has announced, and then the
 * desktop is allowed to come down — otherwise a sharp game leaves you parked
 * at tier 4 with the screensaver on top of the next one.
 *
 * Pure — no DOM, no timers of its own — so it's testable and the subsystems
 * that read it stay honest (they read, they never match state).
 */

export interface DirectorSnapshot {
  fever: number;
  tier: number;
}

export type FeverEvent = "win" | "loss" | "draw" | "forfeit" | "newGame";

export const tierOf = (fever: number): number =>
  fever >= 1 ? 4 : fever >= 0.75 ? 3 : fever >= 0.5 ? 2 : fever >= 0.25 ? 1 : 0;

/** How fast fever climbs and cools, per second. While a game is live rising is
    easier by design; once it's over the desktop cools at COOL instead, which is
    the only rate fast enough to read as the fever letting go. */
const RISE = 0.035;
const FALL = 0.01;
const COOL = 0.05;
const BASE = 0.08;

/** Seconds an end-of-game target stands before the desktop starts cooling.
    A win holds through its cascade and its screensaver; a loss holds long
    enough that stewing on it still escalates. */
const HOLD: Record<Exclude<FeverEvent, "newGame">, number> = {
  win: 12,
  loss: 22,
  draw: 6,
  forfeit: 6,
};

export interface Director {
  /** The live eval feed: red-POV advantage after `ply` of `cells` moves. */
  feedEval(advantage: number, ply: number, cells: number): void;
  event(e: FeverEvent): void;
  /** Advance time. Returns the snapshot if fever or tier moved. */
  step(dtSeconds: number): DirectorSnapshot | null;
  /** Harness override: pin fever to a value (null unpins). */
  pin(fever: number | null): void;
  snapshot(): DirectorSnapshot;
}

export function makeDirector(): Director {
  let fever = 0;
  let target = BASE;
  let pinned: number | null = null;
  let lastTier = 0;
  /** Seconds the current end-of-game target still stands. */
  let hold = 0;
  /** Above where we should be now that the game is over — come down fast. */
  let cooling = false;

  const clamp = (v: number): number => Math.max(0, Math.min(1, v));

  function snapshot(): DirectorSnapshot {
    const f = pinned ?? fever;
    return { fever: f, tier: tierOf(f) };
  }

  return {
    feedEval(advantage, ply, cells) {
      if (hold > 0) return; // the endgame owns the target while it holds
      const sharp = Math.min(1, Math.abs(advantage));
      const progress = cells > 0 ? ply / cells : 0;
      target = clamp(BASE + 0.55 * sharp + 0.3 * progress ** 1.5);
    },
    event(e) {
      switch (e) {
        case "win":
          fever = Math.max(fever, 0.8);
          target = 1;
          hold = HOLD.win;
          break;
        case "loss":
          // losing goes low, not loud: coals now, escalation only if you stew
          fever = Math.max(fever, 0.45);
          target = 0.85;
          hold = HOLD.loss;
          break;
        case "draw":
        case "forfeit":
          target = Math.min(target, 0.4);
          hold = HOLD[e];
          break;
        case "newGame":
          target = BASE;
          hold = 0;
          cooling = true; // a fresh board doesn't inherit the last one's fever
          break;
      }
    },
    step(dt) {
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
      const after = snapshot();
      const moved = after.fever !== before.fever || after.tier !== lastTier;
      lastTier = after.tier;
      return moved ? after : null;
    },
    pin(f) {
      pinned = f;
    },
    snapshot,
  };
}
