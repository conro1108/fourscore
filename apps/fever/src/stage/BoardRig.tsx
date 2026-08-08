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

  // Physical, not standard: the board is lacquered obsidian with a thin-film
  // sheen, so the VoidSky's magenta/teal/gold shows up as an oil-slick crawl
  // across the plates as the camera sways. The board lives on the expensive
  // side of the budget law with the void — this is where "chrome that reflects
  // a sky that isn't there" happens.
  const plum = useMemo(
    () =>
      new THREE.MeshPhysicalMaterial({
        color: "#251733",
        roughness: 0.26,
        metalness: 0.4,
        iridescence: 0.6,
        iridescenceIOR: 1.6,
        envMapIntensity: 1.7,
      }),
    [],
  );
  const railMat = useMemo(
    () =>
      new THREE.MeshPhysicalMaterial({
        color: "#1a1026",
        roughness: 0.35,
        metalness: 0.4,
        iridescence: 0.35,
        iridescenceIOR: 1.6,
        envMapIntensity: 1.3,
      }),
    [],
  );

  const { frameW, frameH, slotHalf, plateDepth } = layout;
  // The whole sandwich, not just the slot: the plates' own thickness is part
  // of the seam, and a rail that only spans the gap leaves a lit hairline down
  // the board's edge. Invisible head-on, obvious the moment the camera orbits.
  const gap = slotHalf * 2 + plateDepth * 2;
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
