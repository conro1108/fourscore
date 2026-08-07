/**
 * Tiny cross-component theater signals that aren't game state and don't
 * deserve a store subscription: the camera reads these inside useFrame.
 */
export const stageFx = {
  /** performance.now() of the last disc impact; the camera dips for a beat. */
  lastLandAt: 0,
};
