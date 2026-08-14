/**
 * The release slider — the Connect 4 locking bar, as shared state and pure math.
 *
 * The real toy's floor is not a drawer. It is a flat plastic ladder: a strip
 * with rectangular slots cut along it at exactly the column pitch, so that in
 * its resting position a solid rung sits under every column and the discs stand
 * on the rungs. Pull the tab an inch and the whole ladder shifts *half a
 * column*, which puts the slots under the columns and the rungs under the walls
 * between them. The floor doesn't move out of the way — it changes phase. Every
 * disc on the board loses its support in the same instant, which is where the
 * clatter comes from.
 *
 * So the numbers here are all lattice numbers. The cell pitch is 1 world unit
 * (`layout.ts`), the ladder's period is that same 1, and the travel is half of
 * it. A rung has to be narrow enough that the slot beside it passes a disc —
 * which caps it at `1 - 2 * discRadius` — and that same fact makes the release
 * happen at the very end of the pull, when the last of the rung finally clears
 * the last of the disc.
 *
 * The slider object is mutable, per-stage (the preview grid mounts many
 * stages), and read inside useFrame by everything that moves with it: the
 * rungs, the handle, and every settled disc. No store, no re-renders — same
 * pattern as `stageFx`, but instanced.
 *
 * Once the discs are out there is no putting them back, and a bar that has
 * passed its detent doesn't wait for the hand — see `COMMIT_PULL`.
 */

import type { StageLayout } from "./layout.js";

export interface Slider {
  /** 0 locked .. 1 aligned. Multiply by `BAR_TRAVEL` for world units. */
  pull: number;
  /** A pointer holds the handle right now. */
  grabbed: boolean;
  /** Past the detent; the pull finishes whether or not the hand stays. */
  committed: boolean;
}

export const createSlider = (): Slider => ({ pull: 0, grabbed: false, committed: false });

/**
 * Lateral travel from locked to aligned, in world units: half a cell. Not a
 * tuning knob — it is the distance from a rung's centre to the slot's centre,
 * and any other value leaves the floor half-open.
 */
export const BAR_TRAVEL = 0.5;

/** Slack between a disc's edge and the slot it drops through, each side. */
const SLOT_PLAY = 0.015;

/**
 * How wide one rung is. The slot beside it has to pass a disc, and rung + slot
 * has to come to exactly one cell or the ladder stops lining up with the grid
 * a few columns along — so the disc's diameter sets this, not taste. On the
 * shipped boards that's a thin picket (0.15 of a cell), which is what the real
 * bar looks like from underneath too.
 */
export const rungWidth = (layout: StageLayout): number =>
  1 - 2 * (layout.discRadius + SLOT_PLAY);

/**
 * The height of the bar's own body. Most of the frame's bottom border, because
 * a mechanism you have to hunt for isn't one: the rungs have to be big enough
 * on screen to see which side of the column they're on.
 */
export const BAR_H = 0.44;

/** y of the rungs' top face: the surface the bottom row of discs stands on. */
export const floorY = (layout: StageLayout): number => layout.yOf(0) - layout.discRadius;

/**
 * The pull at which the rungs have cleared the discs and the board lets go.
 * The same number for every column — that's the whole mechanism — and it lands
 * near the end of the travel, because a rung goes on holding its disc until the
 * last sliver of it has slid past the disc's edge.
 */
export const releasePull = (layout: StageLayout): number =>
  Math.min(1, (layout.discRadius + rungWidth(layout) / 2) / BAR_TRAVEL);

/**
 * The detent. Past this the bar has been shoved far enough that it finishes on
 * its own: the toy's rungs are already half out from under the stack and the
 * hand is no longer what's holding the game together.
 */
export const COMMIT_PULL = 0.7;

/** The detent pull — never, on an empty board, where there is nothing to spill. */
export const commitPull = (occupiedCols: readonly number[]): number =>
  occupiedCols.length === 0 ? Infinity : COMMIT_PULL;

/**
 * The band cut through the front plate so the mechanism is visible: the bar
 * rides in a channel under the bottom row, and a slider you can't see is just a
 * button that lies about being a slider. Kept clear of the bottom holes (and of
 * their eyelets) above, and stopping short of the frame's bottom edge so the
 * board keeps a lip to stand on.
 */
export interface BarWindow {
  top: number;
  bottom: number;
  /** Half-width: the playfield exactly, so the bar's ends stay behind the border. */
  halfW: number;
}

export const barWindow = (layout: StageLayout): BarWindow => ({
  top: layout.yOf(0) - layout.holeRadius - 0.06,
  bottom: -layout.frameH / 2 + 0.14,
  halfW: layout.boardW / 2,
});

/** Same heavy gravity the drop uses (match/timing.ts), in cells/s². */
export const EXIT_GRAVITY = 130;

/** How far below the frame a falling disc is gone for good. */
export const EXIT_DEPTH = 6;

/**
 * How long each row waits behind the one under it on the way out. Physically
 * they all lose their floor at once; in a real board they also shoulder past
 * each other on the way through, and a stack that leaves in perfect lockstep
 * reads as one rigid object being lowered.
 */
export const EXIT_STAGGER = 0.012;

/** Bar travel per second once a release runs itself (committed or auto). */
export const AUTO_PULL_RATE = 3.4;
