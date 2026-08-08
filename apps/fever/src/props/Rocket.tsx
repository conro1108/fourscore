/**
 * ROCKET-FIZZLE — the blunder gag.
 *
 * A rocket launches beautifully, runs out of whatever it had at about head
 * height, hangs there a beat too long, and tips over out of frame. It never
 * says the move was bad; it is simply a rocket having the worst possible time
 * in the same second you played (per `director/types.ts`, a `move` gag may be
 * as loud as it likes but may not assert a result — this one asserts nothing
 * at all, which is why it's funnier).
 *
 * Budget, audited (6-seg closed cylinder = 24, 6-seg cone = 12, box = 12):
 *   body 24 + nose 12 + flame 12 + 3 fins x 12 = 84 triangles. Law is <= 300.
 * One 64px nearest texture, Lambert flat, no environment map.
 */

import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import * as THREE from "three";
import type { StageLayout } from "../stage/layout.js";
import { usePropMaterial, usePropTexture } from "./material.js";
import { rocketPose, stepIndex, stepped } from "./steps.js";
import { rocketSkin } from "./texture.js";

export const ROCKET_MS = 2600;
const STEP_FPS = 12;

export function Rocket({ layout, phase }: { layout: StageLayout; phase: () => number }) {
  const group = useRef<THREE.Group>(null);
  const flame = useRef<THREE.Mesh>(null);

  const skin = usePropTexture(rocketSkin);
  const bodyMat = usePropMaterial({ map: skin, glow: 0.35 });
  const finMat = usePropMaterial({ color: "#a3164e" });
  const flameMat = usePropMaterial({ color: "#ed5705", glow: 2.4, emissive: "#ffb200" });

  // Launched from the right of the board, well clear of the truck's lane.
  const x = layout.frameW * 0.46;
  const yRest = -(layout.frameH / 2) - 1.6;
  const climb = layout.frameH * 0.78;

  useFrame(() => {
    if (!group.current) return;
    const seconds = (phase() * ROCKET_MS) / 1000;
    const t = stepped(seconds, STEP_FPS) / (ROCKET_MS / 1000);
    const pose = rocketPose(t);
    const step = stepIndex(seconds, STEP_FPS);

    group.current.position.set(x, yRest + pose.rise * climb, 3.0);
    group.current.rotation.z = -pose.tilt;

    if (flame.current) {
      flame.current.visible = pose.burning;
      // Two-frame flame: it is on, then it is longer. Nothing in between.
      const stretch = step % 2 === 0 ? 1 : 1.6;
      flame.current.scale.set(1, stretch, 1);
      flame.current.position.y = -1.05 - (stretch - 1) * 0.3;
    }
  });

  return (
    <group ref={group} position={[x, yRest, 3.0]}>
      <mesh material={bodyMat}>
        <cylinderGeometry args={[0.24, 0.24, 1.5, 6]} />
      </mesh>
      <mesh material={bodyMat} position={[0, 1.0, 0]}>
        <coneGeometry args={[0.24, 0.55, 6]} />
      </mesh>
      {[0, (2 * Math.PI) / 3, (4 * Math.PI) / 3].map((a, i) => (
        <mesh
          key={i}
          material={finMat}
          position={[Math.cos(a) * 0.26, -0.6, Math.sin(a) * 0.26]}
          rotation-y={-a}
        >
          <boxGeometry args={[0.34, 0.5, 0.06]} />
        </mesh>
      ))}
      <mesh ref={flame} material={flameMat} position={[0, -1.05, 0]} rotation-x={Math.PI}>
        <coneGeometry args={[0.2, 0.7, 6]} />
      </mesh>
    </group>
  );
}
