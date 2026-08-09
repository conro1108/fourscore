/**
 * The monster truck — the exemplar prop, and the founding instance of the
 * cheap budget. Every later prop is built by holding it next to this one.
 *
 * The budget, audited by hand (box = 12 tris, 6-segment closed cylinder = 24):
 *   body 12 + cab 12 + 4 wheels x 24 + 2 exhausts x 12 + spoiler 12
 *   + 2 struts x 12 = 180 triangles. Law is <= 300.
 * Texture: one 64px nearest-filtered canvas (texture.ts), box-mapped so the
 * whole livery lands on every face. Flat (Lambert) shading — props never get
 * a normal map and never pick up the void's environment reflections; cheap
 * things do not reflect the sky that isn't there.
 *
 * All motion is sampled through `stepped` at 12fps while the camera and void
 * run at 60 — the two budgets sharing one frame is the aesthetic.
 */

import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import * as THREE from "three";
import { stageFx } from "../stage/fx.js";
import type { StageLayout } from "../stage/layout.js";
import { usePropMaterial, usePropTexture } from "./material.js";
import { stepIndex, stepped, truckPose } from "./steps.js";
import { truckLivery } from "./texture.js";

export const TRUCK_LAP_MS = 4200;
const STEP_FPS = 12;
const WHEEL_R = 0.5;

export function Truck({ layout, phase }: { layout: StageLayout; phase: () => number }) {
  const group = useRef<THREE.Group>(null);
  const wheels = useRef<(THREE.Group | null)[]>([]);
  const wasAirborne = useRef(false);

  const livery = usePropTexture(truckLivery);

  // The livery doubles as its own emissive map: the flames and chrome stripe
  // glow faintly, which is what hands the cheap prop to the expensive bloom.
  //
  // Through `usePropMaterial` like everything else. These were three raw
  // `useMemo`s with no cleanup, from before `material.ts` existed to own
  // disposal — so every lap of the truck leaked three materials, which is a
  // slow drip nothing in the game could ever surface. It was the last prop
  // outside the contract.
  const bodyMat = usePropMaterial({ map: livery, glow: 0.5 });
  const darkMat = usePropMaterial({ color: "#2c2733" });
  const chromeMat = usePropMaterial({ color: "#c8ccd4" });

  // The lap crosses the whole frame, off-screen to off-screen, under the
  // board and in front of it. Everything derives from layout — no 7s.
  const xStart = -(layout.frameW / 2 + 5.5);
  const xEnd = layout.frameW / 2 + 5.5;
  // Wheels just above the visible frame bottom: the drive-in reads as a lap
  // along the foot of the frame, and the jump carries it up across the
  // board's lower rows.
  const yGround = -(layout.frameH / 2) - 0.35;

  useFrame(() => {
    if (!group.current) return;
    const raw = phase();
    const seconds = (raw * TRUCK_LAP_MS) / 1000;
    // The hard step: the truck exists at 12fps.
    const t = stepped(seconds, STEP_FPS) / (TRUCK_LAP_MS / 1000);
    const pose = truckPose(t);

    // Two-frame suspension bounce whenever grounded — the county-fair idle.
    const bounce = pose.grounded && stepIndex(seconds, STEP_FPS) % 2 === 0 ? 0.06 : 0;

    group.current.position.set(
      xStart + pose.u * (xEnd - xStart),
      yGround + pose.lift + bounce,
      3.2,
    );
    group.current.rotation.z = pose.pitch;
    // Yawed a touch toward the camera: dead side-on, a low-poly box is an
    // unreadable rectangle; a quarter-turn of depth is what makes it a truck.
    group.current.rotation.y = 0.30;

    // Rolling, quantized with everything else; frozen mid-air by the pose.
    const spin = pose.grounded ? -(pose.u * (xEnd - xStart)) / WHEEL_R : 0;
    for (const w of wheels.current) if (w) w.rotation.z = spin;

    // The slam. The whole stage flinches on the same signal a disc landing
    // uses — one flinch, one meaning.
    if (wasAirborne.current && pose.grounded) stageFx.lastLandAt = performance.now();
    wasAirborne.current = !pose.grounded;
  });

  return (
    <group ref={group} position={[xStart, yGround, 3.2]}>
      {/* body */}
      <mesh material={bodyMat} position={[0, 0.95, 0]}>
        <boxGeometry args={[2.3, 0.6, 1.0]} />
      </mesh>
      {/* cab */}
      <mesh material={bodyMat} position={[-0.25, 1.5, 0]}>
        <boxGeometry args={[0.9, 0.55, 0.92]} />
      </mesh>
      {/* wheels */}
      {([
        [0.85, 0.55],
        [0.85, -0.55],
        [-0.85, 0.55],
        [-0.85, -0.55],
      ] as const).map(([x, z], i) => (
        <group key={i} ref={(g) => (wheels.current[i] = g)} position={[x, WHEEL_R, z]}>
          <mesh material={darkMat} rotation-x={Math.PI / 2}>
            <cylinderGeometry args={[WHEEL_R, WHEEL_R, 0.42, 6]} />
          </mesh>
        </group>
      ))}
      {/* exhaust stacks */}
      <mesh material={chromeMat} position={[-0.62, 1.95, 0.3]} rotation-z={0.12}>
        <boxGeometry args={[0.12, 0.7, 0.12]} />
      </mesh>
      <mesh material={chromeMat} position={[-0.62, 1.95, -0.3]} rotation-z={0.12}>
        <boxGeometry args={[0.12, 0.7, 0.12]} />
      </mesh>
      {/* spoiler */}
      <mesh material={darkMat} position={[-1.15, 1.42, 0.32]} rotation-z={0.5}>
        <boxGeometry args={[0.08, 0.36, 0.08]} />
      </mesh>
      <mesh material={darkMat} position={[-1.15, 1.42, -0.32]} rotation-z={0.5}>
        <boxGeometry args={[0.08, 0.36, 0.08]} />
      </mesh>
      <mesh material={chromeMat} position={[-1.24, 1.58, 0]} rotation-z={0.5}>
        <boxGeometry args={[0.5, 0.08, 1.0]} />
      </mesh>
    </group>
  );
}
