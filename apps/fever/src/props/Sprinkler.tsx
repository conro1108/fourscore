/**
 * SPRINKLER — Moss's signature gag, built to the persona in VISION.md: "rises
 * from below the frame, waters nothing for exactly two stepped beats, and
 * descends. It is never in a hurry either."
 *
 * Fires on `idle-beat`, so it is the act the player sees most and the one that
 * has to wear best. It is therefore the quietest thing in the roster on
 * purpose: no sound of its own, no flinch, no claim. Ambient wrongness.
 *
 * The water is eight flat quads that appear and disappear on the step clock —
 * a spray drawn the way a 1999 sprite would draw one, because a particle
 * system here would be the void's budget spent on a prop.
 *
 * Budget, audited (6-seg closed cylinder = 24, box = 12, quad = 2):
 *   post 12 + head 24 + arm 12 + 8 droplets x 2 = 64 triangles.
 */

import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import * as THREE from "three";
import type { StageLayout } from "../stage/layout.js";
import { usePropMaterial } from "./material.js";
import { sprinklerPose, stepIndex, stepped } from "./steps.js";

export const SPRINKLER_MS = 3000;
const STEP_FPS = 12;
const DROPS = 8;

export function Sprinkler({ layout, phase }: { layout: StageLayout; phase: () => number }) {
  const group = useRef<THREE.Group>(null);
  const drops = useRef<(THREE.Mesh | null)[]>([]);

  const bodyMat = usePropMaterial({ color: "#3f6b2e" });
  const capMat = usePropMaterial({ color: "#6aa348", glow: 0.25 });
  const waterMat = usePropMaterial({
    color: "#9fd6e8",
    glow: 0.8,
    transparent: true,
    opacity: 0.85,
    side: THREE.DoubleSide,
  });

  const x = -layout.frameW * 0.4;
  const hidden = -(layout.frameH / 2) - 2.8;
  const shown = -(layout.frameH / 2) - 0.2;

  useFrame(() => {
    if (!group.current) return;
    const seconds = (phase() * SPRINKLER_MS) / 1000;
    const t = stepped(seconds, STEP_FPS) / (SPRINKLER_MS / 1000);
    const pose = sprinklerPose(t);
    const step = stepIndex(seconds, STEP_FPS);

    group.current.position.set(x, hidden + pose.rise * (shown - hidden), 3.2);

    // The spray: a two-frame arc that alternates rather than flows. Off
    // entirely between the beats — it waters nothing, twice.
    drops.current.forEach((drop, i) => {
      if (!drop) return;
      const on = pose.beat !== 0 && (i + step) % 3 !== 0;
      drop.visible = on;
      // A visible arc, not a horizontal dribble: the spray goes up before it
      // goes out, which is the only way eight quads read as water.
      const reach = 0.35 + i * 0.3;
      const arc = Math.sin(((i + 0.5) / DROPS) * Math.PI) * 1.05;
      drop.position.set(reach, 1.45 + arc - reach * 0.18, 0);
      drop.rotation.z = 0.5 - i * 0.22;
    });
  });

  return (
    <group ref={group} position={[x, hidden, 3.2]}>
      <mesh material={bodyMat} position={[0, 0.5, 0]}>
        <boxGeometry args={[0.2, 1.6, 0.2]} />
      </mesh>
      <mesh material={capMat} position={[0, 1.35, 0]}>
        <cylinderGeometry args={[0.26, 0.3, 0.3, 6]} />
      </mesh>
      <mesh material={bodyMat} position={[0.25, 1.45, 0]} rotation-z={-0.35}>
        <boxGeometry args={[0.55, 0.12, 0.12]} />
      </mesh>
      {Array.from({ length: DROPS }, (_, i) => (
        <mesh
          key={i}
          ref={(m) => (drops.current[i] = m)}
          material={waterMat}
          position={[0.35 + i * 0.28, 1.5, 0]}
        >
          <planeGeometry args={[0.22, 0.07]} />
        </mesh>
      ))}
    </group>
  );
}
