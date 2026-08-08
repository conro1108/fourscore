/**
 * PIN-SCATTER — Bramble's signature.
 *
 * Five pins rise into the frame, something off-screen hits them, four go over,
 * and the fifth is left rocking on the two-frame clock. It never falls. The
 * clip ends and takes it with it, so nobody ever finds out — which is Bramble's
 * gameplay soul (`builds threats compulsively and cashes maybe half of them`)
 * played out in three seconds of canned animation.
 *
 * Nothing here is random. Which pin survives is a constant and the four
 * velocities are functions of the pin's index, because the taste law says
 * randomness picks which gag fires and never how a gag looks. The same pin
 * goes the same way every single time you see this.
 *
 * Budget, audited: five 6-sided closed cylinders = 5 x 24 = 120 triangles. One
 * 64px texture, shared.
 */

import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import type { StageLayout } from "../stage/layout.js";
import { usePropMaterial, usePropTexture } from "./material.js";
import { pinPose, stepIndex, stepped } from "./steps.js";
import { pinSkin } from "./texture.js";

export const PINS_MS = 2900;
const STEP_FPS = 12;
const COUNT = 5;
const PIN_H = 1.15;

export function Pins({ layout, phase }: { layout: StageLayout; phase: () => number }) {
  const pins = useRef<(THREE.Group | null)[]>([]);
  const skin = usePropTexture(pinSkin);
  const mat = usePropMaterial({ map: skin, glow: 0.15 });

  // A rack across the lower third of the frame, sized off the variant like
  // everything else on this stage. High enough off the bottom edge that a pin
  // going over has somewhere to fall.
  const spacing = Math.min(layout.frameW / (COUNT + 1), 1.4);
  const home = useMemo(
    () =>
      Array.from({ length: COUNT }, (_, i) => ({
        x: (i - (COUNT - 1) / 2) * spacing,
        y: -(layout.frameH / 2) + 1.5,
      })),
    [spacing, layout.frameH],
  );

  useFrame(() => {
    const seconds = (phase() * PINS_MS) / 1000;
    const t = stepped(seconds, STEP_FPS) / (PINS_MS / 1000);
    const step = stepIndex(seconds, STEP_FPS);
    for (let i = 0; i < COUNT; i++) {
      const g = pins.current[i];
      if (!g) continue;
      const pose = pinPose(t, i, step);
      g.position.set(home[i]!.x + pose.x, home[i]!.y + pose.y, 2.5);
      g.rotation.z = pose.standing ? pose.lean : pose.spin;
    }
  });

  return (
    <>
      {home.map((h, i) => (
        <group
          key={i}
          ref={(g) => {
            pins.current[i] = g;
          }}
          position={[h.x, h.y, 2.5]}
        >
          {/* Every pin pivots about its base, not its middle: the survivor's
              rock is the whole point of the act and a pin that rocks about its
              waist reads as a floating object rather than a standing one. The
              four that get hit inherit the same pivot, which at 12fps is
              indistinguishable from a proper tumble. */}
          <mesh material={mat} position={[0, PIN_H / 2, 0]}>
            <cylinderGeometry args={[0.16, 0.26, PIN_H, 6]} />
          </mesh>
        </group>
      ))}
    </>
  );
}
