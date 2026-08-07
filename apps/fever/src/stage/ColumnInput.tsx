/**
 * Column hit areas and the hover ghost. The ghost snaps from column to column
 * — no tweening between them; snapping is the hard-edged timing rule applied
 * to input affordance.
 */

import type { Player } from "@fourscore/engine";
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
  return (
    <mesh position={[layout.xOf(col), layout.dropY, 0]} rotation-x={Math.PI / 2}>
      <cylinderGeometry args={[layout.discRadius, layout.discRadius, layout.discThickness, 40]} />
      <meshStandardMaterial color={color} transparent opacity={0.4} depthWrite={false} />
    </mesh>
  );
}
