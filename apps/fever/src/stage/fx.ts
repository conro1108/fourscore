import type { Slider } from "./release.js";

/**
 * Tiny cross-component theater signals that aren't game state and don't
 * deserve a store subscription: the camera reads these inside useFrame.
 */
export const stageFx = {
  /** performance.now() of the last disc impact; the camera dips for a beat. */
  lastLandAt: 0,
  /**
   * The act the prop stage started most recently. Nothing in the game reads
   * it — it exists so `tools/live-bots.mjs` can ask the running app which gag
   * it actually chose, which is the one thing about the signature wiring that
   * a unit test can't see (the draw happens against the live Director).
   */
  lastAct: "",
  /**
   * The most recent stage's release slider. Nothing in the game reads it —
   * it's how a scripted run can tell whether a synthetic drag actually grabbed
   * the handle, which no assertion on the move list can see until too late.
   */
  slider: null as Slider | null,
  /**
   * Where that slider's handle is on screen this frame, in CSS pixels. Also
   * nothing the game reads: a scripted drag has to put a real pointer on a
   * mesh, and the alternative is a magic pixel in the tool that goes stale the
   * first time the board changes size.
   */
  handleAt: null as { x: number; y: number } | null,
  /**
   * When each disc lost its floor, one entry per disc. The whole point of the
   * locking bar is that these are all the same instant — a floor that opened
   * column by column would look nearly identical in a screenshot and be the
   * wrong toy — so `tools/live-slider.mjs` reads the spread rather than
   * squinting at a frame. Cleared when the move list changes.
   */
  freed: [] as number[],
};
