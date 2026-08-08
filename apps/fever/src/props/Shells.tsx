/**
 * SHELL-GAME — Cinder's signature.
 *
 * Three cups slide in, swap three times, and one lifts. Nothing under it. Then
 * all three lift. Nothing under any of them. They slide off.
 *
 * The swaps are *cuts*: a cup is at one slot on one frame and at another on
 * the next, with nothing in between. A smooth arc would be a magician doing a
 * trick; a cut is a machine playing a clip of a trick, which is the reference.
 * It also means the act never once has to decide what is under a cup, because
 * the answer is fixed and it is nothing — Cinder "sets two traps and offers you
 * one", and this is that with the count taken to its conclusion.
 *
 * Budget, audited: three 8-sided open cylinders with a top cap = 3 x 24 = 72,
 * plus a table slab 12 = 84 triangles. One 64px texture, shared.
 */

import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import * as THREE from "three";
import type { StageLayout } from "../stage/layout.js";
import { usePropMaterial, usePropTexture } from "./material.js";
import { shellPose, stepped } from "./steps.js";
import { cupSkin } from "./texture.js";

export const SHELLS_MS = 3800;
const STEP_FPS = 12;
const CUPS = 3;
const CUP_H = 0.8;

export function Shells({ layout, phase }: { layout: StageLayout; phase: () => number }) {
  const row = useRef<THREE.Group>(null);
  const cups = useRef<(THREE.Group | null)[]>([]);
  const skin = usePropTexture(cupSkin);
  const mat = usePropMaterial({ map: skin, glow: 0.3 });
  // Light enough to read as a surface. At the void's own near-black the table
  // vanished and the cups looked like they were standing on nothing.
  const tableMat = usePropMaterial({ color: "#4a4356", glow: 0.1 });

  const spacing = Math.min(layout.frameW * 0.15, 1.1);
  // Off to the right of the board, low, on its own little table. Pulled well
  // inside the frame: a prop this far forward is thrown further out by
  // perspective than its world x suggests, and the first pass put the third
  // cup half off the picture.
  const x = layout.frameW * 0.24;
  const y = -(layout.frameH / 2) + 1.1;
  const exit = layout.frameW * 0.7 + 4;

  useFrame(() => {
    if (!row.current) return;
    const seconds = (phase() * SHELLS_MS) / 1000;
    const t = stepped(seconds, STEP_FPS) / (SHELLS_MS / 1000);
    // Every cup reads the same phase, so `offstage` is the same for all three;
    // taking it off cup 0 keeps the row a single object.
    row.current.position.x = x + shellPose(t, 0).offstage * exit;
    for (let i = 0; i < CUPS; i++) {
      const g = cups.current[i];
      if (!g) continue;
      const pose = shellPose(t, i);
      g.position.x = (pose.slot - (CUPS - 1) / 2) * spacing;
      g.position.y = pose.lift * 0.7;
    }
  });

  return (
    <group ref={row} position={[x - exit, y, 3.0]}>
      <mesh material={tableMat} position={[0, -0.14, 0]}>
        <boxGeometry args={[spacing * 3.2, 0.14, 1.0]} />
      </mesh>
      {Array.from({ length: CUPS }, (_, i) => (
        <group
          key={i}
          ref={(g) => {
            cups.current[i] = g;
          }}
        >
          <mesh material={mat} position={[0, CUP_H / 2, 0]}>
            {/* Open at the bottom, which is also the honest way to build a
                thing whose inside the player is going to be shown. */}
            <cylinderGeometry args={[0.3, 0.4, CUP_H, 8, 1, true]} />
          </mesh>
          <mesh material={mat} position={[0, CUP_H, 0]} rotation-x={-Math.PI / 2}>
            <circleGeometry args={[0.3, 8]} />
          </mesh>
        </group>
      ))}
    </group>
  );
}
