/**
 * BANNER-PASS — the tension-shift gag, and the draw.
 *
 * A tow plane crosses the top of the frame at a constant speed dragging a
 * banner. It does not arrive and it does not leave; it is already going when
 * it enters and still going when it exits, which is the joke — the rally has
 * been happening this whole time and you are only now looking up.
 *
 * The banner reads its word off a single 64px tile repeated along its length,
 * so `SUNDAY` becomes SUNDAY SUNDAY SUNDAY for the price of one texture. The
 * tile is drawn condensed and displayed stretched: the letters un-squeeze on
 * a wide quad, which is how a 64px texture stays legible without breaking the
 * budget law.
 *
 * Claims: `tension-shift` is an estimate, so the words are weather, never
 * verdicts. The draw banner is allowed to be flat — a draw is a fact.
 *
 * Budget, audited: fuselage 12 + wing 12 + tail 12 + tow line 12 + banner
 *   (6-segment plane) 12 = 60 triangles. One 64px texture.
 */

import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import * as THREE from "three";
import type { StageLayout } from "../stage/layout.js";
import { usePropMaterial, usePropTexture } from "./material.js";
import { bannerPose, stepIndex, stepped } from "./steps.js";
import { bannerCloth } from "./texture.js";

export const BANNER_MS = 4200;
const STEP_FPS = 12;
const BANNER_LEN = 5.4;

/**
 * @param text  one word, repeated along the banner
 * @param says  how many times it says it (the repeat count)
 */
export function makeBanner(text: string, says = 3) {
  function Banner({ layout, phase }: { layout: StageLayout; phase: () => number }) {
    const group = useRef<THREE.Group>(null);

    const cloth = usePropTexture(() => {
      const tex = bannerCloth(text);
      tex.repeat.set(says, 1);
      return tex;
    });
    const clothMat = usePropMaterial({
      map: cloth,
      glow: 0.22,
      side: THREE.DoubleSide,
    });
    const planeMat = usePropMaterial({ color: "#c8ccd4" });
    const trimMat = usePropMaterial({ color: "#a3164e" });

    // Right to left, above the board, in front of everything. The whole rig is
    // longer than the frame, so both ends are off-stage at both ends of the act.
    const span = layout.frameW + BANNER_LEN + 6;
    const xStart = span / 2;
    // Just over the board's top edge. Props fly in front of the board, and the
    // frustum is *narrower* there than at the board's own depth — the first
    // pass put the banner a comfortable 1.5 units above the frame and flew it
    // straight over the top of the screen. Anything staged at z > 0 has to be
    // framed against the frustum at that z, not against the board.
    const y = layout.frameH / 2 + 0.35;

    useFrame(() => {
      if (!group.current) return;
      const seconds = (phase() * BANNER_MS) / 1000;
      const t = stepped(seconds, STEP_FPS) / (BANNER_MS / 1000);
      const pose = bannerPose(t, stepIndex(seconds, STEP_FPS));
      group.current.position.set(xStart - pose.u * span, y + pose.bob, 1.6);
    });

    return (
      // Yawed a touch toward the camera, like the truck: dead side-on, a
      // low-poly box is an unreadable rectangle.
      <group ref={group} position={[xStart, y, 1.6]} rotation-y={0.32}>
        <mesh material={planeMat}>
          <boxGeometry args={[1.3, 0.3, 0.3]} />
        </mesh>
        {/* wing, crossing the fuselage */}
        <mesh material={trimMat} position={[0.05, 0.1, 0]}>
          <boxGeometry args={[0.42, 0.07, 1.9]} />
        </mesh>
        {/* tail fin */}
        <mesh material={trimMat} position={[0.6, 0.26, 0]}>
          <boxGeometry args={[0.2, 0.36, 0.06]} />
        </mesh>
        {/* the tow line, because a banner floating behind nothing is a bug */}
        <mesh material={planeMat} position={[0.95, 0, 0]}>
          <boxGeometry args={[0.7, 0.04, 0.04]} />
        </mesh>
        {/* the banner, trailing behind (the plane flies to -x, so it trails +x) */}
        <mesh material={clothMat} position={[BANNER_LEN / 2 + 1.3, 0, 0]}>
          <planeGeometry args={[BANNER_LEN, 0.95, 6, 1]} />
        </mesh>
      </group>
    );
  }
  Banner.displayName = `Banner(${text})`;
  return Banner;
}
