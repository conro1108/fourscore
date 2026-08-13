/**
 * The column hit area and the hover ghost.
 *
 * One plane at the depth the discs live at, not a slab per column: once the
 * camera can orbit, a row of 1x1.4 boxes hands the ray to the column *in front
 * of* the one being pointed at — at 40° that's more than half a cell of error,
 * and the board starts taking moves the player didn't make. Intersecting the
 * disc plane and rounding the x is exact from any angle, and it's less
 * geometry.
 *
 * The ghost snaps from column to column — no tweening between them; snapping
 * is the hard-edged timing rule applied to input affordance.
 */

import { useEffect, useMemo } from "react";
import type { Player } from "@fourscore/engine";
import { coinGeometry } from "./coin.js";
import type { StageLayout } from "./layout.js";
import type { Orbit } from "./orbit.js";
import { useTheme } from "./theme.js";

export function ColumnInput({
  layout,
  orbit,
  onColumn,
  onHover,
}: {
  layout: StageLayout;
  orbit: Orbit;
  onColumn: (col: number) => void;
  onHover: (col: number | null) => void;
}) {
  const { variant, frameW, frameH } = layout;
  // Inverse of `layout.xOf`, which is the only reason this is allowed to know
  // that columns are one unit apart.
  const colAt = (x: number) =>
    Math.max(0, Math.min(variant.width - 1, Math.round(x + (variant.width - 1) / 2)));

  return (
    <mesh
      position={[0, 0.9, 0]}
      onPointerMove={(e) => {
        e.stopPropagation();
        onHover(colAt(e.point.x));
      }}
      onPointerOut={() => onHover(null)}
      onClick={(e) => {
        e.stopPropagation();
        // The click that ends a camera drag is not a move.
        if (orbit.dragged) return;
        onColumn(colAt(e.point.x));
      }}
    >
      {/* Tall enough to cover the drop zone above the frame, where the ghost
          floats and where people aim, and as wide as the frame rather than the
          field — aiming at the border reads as aiming at the end column, and
          the clamp above makes that true. */}
      <planeGeometry args={[frameW, frameH + 3.4]} />
      <meshBasicMaterial transparent opacity={0} depthWrite={false} />
    </mesh>
  );
}

export function GhostDisc({
  layout,
  col,
  player,
  dim = false,
}: {
  layout: StageLayout;
  col: number;
  player: Player;
  /**
   * Spent rather than offered. The review marks two columns at once — what
   * would have held, in the mover's colour, and what they actually played, in
   * the same mud a losing disc is dimmed to. One shape, two readings, and no
   * new palette: the ghost already means "a disc could go here".
   */
  dim?: boolean;
}) {
  // The spent mark is the theme's own pale accent, not the mud a losing disc
  // dims to: mud against a dark void is a mark nobody can see, which was
  // exactly how the first version of this shipped to a screenshot.
  const theme = useTheme();
  const color = dim
    ? theme.discs.ghostSpent
    : player === "red"
      ? theme.discs.red.color
      : theme.discs.yellow.color;
  // The ghost is the same coin, not a stand-in cylinder — a preview whose
  // silhouette differs from the thing it previews is a lie about the shape.
  const geometry = useMemo(
    () => coinGeometry(layout.discRadius, layout.discThickness),
    [layout.discRadius, layout.discThickness],
  );
  useEffect(() => () => geometry.dispose(), [geometry]);
  return (
    <mesh
      geometry={geometry}
      position={[layout.xOf(col), layout.dropY, 0]}
      rotation-x={Math.PI / 2}
    >
      <meshStandardMaterial
        color={color}
        transparent
        opacity={dim ? 0.34 : 0.44}
        depthWrite={false}
      />
    </mesh>
  );
}
