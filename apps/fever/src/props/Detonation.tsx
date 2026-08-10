/**
 * WIN-DETONATION — the biggest thing in the game.
 *
 * Everything else in the roster is one object doing one thing. This is four
 * at once: a pyro rack erupts along the foot of the frame, debris launches out
 * of it, a chrome WordArt banner slams at the camera and freezes a beat too
 * long, and then the whole screen throws it back into the void. The word is
 * cut out of its tile rather than printed on it, so what tumbles away is the
 * words and not a board with words on them.
 *
 * It is also the only act licensed to state a fact. `win` comes from the board
 * being finished, not from a search (`director/types.ts`), so the banner is
 * flat and declarative where every other string in the roster hedges or shuts
 * up. It says `GAME OVER`, which is the flattest declaration there is. It used
 * to be a callback to the menu tagline, and the callback didn't land: on the
 * one prop that gets half a second at the lens, a line you have to work out is
 * a line you can't read.
 *
 * The pyro is canned fireworks, not flame. It used to be five identical smooth
 * untextured orange cones standing on the floor, and on the biggest beat in the
 * game five identical smooth untextured orange cones are traffic cones — the
 * banner slammed at the lens over a road works. What a cheap firework looks
 * like is a striped cardboard tube with something coming out of it and a
 * starburst over the top, so that is what each of the five is now: the tube
 * says which object this is before the jet lights and after it goes out, the
 * jet is a stepped sprite rather than a solid of revolution, and the burst is
 * the part the whole effect was for.
 *
 * Budget, audited (box = 12, quad = 2):
 *   5 x (rack 12 + tube 12 + jet 2 + burst 2) + 24 debris x 2 + banner 2
 *   = 190 triangles. Law is <= 300.
 * Five nearest textures — the 64px hazard, tube, flame and burst skins, and the
 * WordArt tile, which is the one texture in the game allowed past 64 and argues
 * for itself in `wordArt`. Lambert flat, no environment map.
 */

import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import { stageFx } from "../stage/fx.js";
import type { StageLayout } from "../stage/layout.js";
import { usePropMaterial, usePropTexture } from "./material.js";
import { DETONATION_MS, detonationPose, stepIndex, stepped } from "./steps.js";
import { hazardSkin, pyroBurst, pyroFlame, pyroTube, wordArt } from "./texture.js";

export { DETONATION_MS };
const STEP_FPS = 12;
const JETS = 5;
const DEBRIS = 24;
const GRAVITY = 11;
/** How tall a tube stands on its rack crate. */
const TUBE_H = 0.9;

export function Detonation({ layout, phase }: { layout: StageLayout; phase: () => number }) {
  const jets = useRef<(THREE.Mesh | null)[]>([]);
  const bursts = useRef<(THREE.Mesh | null)[]>([]);
  const debris = useRef<(THREE.Mesh | null)[]>([]);
  const banner = useRef<THREE.Group>(null);
  const slammed = useRef(false);

  const hazard = usePropTexture(hazardSkin);
  const tube = usePropTexture(pyroTube);
  const flame = usePropTexture(pyroFlame);
  const burst = usePropTexture(pyroBurst);
  // The chrome preset: the ramp the software uses to say its own name, on the
  // one act licensed to say how the game went.
  const sign = usePropTexture(() => wordArt("GAME OVER", "chrome"));
  // Glow values are deliberately modest: the bloom in the post stack is the
  // expensive half's, and a prop shoved into it at 2.5 doesn't read as bright,
  // it reads as white. The heat family has to still look like heat.
  const flameMat = usePropMaterial({
    map: flame,
    glow: 1.0,
    emissive: "#ff8a2a",
    alphaTest: 0.5,
    side: THREE.DoubleSide,
  });
  // Modest, for the reason the note above gives: at 1.2 the burst's rays and
  // its core bloomed into one another and the whole star came back as a yellow
  // blob. The shape is the effect; the brightness is what erases it.
  const burstMat = usePropMaterial({
    map: burst,
    glow: 0.5,
    emissive: "#ffd97a",
    alphaTest: 0.5,
    side: THREE.DoubleSide,
  });
  const tubeMat = usePropMaterial({ map: tube, glow: 0.3 });
  const rackMat = usePropMaterial({ map: hazard, glow: 0.3 });
  const goldMat = usePropMaterial({ color: "#c8991f", glow: 0.7 });
  const acidMat = usePropMaterial({ color: "#7fe018", glow: 0.7 });
  // Cut to the letters, so the banner is a word thrown at you rather than a
  // board with a word on it — the quad still tumbles out, there is just nothing
  // between the letters to see it happen on.
  // 0.16, down from the 0.5 the black-slab version wore. The slab absorbed the
  // bloom; a word cut out of its tile hands the pass nothing but the bright end
  // of a chrome ramp, and at 0.5 the whole banner came back as one white shape
  // with no letters in it — the exact failure the callout's own note warns
  // about, on a prop five times the size.
  const bannerMat = usePropMaterial({
    map: sign,
    glow: 0.16,
    alphaTest: 0.5,
    side: THREE.DoubleSide,
  });

  // Raised from -0.5: the rack used to be a launch point and nothing else, so
  // it could sit off the bottom edge. Now that there is a striped tube standing
  // on it, the tube is half of what says "firework" — and half of it was
  // cropped away by the frame.
  const yFloor = -(layout.frameH / 2) - 0.12;

  // Debris launch vectors, fixed at mount. Fixed, not re-rolled per frame: the
  // taste law lets randomness pick which gag fires, never how it looks, and a
  // shower that reshuffles every frame is static, not confetti.
  const shots = useMemo(
    () =>
      Array.from({ length: DEBRIS }, (_, i) => {
        const a = (i / DEBRIS) * Math.PI * 2;
        const spread = 0.55 + ((i * 7) % 11) / 11;
        return {
          vx: Math.cos(a) * 3.4 * spread,
          vy: 6.5 + ((i * 5) % 7) * 0.6,
          spin: ((i % 5) - 2) * 2.2,
          x0: layout.xOf(i % layout.variant.width),
        };
      }),
    [layout],
  );

  useFrame(() => {
    const seconds = (phase() * DETONATION_MS) / 1000;
    const t = stepped(seconds, STEP_FPS) / (DETONATION_MS / 1000);
    const pose = detonationPose(t);
    const step = stepIndex(seconds, STEP_FPS);

    // Pyro: each jet flickers on its own two-frame offset, so the rack reads
    // as five cheap effects and not one scaled group.
    jets.current.forEach((jet, i) => {
      if (!jet) return;
      const flicker = (step + i) % 2 === 0 ? 1 : 0.72;
      const h = pose.pyro * flicker * layout.frameH * 0.42;
      jet.visible = h > 0.02;
      jet.scale.set(1, Math.max(0.001, h), 1);
      jet.position.y = yFloor + TUBE_H + h / 2;

      // The burst sits on top of whatever the jet reached, and swaps between
      // two sizes on the step clock. Two cels, no tween: a starburst that eases
      // is a light, and this one is a sticker somebody printed.
      const b = bursts.current[i];
      if (b) {
        b.visible = h > layout.frameH * 0.14;
        const cel = (step + i) % 2 === 0 ? 1 : 0.62;
        b.scale.setScalar(cel);
        b.position.y = yFloor + TUBE_H + h;
      }
    });

    debris.current.forEach((chunk, i) => {
      if (!chunk) return;
      const shot = shots[i]!;
      const age = stepped(Math.max(0, pose.debris), STEP_FPS);
      const visible = pose.debris > 0 && age < 3.2;
      chunk.visible = visible;
      if (!visible) return;
      chunk.position.set(
        shot.x0 + shot.vx * age,
        yFloor + shot.vy * age - 0.5 * GRAVITY * age * age,
        2.4,
      );
      chunk.rotation.z = shot.spin * age;
    });

    if (banner.current) {
      // Far off to pressed-against-the-lens and back into the void. Perspective
      // does the growing; nothing here is scaled.
      // Close enough to be rude, not so close the words run off the frame —
      // the banner has to be readable at its stop, which is the whole point of
      // the hold.
      banner.current.position.z = 2 + (1 - pose.bannerZ) * 5.0;
      banner.current.rotation.z = pose.bannerRoll;
      banner.current.visible = pose.bannerZ < 1;
    }

    // The slam flinch, on the same signal a disc landing uses. One flinch,
    // one meaning — the truck's slam does this too.
    if (pose.slam && !slammed.current) stageFx.lastLandAt = performance.now();
    slammed.current = pose.slam;
  });

  return (
    <group>
      {/* the pyro rack, sitting on nothing at the foot of the frame */}
      {Array.from({ length: JETS }, (_, i) => {
        const x = ((i - (JETS - 1) / 2) / ((JETS - 1) / 2)) * (layout.frameW * 0.42);
        return (
          <group key={i}>
            <mesh material={rackMat} position={[x, yFloor - 0.16, 2.6]}>
              <boxGeometry args={[0.62, 0.36, 0.55]} />
            </mesh>
            {/* The tube. Always there, lit or not, which is what makes the
                effect an object with a firework in it rather than a cone. */}
            <mesh material={tubeMat} position={[x, yFloor + TUBE_H / 2, 2.6]}>
              <boxGeometry args={[0.34, TUBE_H, 0.34]} />
            </mesh>
            <mesh
              ref={(m) => (jets.current[i] = m)}
              material={flameMat}
              position={[x, yFloor + TUBE_H, 2.62]}
            >
              {/* A unit-height sprite scaled in y — the jet grows, it doesn't
                  move, and the stretch smears the tile, which is the affine
                  warp the taste law puts in bounds by name. A quad rather than
                  a cone: a smooth solid of revolution is the one thing on this
                  stage that reads as modern, and it read as a traffic cone. */}
              <planeGeometry args={[0.62, 1]} />
            </mesh>
            <mesh
              ref={(m) => (bursts.current[i] = m)}
              material={burstMat}
              position={[x, yFloor + TUBE_H, 2.64]}
            >
              <planeGeometry args={[1.5, 1.5]} />
            </mesh>
          </group>
        );
      })}

      {Array.from({ length: DEBRIS }, (_, i) => (
        <mesh
          key={i}
          ref={(m) => (debris.current[i] = m)}
          material={i % 2 === 0 ? goldMat : acidMat}
          position={[0, yFloor, 2.4]}
        >
          <planeGeometry args={[0.22, 0.22]} />
        </mesh>
      ))}

      <group ref={banner} position={[0, 0.2, 2]}>
        <mesh material={bannerMat}>
          <planeGeometry args={[5.2, 1.4]} />
        </mesh>
      </group>
    </group>
  );
}
