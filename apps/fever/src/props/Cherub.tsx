/**
 * THE CHERUB — pillar 1's imagery on pillar 2's budget, which is the collision
 * the whole game is about done as one prop. Celestial and vaguely religious,
 * used completely wrong: the mascot disc, now with gold wings and a halo
 * nobody issued it, is lowered out of the void, hovers over the game, tilts
 * its head once at what it sees, and is winched back up. It says nothing and
 * it settles nothing — something clearly came to judge, and left.
 *
 * The wings flap as two alternating cels, not a motion; the halo is tipped so
 * it reads as a ring and hangs dead still, because a halo is furniture and
 * furniture does not emote.
 *
 * Budget, audited: body cylinder (10-seg, closed) 40 + two wing quads
 * (double-sided planes) 4 + halo torus (3x12) 72 = 116 triangles. One 64px
 * face texture, Lambert flat.
 */

import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import * as THREE from "three";
import type { StageLayout } from "../stage/layout.js";
import { usePropMaterial, usePropTexture } from "./material.js";
import { cherubPose, stepIndex, stepped } from "./steps.js";
import { mascotFace } from "./texture.js";

export const CHERUB_MS = 4200;
const STEP_FPS = 12;
const RADIUS = 0.62;

export function Cherub({ layout, phase }: { layout: StageLayout; phase: () => number }) {
  const group = useRef<THREE.Group>(null);
  const wingL = useRef<THREE.Mesh>(null);
  const wingR = useRef<THREE.Mesh>(null);

  const face = usePropTexture(() => mascotFace("up"));
  const faceMat = usePropMaterial({ map: face, glow: 0.45 });
  const rimMat = usePropMaterial({ color: "#c8991f", glow: 0.2 });
  const wingMat = usePropMaterial({ color: "#e7c95c", glow: 0.3, side: THREE.DoubleSide });
  const haloMat = usePropMaterial({ color: "#ffe9a8", glow: 0.7 });

  // Above the board, a little off-centre and forward of the plates — it hovers
  // over the game the way the pinsetter does, but to one side: an observer,
  // not an operator.
  const x = -layout.frameW * 0.22;
  const yHover = layout.frameH * 0.24;
  const yTop = layout.frameH / 2 + 3.2;

  useFrame(() => {
    if (!group.current || !wingL.current || !wingR.current) return;
    const seconds = (phase() * CHERUB_MS) / 1000;
    const t = stepped(seconds, STEP_FPS) / (CHERUB_MS / 1000);
    const pose = cherubPose(t, stepIndex(seconds, STEP_FPS));

    group.current.position.set(x, yHover + pose.height * (yTop - yHover), 2.2);
    // The tilt is the act's one event: a hard lean, held, released.
    group.current.rotation.z = pose.tilt * -0.38;
    // Two wing cels. The stroke is instant — a flap, not a beat.
    const spread = pose.flap === 0 ? 0.55 : 0.95;
    wingL.current.rotation.z = spread;
    wingR.current.rotation.z = -spread;
  });

  return (
    <group ref={group} position={[x, yTop, 2.2]}>
      {/* The cast member. Face on the caps, same construction as the mascot. */}
      <mesh material={[rimMat, faceMat, faceMat]} rotation-x={Math.PI / 2}>
        <cylinderGeometry args={[RADIUS, RADIUS, 0.26, 10]} />
      </mesh>
      {/* Wings, hung at the shoulders, just behind the body so the seam where
          they meet it stays the body's own edge. */}
      <mesh ref={wingL} material={wingMat} position={[-RADIUS * 1.5, 0.12, -0.05]}>
        <planeGeometry args={[1.1, 0.5]} />
      </mesh>
      <mesh ref={wingR} material={wingMat} position={[RADIUS * 1.5, 0.12, -0.05]}>
        <planeGeometry args={[1.1, 0.5]} />
      </mesh>
      {/* The halo: tipped to read as a ring, and perfectly still. */}
      <mesh material={haloMat} position={[0, RADIUS + 0.34, 0]} rotation-x={1.25}>
        <torusGeometry args={[0.36, 0.05, 3, 12]} />
      </mesh>
    </group>
  );
}
