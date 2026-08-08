/**
 * PINSETTER — The Oracle's signature.
 *
 * A white machine with five prongs lowers from the top of the frame on two
 * stepped beats, hovers over the board doing nothing, and rises back out on
 * two more. Nothing is set. Nothing is cleared. It comes down when it comes
 * down; it has never been reacting to you.
 *
 * There is no interpolation anywhere in the movement — `pinsetterHeight` is a
 * lookup table with five entries. Everything else in the game that steps is a
 * smooth curve sampled on a hard clock; this one has no curve underneath it at
 * all, which is why the Oracle's clip feels like a different class of object
 * from the rest of the cast.
 *
 * The prong count is five, and it is five on a nine-wide board too. The
 * machine is not sized to your game.
 *
 * Budget, audited: body 12 + 5 prongs x 12 = 72 triangles. One 64px texture on
 * the body; the prongs are flat bone.
 */

import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import * as THREE from "three";
import type { StageLayout } from "../stage/layout.js";
import { usePropMaterial, usePropTexture } from "./material.js";
import { pinsetterHeight, stepped } from "./steps.js";
import { machineSkin } from "./texture.js";

export const PINSETTER_MS = 4000;
const STEP_FPS = 12;
const PRONGS = 5;

export function Pinsetter({ layout, phase }: { layout: StageLayout; phase: () => number }) {
  const group = useRef<THREE.Group>(null);
  const skin = usePropTexture(machineSkin);
  const bodyMat = usePropMaterial({ map: skin, glow: 0.25 });
  const prongMat = usePropMaterial({ color: "#d8d2c4", glow: 0.15 });

  const width = Math.min(layout.frameW * 0.62, 6);
  // Its lowest position is over the *middle* of the board, not its top edge.
  // Sitting on the rim reads as a machine that has arrived somewhere; hanging
  // over the middle of a game it has no business with is the whole gag.
  const low = -layout.frameH * 0.12;
  const travel = layout.frameH + 5;

  useFrame(() => {
    if (!group.current) return;
    const seconds = (phase() * PINSETTER_MS) / 1000;
    const t = stepped(seconds, STEP_FPS) / (PINSETTER_MS / 1000);
    group.current.position.y = low + pinsetterHeight(t) * travel;
  });

  return (
    <group ref={group} position={[0, low + travel, 2.9]}>
      <mesh material={bodyMat}>
        <boxGeometry args={[width, 0.9, 1.1]} />
      </mesh>
      {Array.from({ length: PRONGS }, (_, i) => (
        <mesh
          key={i}
          material={prongMat}
          position={[(i - (PRONGS - 1) / 2) * (width / PRONGS), -1.05, 0]}
        >
          <boxGeometry args={[0.14, 1.2, 0.14]} />
        </mesh>
      ))}
    </group>
  );
}
