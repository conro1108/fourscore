/**
 * THE CALLOUT — one word, thrown at the camera. The lane screen's other form.
 *
 * It spins in out of nothing, stops dead facing you, holds a beat past comfort,
 * and then keeps coming until it's through the lens. The win detonation has
 * done this since phase 3 as the last quarter of a much bigger act; this is the
 * same move on its own, which is what a lane screen actually does most of the
 * time — the animation *is* the word.
 *
 * Each word gets a WordArt preset from `texture.ts` and keeps it — acid for
 * good news, heat for bad, void for a shrug, chrome for the software talking
 * about itself. A gallery rather than a house style, because that is what
 * WordArt was, and fixed per word rather than drawn, because the taste law
 * lets chance pick which gag fires and never how one looks.
 *
 * What it may say is the whole design constraint. A callout hangs off events
 * that are this engine's estimate (`director/types.ts`), so its words are
 * reactions and never results: `NICE.` and `OOF.` are a screen having an
 * opinion, `THAT LOST` would be a claim the Director cannot back. The one act
 * licensed to be flatly declarative is still the detonation, because only `win`
 * and `draw` are facts.
 *
 * Budget, audited: one quad = 2 triangles — the cheapest act in the game, and
 * the loudest. One nearest-filtered WordArt tile, which is the one texture in
 * the game allowed past 64px and says why in its own note (`wordArt`): this
 * quad is seven world units across at the hold and is the largest thing that
 * ever appears on screen, so at 64 texels wide a long word's letters merged
 * into each other and `INCREDIBLE` was a smear.
 */

import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import * as THREE from "three";
import type { StageLayout } from "../stage/layout.js";
import { usePropMaterial, usePropTexture } from "./material.js";
import { calloutPose, stepped } from "./steps.js";
import { wordArt, type WordArtStyle } from "./texture.js";

export const CALLOUT_MS = 2200;
const STEP_FPS = 12;

/**
 * Where the word lives, in world z. It stays in front of the board the whole
 * way through — behind it, the plate occludes the word and you read it through
 * the disc holes, which looks like a z-fighting bug rather than like distance.
 * Depth is sold by scale instead: small and just off the board, then big and
 * near the lens, then past the camera (which sits around z=13).
 */
const FAR = 0.6;
const HELD = 5;
const PAST = 18;

export function makeCallout(text: string, style: WordArtStyle = "chrome") {
  function Callout({ layout, phase }: { layout: StageLayout; phase: () => number }) {
    const group = useRef<THREE.Group>(null);

    const face = usePropTexture(() => wordArt(text, style));
    // Barely any glow. The texture's top band is nearly white; at 1.5 bloom ate
    // the ramp and handed back a white slab, and at 0.55 it still lost the
    // banding that makes it read as metal.
    //
    // `alphaTest` is what makes this a word rather than a sign: the tile is
    // transparent everywhere the letters aren't, and the quad is cut to them.
    // Still one-sided — the spin-in showing the word's back for half a turn is
    // how it has always read, and a mirrored word is not an improvement.
    const mat = usePropMaterial({ map: face, glow: 0.2, alphaTest: 0.5 });

    // Chest height on the board, not dead centre: the word crosses the frame
    // where there is something to cross in front of.
    const y = layout.frameH * 0.22;
    const width = Math.min(layout.frameW * 0.85, 7);

    useFrame(() => {
      if (!group.current) return;
      const seconds = (phase() * CALLOUT_MS) / 1000;
      const pose = calloutPose(stepped(seconds, STEP_FPS) / (CALLOUT_MS / 1000));

      // One number drives depth the whole way through: `pose.z` is 1 out at the
      // back, 0 at the hold, and negative on the way through the lens.
      const z = pose.z >= 0 ? HELD + pose.z * (FAR - HELD) : HELD - pose.z * (PAST - HELD);
      group.current.position.set(0, y, z);
      group.current.rotation.y = pose.yaw;
      // One number, one motion: it grows as it comes and stops growing when it
      // stops, so the hold is genuinely still.
      group.current.scale.setScalar(pose.z > 0 ? 1 - pose.z * 0.7 : 1);
    });

    return (
      <group ref={group} position={[0, y, FAR]}>
        <mesh material={mat}>
          <planeGeometry args={[width, width / 4]} />
        </mesh>
      </group>
    );
  }
  Callout.displayName = `Callout(${text})`;
  return Callout;
}
