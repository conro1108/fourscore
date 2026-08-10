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
  //
  // Retuned in phase 9 (Connor: the board read as "a bland solidworks render").
  // The plum is brighter and wears a clearcoat, so there are two speculars —
  // the body's broad iridescent sheen and a tight wet gloss over it — which is
  // what makes lacquer read as lacquer instead of as tinted plastic.
  const plum = useMemo(
    () =>
      new THREE.MeshPhysicalMaterial({
        color: "#33204a",
        roughness: 0.34,
        metalness: 0.35,
        iridescence: 0.85,
        iridescenceIOR: 1.6,
        clearcoat: 1,
        clearcoatRoughness: 0.18,
        envMapIntensity: 2.1,
      }),
    [],
  );
  // The rails go full mirror: the board's edges are the one place "chrome that
  // reflects a sky that isn't there" is allowed to be literal, and a bright
  // seam around a dark face is what separates an object from an extrusion.
  const railMat = useMemo(
    () =>
      new THREE.MeshPhysicalMaterial({
        color: "#8f84a8",
        roughness: 0.18,
        metalness: 1,
        iridescence: 0.5,
        iridescenceIOR: 1.6,
        envMapIntensity: 1.9,
      }),
    [],
  );
  // Every hole gets a steel eyelet, seated on the front plate. Seventy-two
  // small mirrors catching seventy-two different slices of the sky is most of
  // what "not a CAD slab" means here — and they ring the discs the way an
  // arcade machine would have actually been built.
  const ringMat = useMemo(
    () =>
      new THREE.MeshPhysicalMaterial({
        color: "#a99cc0",
        roughness: 0.14,
        metalness: 1,
        iridescence: 0.4,
        iridescenceIOR: 1.6,
        envMapIntensity: 1.7,
      }),
    [],
  );

  // One instanced draw for all the eyelets; matrices set once per variant.
  const rings = useMemo(() => {
    const { variant, holeRadius } = layout;
    const geometry = new THREE.TorusGeometry(holeRadius + 0.005, 0.038, 10, 36);
    const mesh = new THREE.InstancedMesh(geometry, ringMat, variant.width * variant.height);
    const m = new THREE.Matrix4();
    let i = 0;
    for (let col = 0; col < variant.width; col++) {
      for (let row = 0; row < variant.height; row++) {
        m.setPosition(layout.xOf(col), layout.yOf(row), layout.slotHalf + layout.plateDepth + 0.02);
        mesh.setMatrixAt(i++, m);
      }
    }
    mesh.instanceMatrix.needsUpdate = true;
    return mesh;
  }, [layout, ringMat]);
  useEffect(() => () => rings.geometry.dispose(), [rings]);

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

      {/* The eyelets, seated proud of the front face. */}
      <primitive object={rings} />

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
