/**
 * The board as a real object: two extruded plates with actual circular holes,
 * a slot between them for the discs, and rails closing the sides. It floats in
 * the void — this is not a room, and the board does not need a table.
 *
 * The floor is not here: the bottom of the sandwich is the release tray
 * (`ReleaseTray.tsx`), the sliding Connect 4 floor the discs rest on and fall
 * through. This file owns everything that never moves.
 *
 * Board geometry is on the expensive side of the budget law (it lives with the
 * void, not with the props), so smooth shading and real hole geometry are
 * correct here. Everything is derived from `StageLayout`; no dimension in this
 * file may mention 7 or 6. Materials come from the theme — the fever theme is
 * lacquered obsidian with a thin-film sheen, the parlor is walnut and brass —
 * but the *shape* is the same object in every direction.
 */

import { useEffect, useMemo } from "react";
import * as THREE from "three";
import type { StageLayout } from "./layout.js";
import { useTheme, type MaterialSpec } from "./theme.js";

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

/** A physical material from a theme spec. Callers own disposal. */
export function materialFrom(spec: MaterialSpec): THREE.MeshPhysicalMaterial {
  return new THREE.MeshPhysicalMaterial({
    color: spec.color,
    roughness: spec.roughness,
    metalness: spec.metalness,
    iridescence: spec.iridescence,
    iridescenceIOR: spec.iridescenceIOR,
    clearcoat: spec.clearcoat,
    clearcoatRoughness: spec.clearcoatRoughness,
    envMapIntensity: spec.envMapIntensity,
  });
}

/** How thick the rails (and the tray) are. Shared with ReleaseTray. */
export const RAIL_T = 0.16;

/** The full depth of the board sandwich — slot plus both plates. */
export const sandwichDepth = (layout: StageLayout): number =>
  layout.slotHalf * 2 + layout.plateDepth * 2;

export function BoardRig({ layout }: { layout: StageLayout }) {
  const theme = useTheme();
  // Geometry per variant, disposed when the variant changes — R3F only
  // auto-disposes what it created itself.
  const plate = useMemo(() => plateGeometry(layout), [layout]);
  useEffect(() => () => plate.dispose(), [plate]);

  // In the fever theme this is the phase-9 lacquer: a bright plum body under a
  // clearcoat, so there are two speculars — the broad iridescent sheen and a
  // tight wet gloss — which is what makes lacquer read as lacquer instead of
  // tinted plastic. Other themes trade the whole material, not just the color.
  const plum = useMemo(() => materialFrom(theme.board.plate), [theme]);
  // The rails: in the fever theme, full mirror — the one place "chrome that
  // reflects a sky that isn't there" is allowed to be literal. A bright seam
  // around a dark face is what separates an object from an extrusion.
  const railMat = useMemo(() => materialFrom(theme.board.rail), [theme]);
  // Every hole gets an eyelet, seated on the front plate. Seventy-two small
  // mirrors catching seventy-two different slices of the sky is most of what
  // "not a CAD slab" means here — and they ring the discs the way an arcade
  // machine would have actually been built.
  const ringMat = useMemo(() => materialFrom(theme.board.eyelet), [theme]);
  useEffect(
    () => () => {
      plum.dispose();
      railMat.dispose();
      ringMat.dispose();
    },
    [plum, railMat, ringMat],
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

  const { frameW, frameH, slotHalf } = layout;
  // The whole sandwich, not just the slot: the plates' own thickness is part
  // of the seam, and a rail that only spans the gap leaves a lit hairline down
  // the board's edge. Invisible head-on, obvious the moment the camera orbits.
  const gap = sandwichDepth(layout);

  return (
    <group>
      {/* Front and back plates share one geometry with real holes. */}
      <mesh geometry={plate} material={plum} position={[0, 0, slotHalf]} />
      <mesh geometry={plate} material={plum} position={[0, 0, -slotHalf - layout.plateDepth]} />

      {/* The eyelets, seated proud of the front face. */}
      <primitive object={rings} />

      {/* Side rails close the sandwich so light can't leak through the seams.
          The floor is the release tray, mounted by the stage. */}
      <mesh material={railMat} position={[-(frameW - RAIL_T) / 2, 0, 0]}>
        <boxGeometry args={[RAIL_T, frameH, gap]} />
      </mesh>
      <mesh material={railMat} position={[(frameW - RAIL_T) / 2, 0, 0]}>
        <boxGeometry args={[RAIL_T, frameH, gap]} />
      </mesh>
    </group>
  );
}
