/**
 * BUMPERS-UP — Acorn's signature.
 *
 * Two foam lane bumpers rise into the bottom of the frame, seat on one stepped
 * frame, and stay up doing nothing at all until the act ends. There is no
 * gutter. Nobody asked for them. Rung 1's whole character is that the screen
 * has decided to help.
 *
 * They run *along* the view rather than across it — two long rails at
 * ±x either side of the board, receding past it — because that is what makes
 * them read as a lane instead of as two bars laid over the picture. The
 * convergence is the perspective camera's, not a modelled taper, and it is the
 * one place a prop is allowed to use the expensive half of the frame for
 * anything: the board sits between them and becomes the thing at the end of
 * the lane.
 *
 * They are fat now, and that is the whole of the rework. Two 0.55-wide rails
 * with a nine-times-repeated five-chevron tile came back from the harness as
 * two shimmering hairlines in the bottom corners: the stripe period fell under
 * a pixel at the far end, and a nearest filter with no mip chain has nothing to
 * average it with, so the rail crawled instead of sitting still. Fine detail on
 * something that recedes to a point is not detail, it is aliasing. Twice the
 * section, a quarter of the stripes, and a dark kick rail underneath to give
 * the foam something to sit on.
 *
 * Budget, audited (box = 12): 2 rails + 2 kick rails = 48 triangles.
 * One 64px texture.
 */

import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import * as THREE from "three";
import { stageFx } from "../stage/fx.js";
import type { StageLayout } from "../stage/layout.js";
import { usePropMaterial, usePropTexture } from "./material.js";
import { bumperPose, stepped } from "./steps.js";
import { bumperSkin } from "./texture.js";

export const BUMPERS_MS = 2600;
const STEP_FPS = 12;

export function Bumpers({ layout, phase }: { layout: StageLayout; phase: () => number }) {
  const group = useRef<THREE.Group>(null);
  const skin = usePropTexture(bumperSkin);
  // Barely lit from inside. Foam is the least luminous object in the game and
  // at the phase-3 roster's usual glow the pair came back as two neon planks.
  const mat = usePropMaterial({ map: skin, glow: 0.16 });
  const kickMat = usePropMaterial({ color: "#402e3a" });
  /** Seat once per act, not once per frame of the seating beat. */
  const clunked = useRef(false);

  // Outside the board, and long enough in z to pass it at both ends. Pulled in
  // from 0.56: at the old width they hugged the bottom corners of the frame and
  // the near ends were half off it.
  const side = layout.frameW * 0.5;
  const length = layout.frameH + 8;
  const hidden = -(layout.frameH / 2) - 2.8;
  const shown = -(layout.frameH / 2) + 0.5;

  useFrame(() => {
    if (!group.current) return;
    const seconds = (phase() * BUMPERS_MS) / 1000;
    const t = stepped(seconds, STEP_FPS) / (BUMPERS_MS / 1000);
    const pose = bumperPose(t);
    group.current.position.y = hidden + pose.rise * (shown - hidden);
    if (pose.seated && !clunked.current) {
      clunked.current = true;
      // The same flinch a disc landing fires. Cheap things are allowed to hit
      // the expensive camera; that crossing is the aesthetic.
      stageFx.lastLandAt = performance.now();
    }
  });

  return (
    // Centred a little forward of the board so the rails pass in front of it
    // at the near end and behind it at the far one — which is the only cue
    // that says these are beside the board rather than under it.
    <group ref={group} position={[0, hidden, 1.4]}>
      {[-side, side].map((x) => (
        <group key={x}>
          {/* The kick rail: an ink-dark plinth under the foam. Nothing about a
              lane needs it — it is there so the bright rail has an edge to end
              on rather than fading into whatever the void is doing below. */}
          <mesh material={kickMat} position={[x, -0.62, 0]}>
            <boxGeometry args={[0.8, 0.5, length]} />
          </mesh>
          <mesh material={mat} position={[x, 0, 0]}>
            <boxGeometry args={[1.1, 0.85, length]} />
          </mesh>
        </group>
      ))}
    </group>
  );
}
