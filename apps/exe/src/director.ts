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

/** How fast fever climbs and cools, per second. Rising is easier by design. */
const RISE = 0.035;
const FALL = 0.01;
const BASE = 0.08;

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

  const clamp = (v: number): number => Math.max(0, Math.min(1, v));

  function snapshot(): DirectorSnapshot {
    const f = pinned ?? fever;
    return { fever: f, tier: tierOf(f) };
  }

  return {
    feedEval(advantage, ply, cells) {
      const sharp = Math.min(1, Math.abs(advantage));
      const progress = cells > 0 ? ply / cells : 0;
      target = clamp(BASE + 0.55 * sharp + 0.3 * progress ** 1.5);
    },
    event(e) {
      switch (e) {
        case "win":
          fever = Math.max(fever, 0.8);
          target = 1;
          break;
        case "loss":
          // losing goes low, not loud: coals now, escalation only if you stew
          fever = Math.max(fever, 0.45);
          target = 0.85;
          break;
        case "draw":
        case "forfeit":
          target = Math.min(target, 0.4);
          break;
        case "newGame":
          target = BASE;
          break;
      }
    },
    step(dt) {
      const before = snapshot();
      const d = target - fever;
      fever = clamp(fever + Math.max(-FALL * dt, Math.min(RISE * dt, d)));
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
