/**
 * DEEP SPACE — the act about nothing.
 *
 * A ringed planet drifts across the top of the frame with four sparkles
 * twinkling around it, and then it is gone. It has no relationship to the game,
 * to the move that summoned it, or to anything else on the stage. It does not
 * arrive and it does not conclude: it was already crossing before the screen
 * cut to it.
 *
 * This is the reference's fourth trait — the screen leaves the venue with no
 * explanation and comes back — and it is the one act licensed to be about
 * nothing at all. That makes it the *only* honest answer to an ordinary move:
 * a clip that cannot possibly be a comment on your play, because it does not
 * know you played. Everything else on the stage is at least pretending.
 *
 * Teal and gold, not violet, and rounder than it was. Painting the planet in
 * the void's own colours was the wrong reading of "somewhere else": a lavender
 * sphere on a lavender void loses its whole lower half and the act arrives as a
 * smear with a ring near it. Teal is in the oil-slick ramp, so it is house
 * colour, and it is the one part of that ramp the void never spends. The
 * terminator went from a third of the tile to a sixth for the same reason the
 * silhouette needed — at a third it bit a flat side out of the sphere and the
 * planet read as a potato.
 *
 * Budget, audited (10x6 sphere = 100, quad = 2):
 *   planet 100 + ring 2 + 4 sparkles x 2 = 110 triangles. Law is <= 300.
 * The two extra rings of facets are what stop a cheap sphere reading as a
 * lump — 8x5 is fine on a wrecking ball, which is *supposed* to be crude, and
 * wrong on the one prop whose whole job is to be a beautiful thing from
 * elsewhere.
 *
 * Two 64px nearest textures and one more shared between the sparkles.
 */

import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import * as THREE from "three";
import type { StageLayout } from "../stage/layout.js";
import { usePropMaterial, usePropTexture } from "./material.js";
import { deepSpacePose, stepIndex, stepped } from "./steps.js";
import { planetSkin, ringSkin, sparkTexture } from "./texture.js";

export const DEEP_SPACE_MS = 4200;
const STEP_FPS = 12;
const RADIUS = 1.15;

/** Where the sparkles sit relative to the planet, and how big each one is. */
const SPARKS: [x: number, y: number, size: number][] = [
  [-1.9, 1.05, 0.85],
  [1.75, 1.35, 0.55],
  [2.15, -0.85, 0.7],
  [-1.45, -1.15, 0.45],
];

export function DeepSpace({ layout, phase }: { layout: StageLayout; phase: () => number }) {
  const group = useRef<THREE.Group>(null);
  const sparks = useRef<(THREE.Mesh | null)[]>([]);

  const skin = usePropTexture(planetSkin);
  const rings = usePropTexture(ringSkin);
  const bigSpark = usePropTexture(() => sparkTexture(true));
  const smallSpark = usePropTexture(() => sparkTexture(false));

  const planetMat = usePropMaterial({ map: skin, glow: 0.34 });
  const ringMat = usePropMaterial({ map: rings, glow: 0.3, alphaTest: 0.4, side: THREE.DoubleSide });
  // Two materials rather than one swapped texture: a material change per frame
  // would rebuild the program, and the twinkle is every other frame.
  const bigMat = usePropMaterial({ map: bigSpark, glow: 1.6, emissive: "#e4d2ff", alphaTest: 0.5 });
  const smallMat = usePropMaterial({
    map: smallSpark,
    glow: 1.6,
    emissive: "#e4d2ff",
    alphaTest: 0.5,
  });

  // High and in front of the board.
  //
  // Behind it — which is where "somewhere else" wants to be, and where this
  // started — the board occludes the whole act and the harness hands back a
  // planet visible only through the disc holes. There is no depth *behind* the
  // board on this stage; the void is a backdrop, not a room. So the interlude
  // plays over the top of the game like every other clip, and what says it is
  // somewhere else is the content, not the z.
  const xStart = -(layout.frameW / 2 + 4);
  const xEnd = layout.frameW / 2 + 4;
  const y = layout.frameH * 0.3;

  useFrame(() => {
    if (!group.current) return;
    const seconds = (phase() * DEEP_SPACE_MS) / 1000;
    const t = stepped(seconds, STEP_FPS) / (DEEP_SPACE_MS / 1000);
    const pose = deepSpacePose(t, stepIndex(seconds, STEP_FPS));

    group.current.position.set(xStart + pose.u * (xEnd - xStart), y + pose.arc, 2.6);

    // Twinkle: the sparkles swap cels on alternate frames, in two groups, so
    // the field is never all one size. Nothing fades — a sparkle that fades is
    // a light, and a sparkle that swaps is a sticker.
    sparks.current.forEach((spark, i) => {
      if (spark) spark.material = (i % 2 === pose.twinkle ? bigMat : smallMat) as THREE.Material;
    });
  });

  return (
    <group ref={group} position={[xStart, y, 2.6]}>
      <mesh material={planetMat}>
        <sphereGeometry args={[RADIUS, 10, 6]} />
      </mesh>
      {/* The ring is a textured quad lying flat, not a torus: a torus is 400
          triangles of a shape that is two triangles of texture. Tilted so it
          reads as a ring rather than as a line. */}
      <mesh material={ringMat} rotation={[Math.PI / 2 - 0.42, 0, 0.18]}>
        <planeGeometry args={[RADIUS * 3.4, RADIUS * 3.4]} />
      </mesh>
      {SPARKS.map(([x, sy, size], i) => (
        <mesh
          key={i}
          ref={(m) => (sparks.current[i] = m)}
          material={smallMat}
          position={[x, sy, 0.4]}
        >
          <planeGeometry args={[size, size]} />
        </mesh>
      ))}
    </group>
  );
}
