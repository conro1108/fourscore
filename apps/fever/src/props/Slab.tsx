/**
 * SLAB-DROP — Pebble's signature.
 *
 * A concrete slab falls from the top of the frame, lands square in front of
 * the board with exactly one frame of bounce, sits there, and is winched back
 * up. Nothing was going to hit you. It says OK on it.
 *
 * It fires on `threat`, which is an estimate, so the slab is not allowed to
 * claim anything (`director/types.ts`) — and it doesn't: it is a heavy object
 * arriving, and the only word on it is the same one the About box says.
 *
 * Budget, audited: slab 12 + cable 12 = 24 triangles. One 64px texture.
 */

import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import * as THREE from "three";
import { stageFx } from "../stage/fx.js";
import type { StageLayout } from "../stage/layout.js";
import { usePropMaterial, usePropTexture } from "./material.js";
import { slabPose, stepped } from "./steps.js";
import { slabSkin } from "./texture.js";

export const SLAB_MS = 2400;
const STEP_FPS = 12;

export function Slab({ layout, phase }: { layout: StageLayout; phase: () => number }) {
  const group = useRef<THREE.Group>(null);
  const cable = useRef<THREE.Mesh>(null);
  const skin = usePropTexture(slabSkin);
  const mat = usePropMaterial({ map: skin, glow: 0.18 });
  const cableMat = usePropMaterial({ color: "#4a4750" });
  const struck = useRef(false);

  const width = Math.min(layout.frameW * 0.5, 4.4);
  const rest = -(layout.frameH / 2) + 1.1;
  // "Above the frame" measured at the slab's own depth, not the board's — a
  // prop this far forward leaves the top of the picture sooner than its world
  // y suggests (the lesson the tow banner cost phase 3).
  const travel = layout.frameH + 4;

  useFrame(() => {
    if (!group.current || !cable.current) return;
    const seconds = (phase() * SLAB_MS) / 1000;
    const t = stepped(seconds, STEP_FPS) / (SLAB_MS / 1000);
    const pose = slabPose(t);
    const y = rest + pose.height * travel;
    group.current.position.y = y;
    // The cable is always taut to somewhere above the frame, so the slab is
    // never falling freely — it is being *let* down, which is worse.
    const length = Math.max(0.1, travel + 3 - pose.height * travel);
    cable.current.scale.y = length;
    cable.current.position.y = 0.5 + length / 2;
    if (pose.impact && !struck.current) {
      struck.current = true;
      stageFx.lastLandAt = performance.now();
    }
  });

  return (
    <group ref={group} position={[0, rest + travel, 2.8]}>
      <mesh material={mat}>
        <boxGeometry args={[width, 1.4, 0.5]} />
      </mesh>
      <mesh ref={cable} material={cableMat} position={[0, 2, 0]}>
        <boxGeometry args={[0.09, 1, 0.09]} />
      </mesh>
    </group>
  );
}
