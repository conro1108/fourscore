/**
 * The monster truck — the exemplar prop, and the founding instance of the
 * cheap budget. Every later prop is built by holding it next to this one.
 *
 * Which is why it being illegible mattered more than any other prop being
 * illegible. Three things were wrong and they were the same three things wrong
 * with half the roster:
 *
 *  - **No value contrast.** The livery was black with green flames and the void
 *    is near-black purple, so the truck was a hole in the picture with an
 *    equalizer on it. The body is white now. The void does not own white.
 *  - **No wheels.** Four dark six-segment prisms as tall as the body, at the
 *    body's own width, flat-coloured on all three material slots. Nothing about
 *    a hexagonal prism says wheel; what says it is a *hub cap facing you* and
 *    being tucked under something. The cylinder's three slots are now tread,
 *    hub, hub — no extra geometry, and it reads at a glance.
 *  - **No face.** VISION.md: a prop with no face is the weakest thing on the
 *    stage. It has headlamp eyes and a grille mouth, on the end the yaw already
 *    turns toward the camera.
 *
 * The budget, audited by hand (box = 12 tris, 6-segment closed cylinder = 24,
 * quad = 2):
 *   body 12 + cab 12 + 4 wheels x 24 + 2 exhausts x 12 + spoiler 12
 *   + 2 struts x 12 + face 2 = 182 triangles. Law is <= 300.
 * Textures: four 64px nearest-filtered canvases (texture.ts) — livery, tread,
 * hub, face. The livery is box-mapped so the whole decal lands on every face.
 * Flat (Lambert) shading — props never get a normal map and never pick up the
 * void's environment reflections; cheap things do not reflect the sky that
 * isn't there.
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
import { truckFace, truckHub, truckLivery, truckTread } from "./texture.js";

export const TRUCK_LAP_MS = 4200;
const STEP_FPS = 12;
/**
 * Down from 0.5, which was the body's own half-height: at that size the four
 * wheels were the truck and the truck was a rumour. Still oversized, because it
 * is a monster truck — just no longer the largest thing in its own silhouette.
 */
const WHEEL_R = 0.44;
/** `[x, z]`, tucked inside the body's width so they read as *under* it. */
const WHEELS: [number, number][] = [
  [0.82, 0.44],
  [0.82, -0.44],
  [-0.82, 0.44],
  [-0.82, -0.44],
];

export function Truck({ layout, phase }: { layout: StageLayout; phase: () => number }) {
  const group = useRef<THREE.Group>(null);
  const wheels = useRef<(THREE.Group | null)[]>([]);
  const wasAirborne = useRef(false);

  const livery = usePropTexture(truckLivery);
  const tread = usePropTexture(truckTread);
  const hub = usePropTexture(truckHub);
  const grille = usePropTexture(truckFace);

  // The livery doubles as its own emissive map: the flames and chrome stripe
  // glow faintly, which is what hands the cheap prop to the expensive bloom.
  //
  // Through `usePropMaterial` like everything else. These were three raw
  // `useMemo`s with no cleanup, from before `material.ts` existed to own
  // disposal — so every lap of the truck leaked three materials, which is a
  // slow drip nothing in the game could ever surface. It was the last prop
  // outside the contract.
  //
  // 0.28 rather than the 0.5 a black panel needed. The body is white now and
  // white is what bloom finds first: at the old value the whole truck came back
  // as one bright shape with the flames burnt out of it.
  const bodyMat = usePropMaterial({ map: livery, glow: 0.28 });
  const treadMat = usePropMaterial({ map: tread, glow: 0.06 });
  const hubMat = usePropMaterial({ map: hub, glow: 0.2 });
  const faceMat = usePropMaterial({ map: grille, glow: 0.2 });
  const darkMat = usePropMaterial({ color: "#402e3a" });
  const chromeMat = usePropMaterial({ color: "#dfe2ea", glow: 0.15 });

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
    //
    // Negative, which is the opposite of what it used to be. A positive yaw
    // swings the *nose* away from the lens, and the nose is where the face is —
    // the grille and the headlamps were pointed at the back wall for the whole
    // lap.
    //
    // And much further round than a "touch". At 0.34 the front face projects to
    // about a sixth of the flank's width, which is a sliver, not a face: the
    // mower's rule (a face on a side nobody sees is not a face) applies to
    // *angle* as well as to side. At 0.72 it is a proper three-quarter view —
    // the truck is angled at you while it laps sideways, which is both more
    // readable and the exact pose every monster truck poster has ever used.
    group.current.rotation.y = -0.72;

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
      {/* Body. Taller and lifted than it was, so the wheels tuck under it
          rather than standing beside it — the mower learned the same thing. */}
      <mesh material={bodyMat} position={[0, 1.04, 0]}>
        <boxGeometry args={[2.3, 0.74, 1.04]} />
      </mesh>
      {/* cab */}
      <mesh material={bodyMat} position={[-0.38, 1.68, 0]}>
        <boxGeometry args={[0.96, 0.6, 0.94]} />
      </mesh>
      {/* The face, on the front, which the yaw turns toward the audience. On
          the flank — where the mower's has to go, because the mower is in
          profile all act — this one would be scrolling past sideways. */}
      <mesh material={faceMat} position={[1.16, 1.04, 0]} rotation-y={Math.PI / 2}>
        <planeGeometry args={[1.04, 0.74]} />
      </mesh>
      {/* Wheels. Three material slots in three's own order — side, then both
          caps — so the tread wraps the rim and a chrome hub faces the camera on
          the near side of every wheel. That is the whole difference between a
          wheel and a hexagonal prism, and it costs no triangles. */}
      {WHEELS.map(([x, z], i) => (
        <group key={i} ref={(g) => (wheels.current[i] = g)} position={[x, WHEEL_R, z]}>
          <mesh material={[treadMat, hubMat, hubMat]} rotation-x={Math.PI / 2}>
            <cylinderGeometry args={[WHEEL_R, WHEEL_R, 0.4, 6]} />
          </mesh>
        </group>
      ))}
      {/* exhaust stacks */}
      <mesh material={chromeMat} position={[-0.7, 2.14, 0.3]} rotation-z={0.12}>
        <boxGeometry args={[0.14, 0.78, 0.14]} />
      </mesh>
      <mesh material={chromeMat} position={[-0.7, 2.14, -0.3]} rotation-z={0.12}>
        <boxGeometry args={[0.14, 0.78, 0.14]} />
      </mesh>
      {/* spoiler */}
      <mesh material={darkMat} position={[-1.16, 1.56, 0.32]} rotation-z={0.5}>
        <boxGeometry args={[0.09, 0.4, 0.09]} />
      </mesh>
      <mesh material={darkMat} position={[-1.16, 1.56, -0.32]} rotation-z={0.5}>
        <boxGeometry args={[0.09, 0.4, 0.09]} />
      </mesh>
      <mesh material={chromeMat} position={[-1.26, 1.74, 0]} rotation-z={0.5}>
        <boxGeometry args={[0.52, 0.09, 1.02]} />
      </mesh>
    </group>
  );
}
