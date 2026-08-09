/**
 * MIRROR-BALL — the tension-rising gag.
 *
 * A mirror ball is winched down from above the frame on four hard steps, spins
 * at dead centre in front of the board for two-thirds of the act, and is
 * winched back up. Nothing else happens. It is the one act in the new set that
 * arrives *where the game is* rather than crossing past it — it comes down in
 * the middle and stays long enough to be in the way, which is the joke: the
 * position is sharpening and the screen has decided this is a disco.
 *
 * A mirror ball at 12fps is a strobe rather than a sweep, and that is why the
 * spin is stepped like everything else: the light squares it throws jump around
 * the void in whole chunks. Wrong, and wrong the same way every time.
 *
 * Budget, audited (8x5 sphere = 64, box = 12, quad = 2):
 *   ball 64 + wire 12 + 4 light quads x 2 = 84 triangles. Law is <= 300.
 */

import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import * as THREE from "three";
import type { StageLayout } from "../stage/layout.js";
import { usePropMaterial, usePropTexture } from "./material.js";
import { mirrorPose, stepIndex, stepped } from "./steps.js";
import { mirrorFacets } from "./texture.js";

export const MIRROR_MS = 4400;
const STEP_FPS = 12;
const BALL_R = 1.0;

/**
 * Where the thrown light lands, in frame-widths and frame-heights from the
 * centre. Four squares, fixed, because randomness picks which gag fires and
 * never how it looks — a mirror ball that scattered light differently each time
 * would be the only non-repeating thing on the stage.
 */
/**
 * They land in the void *around* the board rather than on it. Inside the
 * board's footprint they read as four white discs sitting in empty holes — a
 * board with the wrong pieces in it, which is the one thing spectacle is never
 * allowed to look like.
 */
const GLINTS: [x: number, y: number, size: number][] = [
  [-0.72, 0.34, 1.2],
  [0.68, -0.22, 0.9],
  [0.78, 0.42, 0.6],
  [-0.64, -0.4, 1.0],
];

export function MirrorBall({ layout, phase }: { layout: StageLayout; phase: () => number }) {
  const group = useRef<THREE.Group>(null);
  const ball = useRef<THREE.Mesh>(null);
  const glints = useRef<(THREE.Mesh | null)[]>([]);

  const facets = usePropTexture(mirrorFacets);
  const ballMat = usePropMaterial({ map: facets, glow: 0.55 });
  const wireMat = usePropMaterial({ color: "#565c65" });
  // The thrown light: additive-ish, and bright enough to reach the bloom. It is
  // the only part of this prop that is allowed to be pretty, and it is four
  // squares.
  const lightMat = usePropMaterial({
    color: "#e8e4f0",
    glow: 1.1,
    transparent: true,
    opacity: 0.34,
  });

  const yTop = layout.frameH / 2 + 3.0;
  const yRest = 0.2;

  useFrame(() => {
    if (!group.current) return;
    const seconds = (phase() * MIRROR_MS) / 1000;
    const t = stepped(seconds, STEP_FPS) / (MIRROR_MS / 1000);
    const step = stepIndex(seconds, STEP_FPS);
    const pose = mirrorPose(t, step);

    group.current.position.y = yTop + pose.drop * (yRest - yTop);
    if (ball.current) ball.current.rotation.y = pose.spin;
    // The light exists only while the ball is down, and alternates between two
    // cels of two squares — this pair, then the other pair, and nothing in
    // between. Half the glints at a time is what makes it read as light moving
    // rather than as four lamps blinking together.
    glints.current.forEach((mesh, i) => {
      if (mesh) mesh.visible = pose.drop > 0.99 && i % 2 === pose.glint;
    });
  });

  return (
    <>
      <group ref={group} position={[0, yTop, 3.2]}>
        <mesh material={wireMat} position={[0, BALL_R + 1.6, 0]}>
          <boxGeometry args={[0.08, 3.2, 0.08]} />
        </mesh>
        <mesh ref={ball} material={ballMat}>
          <sphereGeometry args={[BALL_R, 8, 5]} />
        </mesh>
      </group>

      {/* The light lands on the void, not on the ball — behind the board, so it
          reads as the room being lit rather than as four stickers on the game. */}
      {GLINTS.map(([gx, gy, size], i) => (
        <mesh
          key={i}
          ref={(m) => (glints.current[i] = m)}
          material={lightMat}
          position={[gx * layout.frameW, gy * layout.frameH, -1.2]}
          visible={false}
        >
          <planeGeometry args={[size, size]} />
        </mesh>
      ))}
    </>
  );
}
