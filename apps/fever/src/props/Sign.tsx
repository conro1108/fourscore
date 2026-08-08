/**
 * SIGN-HOLD — the dubious-move gag, and the smallest act in the game.
 *
 * A hand-lettered sign pops up over the bottom edge of the frame, waggles on
 * the two-frame clock, and drops. It says `HMM.` — a reaction, not a verdict,
 * which is the whole reason a `move` gag is allowed to speak at all.
 *
 * Budget, audited: panel 12 + stick 12 = 24 triangles. One 64px texture.
 */

import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import * as THREE from "three";
import type { StageLayout } from "../stage/layout.js";
import { usePropMaterial, usePropTexture } from "./material.js";
import { signPose, stepIndex, stepped } from "./steps.js";
import { signFace } from "./texture.js";

export const SIGN_MS = 1500;
const STEP_FPS = 12;

export function makeSign(text: string) {
  function Sign({ layout, phase }: { layout: StageLayout; phase: () => number }) {
    const group = useRef<THREE.Group>(null);

    const face = usePropTexture(() => signFace(text));
    const faceMat = usePropMaterial({ map: face, glow: 0.5 });
    const stickMat = usePropMaterial({ color: "#c8ccd4" });

    const x = -layout.frameW * 0.34;
    const hidden = -(layout.frameH / 2) - 2.4;
    const shown = -(layout.frameH / 2) + 0.35;

    useFrame(() => {
      if (!group.current) return;
      const seconds = (phase() * SIGN_MS) / 1000;
      const t = stepped(seconds, STEP_FPS) / (SIGN_MS / 1000);
      const pose = signPose(t, stepIndex(seconds, STEP_FPS));
      group.current.position.set(x, hidden + pose.rise * (shown - hidden), 3.4);
      group.current.rotation.z = pose.lean;
    });

    return (
      <group ref={group} position={[x, hidden, 3.4]}>
        <mesh material={faceMat} position={[0, 0.85, 0]}>
          <boxGeometry args={[1.35, 1.05, 0.06]} />
        </mesh>
        <mesh material={stickMat} position={[0, -0.1, 0]}>
          <boxGeometry args={[0.1, 1.3, 0.1]} />
        </mesh>
      </group>
    );
  }
  Sign.displayName = `Sign(${text})`;
  return Sign;
}
