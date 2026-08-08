/**
 * LANE-SOLVE — Quill's signature.
 *
 * A dotted trajectory draws itself across the frame, one dash per stepped
 * frame, to a reticle that snaps on in front of the board, holds a beat too
 * long, and then un-draws itself dash by dash. It is the diagram that appears
 * over the replay showing where the ball should have gone: Quill is not playing
 * you, it is annotating you.
 *
 * It shows you the line and it does not say whose, which is what keeps it
 * inside the claims law — it fires on `threat`, an estimate, and an overlay
 * with no destination named cannot overclaim one (`director/types.ts`).
 *
 * The exit is the un-draw, and that is not a fade: every dash is on or off,
 * the reticle is present or absent, nothing is ever half-opaque, and the last
 * frame of the act has none of it. An overlay leaves the way an overlay
 * leaves.
 *
 * Budget, audited: 12 dashes x 2 + reticle 4 quads x 2 = 32 triangles. No
 * texture at all — this is the one act in the game that is pure emissive
 * geometry, because a HUD drawn on a texture is a picture of a HUD.
 */

import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import * as THREE from "three";
import type { StageLayout } from "../stage/layout.js";
import { usePropMaterial } from "./material.js";
import { solvePose, stepped } from "./steps.js";

export const SOLVE_MS = 2700;
const STEP_FPS = 12;
const DASHES = 12;

export function LaneSolve({ layout, phase }: { layout: StageLayout; phase: () => number }) {
  const dashes = useRef<(THREE.Mesh | null)[]>([]);
  const reticle = useRef<THREE.Group>(null);
  const mat = usePropMaterial({ color: "#5fd8e8", glow: 1.4 });

  // Left edge to a point just off the board's centre, rising slightly — the
  // line a diagram draws, not the line an object travels.
  const x0 = -(layout.frameW / 2) - 2.2;
  const x1 = layout.frameW * 0.12;
  const y0 = -(layout.frameH / 2) + 0.6;
  const y1 = layout.frameH * 0.06;

  const at = (i: number) => {
    const u = i / (DASHES - 1);
    return [x0 + (x1 - x0) * u, y0 + (y1 - y0) * u] as const;
  };

  useFrame(() => {
    const seconds = (phase() * SOLVE_MS) / 1000;
    const t = stepped(seconds, STEP_FPS) / (SOLVE_MS / 1000);
    const pose = solvePose(t, DASHES);
    for (let i = 0; i < DASHES; i++) {
      const m = dashes.current[i];
      if (m) m.visible = i < pose.lit;
    }
    if (reticle.current) reticle.current.visible = pose.reticle;
  });

  const [rx, ry] = at(DASHES - 1);

  return (
    <group position={[0, 0, 3.2]}>
      {Array.from({ length: DASHES }, (_, i) => {
        const [x, y] = at(i);
        return (
          <mesh
            key={i}
            ref={(m) => {
              dashes.current[i] = m;
            }}
            material={mat}
            position={[x, y, 0]}
            visible={false}
          >
            <planeGeometry args={[0.42, 0.1]} />
          </mesh>
        );
      })}
      {/* Four ticks around nothing. A closed box would be a target; four
          corners is a measurement. */}
      <group ref={reticle} position={[rx, ry, 0]} visible={false}>
        <mesh material={mat} position={[0, 0.5, 0]}>
          <planeGeometry args={[0.09, 0.42]} />
        </mesh>
        <mesh material={mat} position={[0, -0.5, 0]}>
          <planeGeometry args={[0.09, 0.42]} />
        </mesh>
        <mesh material={mat} position={[-0.5, 0, 0]}>
          <planeGeometry args={[0.42, 0.09]} />
        </mesh>
        <mesh material={mat} position={[0.5, 0, 0]}>
          <planeGeometry args={[0.42, 0.09]} />
        </mesh>
      </group>
    </group>
  );
}
