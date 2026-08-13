/**
 * The release tray — the Connect 4 slider, as shared state and pure math.
 *
 * The board's floor is a sliding tray with a handle sticking out its right
 * side, exactly like the toy. Pulling the handle slides the floor open from
 * the left; a column's discs let go the moment the opening clears them, so the
 * board pours out left-to-right as you pull. That geometry is what makes the
 * gesture read as *emptying a physical object* rather than pressing reset.
 *
 * The tray object is mutable, per-stage (the preview grid mounts many stages),
 * and read inside useFrame by everything that moves with it: the rail mesh,
 * the handle, and every settled disc. No store, no re-renders — same pattern
 * as `stageFx`, but instanced.
 *
 * Once any disc has been let out there is no putting it back — the toy works
 * that way too — so passing the first occupied column commits the release:
 * let go of the handle and the tray finishes opening on its own.
 */

import type { StageLayout } from "./layout.js";

export interface Tray {
  /** 0 closed .. 1 fully open. Visual truth for the rail, handle and discs. */
  pull: number;
  /** A pointer holds the handle right now. */
  grabbed: boolean;
  /** A disc is out; the release finishes whether or not the hand stays. */
  committed: boolean;
}

export const createTray = (): Tray => ({ pull: 0, grabbed: false, committed: false });

/**
 * The pull at which the tray's opening clears a column and its discs let go.
 * The tray slides right by `pull * frameW`, so the opening grows from the left
 * frame edge; a disc is free once its right edge is past the tray's left end.
 */
export function pullToFree(layout: StageLayout, col: number): number {
  const edge = layout.xOf(col) + layout.discRadius + layout.frameW / 2;
  return Math.min(1, edge / layout.frameW);
}

/** The pull past which a release is committed: the first occupied column falls. */
export function commitPull(layout: StageLayout, occupiedCols: readonly number[]): number {
  if (occupiedCols.length === 0) return Infinity;
  return pullToFree(layout, Math.min(...occupiedCols));
}

/** Same heavy gravity the drop uses (match/timing.ts), in cells/s². */
export const EXIT_GRAVITY = 130;

/** How far below the frame a falling disc is gone for good. */
export const EXIT_DEPTH = 6;

/** Tray travel per second once a release runs itself (committed or auto). */
export const AUTO_PULL_RATE = 2.6;
