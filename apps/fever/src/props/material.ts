/**
 * Prop materials, in one place so the cheap budget is enforced by construction
 * rather than by remembering.
 *
 * Every prop material is Lambert with flat shading and no environment map —
 * cheap things do not reflect the sky that isn't there (phase-2 decision). A
 * prop that wants gloss is a prop that has stopped being a prop.
 *
 * Both hooks own disposal, which is the thing five roster files would
 * otherwise each get subtly wrong.
 */

import { useEffect, useMemo } from "react";
import * as THREE from "three";

/** A generated 64px prop texture, built once and disposed with the component. */
export function usePropTexture(make: () => THREE.CanvasTexture): THREE.CanvasTexture {
  const texture = useMemo(make, []);
  useEffect(() => () => texture.dispose(), [texture]);
  return texture;
}

export interface PropMaterialOptions {
  color?: THREE.ColorRepresentation;
  map?: THREE.Texture;
  /**
   * Emissive strength. The livery doubles as its own emissive map, which is
   * how a flat-shaded prop gets handed to the expensive bloom pass — the one
   * sanctioned crossing between the two budgets.
   */
  glow?: number;
  /**
   * Defaults to the prop's own color (or to white when there's a map, so the
   * map is what glows). Left as plain white it bleaches every glowing prop to
   * the same non-color the moment bloom touches it — which is how a gold
   * confetti shower came back from the harness looking like office paper.
   */
  emissive?: THREE.ColorRepresentation;
  transparent?: boolean;
  opacity?: number;
  /**
   * Cut the prop out of its own texture's alpha: anything below this is not
   * drawn at all. Not `transparent`, deliberately — alpha blending would sort
   * this quad against the board and the bloom behind it, and a WordArt word
   * that half-dissolves into the scene is the wrong artifact entirely. The
   * cutout is hard, the same way a nearest filter is hard.
   */
  alphaTest?: number;
  side?: THREE.Side;
}

export function usePropMaterial(options: PropMaterialOptions): THREE.MeshLambertMaterial {
  const {
    color = "#ffffff",
    map,
    glow = 0,
    emissive = map ? "#ffffff" : color,
    transparent,
    opacity,
    alphaTest,
    side,
  } = options;

  const material = useMemo(() => {
    const mat = new THREE.MeshLambertMaterial({ color, flatShading: true });
    if (map) mat.map = map;
    if (glow > 0) {
      mat.emissive = new THREE.Color(emissive);
      mat.emissiveIntensity = glow;
      if (map) mat.emissiveMap = map;
    }
    if (transparent !== undefined) mat.transparent = transparent;
    if (opacity !== undefined) mat.opacity = opacity;
    if (alphaTest !== undefined) mat.alphaTest = alphaTest;
    if (side !== undefined) mat.side = side;
    return mat;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [color, map, glow, emissive, transparent, opacity, alphaTest, side]);

  useEffect(() => () => material.dispose(), [material]);
  return material;
}
