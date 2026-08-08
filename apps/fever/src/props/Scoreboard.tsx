/**
 * SCORE-LIE — Vane's signature.
 *
 * A scoring monitor lowers on a bracket, displays a mark, holds, and on one
 * frame in the middle of the hold the mark silently becomes a different one.
 * Then it retracts. It is not your score. It is not anyone's score.
 *
 * The lie is the whole act, and it has to stay *deniable* to be one: the marks
 * are bowling marks — a strike and a foul — on a game that is not bowling, so
 * the display can't be read as a claim about this position however you squint.
 * That matters, because this fires on `tension-shift`, which is the Director's
 * estimate, and an estimate may never assert a result (`director/types.ts`).
 * Vane's engine profile has `bluffs: true`; this is that mechanic given a face,
 * not a second channel of information.
 *
 * Budget, audited: housing 12 + glass quad 2 + bracket 12 = 26 triangles. One
 * 64px texture holding both marks, swapped by moving the UV offset half a tile.
 */

import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import * as THREE from "three";
import type { StageLayout } from "../stage/layout.js";
import { usePropMaterial, usePropTexture } from "./material.js";
import { scorePose, stepped } from "./steps.js";
import { scoreGlass } from "./texture.js";

export const SCORE_MS = 3000;
const STEP_FPS = 12;

export function Scoreboard({ layout, phase }: { layout: StageLayout; phase: () => number }) {
  const group = useRef<THREE.Group>(null);
  const bracket = useRef<THREE.Mesh>(null);
  const glass = usePropTexture(scoreGlass);
  const glassMat = usePropMaterial({ map: glass, glow: 0.8 });
  const caseMat = usePropMaterial({ color: "#2f2b3a", glow: 0.05 });

  // Off to the left, high — where a scoring monitor hangs.
  const x = -layout.frameW * 0.42;
  const top = layout.frameH / 2 + 3.2;
  const rest = layout.frameH / 2 - 1.4;

  useFrame(() => {
    if (!group.current || !bracket.current) return;
    const seconds = (phase() * SCORE_MS) / 1000;
    const t = stepped(seconds, STEP_FPS) / (SCORE_MS / 1000);
    const pose = scorePose(t);
    group.current.position.y = top + pose.drop * (rest - top);
    // The bracket stretches back up to wherever this thing is mounted, so it
    // is always hanging off something rather than floating.
    const length = Math.max(0.1, top + 3 - group.current.position.y);
    bracket.current.scale.y = length;
    bracket.current.position.y = 0.55 + length / 2;
    // The canvas is flipped, so the first mark is the *top* half of the tile.
    glass.offset.y = pose.mark === 0 ? 0.5 : 0;
  });

  return (
    <group ref={group} position={[x, top, 3.0]}>
      <mesh material={caseMat}>
        <boxGeometry args={[2.1, 1.15, 0.4]} />
      </mesh>
      <mesh material={glassMat} position={[0, 0, 0.21]}>
        <planeGeometry args={[1.85, 0.9]} />
      </mesh>
      <mesh ref={bracket} material={caseMat} position={[0, 1, 0]}>
        <boxGeometry args={[0.12, 1, 0.12]} />
      </mesh>
    </group>
  );
}
