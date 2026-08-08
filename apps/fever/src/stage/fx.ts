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
};
