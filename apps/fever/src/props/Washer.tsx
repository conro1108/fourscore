/**
 * WINDOW-WASHER — the blunder gag that climbs.
 *
 * A plank on two ropes winches up the left edge of the frame in six stepped
 * jerks, carrying the mascot and a squeegee. It reaches the top, wipes exactly
 * one stripe across a void that has no glass in it, admires that for a fifth of
 * the act, and then the rope gives and the whole rig drops out of the bottom of
 * the frame.
 *
 * This is the only act in the game that travels *up* under its own power. The
 * roster could already fall, cross and arrive, and the stage's whole left side
 * was empty — an act that spends four seconds climbing it is worth more than
 * another thing crossing the floor.
 *
 * Cartoon violence with no consequence, which pillar 2 puts explicitly in
 * bounds: nothing lands, because the act ends before it does.
 *
 * Budget, audited (closed cylinder = 4 x segments, box = 12, quad = 2):
 *   plank 12 + 2 ropes x 12 + squeegee handle 12 + head 12 = 60,
 *   + mascot disc 40 + stripe 2 = 102 triangles. Law is <= 300.
 */

import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import * as THREE from "three";
import { stageFx } from "../stage/fx.js";
import type { StageLayout } from "../stage/layout.js";
import { usePropMaterial, usePropTexture } from "./material.js";
import { stepped, washerPose } from "./steps.js";
import { mascotFace, plankSkin } from "./texture.js";

export const WASHER_MS = 4200;
const STEP_FPS = 12;
const DISC_R = 0.55;

export function Washer({ layout, phase }: { layout: StageLayout; phase: () => number }) {
  const rig = useRef<THREE.Group>(null);
  const ropes = useRef<THREE.Group>(null);
  const arm = useRef<THREE.Group>(null);
  const stripe = useRef<THREE.Mesh>(null);
  const wasFalling = useRef(false);

  const plank = usePropTexture(plankSkin);
  const face = usePropTexture(() => mascotFace("up"));
  const plankMat = usePropMaterial({ map: plank, glow: 0.15 });
  const ropeMat = usePropMaterial({ color: "#8a7f6b" });
  const rimMat = usePropMaterial({ color: "#a3164e", glow: 0.15 });
  const faceMat = usePropMaterial({ map: face, glow: 0.35 });
  const rubberMat = usePropMaterial({ color: "#2c2733" });
  // Dim, because bloom finds it. At 1.6 the stripe came back from the harness
  // as a blown-out white bar over the top of the frame — brighter than the
  // detonation, for a squeegee.
  const shineMat = usePropMaterial({
    color: "#e8e4f0",
    glow: 0.5,
    transparent: true,
    opacity: 0.3,
  });

  // Up the left edge, in front of the board. `height` 1 puts the plank near the
  // top of the frame and -0.75 puts it well below the bottom of it.
  //
  // Both numbers are pulled *in* from where they started. The rig sits at z 3.2
  // and perspective throws anything that far forward outward, so parking it
  // beside the frame at the frame's own height put the whole act off the top
  // left corner of the picture — the harness caught one corner of a plank.
  const x = -(layout.frameW / 2) + 1.2;
  const yOf = (height: number) => height * (layout.frameH / 2 - 1.6);
  /**
   * How far the squeegee reaches across the void, in world units — and short,
   * on purpose. It has to stay visibly *held*: at anything over a unit the
   * harness showed a stick and a bright bar out on their own with the mascot
   * behind them, which reads as two more props rather than as one doing a job.
   */
  const REACH = 0.7;

  useFrame(() => {
    if (!rig.current) return;
    const seconds = (phase() * WASHER_MS) / 1000;
    const t = stepped(seconds, STEP_FPS) / (WASHER_MS / 1000);
    const pose = washerPose(t);

    rig.current.position.y = yOf(pose.height);
    // The plank tips as it goes, and the ropes are simply not there any more —
    // one frame with them and one without. That cut is the only thing on screen
    // that says why the rig is falling, and it is cheaper than showing it snap.
    rig.current.rotation.z = pose.falling ? 0.22 : 0;
    if (ropes.current) ropes.current.visible = !pose.falling;

    if (arm.current) {
      // The stroke is six stepped positions across the reach, and the arm is
      // parked back at the start of it whenever nothing is being wiped.
      arm.current.position.x = (pose.wipe ?? 0) * REACH;
    }
    if (stripe.current) {
      // The clean stripe travels with the squeegee head rather than being left
      // behind: an act ends off-stage, and a shine still hanging in the void
      // after the rig has gone is the same law broken where you can see it.
      stripe.current.visible = pose.wipe !== null && !pose.falling;
    }

    if (pose.falling && !wasFalling.current) stageFx.lastLandAt = performance.now();
    wasFalling.current = pose.falling;
  });

  return (
    <group ref={rig} position={[x, yOf(-0.75), 2.0]}>
      {/* The ropes, running up out of frame to a winch nobody has seen. */}
      <group ref={ropes}>
        {[-0.7, 0.7].map((rx, i) => (
          <mesh key={i} material={ropeMat} position={[rx, 3.2, 0]}>
            <boxGeometry args={[0.07, 6.4, 0.07]} />
          </mesh>
        ))}
      </group>
      <mesh material={plankMat}>
        <boxGeometry args={[1.9, 0.22, 0.6]} />
      </mesh>

      {/* The mascot, stood on the plank, doing a job. Face on the caps, same as
          everywhere else the disc turns up. */}
      <mesh material={[rimMat, faceMat, faceMat]} position={[-0.4, DISC_R + 0.14, 0]} rotation-x={Math.PI / 2}>
        <cylinderGeometry args={[DISC_R, DISC_R, 0.3, 10]} />
      </mesh>

      {/* The squeegee, held by the mascot rather than parked beside it. The
          arm's origin is the mascot's own x for exactly that reason: on its own
          transform it swung off across the frame and read as a black stick and
          a grey bar with nothing holding either. */}
      <group ref={arm} position={[-0.4, 0, 0]}>
        {/* The handle runs from the mascot out to the head and is long enough
            to still overlap it at full reach, so the three parts never come
            apart into three props. */}
        <mesh material={rubberMat} position={[0.45, 0.9, 0.25]} rotation-z={-0.3}>
          <boxGeometry args={[1.3, 0.09, 0.09]} />
        </mesh>
        <mesh material={rubberMat} position={[1.05, 1.08, 0.25]}>
          <boxGeometry args={[0.12, 0.7, 0.12]} />
        </mesh>
        <mesh ref={stripe} material={shineMat} position={[1.05, 1.08, 0.12]} visible={false}>
          <planeGeometry args={[0.3, 0.7]} />
        </mesh>
      </group>
    </group>
  );
}
