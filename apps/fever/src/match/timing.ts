/**
 * Drop theater as pure math, so the taste-law timing rules are testable.
 *
 * The rules (VISION.md): timing is hard-edged. The disc falls under heavy
 * gravity — noticeably faster than polite UI physics — hits once, takes one
 * crisp bounce, and stops dead. No easing curves anywhere in here; the fall is
 * a real parabola and the squash is a hard step function, because "stepped"
 * reads as a choice and "eased" reads as a framework default.
 */

/** World units are board cells. ~2.4x the gravity that would feel documentary. */
const GRAVITY = 130; // cells / s²
/** One bounce, small and sharp. Zero would read as the disc gluing itself on. */
const RESTITUTION = 0.22;

export interface DropPlan {
  /** ms from release until the disc is settled for good. */
  durationMs: number;
  /** ms from release until first impact — the squash hangs off this. */
  impactMs: number;
  /** World y at time t (ms). Clamped to the resting y after `durationMs`. */
  yAt(tMs: number): number;
}

export function planDrop(startY: number, restY: number): DropPlan {
  const fall = Math.max(0, startY - restY);
  const tFall = Math.sqrt((2 * fall) / GRAVITY); // seconds
  const vImpact = GRAVITY * tFall;
  const vBounce = vImpact * RESTITUTION;
  const tBounce = (2 * vBounce) / GRAVITY;
  const impactMs = tFall * 1000;
  const durationMs = (tFall + tBounce) * 1000;

  return {
    durationMs,
    impactMs,
    yAt(tMs: number): number {
      const t = tMs / 1000;
      if (t <= 0) return startY;
      if (t < tFall) return startY - 0.5 * GRAVITY * t * t;
      const tb = t - tFall;
      if (tb < tBounce) {
        return restY + vBounce * tb - 0.5 * GRAVITY * tb * tb;
      }
      return restY;
    },
  };
}

export interface Squash {
  /** Horizontal scale (world x). */
  x: number;
  /** Vertical scale (world y). */
  y: number;
}

/**
 * Impact squash as three hard steps: flat smack, slight over-correct, done.
 * Stepped on purpose — see the module comment.
 */
export function squashAt(tMs: number, impactMs: number): Squash {
  const dt = tMs - impactMs;
  if (dt < 0) return { x: 1, y: 1 };
  if (dt < 60) return { x: 1.14, y: 0.78 };
  if (dt < 120) return { x: 0.97, y: 1.05 };
  return { x: 1, y: 1 };
}
