/**
 * BEACON-DROP — the threat alarm.
 *
 * A hazard beacon lowers itself into the frame on a stalk, strobes for a few
 * seconds, and winches back up. It is the heat family arriving as an object
 * rather than as a gradient: heat means fever everywhere in this game, and a
 * live threat is the most legible fever there is.
 *
 * It strobes rather than sweeps — the lamp is a hard square wave on the step
 * clock, which is the timing law's reading of "alarm" and matches the win
 * blink the discs already do.
 *
 * A threat is the Director's estimate, not a fact, so this act says nothing.
 * It is a light. Lights don't claim anything.
 *
 * Budget, audited (8-seg closed cylinder = 32, box = 12):
 *   stalk 12 + housing 32 + lamp 12 + cap 12 = 68 triangles.
 */

import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import * as THREE from "three";
import type { StageLayout } from "../stage/layout.js";
import { usePropMaterial, usePropTexture } from "./material.js";
import { beaconPose, stepIndex, stepped } from "./steps.js";
import { hazardSkin } from "./texture.js";

export const BEACON_MS = 2600;
const STEP_FPS = 12;

export function Beacon({ layout, phase }: { layout: StageLayout; phase: () => number }) {
  const group = useRef<THREE.Group>(null);
  const lamp = useRef<THREE.Mesh>(null);

  const hazard = usePropTexture(hazardSkin);
  const housingMat = usePropMaterial({ map: hazard, glow: 0.3 });
  const stalkMat = usePropMaterial({ color: "#2c2733" });
  const lampMat = usePropMaterial({ color: "#ed5705", glow: 3.0, emissive: "#ff7a1a" });

  const x = layout.frameW * 0.42;
  const top = layout.frameH / 2 + 2.6;
  const low = layout.frameH / 2 - 0.9;

  useFrame(() => {
    if (!group.current) return;
    const seconds = (phase() * BEACON_MS) / 1000;
    const t = stepped(seconds, STEP_FPS) / (BEACON_MS / 1000);
    const pose = beaconPose(t, stepIndex(seconds, STEP_FPS));

    group.current.position.set(x, top - pose.drop * (top - low), 3.0);
    if (lamp.current) lamp.current.rotation.y = pose.spin;
    lampMat.emissiveIntensity = pose.lamp * 3.4;
  });

  return (
    <group ref={group} position={[x, top, 3.0]}>
      {/* stalk, running back up out of the frame */}
      <mesh material={stalkMat} position={[0, 1.6, 0]}>
        <boxGeometry args={[0.12, 3.2, 0.12]} />
      </mesh>
      <mesh material={housingMat}>
        <cylinderGeometry args={[0.42, 0.42, 0.5, 8]} />
      </mesh>
      <mesh ref={lamp} material={lampMat} position={[0, 0.42, 0]}>
        <boxGeometry args={[0.7, 0.34, 0.24]} />
      </mesh>
      <mesh material={stalkMat} position={[0, 0.68, 0]}>
        <boxGeometry args={[0.5, 0.12, 0.5]} />
      </mesh>
    </group>
  );
}
