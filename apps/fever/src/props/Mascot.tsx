/**
 * THE MASCOT — the lane screen's cast, and the first act built to VISION.md's
 * new pillar 2.
 *
 * A game disc with a face rolls in on its edge, performs the one canned
 * reaction it has for what you did, and rolls out. That is the whole reference
 * in one prop: a character with no origin, no stakes and no opinion, doing the
 * same bit it did last time because there is only one bit per outcome.
 *
 * Two acts, one component. `cheer` hops twice and spins; `flop` goes flat in a
 * single frame and stays flat a beat too long. Which one you get is decided by
 * `move.quality`, so the mascot is as wrong as the estimate is — and it never
 * says anything, which is what keeps a `move` gag inside the claims law
 * (`director/types.ts`): it is a disc having a feeling, not a verdict.
 *
 * Budget, audited: one 10-segment closed cylinder = 40 triangles, and the face
 * rides on its caps rather than on a quad of its own. One 64px texture,
 * Lambert flat.
 */

import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import * as THREE from "three";
import type { StageLayout } from "../stage/layout.js";
import { usePropMaterial, usePropTexture } from "./material.js";
import { mascotPose, stepped, type MascotMood } from "./steps.js";
import { mascotFace } from "./texture.js";

export const MASCOT_MS = 3400;
const STEP_FPS = 12;
const RADIUS = 0.85;

export function makeMascot(mood: MascotMood) {
  function Mascot({ layout, phase }: { layout: StageLayout; phase: () => number }) {
    const group = useRef<THREE.Group>(null);
    const body = useRef<THREE.Group>(null);

    const face = usePropTexture(() => mascotFace(mood === "cheer" ? "up" : "down"));
    // 0.18, down from 0.45. The face was gold and needed the lift to be seen at
    // all; it is bone now, and bone is what the bloom pass finds first — at the
    // old value the mascot arrived as a featureless glowing circle, which is
    // the same problem it had before, solved in the opposite direction. The
    // piano's note says this in its own words: eye-whites are a lamp at 0.4.
    const faceMat = usePropMaterial({ map: face, glow: 0.18 });
    const rimMat = usePropMaterial({ color: "#a3164e", glow: 0.15 });

    // Its lane is the floor, well below the board, running the whole width and
    // off both edges — it is never on screen at either end of the act.
    const xStart = -(layout.frameW / 2 + 3.4);
    const xEnd = layout.frameW / 2 + 3.4;
    // Its floor is the frame's bottom edge, not the space under it. Props this
    // far forward are pushed further down the screen by perspective than their
    // world y suggests, and at the truck's ground height the mascot played the
    // whole bit half off the bottom of the picture.
    const yGround = -(layout.frameH / 2) + 0.15;

    useFrame(() => {
      if (!group.current || !body.current) return;
      const seconds = (phase() * MASCOT_MS) / 1000;
      const t = stepped(seconds, STEP_FPS) / (MASCOT_MS / 1000);
      const pose = mascotPose(t, mood);

      group.current.position.set(
        xStart + pose.u * (xEnd - xStart),
        yGround + RADIUS * pose.squash + pose.hop,
        2.6,
      );
      group.current.rotation.z = pose.roll;
      // Squash is applied under the roll so a flattened disc stays flattened
      // against the floor rather than tipping with it.
      body.current.scale.set(1, pose.squash, 1);
    });

    return (
      <group ref={group} position={[xStart, yGround + RADIUS, 2.6]}>
        <group ref={body}>
          {/* Three material slots, in three's own order: side, then both caps.
              The face goes on the caps rather than on a quad in front, because
              a cap's UVs are already a circle — a square quad hands back the
              texture's transparent corners as a black box, and it would need
              alpha the rest of the prop system doesn't use. It also means the
              disc has a face on both sides, which is correct for a character
              nobody designed. */}
          <mesh material={[rimMat, faceMat, faceMat]} rotation-x={Math.PI / 2}>
            <cylinderGeometry args={[RADIUS, RADIUS, 0.34, 10]} />
          </mesh>
        </group>
      </group>
    );
  }
  Mascot.displayName = `Mascot(${mood})`;
  return Mascot;
}
