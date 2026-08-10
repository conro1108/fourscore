/**
 * THE STARE — the mascot, in sunglasses, declining to perform.
 *
 * It rises out of the bottom of the frame in three hard steps, arrives at eye
 * level, leans once toward the lens, and holds there long past the point where
 * a clip should have ended. Then one frame, and it isn't there. It does not
 * hop, it does not roll, it does not react to anything, and it never leaves the
 * spot it came up in.
 *
 * This is the reference's "apex predator" trait taken as register rather than
 * as content: total confidence, zero action. And it is deliberately the *same
 * disc* as `Mascot` — same body, same grin, same 40 triangles — because a lane
 * screen's cast is unexplained by law. The character that hops twice when you
 * play well is also the character that comes up out of the floor and looks at
 * you, and the screen offers no account of the difference.
 *
 * It says nothing, which is what keeps it inside the claims law
 * (`director/types.ts`) on the events it answers: a disc having an attitude is
 * not a verdict.
 *
 * Budget, audited: one 10-segment closed cylinder = 40 triangles, face on the
 * caps as on the mascot. One 64px texture, Lambert flat.
 */

import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import * as THREE from "three";
import type { StageLayout } from "../stage/layout.js";
import { usePropMaterial, usePropTexture } from "./material.js";
import { starePose, stepped } from "./steps.js";
import { mascotFace } from "./texture.js";

export const STARE_MS = 3600;
const STEP_FPS = 12;
/**
 * Bigger than the mascot's 0.85. It is the same character at the wrong scale,
 * which is the cheapest way a screen has ever made something read as a threat —
 * and wrong-scale is in the taste law by name.
 */
const RADIUS = 1.35;

export function Stare({ layout, phase }: { layout: StageLayout; phase: () => number }) {
  const group = useRef<THREE.Group>(null);

  const face = usePropTexture(() => mascotFace("shades"));
  // Low, with the mascot: the bone face is what bloom finds first.
  const faceMat = usePropMaterial({ map: face, glow: 0.2 });
  const rimMat = usePropMaterial({ color: "#a3164e", glow: 0.15 });

  // Bottom right, in the rocket's berth: it comes up out of the floor at the
  // edge of the frame rather than in front of the board, so the board stays
  // readable while something is looking at you next to it.
  const x = layout.frameW * 0.33;
  const hidden = -(layout.frameH / 2) - RADIUS * 2;
  const shown = -(layout.frameH / 2) + RADIUS * 1.5;
  /**
   * How far the lean carries it toward the lens.
   *
   * Small, and the first pass wasn't: at 2.6 the disc arrived close enough to
   * the camera that perspective threw it off the bottom right of the picture
   * entirely, and the act's whole payload — a face, looking at you — played
   * outside the frame. Coming closer costs frame in both axes at once, so this
   * is the number that buys the menace and it has to stay cheap.
   */
  const LEAN_Z = 1.4;

  useFrame(() => {
    if (!group.current) return;
    const seconds = (phase() * STARE_MS) / 1000;
    const pose = starePose(stepped(seconds, STEP_FPS) / (STARE_MS / 1000));

    group.current.position.set(x, hidden + pose.rise * (shown - hidden), 3.0 + pose.lean * LEAN_Z);
    // The lean is a step forward in z and nothing else — no tilt, no scale.
    // Anything smoother would make it a creature moving; this is a cel change.
  });

  return (
    <group ref={group} position={[x, hidden, 3.0]}>
      {/* Material slots in three's own order: side, then both caps. The face
          rides the caps for the same reason it does on the mascot — a cap's UVs
          are already a circle, so it needs no alpha. */}
      <mesh material={[rimMat, faceMat, faceMat]} rotation-x={Math.PI / 2}>
        <cylinderGeometry args={[RADIUS, RADIUS, 0.4, 10]} />
      </mesh>
    </group>
  );
}
