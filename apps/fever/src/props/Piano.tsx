/**
 * PIANO-DROP — the blunder gag, falling past the whole board.
 *
 * A grand piano comes down from above the top of the frame, stops dead in
 * mid-air in front of the board for a third of the act, acquires a tilt on the
 * frame it stops, then falls the rest of the way and out the bottom. A beat
 * later one white key bounces back up into the empty frame and goes down again.
 *
 * Nothing catches it and nothing holds it — the hold is the taste law's "the
 * physics make absolutely no sense" taken at its word, and it is the only thing
 * in the act that is a joke rather than a fall. The piano has a face, because a
 * prop with no face is the weakest thing on the stage (VISION.md) and this one
 * had a mouth already: the keys are teeth the moment there are eyes above them.
 *
 * It is an *upright*, and that was the harness's call rather than a taste one.
 * A grand modelled at a grand's proportions and viewed from the audience's seat
 * is a flat dark bar with a stick on it — correct, and unreadable, which is the
 * same failure the mower's first pass recorded. An upright seen face-on is a
 * rectangle with a keyboard across it and two eyes above that, and it says what
 * it is in the one second it has before it leaves the frame.
 *
 * Budget, audited (box = 12, quad = 2):
 *   body 12 + lid 12 + shelf 12 + 2 legs x 12 = 60, + keys 2 + face 2
 *   + loose key 12 = 76 triangles. Law is <= 300.
 */

import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import * as THREE from "three";
import { stageFx } from "../stage/fx.js";
import type { StageLayout } from "../stage/layout.js";
import { usePropMaterial, usePropTexture } from "./material.js";
import { pianoPose, stepped } from "./steps.js";
import { pianoFace, pianoKeys, pianoLacquer } from "./texture.js";

export const PIANO_MS = 3400;
const STEP_FPS = 12;
/** Roughly three columns wide and as tall as half the board. */
const W = 2.8;
const H = 2.5;

export function Piano({ layout, phase }: { layout: StageLayout; phase: () => number }) {
  const group = useRef<THREE.Group>(null);
  const key = useRef<THREE.Mesh>(null);
  const wasPresent = useRef(false);

  const lacquer = usePropTexture(pianoLacquer);
  const keys = usePropTexture(pianoKeys);
  const eyes = usePropTexture(pianoFace);
  const bodyMat = usePropMaterial({ map: lacquer, glow: 0.25 });
  // Both kept low. Ivory and eye-whites are the brightest things on a prop this
  // dark, so bloom finds them first — at 0.4 the face was a lamp.
  const keyMat = usePropMaterial({ map: keys, glow: 0.12 });
  const faceMat = usePropMaterial({ map: eyes, glow: 0.15, alphaTest: 0.5 });
  const shelfMat = usePropMaterial({ color: "#1a1520" });
  const ivoryMat = usePropMaterial({ color: "#e8e4f0", glow: 0.3 });

  // Dead centre in x and well in front of the board: the whole point is that it
  // falls past the game rather than beside it.
  const x = 0;
  const z = 3.4;

  useFrame(() => {
    if (!group.current) return;
    const seconds = (phase() * PIANO_MS) / 1000;
    const t = stepped(seconds, STEP_FPS) / (PIANO_MS / 1000);
    const pose = pianoPose(t);

    group.current.visible = pose.present;
    group.current.position.set(x, pose.y * layout.frameH, z);
    group.current.rotation.z = pose.tilt;

    if (key.current) {
      key.current.visible = pose.key !== null;
      if (pose.key !== null) key.current.position.y = pose.key * layout.frameH;
    }

    // The stage flinches when it goes, not when it stops: the hold is silent on
    // purpose, and a flinch there would tell you something had happened.
    if (wasPresent.current && !pose.present) stageFx.lastLandAt = performance.now();
    wasPresent.current = pose.present;
  });

  return (
    <>
      <group ref={group} position={[x, layout.frameH, z]}>
        {/* One body and one lid, not a piano. Every extra part on a prop this
            size is detail nobody reads while it is falling. */}
        <mesh material={bodyMat}>
          <boxGeometry args={[W, H, 0.8]} />
        </mesh>
        <mesh material={bodyMat} position={[0, H / 2 + 0.1, 0.06]}>
          <boxGeometry args={[W + 0.2, 0.2, 0.95]} />
        </mesh>
        {/* The face, on the fallboard, facing the camera. Same placement rule
            as the mower's: a face on a side nobody sees is not a face. */}
        <mesh material={faceMat} position={[0, H * 0.24, 0.41]}>
          <planeGeometry args={[W * 0.8, W * 0.8 * 0.62]} />
        </mesh>
        {/* The keyboard, square-on to the camera rather than lying flat on a
            shelf. A shelf is where a keyboard really is and it is edge-on from
            the audience's seat — the harness handed back a dashed line, which
            reads as a mouth and not as a piano. Turned to face front the black
            and white pattern is the thing that says what this prop is, and it
            is still a mouth, which is the whole design. */}
        <mesh material={shelfMat} position={[0, -H * 0.2, 0.42]}>
          <boxGeometry args={[W * 0.94, 0.72, 0.3]} />
        </mesh>
        <mesh material={keyMat} position={[0, -H * 0.2, 0.58]}>
          <planeGeometry args={[W * 0.88, 0.58]} />
        </mesh>
        {[-W * 0.4, W * 0.4].map((lx, i) => (
          <mesh key={i} material={bodyMat} position={[lx, -H * 0.62, 0.2]}>
            <boxGeometry args={[0.22, H * 0.24, 0.3]} />
          </mesh>
        ))}
      </group>

      {/* The exit. One key, from off the bottom of an empty frame, and back
          down. Nobody is shown what it bounced off. */}
      <mesh ref={key} material={ivoryMat} position={[0.6, -layout.frameH, z]} visible={false}>
        <boxGeometry args={[0.22, 0.9, 0.16]} />
      </mesh>
    </>
  );
}
