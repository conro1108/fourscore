/**
 * The post stack — final (phase 2, the thesis). Lives with the void on the
 * expensive side of the budget law: full-resolution, smooth, modern. Four
 * passes, in order:
 *
 * - Bloom: the "the bloom is real" pillar. Mipmap blur, threshold set so the
 *   winning line, the disc emissives and the hot end of the void glow while
 *   the board body stays matte. Intensity rides fever.
 * - Chromatic aberration: zero-ish at idle, visibly smearing the frame edges
 *   by full fever — the image itself starts to sweat. Radially modulated so
 *   the board's center stays readable at all temperatures.
 * - Noise: fine grain, softly overlaid. This is *film* grain on the expensive
 *   side, not crunch — it kills gradient banding and unifies the cheap props
 *   with the smooth void in one frame.
 * - Vignette: constant. The void already darkens its edges; this just seats
 *   the frame.
 *
 * Fever mapping happens here per frame via `useFeverSource`, so the harness
 * can pin a temperature and the stack obeys — the effects' props are their
 * idle values, and useFrame writes the escalation on top.
 */

import { useFrame } from "@react-three/fiber";
import { EffectComposer, Bloom, ChromaticAberration, Noise, Vignette } from "@react-three/postprocessing";
import { BlendFunction } from "postprocessing";
import type { BloomEffect, ChromaticAberrationEffect, NoiseEffect } from "postprocessing";
import { useRef } from "react";
import { useFeverSource } from "../director/scope.js";

export function PostStack() {
  const bloom = useRef<BloomEffect>(null);
  const aberration = useRef<ChromaticAberrationEffect>(null);
  const grain = useRef<NoiseEffect>(null);
  const feverOf = useFeverSource();

  useFrame(() => {
    const fever = feverOf();
    // The same perceptual curve the void uses — the bottom half of the range
    // has to do visible work.
    const f = Math.pow(fever, 0.55);

    if (bloom.current) bloom.current.intensity = 0.75 + 1.35 * f;
    if (aberration.current) {
      // Squared so the smear arrives late and hard rather than muddying the
      // mid-band; radial modulation keeps the center clean regardless.
      const shift = 0.0004 + 0.0035 * fever * fever;
      aberration.current.offset.set(shift, shift * 0.6);
    }
    if (grain.current) grain.current.blendMode.opacity.value = 0.035 + 0.075 * f;
  });

  return (
    <EffectComposer multisampling={0}>
      <Bloom
        ref={bloom as never}
        mipmapBlur
        intensity={0.75}
        luminanceThreshold={0.32}
        luminanceSmoothing={0.22}
      />
      <ChromaticAberration
        ref={aberration as never}
        radialModulation
        modulationOffset={0.28}
      />
      <Noise ref={grain as never} premultiply blendFunction={BlendFunction.OVERLAY} opacity={0.035} />
      <Vignette eskil={false} offset={0.18} darkness={0.55} />
    </EffectComposer>
  );
}
