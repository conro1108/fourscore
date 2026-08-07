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
 * Camera distance that fits the frame (plus breathing room) in the frustum,
 * whichever of width or height is binding at this aspect ratio.
 */
export function fitDistance(
  layout: StageLayout,
  fovDeg: number,
  aspect: number,
  pad = { x: 1.35, y: 1.55 },
): number {
  const halfV = Math.tan((fovDeg * Math.PI) / 360);
  const halfH = halfV * aspect;
  const needV = (layout.frameH / 2 + pad.y) / halfV;
  const needH = (layout.frameW / 2 + pad.x) / halfH;
  return Math.max(needV, needH);
}
