/**
 * FOAM-FINGER — the brilliant-move gag, and the only prop that addresses you.
 *
 * A foam hand the height of the board rises out of the floor on four hard
 * steps, wags twice, points at the camera for a quarter of the act, and sinks
 * back out. Two wags and not three: three is a character emoting, two is a
 * machine playing a cel it has played before.
 *
 * Everything else in the roster performs at the stage. This one turns round,
 * which is why it holds the point for so long and does nothing else in it — the
 * held frame is the act, and the wags are how it earns the held frame.
 *
 * It says NO. 1 and it is not saying it about you specifically. It says NO. 1
 * on the menu too.
 *
 * Budget, audited (box = 12): palm 12 + index 12 + thumb 12 + cuff 12 = 48
 * triangles. Law is <= 300 — the cheapest act in the game, and the biggest.
 */

import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import * as THREE from "three";
import type { StageLayout } from "../stage/layout.js";
import { usePropMaterial, usePropTexture } from "./material.js";
import { fingerPose, stepped } from "./steps.js";
import { foamSkin } from "./texture.js";

export const FINGER_MS = 3200;
const STEP_FPS = 12;

export function Finger({ layout, phase }: { layout: StageLayout; phase: () => number }) {
  const group = useRef<THREE.Group>(null);

  const foam = usePropTexture(foamSkin);
  // The decal goes on the palm and nowhere else. Box-mapping the livery onto
  // every part put NO. 1 on the palm, the finger and the thumb at three
  // different sizes, and the harness handed back three green boxes with writing
  // on rather than a hand — the truck's toy-commercial trick doesn't survive a
  // prop whose whole read is its silhouette.
  const palmMat = usePropMaterial({ map: foam, glow: 0.35 });
  const foamMat = usePropMaterial({ color: "#7fe018", glow: 0.3 });
  const cuffMat = usePropMaterial({ color: "#5fae10", glow: 0.15 });

  // Down the right side, in front of the board, and tall: at full rise the
  // fingertip is level with the top of the frame. The berth is `right`, which
  // is why it can share the menu with the cannon on the left.
  const x = layout.frameW * 0.3;
  const height = layout.frameH * 0.7;
  const yHidden = -(layout.frameH / 2) - height;
  const yUp = -(layout.frameH / 2) + 1.1;

  useFrame(() => {
    if (!group.current) return;
    const seconds = (phase() * FINGER_MS) / 1000;
    const t = stepped(seconds, STEP_FPS) / (FINGER_MS / 1000);
    const pose = fingerPose(t);

    group.current.position.y = yHidden + pose.rise * (yUp - yHidden);
    // The wag pivots at the base, where a hand on a stick would pivot, rather
    // than at the middle of the prop — which reads as the whole thing sliding.
    group.current.rotation.z = pose.wag;
  });

  return (
    <group ref={group} position={[x, yHidden, 3.4]}>
      {/* Yawed toward the camera so the number is readable from the audience's
          seat rather than from the side of the stage. */}
      <group rotation-y={-0.34}>
        <mesh material={cuffMat} position={[0, height * 0.12, 0]}>
          <boxGeometry args={[1.5, height * 0.24, 0.4]} />
        </mesh>
        {/* The palm carries the decal. Everything else is foam. */}
        <mesh material={palmMat} position={[0, height * 0.45, 0]}>
          <boxGeometry args={[1.7, height * 0.42, 0.42]} />
        </mesh>
        {/* The one raised finger, offset from the palm's centre because a hand
            is not symmetrical and a prop that is reads as a paddle. */}
        <mesh material={foamMat} position={[-0.25, height * 0.79, 0]}>
          <boxGeometry args={[0.7, height * 0.28, 0.42]} />
        </mesh>
        <mesh material={foamMat} position={[0.85, height * 0.5, 0]} rotation-z={-0.5}>
          <boxGeometry args={[0.55, height * 0.26, 0.4]} />
        </mesh>
      </group>
    </group>
  );
}
