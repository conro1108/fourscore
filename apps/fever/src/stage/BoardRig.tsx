/**
 * The board as a real object: two extruded plates with actual circular holes,
 * a slot between them for the discs, and rails closing the sides and floor.
 * It floats in the void — this is not a room, and the board does not need a
 * table.
 *
 * Board geometry is on the expensive side of the budget law (it lives with the
 * void, not with the props), so smooth shading and real hole geometry are
 * correct here. Everything is derived from `StageLayout`; no dimension in this
 * file may mention 7 or 6.
 */

import { useEffect, useMemo } from "react";
import * as THREE from "three";
import type { StageLayout } from "./layout.js";

function plateGeometry(layout: StageLayout): THREE.ExtrudeGeometry {
  const { frameW, frameH, holeRadius, variant } = layout;
  const shape = new THREE.Shape();
  shape.moveTo(-frameW / 2, -frameH / 2);
  shape.lineTo(frameW / 2, -frameH / 2);
  shape.lineTo(frameW / 2, frameH / 2);
  shape.lineTo(-frameW / 2, frameH / 2);
  shape.closePath();

  for (let col = 0; col < variant.width; col++) {
    for (let row = 0; row < variant.height; row++) {
      const hole = new THREE.Path();
      hole.absarc(layout.xOf(col), layout.yOf(row), holeRadius, 0, Math.PI * 2, true);
      shape.holes.push(hole);
    }
  }

  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: layout.plateDepth,
    bevelEnabled: true,
    bevelThickness: 0.03,
    bevelSize: 0.03,
    bevelSegments: 2,
    curveSegments: 20,
  });
  geometry.computeVertexNormals();
  return geometry;
}

export function BoardRig({ layout }: { layout: StageLayout }) {
  // Geometry per variant, disposed when the variant changes — R3F only
  // auto-disposes what it created itself.
  const plate = useMemo(() => plateGeometry(layout), [layout]);
  useEffect(() => () => plate.dispose(), [plate]);

  const plum = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: "#1d1329",
        roughness: 0.3,
        metalness: 0.45,
      }),
    [],
  );
  const railMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: "#140b1f",
        roughness: 0.45,
        metalness: 0.3,
      }),
    [],
  );

  const { frameW, frameH, slotHalf, plateDepth } = layout;
  const gap = slotHalf * 2;
  const railT = 0.16;

  return (
    <group>
      {/* Front and back plates share one geometry with real holes. */}
      <mesh geometry={plate} material={plum} position={[0, 0, slotHalf]} />
      <mesh geometry={plate} material={plum} position={[0, 0, -slotHalf - plateDepth]} />

      {/* Rails close the sandwich so light can't leak through the seams. */}
      <mesh material={railMat} position={[-(frameW - railT) / 2, 0, 0]}>
        <boxGeometry args={[railT, frameH, gap]} />
      </mesh>
      <mesh material={railMat} position={[(frameW - railT) / 2, 0, 0]}>
        <boxGeometry args={[railT, frameH, gap]} />
      </mesh>
      <mesh material={railMat} position={[0, -(frameH - railT) / 2, 0]}>
        <boxGeometry args={[frameW, railT, gap]} />
      </mesh>
    </group>
  );
}
