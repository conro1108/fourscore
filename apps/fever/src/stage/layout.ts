/**
 * Variant geometry → world geometry. Pure, and the only place stage dimensions
 * come from: board plates, disc positions, camera framing, prop placement
 * (later) all read this. Nothing downstream may hardcode a 7x6 — geometry is a
 * value (repo law), and both variants ship.
 *
 * World units: one board cell = 1 unit. Origin at the board's center; +y up,
 * +z toward the camera. Discs live in the slot around z = 0.
 */

import type { Variant } from "@fourscore/engine";

export interface StageLayout {
  variant: Variant;
  /** Playable field size in world units. */
  boardW: number;
  boardH: number;
  /** Outer frame size (field + border). */
  frameW: number;
  frameH: number;
  border: number;
  discRadius: number;
  holeRadius: number;
  discThickness: number;
  /** Extrusion depth of each face plate. */
  plateDepth: number;
  /** z of the front plate's back face; the slot the discs fall through. */
  slotHalf: number;
  /** Where a disc spawns (and the hover ghost floats): above the frame's top. */
  dropY: number;
  /** World x of a column's center. */
  xOf(col: number): number;
  /** World y of a row's center, bottom-up (row 0 rests on the floor). */
  yOf(row: number): number;
}

export function layoutFor(variant: Variant): StageLayout {
  const { width, height } = variant;
  const border = 0.62;
  const boardW = width;
  const boardH = height;
  return {
    variant,
    boardW,
    boardH,
    frameW: boardW + border * 2,
    frameH: boardH + border * 2,
    border,
    discRadius: 0.41,
    holeRadius: 0.44,
    discThickness: 0.3,
    plateDepth: 0.16,
    slotHalf: 0.24,
    dropY: boardH / 2 + border + 0.85,
    xOf: (col) => col - (width - 1) / 2,
    yOf: (row) => row - (height - 1) / 2,
  };
}

/**
 * What the camera looks at, and what it orbits around: the board's center,
 * nudged up so the frame sits a touch low. Not variant-derived — the board is
 * centered on the origin at every size. The void reads this too, because it
 * has to hang behind the board along whatever axis the camera is on.
 */
export const CAMERA_TARGET: [number, number, number] = [0, 0.1, 0];

/**
 * Camera distance that fits the frame (plus breathing room) in the frustum at
 * this aspect ratio *and* this orbit.
 *
 * Straight on, that's whichever of width or height is binding. Turned, it
 * isn't: the board's near edge comes toward the camera, so the frame it needs
 * grows even though the board's world size hasn't changed — at the yaw stop
 * the old distance clipped the top off the plate. So each corner of the padded
 * rect is measured in the camera's own basis: how far along the view axis it
 * sits, and how far off it. A corner `a` along the axis and `p` off it fits
 * only if the camera is at least `a + p / tan(half fov)` away.
 *
 * With yaw and pitch at zero this reduces to exactly the two-term version it
 * replaces — the resting frame, which everything from the thesis screenshot to
 * the void's tuning is authored against, is unchanged by construction.
 */
export function fitDistance(
  layout: StageLayout,
  fovDeg: number,
  aspect: number,
  yaw = 0,
  pitch = 0,
  pad = { x: 1.35, y: 1.55 },
): number {
  const tanV = Math.tan((fovDeg * Math.PI) / 360);
  const tanH = tanV * aspect;
  const halfW = layout.frameW / 2 + pad.x;
  const halfH = layout.frameH / 2 + pad.y;

  // The camera's basis at this orbit: `u` from the board toward the camera,
  // `right`/`up` spanning the film plane. Same construction as three's lookAt
  // with a +y world up, which is what the rig uses.
  const cp = Math.cos(pitch);
  const u: Vec3 = [Math.sin(yaw) * cp, Math.sin(pitch), Math.cos(yaw) * cp];
  const right: Vec3 = [Math.cos(yaw), 0, -Math.sin(yaw)];
  const up = cross(u, right);

  let dist = 0;
  for (const sx of [-1, 1]) {
    for (const sy of [-1, 1]) {
      const corner: Vec3 = [sx * halfW, sy * halfH, 0];
      const along = dot(corner, u);
      dist = Math.max(
        dist,
        along + Math.abs(dot(corner, right)) / tanH,
        along + Math.abs(dot(corner, up)) / tanV,
      );
    }
  }
  return dist;
}

type Vec3 = [number, number, number];
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
