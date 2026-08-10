/**
 * BEACON-DROP — the threat alarm.
 *
 * A hazard beacon lowers itself into the frame on a stalk, strobes for a few
 * seconds, and winches back up. It is the heat family arriving as an object
 * rather than as a gradient: heat means fever everywhere in this game, and a
 * live threat is the most legible fever there is.
 *
 * It strobes rather than sweeps — the lamp is a hard square wave on the step
 * clock, which is the timing law's reading of "alarm" and matches the win
 * blink the discs already do.
 *
 * A threat is the Director's estimate, not a fact, so this act says nothing.
 * It is a light. Lights don't claim anything — which is also why this is the
 * one prop in the rework that deliberately still has no face. The facelessness
 * is the joke: everything else on this stage is sentient and the alarm is not.
 *
 * What it did need was size. It was a 0.42-radius housing on a stick, parked
 * just inside the top corner of the frame, and a threat cue you have to go
 * looking for is not a cue. Half again as big, dropped properly into frame, and
 * with the two things a rotating beacon actually reads by: a hot lens that
 * orbits the housing — visible, then hidden behind it, then visible — and a
 * hard-edged flare behind the whole thing that snaps between two sizes on the
 * strobe. Neither is a new idea; both are the cheapest possible version of one.
 *
 * The cap and the base are cylinders rather than boxes, which is the one place
 * this prop spends triangles it could save. A box flange around a cylinder
 * sticks its corners out to 1.4x the radius, so the first pass came back as a
 * lamp between two square slabs — the silhouette said sandwich, not beacon.
 *
 * Budget, audited (8-seg closed cylinder = 32, box = 12, quad = 2):
 *   stalk 12 + cap 32 + glass 32 + base 32 + lens 12 + flare 2 = 122 triangles.
 *   Law is <= 300.
 */

import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import * as THREE from "three";
import type { StageLayout } from "../stage/layout.js";
import { usePropMaterial, usePropTexture } from "./material.js";
import { beaconPose, stepIndex, stepped } from "./steps.js";
import { beaconGlass, flareStar, hazardSkin } from "./texture.js";

export const BEACON_MS = 2600;
const STEP_FPS = 12;
/** The glass's radius. Everything else on the prop is sized off it. */
const R = 0.7;

export function Beacon({ layout, phase }: { layout: StageLayout; phase: () => number }) {
  const group = useRef<THREE.Group>(null);
  const rotor = useRef<THREE.Group>(null);
  const flare = useRef<THREE.Mesh>(null);

  const hazard = usePropTexture(hazardSkin);
  const glass = usePropTexture(beaconGlass);
  const star = usePropTexture(flareStar);
  const housingMat = usePropMaterial({ map: hazard, glow: 0.3 });
  const stalkMat = usePropMaterial({ color: "#402e3a" });
  const glassMat = usePropMaterial({ map: glass, glow: 1.0, emissive: "#ff7a1a" });
  const lensMat = usePropMaterial({ color: "#ffd97a", glow: 2.6, emissive: "#ffb14a" });
  const flareMat = usePropMaterial({
    map: star,
    glow: 1.4,
    emissive: "#ff8a2a",
    alphaTest: 0.5,
    side: THREE.DoubleSide,
  });

  const x = layout.frameW * 0.38;
  const top = layout.frameH / 2 + 3.2;
  // A third of the way down the frame rather than clipped to its top edge: the
  // whole prop used to sit in the corner with the housing half out of shot.
  const low = layout.frameH * 0.24;

  useFrame(() => {
    if (!group.current) return;
    const seconds = (phase() * BEACON_MS) / 1000;
    const step = stepIndex(seconds, STEP_FPS);
    const t = stepped(seconds, STEP_FPS) / (BEACON_MS / 1000);
    const pose = beaconPose(t, step);

    group.current.position.set(x, top - pose.drop * (top - low), 3.0);
    if (rotor.current) rotor.current.rotation.y = pose.spin;
    glassMat.emissiveIntensity = 0.35 + pose.lamp * 1.4;
    lensMat.emissiveIntensity = pose.lamp * 3.0;
    // Two cels, never a fade. The strobe is a square wave everywhere else in
    // this act and the flare is not allowed to be the one soft thing in it.
    // It shrinks rather than vanishing on the off frame: a light that blinks
    // fully out reads as a bulb failing, and this one is meant to be working.
    if (flare.current) flare.current.scale.setScalar(pose.lamp > 0.5 ? 1 : 0.4);
  });

  return (
    <group ref={group} position={[x, top, 3.0]}>
      {/* The flare, behind everything, so the lamp reads as brighter than the
          post stack is ever going to make a 64px texture look. */}
      <mesh ref={flare} material={flareMat} position={[0, 0.05, -0.9]}>
        <planeGeometry args={[4.2, 4.2]} />
      </mesh>
      {/* stalk, running back up out of the frame */}
      <mesh material={stalkMat} position={[0, 2.0, 0]}>
        <boxGeometry args={[0.2, 3.8, 0.2]} />
      </mesh>
      {/* The cap and the base, both hazard-striped, which is the only part of
          the prop that says which family this light belongs to. */}
      <mesh material={housingMat} position={[0, R * 0.86, 0]}>
        <cylinderGeometry args={[R * 1.1, R * 1.1, 0.24, 8]} />
      </mesh>
      <mesh material={glassMat}>
        <cylinderGeometry args={[R, R, R * 1.5, 8]} />
      </mesh>
      <mesh material={housingMat} position={[0, -R * 0.9, 0]}>
        <cylinderGeometry args={[R * 1.2, R * 1.16, 0.3, 8]} />
      </mesh>
      {/* The hot lens, orbiting the housing on the spin. It goes behind the
          glass for half of every turn and comes back, which is what a rotating
          beacon *is* — and it costs one box and no per-frame work beyond the
          rotation the act was already computing. */}
      <group ref={rotor}>
        <mesh material={lensMat} position={[0, 0, R * 0.98]}>
          <boxGeometry args={[R * 0.9, R * 0.8, 0.22]} />
        </mesh>
      </group>
    </group>
  );
}
