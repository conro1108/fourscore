/**
 * CANNON-SHOT — the brilliant-move gag, and the longest travel in the game.
 *
 * A circus cannon rolls in at the bottom left, cranks its barrel up in three
 * hard steps, aims at nothing for half a second, and fires the mascot in an arc
 * that crosses the entire frame and leaves past the top right corner. The
 * cannon sits there smoking and rolls back off the way it came.
 *
 * It exists because the roster had grown along one edge: the truck, the mascot,
 * the mower and the pins all cross the floor and the rocket climbs one corner,
 * so on a real screen the props read as a strip of activity under a board. This
 * one is a diagonal across everything, and the shot spends most of its flight
 * above the top of the frame — the emptiest part of the stage.
 *
 * Budget, audited (closed cylinder = 4 x segments, box = 12, quad = 2):
 *   barrel 24 + carriage 12 + 2 wheels x 24 + trunnion 12 = 96,
 *   + shot disc 40 + 2 smoke quads x 2 = 140 triangles. Law is <= 300.
 */

import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import * as THREE from "three";
import { stageFx } from "../stage/fx.js";
import type { StageLayout } from "../stage/layout.js";
import { usePropMaterial, usePropTexture } from "./material.js";
import { cannonPose, stepped } from "./steps.js";
import { cannonLivery, mascotFace } from "./texture.js";

export const CANNON_MS = 3800;
const STEP_FPS = 12;
const SHOT_R = 0.5;
/** Barrel elevation at full crank. Steep enough to clear the board's top. */
const AIM = 0.86;
/** The barrel's pivot, and the muzzle it puts in front of you at full aim. */
const PIVOT: [number, number] = [-0.2, 0.95];
const MUZZLE: [number, number] = [
  PIVOT[0] + 1.95 * Math.cos(AIM),
  PIVOT[1] + 1.95 * Math.sin(AIM),
];

export function Cannon({ layout, phase }: { layout: StageLayout; phase: () => number }) {
  const rig = useRef<THREE.Group>(null);
  const barrel = useRef<THREE.Group>(null);
  const recoil = useRef<THREE.Group>(null);
  const shot = useRef<THREE.Group>(null);
  const smoke = useRef<THREE.Group>(null);
  const wasFlying = useRef(false);

  const livery = usePropTexture(cannonLivery);
  const face = usePropTexture(() => mascotFace("up"));
  const bodyMat = usePropMaterial({ map: livery, glow: 0.3 });
  const darkMat = usePropMaterial({ color: "#2c2733" });
  const wheelMat = usePropMaterial({ color: "#8f6f14", glow: 0.12 });
  const rimMat = usePropMaterial({ color: "#a3164e", glow: 0.15 });
  const faceMat = usePropMaterial({ map: face, glow: 0.35 });
  // Faint, and small. A camera-facing quad is the cheapest smoke there is and
  // the cheapest way to get it wrong: bright enough to see the edges of, it
  // stops being a puff and becomes a grey card laid on the board.
  const smokeMat = usePropMaterial({
    color: "#c8ccd4",
    glow: 0.15,
    transparent: true,
    opacity: 0.18,
  });

  // The cannon's berth is the bottom left corner; the shot's range is the whole
  // frame and then some. Everything derives from the layout.
  //
  // It parks *inside* the frame's left edge rather than beside it: props sit at
  // z 3, well in front of the board, so perspective throws them further out
  // than their world x suggests — the first pass parked at the edge and the
  // harness showed a cannon half out of the picture.
  const xPark = -(layout.frameW / 2) + 0.9;
  const xOff = -(layout.frameW / 2) - 4.5;
  const yGround = -(layout.frameH / 2) + 0.5;
  const span = layout.frameW + 4;

  useFrame(() => {
    if (!rig.current || !barrel.current || !recoil.current) return;
    const seconds = (phase() * CANNON_MS) / 1000;
    const t = stepped(seconds, STEP_FPS) / (CANNON_MS / 1000);
    const pose = cannonPose(t);

    rig.current.position.x = xOff + pose.u * (xPark - xOff);
    barrel.current.rotation.z = pose.crank * AIM;
    // Recoil runs along the barrel's own axis, so it is applied inside the
    // elevation rather than on the rig: a cannon that recoils horizontally
    // while aimed at 50 degrees is the kind of accident the taste law is about.
    recoil.current.position.x = -pose.recoil;

    if (shot.current) {
      shot.current.visible = pose.shot !== null;
      if (pose.shot) {
        shot.current.position.set(
          xPark + 0.9 + pose.shot.u * span,
          yGround + 1.2 + pose.shot.v * layout.frameH,
          3.0,
        );
        shot.current.rotation.z = pose.shot.spin;
      }
    }
    if (smoke.current) {
      smoke.current.visible = pose.smoke > 0.02;
      // Two quads growing out of the muzzle. Scale rather than fade: the
      // opacity is fixed and the puff simply gets bigger and then isn't there.
      // Kept small — at three units across it stopped reading as smoke and
      // became a grey card laid over the board.
      smoke.current.scale.setScalar(0.4 + (1 - pose.smoke) * 1.1);
    }

    // The stage flinches on the shot, the same signal a disc landing uses.
    const flying = pose.shot !== null;
    if (flying && !wasFlying.current) stageFx.lastLandAt = performance.now();
    wasFlying.current = flying;
  });

  return (
    <>
      <group ref={rig} position={[xOff, yGround, 3.0]}>
        {/* Carriage and wheels — the only part that says this is on a fairground
            rather than on a battlefield is the livery, which is the whole trick. */}
        <mesh material={darkMat} position={[0, 0.5, 0]}>
          <boxGeometry args={[1.5, 0.5, 0.8]} />
        </mesh>
        {/* Wheels in a lighter grey than the carriage. In the carriage's own
            colour the whole bottom of the prop came back from the harness as
            one black blob — a six-segment cylinder only reads as a wheel if
            something behind it doesn't. */}
        {[0.5, -0.5].map((z, i) => (
          <mesh key={i} material={wheelMat} position={[0.35, 0.36, z]} rotation-x={Math.PI / 2}>
            <cylinderGeometry args={[0.38, 0.38, 0.18, 6]} />
          </mesh>
        ))}
        {/* The trunnion the barrel pivots on, so the pivot is a visible part
            rather than an empty transform. */}
        <mesh material={darkMat} position={[PIVOT[0], PIVOT[1], 0]}>
          <boxGeometry args={[0.3, 0.3, 1.0]} />
        </mesh>
        <group ref={barrel} position={[PIVOT[0], PIVOT[1], 0]}>
          <group ref={recoil}>
            <mesh material={bodyMat} position={[0.95, 0, 0]} rotation-z={Math.PI / 2}>
              <cylinderGeometry args={[0.4, 0.46, 2.0, 6]} />
            </mesh>
          </group>
        </group>
        {/* The smoke sits where the muzzle is at full elevation, and is *not*
            parented to the barrel: a camera-facing quad inside a rotating group
            tips with it and stops being smoke the moment it does. It only ever
            plays after the crank is done, so a fixed position is the right one
            every frame it is visible. */}
        <group ref={smoke} position={[MUZZLE[0], MUZZLE[1], 0.3]} visible={false}>
          <mesh material={smokeMat}>
            <planeGeometry args={[0.75, 0.75]} />
          </mesh>
          <mesh material={smokeMat} position={[0.28, 0.24, 0.15]}>
            <planeGeometry args={[0.5, 0.5]} />
          </mesh>
        </group>
      </group>

      {/* The shot: the mascot, fired. It is the same disc with the same face,
          because the cast is unexplained and nobody is going to account for
          this either. */}
      <group ref={shot} position={[xPark, yGround, 3.0]} visible={false}>
        {/* The face is on the caps, not on a quad in front — same reason as
            `Mascot`: a cap's UVs are already a circle, and a square quad hands
            back the texture's transparent corners as a black box. */}
        <mesh material={[rimMat, faceMat, faceMat]} rotation-x={Math.PI / 2}>
          <cylinderGeometry args={[SHOT_R, SHOT_R, 0.3, 10]} />
        </mesh>
      </group>

    </>
  );
}
