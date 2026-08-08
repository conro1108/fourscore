/**
 * Column hit areas and the hover ghost. The ghost snaps from column to column
 * — no tweening between them; snapping is the hard-edged timing rule applied
 * to input affordance.
 */

import { useEffect, useMemo } from "react";
import type { Player } from "@fourscore/engine";
import { coinGeometry } from "./coin.js";
import type { StageLayout } from "./layout.js";

export function ColumnInput({
  layout,
  onColumn,
  onHover,
}: {
  layout: StageLayout;
  onColumn: (col: number) => void;
  onHover: (col: number | null) => void;
}) {
  const { variant, frameH } = layout;
  return (
    <group>
      {Array.from({ length: variant.width }, (_, col) => (
        <mesh
          key={col}
          position={[layout.xOf(col), 0.9, 0]}
          onClick={(e) => {
            e.stopPropagation();
            onColumn(col);
          }}
          onPointerOver={(e) => {
            e.stopPropagation();
            onHover(col);
          }}
          onPointerOut={() => onHover(null)}
        >
          <boxGeometry args={[1, frameH + 3.4, 1.4]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
      ))}
    </group>
  );
}

export function GhostDisc({
  layout,
  col,
  player,
}: {
  layout: StageLayout;
  col: number;
  player: Player;
}) {
  const color = player === "red" ? "#a3164e" : "#c8991f";
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
      <meshStandardMaterial color={color} transparent opacity={0.4} depthWrite={false} />
    </mesh>
  );
}
