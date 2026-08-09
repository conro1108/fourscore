/**
 * WRECKING-BALL — the threat gag, and the only act that crosses the whole
 * width in one gesture.
 *
 * A chain swings in from off-frame left, sweeps the entire width in front of
 * the board, hangs at the top of its arc for a fifth of the act, and swings
 * back out the way it came. It hits nothing. There was never anything to hit —
 * the board is behind it, and the ball goes past twice without noticing.
 *
 * The ball has half-lidded eyes pointed the way it is travelling, which is the
 * whole of its opinion about the job.
 *
 * Budget, audited (8x5 sphere = 64, box = 12, quad = 2):
 *   ball 64 + 8 chain links x 12 = 160, + face 2 = 162 triangles.
 *   Law is <= 300.
 */

import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import * as THREE from "three";
import type { StageLayout } from "../stage/layout.js";
import { usePropMaterial, usePropTexture } from "./material.js";
import { stepIndex, stepped, wreckingPose } from "./steps.js";
import { ironFace, ironSkin } from "./texture.js";

export const WRECKING_MS = 4000;
const STEP_FPS = 12;
const BALL_R = 1.15;
const LINKS = 8;

export function Wrecking({ layout, phase }: { layout: StageLayout; phase: () => number }) {
  const arm = useRef<THREE.Group>(null);
  const ball = useRef<THREE.Group>(null);

  const iron = usePropTexture(ironSkin);
  const face = usePropTexture(ironFace);
  const ironMat = usePropMaterial({ map: iron, glow: 0.12 });
  const faceMat = usePropMaterial({ map: face, glow: 0.18, alphaTest: 0.5 });
  const linkMat = usePropMaterial({ color: "#6c737f", glow: 0.1 });

  // The pivot hangs above the top of the frame, off-screen, and the chain is
  // long enough that the ball swings through the board's own height. At the
  // extremes of the arc the ball is past both edges, which is what makes the
  // entrance and the exit off-stage rather than a fade at the sides.
  const pivotY = layout.frameH / 2 + 2.2;
  const chain = layout.frameH * 0.72 + 2.2;

  useFrame(() => {
    if (!arm.current || !ball.current) return;
    const seconds = (phase() * WRECKING_MS) / 1000;
    const t = stepped(seconds, STEP_FPS) / (WRECKING_MS / 1000);
    const pose = wreckingPose(t, stepIndex(seconds, STEP_FPS));

    arm.current.rotation.z = -pose.swing;
    // The rattle is on the ball alone, along the chain: the links stay put and
    // the weight on the end of them shakes, which is the difference between a
    // chain and a stick.
    ball.current.position.y = -chain + pose.rattle;
    // The face stays upright while the arm swings, so the ball reads as looking
    // where it is going rather than as a decal rotating with the geometry.
    ball.current.rotation.z = pose.swing;
  });

  return (
    <group ref={arm} position={[0, pivotY, 3.2]}>
      {/* The chain. Links alternate wide and narrow rather than upright and
          sideways: turning every other one flat on its side is what a chain
          really does and from the front it draws three loose crossbars with
          gaps between them. Alternating the *thickness* keeps the line
          continuous and still says interlocking, at eight boxes. */}
      {Array.from({ length: LINKS }, (_, i) => (
        <mesh key={i} material={linkMat} position={[0, (-(i + 0.5) * chain) / LINKS, 0]}>
          <boxGeometry
            args={
              i % 2 === 0
                ? [0.3, (chain / LINKS) * 0.96, 0.12]
                : [0.12, (chain / LINKS) * 0.96, 0.3]
            }
          />
        </mesh>
      ))}
      <group ref={ball} position={[0, -chain, 0]}>
        <mesh material={ironMat}>
          <sphereGeometry args={[BALL_R, 8, 5]} />
        </mesh>
        {/* The eyes, as a decal on a quad in front of the sphere. A sphere's
            UVs wrap the whole tile around it, so a face painted into the skin
            would appear once at the back and stretched into a band at the
            poles. */}
        <mesh material={faceMat} position={[0, 0.1, BALL_R * 0.96]}>
          <planeGeometry args={[BALL_R * 1.7, BALL_R * 1.7]} />
        </mesh>
      </group>
    </group>
  );
}
