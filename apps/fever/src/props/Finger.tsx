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
 * It was four boxes at a paddle's proportions and it came back from the harness
 * as a stack of green rectangles with Arial on the middle one. Three fixes, and
 * they are the three the whole roster needed:
 *
 *  - **Silhouette.** A foam finger is mostly *finger*. The index is now nearly
 *    half the prop's height and narrow, and two knuckles step down the palm to
 *    its right — the notch between the raised finger and the folded ones is the
 *    only thing that makes a hand a hand rather than a mitten.
 *  - **The word is a decal, not the livery.** `NO. 1` was baked into the
 *    box-mapped skin, so it landed on the palm, the finger and the thumb at
 *    three sizes. It is one quad now, outlined, sized once.
 *  - **A face.** Two eyes on the fingertip. The one act that turns round and
 *    points at the camera held that frame with nothing on it; now the thing
 *    pointing at you is looking slightly past you.
 *
 * Budget, audited (box = 12, quad = 2): cuff 12 + palm 12 + index 12
 * + 2 knuckles x 12 + thumb 12 = 72, + number 2 + eyes 2 = 76 triangles.
 * Law is <= 300.
 */

import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import * as THREE from "three";
import type { StageLayout } from "../stage/layout.js";
import { usePropMaterial, usePropTexture } from "./material.js";
import { fingerPose, stepped } from "./steps.js";
import { foamCuff, foamEyes, foamNumber, foamSkin } from "./texture.js";

export const FINGER_MS = 3200;
const STEP_FPS = 12;

export function Finger({ layout, phase }: { layout: StageLayout; phase: () => number }) {
  const group = useRef<THREE.Group>(null);

  const foam = usePropTexture(foamSkin);
  const cuffTex = usePropTexture(foamCuff);
  const number = usePropTexture(foamNumber);
  const eyes = usePropTexture(foamEyes);
  // One foam livery on every part of the hand, carrying the ink outline the
  // silhouette needs, and the writing on a quad of its own. Box-mapping the
  // *word* onto every part is what put NO. 1 on the palm, the finger and the
  // thumb at three different sizes — the truck's toy-commercial trick doesn't
  // survive a prop whose whole read is its silhouette.
  const foamMat = usePropMaterial({ map: foam, glow: 0.28 });
  const cuffMat = usePropMaterial({ map: cuffTex, glow: 0.18 });
  const numberMat = usePropMaterial({ map: number, glow: 0.3, alphaTest: 0.5 });
  const eyeMat = usePropMaterial({ map: eyes, glow: 0.25, alphaTest: 0.5 });

  // Down the right side, in front of the board, and tall: at full rise the
  // fingertip is level with the top of the frame. The berth is `right`, which
  // is why it can share the menu with the cannon on the left.
  const x = layout.frameW * 0.3;
  const height = layout.frameH * 0.78;
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
        {/* The wristband, in the disc crimson: the one part of the prop that
            isn't green, which is what stops the whole hand reading as one
            extruded shape from the ankle up. */}
        <mesh material={cuffMat} position={[0, height * 0.07, 0]}>
          <boxGeometry args={[1.4, height * 0.14, 0.44]} />
        </mesh>
        <mesh material={foamMat} position={[0, height * 0.31, 0]}>
          <boxGeometry args={[1.8, height * 0.34, 0.46]} />
        </mesh>
        {/* The folded fingers, as two knuckles stepping down to the right of
            the raised one. This is the notch — a palm with a single spike on it
            is a paddle, and the step is the only thing that says hand. */}
        {/* Thinner in z than the palm, and not by accident: at the palm's own
            depth their front and back faces are coplanar with it and the seam
            dithers. Two hundredths is enough and nothing reads it as a step. */}
        <mesh material={foamMat} position={[0.2, height * 0.505, 0]}>
          <boxGeometry args={[0.58, height * 0.13, 0.42]} />
        </mesh>
        <mesh material={foamMat} position={[0.72, height * 0.49, 0]}>
          <boxGeometry args={[0.46, height * 0.1, 0.42]} />
        </mesh>
        {/* The one raised finger: long, narrow, and offset from the palm's
            centre, because a hand is not symmetrical and a prop that is reads
            as a paddle. Nearly half the prop's height — a foam finger is
            mostly finger, and the old one was a stub. */}
        <mesh material={foamMat} position={[-0.44, height * 0.71, 0]}>
          <boxGeometry args={[0.68, height * 0.46, 0.44]} />
        </mesh>
        {/* The eyes, on the tip, facing the way it points. */}
        <mesh material={eyeMat} position={[-0.44, height * 0.855, 0.24]}>
          <planeGeometry args={[0.6, 0.4]} />
        </mesh>
        {/* The thumb, out to the side and angled up. */}
        <mesh material={foamMat} position={[0.94, height * 0.34, 0]} rotation-z={-0.72}>
          <boxGeometry args={[0.5, height * 0.24, 0.4]} />
        </mesh>
        {/* The word, once, at one size, on the palm. */}
        <mesh material={numberMat} position={[0, height * 0.31, 0.24]}>
          <planeGeometry args={[1.55, 1.0]} />
        </mesh>
      </group>
    </group>
  );
}
