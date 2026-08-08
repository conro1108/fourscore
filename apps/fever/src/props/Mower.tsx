/**
 * THE MOWER — Moss's signature clip, and the sprinkler's replacement.
 *
 * A ride-on mower with a face crosses the frame at one speed, stops in the
 * middle for a quarter of the act for no reason anybody could name, and
 * continues. It cuts nothing. Nothing grows here.
 *
 * The sprinkler it replaces was the persona taken literally — the groundskeeper
 * has groundskeeping equipment — and it was the weakest thing on the stage
 * because it was a *thing*. The reference's cast is sentient: the clip is
 * funny when the equipment has a face and an inner life it is not sharing. Same
 * persona, same pace, same watering-nothing joke; a character doing it.
 *
 * It is the act the player sees most on Moss's stage, so it is also the
 * quietest thing in the roster: one idling engine, no flinch, no claim.
 *
 * Budget, audited (6-seg closed cylinder = 24, box = 12, quad = 2):
 *   body 12 + seat 12 + 4 wheels x 24 = 120, + face 2 + blades 2 = 124
 *   triangles. Law is <= 300.
 */

import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import * as THREE from "three";
import type { StageLayout } from "../stage/layout.js";
import { usePropMaterial, usePropTexture } from "./material.js";
import { mowerPose, stepIndex, stepped } from "./steps.js";
import { mowerFace, mowerLivery } from "./texture.js";

/**
 * Long, and the longest act in the game that isn't the ending. It has to be:
 * the hold in the middle is the joke, and a hold you can wait out is not a hold
 * that has gone on too long. The stage's one-act-at-a-time rule means Moss's
 * screen is genuinely quieter than everybody else's, which is correct.
 */
export const MOWER_MS = 4600;
const STEP_FPS = 12;

/**
 * Built at roughly a metre and shown at nearly two.
 *
 * The first pass was modelled to its own sensible proportions and came back
 * from the harness as a pile of green boxes along the bottom edge — correct,
 * detailed, and unreadable. Wrong-scale is in the taste law by name and this is
 * which direction it goes: a prop has about a second to say what it is, and a
 * mower the size of a mower says nothing at all.
 */
const SCALE = 1.65;

/**
 * `[x, radius, z]` — small at the front, big at the back, as they are, and both
 * pairs tucked inside the body's own width.
 *
 * They were outboard of it to start with, at a real mower's track, and the near
 * pair read as two black hexagons floating in front of the machine rather than
 * as wheels under it. Nothing about a six-segment cylinder says "wheel" on its
 * own; what says it is being *underneath something*.
 */
const WHEELS: [number, number, number][] = [
  [-0.62, 0.22, 0.26],
  [-0.62, 0.22, -0.26],
  [0.6, 0.28, 0.26],
  [0.6, 0.28, -0.26],
];

export function Mower({ layout, phase }: { layout: StageLayout; phase: () => number }) {
  const group = useRef<THREE.Group>(null);
  const chassis = useRef<THREE.Group>(null);
  const blades = useRef<THREE.Mesh>(null);
  const wheels = useRef<(THREE.Group | null)[]>([]);

  const livery = usePropTexture(mowerLivery);
  const face = usePropTexture(mowerFace);
  const bodyMat = usePropMaterial({ map: livery, glow: 0.2 });
  const faceMat = usePropMaterial({ map: face, glow: 0.4, alphaTest: 0.5 });
  const tyreMat = usePropMaterial({ color: "#221c28" });
  const bladeMat = usePropMaterial({ color: "#8f98a8", glow: 0.15 });

  // The mascot's lane, and for the same reason: props this far forward are
  // pushed down the screen by perspective, so the floor is the frame's bottom
  // edge rather than the space under it.
  const xStart = -(layout.frameW / 2 + 3.6);
  const xEnd = layout.frameW / 2 + 3.6;
  const yGround = -(layout.frameH / 2) + 0.2;

  useFrame(() => {
    if (!group.current || !chassis.current) return;
    const seconds = (phase() * MOWER_MS) / 1000;
    const t = stepped(seconds, STEP_FPS) / (MOWER_MS / 1000);
    const pose = mowerPose(t, stepIndex(seconds, STEP_FPS));

    group.current.position.set(xStart + pose.u * (xEnd - xStart), yGround, 2.4);
    // The jolt is on the chassis, not the group: the wheels stay on the floor
    // and the body shakes on top of them, which is the only thing separating an
    // idling engine from a prop with a vertical bug.
    chassis.current.position.y = pose.jolt;
    if (blades.current) blades.current.rotation.y = pose.blades;
    // Wheels roll off distance travelled, not off time, so they stop dead when
    // it stops. A wheel still turning under a stationary machine is the exact
    // kind of accidental badness the taste law is about — and the mower stands
    // still for a quarter of the act, so there is a lot of time to notice.
    const rolled = pose.u * (xEnd - xStart);
    wheels.current.forEach((wheel, i) => {
      if (wheel) wheel.rotation.z = -rolled / WHEELS[i]![1];
    });
  });

  return (
    <group ref={group} position={[xStart, yGround, 2.4]} scale={SCALE}>
      {/* The cutting deck, low and forward, with the blades under it. */}
      <mesh ref={blades} material={bladeMat} position={[0, 0.2, 0]} rotation-x={-Math.PI / 2}>
        <planeGeometry args={[1.5, 0.5]} />
      </mesh>
      <group ref={chassis}>
        {/* One body, not four. The first pass was a deck, a hood, a seat and a
            face at a mower's real proportions, and it came back from the
            harness as a pile of green boxes — every part correct and the whole
            thing illegible. A prop gets about a second to say what it is, so
            what it is has to be one shape with one detail on it. */}
        {/* Its bottom edge sits below the top of the rear wheels on purpose:
            the wheels are inboard in z, so the overlap is *inside* the body and
            all you see of them is the part below it. Tucked and clear of the
            face plane in one placement — at the track a real mower has, the
            near pair read as loose hexagons in front of the machine, and half a
            centimetre further forward they poked through its cheek. */}
        <mesh material={bodyMat} position={[0, 0.66, 0]}>
          <boxGeometry args={[1.9, 0.7, 0.78]} />
        </mesh>
        {/* The face on the *side*, facing the camera. On the front — where a
            machine's face would be — it would be turned away for the whole act:
            this thing crosses the frame in profile, so a front-mounted face is
            a face nobody ever sees. A face on the flank is wrong in a way that
            is legible, which is the trade the taste law asks for every time. It
            looks at you for five seconds and does not adjust its course. */}
        <mesh material={faceMat} position={[0, 0.66, 0.4]}>
          <planeGeometry args={[1.5, 0.6]} />
        </mesh>
        {/* The seat, which is the only thing that says this is ridden, and the
            silhouette's one interruption. Nobody is on it. */}
        <mesh material={bodyMat} position={[0.72, 1.17, 0]}>
          <boxGeometry args={[0.42, 0.34, 0.6]} />
        </mesh>
      </group>
      {WHEELS.map(([x, r, z], i) => (
        <group key={i} ref={(w) => (wheels.current[i] = w)} position={[x, r, z]}>
          {/* The spin is on the group and the lay-down is on the mesh: one
              rotation each, so neither has to be composed with the other. */}
          <mesh material={tyreMat} rotation-x={Math.PI / 2}>
            <cylinderGeometry args={[r, r, 0.14, 6]} />
          </mesh>
        </group>
      ))}
    </group>
  );
}
