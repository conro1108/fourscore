/**
 * Drag-to-orbit: the only camera control the player gets.
 *
 * Pure state, no DOM and no three — the stage feeds it pointer coordinates and
 * the camera rig reads two angles off it. That split is what makes the throw
 * and the clamps testable, and it keeps the framing rules (fit distance, sway,
 * land flinch) where they already are.
 *
 * Two things the naive version gets wrong and this one doesn't:
 *
 * - **A drag ends in a click.** The browser fires one on pointerup whether or
 *   not the pointer travelled, so rotating the board would also drop a disc.
 *   A press only becomes a drag past `SLOP_PX`, and `dragged` stays true
 *   through the click that follows so the column input can ignore it.
 * - **Velocity is measured in `step`, not `move`.** A pointer delta doesn't
 *   know how long it took; only the frame loop does. Measuring it here also
 *   means holding the pointer still for a beat before letting go releases
 *   nothing, which is what a hand expects.
 */

export interface OrbitLimits {
  /** Maximum yaw either side of the authored front view, in radians. */
  yaw: number;
  pitchMin: number;
  pitchMax: number;
}

/**
 * Far enough to read as a real object with a slot and a thickness; not so far
 * that the board turns into an edge or the props show their backs. Pitch is
 * asymmetric because looking down the columns is the interesting direction —
 * from below you mostly see the underside of discs.
 */
export const ORBIT_LIMITS: OrbitLimits = { yaw: 0.95, pitchMin: -0.4, pitchMax: 0.7 };

/** Radians per pixel. A ~200px drag crosses the whole yaw range. */
const YAW_PER_PX = 0.0046;
const PITCH_PER_PX = 0.0034;
/** A press that never travels this far is a move, not a camera drag. */
const SLOP_PX = 5;
/**
 * e-folds per second of a released spin. Heavier than a typical 3D viewer on
 * purpose: a throw coasts `velocity / FRICTION` radians, and the whole yaw
 * range here is 1.9 — anything glidier means every flick pins the camera to a
 * stop instead of landing where the hand meant.
 */
const FRICTION = 12;
/** Below this the spin is over — stops the camera creeping for ever. */
const STILL = 0.02;

/**
 * How close the player may pull the board in, as a fraction of the authored fit
 * distance. One is the framing the layout chose; there is no number above it,
 * because pulling *back* would replace the authored composition rather than
 * move around inside it — the same reason there's no pan.
 *
 * The near stop is where the board fills the frame, and it's arithmetic rather
 * than taste: `fitDistance` pads the frame by 1.35 world units either side, so
 * the visible half-width is (frameW/2 + 1.35)·zoom and the board's own half
 * width is frameW/2. On Connect 4 those meet at 0.75. Closer than that and the
 * outer columns are off screen, which the first attempt (0.5) did — it looked
 * like a bug in the layout, not like a zoom.
 */
const ZOOM_MIN = 0.75;
const ZOOM_MAX = 1;

export interface Orbit {
  /** Camera angles relative to the authored front view, in radians. */
  yaw: number;
  pitch: number;
  /** Multiplier on the authored fit distance. 1 is the framing as designed. */
  zoom: number;
  /** Between press and release. */
  dragging: boolean;
  /** This gesture passed the slop: the click it ends is not a move. */
  dragged: boolean;
  /** Two fingers are down; single-pointer orbiting is suspended. */
  pinching: boolean;
  press(x: number, y: number): void;
  move(x: number, y: number): void;
  release(): void;
  /**
   * The distance between two fingers, in pixels. The first call of a gesture
   * takes the reference; every one after it is measured against that, so the
   * board tracks the fingers rather than accumulating drift.
   */
  pinch(span: number): void;
  endPinch(): void;
  /** Wheel and trackpad. Above 1 pulls back, below 1 pushes in. */
  zoomBy(factor: number): void;
  /** Advance the throw. Called once per frame with the frame delta in seconds. */
  step(dt: number): void;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export function createOrbit(limits: OrbitLimits = ORBIT_LIMITS): Orbit {
  let lastX = 0;
  let lastY = 0;
  let startX = 0;
  let startY = 0;
  // Travel since the last frame, waiting to be turned into a velocity.
  let pendingYaw = 0;
  let pendingPitch = 0;
  let velYaw = 0;
  let velPitch = 0;
  // The finger span and the zoom the current pinch started from.
  let pinchFrom = 0;
  let zoomFrom = 1;

  const clampYaw = (v: number) => clamp(v, -limits.yaw, limits.yaw);
  const clampPitch = (v: number) => clamp(v, limits.pitchMin, limits.pitchMax);

  const orbit: Orbit = {
    yaw: 0,
    pitch: 0,
    zoom: 1,
    dragging: false,
    dragged: false,
    pinching: false,

    press(x, y) {
      orbit.dragging = true;
      orbit.dragged = false;
      startX = lastX = x;
      startY = lastY = y;
      // Catching a spinning board stops it.
      velYaw = velPitch = 0;
      pendingYaw = pendingPitch = 0;
    },

    move(x, y) {
      // A two-finger gesture is a pinch, not a drag: letting the first finger
      // also turn the board makes the zoom feel like it's fighting you.
      if (!orbit.dragging || orbit.pinching) return;
      const dx = x - lastX;
      const dy = y - lastY;
      lastX = x;
      lastY = y;
      // Motion delivered while still under the slop is dropped rather than
      // banked, so a press that turns into a drag doesn't start with a jerk.
      if (!orbit.dragged && Math.hypot(x - startX, y - startY) < SLOP_PX) return;
      orbit.dragged = true;
      // Drag right, board turns right — so the camera goes left.
      const yaw = clampYaw(orbit.yaw - dx * YAW_PER_PX);
      const pitch = clampPitch(orbit.pitch + dy * PITCH_PER_PX);
      // Bank the travel that actually happened, so dragging into a limit
      // builds no throw to release.
      pendingYaw += yaw - orbit.yaw;
      pendingPitch += pitch - orbit.pitch;
      orbit.yaw = yaw;
      orbit.pitch = pitch;
    },

    release() {
      orbit.dragging = false;
    },

    pinch(span) {
      if (span <= 0) return;
      if (!orbit.pinching) {
        orbit.pinching = true;
        // The gesture that ends this can't be allowed to drop a disc, and it
        // never travelled far enough for the slop to notice.
        orbit.dragged = true;
        velYaw = velPitch = 0;
        pendingYaw = pendingPitch = 0;
        pinchFrom = span;
        zoomFrom = orbit.zoom;
        return;
      }
      // Fingers spreading means the board comes closer, which is a *smaller*
      // camera distance.
      orbit.zoom = clamp((zoomFrom * pinchFrom) / span, ZOOM_MIN, ZOOM_MAX);
    },

    endPinch() {
      orbit.pinching = false;
    },

    zoomBy(factor) {
      orbit.zoom = clamp(orbit.zoom * factor, ZOOM_MIN, ZOOM_MAX);
    },

    step(dt) {
      if (dt <= 0) return;
      if (orbit.dragging) {
        velYaw = pendingYaw / dt;
        velPitch = pendingPitch / dt;
        pendingYaw = pendingPitch = 0;
        return;
      }
      if (velYaw === 0 && velPitch === 0) return;
      const decay = Math.exp(-FRICTION * dt);
      const yaw = clampYaw(orbit.yaw + velYaw * dt);
      const pitch = clampPitch(orbit.pitch + velPitch * dt);
      // Unchanged means the limit ate it; a throw doesn't bounce.
      velYaw = yaw === orbit.yaw ? 0 : velYaw * decay;
      velPitch = pitch === orbit.pitch ? 0 : velPitch * decay;
      orbit.yaw = yaw;
      orbit.pitch = pitch;
      if (Math.abs(velYaw) < STILL) velYaw = 0;
      if (Math.abs(velPitch) < STILL) velPitch = 0;
    },
  };

  return orbit;
}
