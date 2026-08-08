/**
 * The void — final look (phase 2, the thesis). The expensive side of the budget
 * law: full resolution, smooth, genuinely beautiful. Three layers:
 *
 * 1. A deep radial well of bruised purple falling to near-black (never pure
 *    black — VISION.md palette law).
 * 2. Weather: two drifting value-noise fields, violet and teal-night, that
 *    push harder and go blotchier as fever rises.
 * 3. The oil slick: an iridescent magenta → teal → gold ramp riding the
 *    weather. Present as a faint sheen from fever 0 so the void is alive
 *    before the game sharpens (early escalation has to be visible, not saved
 *    for the finale), and lush by mid-fever.
 *
 * The heat family (arterial red / hazard orange) enters here and only here
 * with fever: embers blooming low in the frame, like a furnace under the
 * nothing. This is the palette decision phase 1 deferred — heat means fever,
 * everywhere in the game, so escalation stays legible.
 */

import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import { useFeverSource } from "../director/scope.js";

const vertex = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const fragment = /* glsl */ `
  varying vec2 vUv;
  /* Drift distance, not wall clock — see the note in useFrame below. */
  uniform float uTime;
  uniform float uFever;

  // Cheap value noise; the void wants soft weather, not detail.
  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
  }
  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
      mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
      u.y
    );
  }

  // The oil-slick ramp: magenta into teal into gold. Mirrored so it cycles
  // without a seam. Authored at screen values like everything here.
  vec3 slickRamp(float x) {
    vec3 magenta = vec3(0.72, 0.10, 0.55);
    vec3 teal    = vec3(0.05, 0.46, 0.47);
    vec3 gold    = vec3(0.80, 0.58, 0.16);
    vec3 c = mix(magenta, teal, smoothstep(0.12, 0.52, x));
    return mix(c, gold, smoothstep(0.58, 0.92, x));
  }

  void main() {
    vec2 p = (vUv - 0.5) * vec2(1.88, 1.0);
    float r = length(p);

    // Escalation response is curved: linear fever piles all visible change
    // into the top third, and 0.5 looks like 0 in a still. 0.55 keeps the
    // bottom half of the range doing real work.
    float f = pow(uFever, 0.55);

    // Deep radial well: bruised purple center falling to near-black edges.
    vec3 center = vec3(0.086, 0.047, 0.149);
    vec3 edge   = vec3(0.027, 0.016, 0.055);
    vec3 col = mix(center, edge, smoothstep(0.15, 0.95, r));

    // Weather, drifting in two directions at two scales.
    float t = uTime;
    float n1 = noise(p * 2.6 + vec2(t * 0.11, t * 0.05));
    float n2 = noise(p * 5.2 + vec2(-t * 0.04, t * 0.09) + 17.0);

    // Soft bruises at rest, defined blotches at full fever.
    float sharpen = mix(2.0, 1.15, f);
    vec3 bruise = vec3(0.141, 0.063, 0.200);
    vec3 tealNight = vec3(0.031, 0.110, 0.129);
    col += bruise * pow(n1, sharpen) * (0.55 + 1.05 * f);
    col += tealNight * pow(n2, sharpen) * (0.30 + 0.45 * f);
    col *= 1.0 + 0.45 * f * smoothstep(0.55, 0.05, r);

    // The oil slick. A slow field picks where the film sits; its thickness
    // cycles the mirrored ramp so colors crawl the way a real slick does.
    // It lives inside the bruises (masked by n1) and favors the frame's
    // edges over the well, so the board keeps its dark backdrop.
    float slick = noise(p * 1.5 + vec2(t * 0.05, -t * 0.028) + 40.0);
    float film = abs(fract(slick * 1.35 + t * 0.012) * 2.0 - 1.0);
    float sheenMask = pow(n1, 1.6) * smoothstep(0.10, 0.55, r);
    col += slickRamp(film) * sheenMask * (0.10 + 0.34 * f);

    // The heat family, entering with fever and only with fever: embers low in
    // the frame, arterial red banking into hazard orange where they burn
    // brightest. At fever 0 this term is exactly zero — idle stays goth night.
    float heat = smoothstep(0.15, 0.85, uFever);
    float emberField = noise(p * 3.4 + vec2(t * 0.18, -t * 0.12) + 71.0);
    float ember = pow(emberField, mix(3.2, 1.7, heat));
    vec3 arterial = vec3(0.55, 0.05, 0.07);
    vec3 hazard   = vec3(0.93, 0.34, 0.05);
    float low = smoothstep(0.62, 0.05, vUv.y);
    col += mix(arterial, hazard, ember) * ember * heat * (0.20 + 0.55 * low);
    // A faint arterial underglow so the heat reads even between embers.
    col += arterial * heat * 0.10 * low;

    // A faint vertical grade so "up" exists in the nothing.
    col += vec3(0.045, 0.020, 0.062) * smoothstep(0.15, 0.85, vUv.y) * 0.4;

    // The colors above are authored as what should reach the screen, but the
    // post chain treats this output as linear and applies linear-to-sRGB at
    // the end — without this the void renders as washed-out daylight purple.
    col = pow(col, vec3(2.2));

    // Fine grain kills gradient banding, which the expensive side of the
    // budget law can't tolerate. Below anything readable as texture.
    col += (hash(vUv * 913.7 + vec2(fract(t), 0.0)) - 0.5) * 0.008;

    gl_FragColor = vec4(col, 1.0);
  }
`;

/** Drift speed in noise-units per second, across the fever range. */
const CALM_DRIFT = 0.6;
const FEVERED_DRIFT = 4.5;

export function VoidBackdrop() {
  const material = useRef<THREE.ShaderMaterial>(null);
  const drift = useRef(0);
  const feverOf = useFeverSource();
  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uFever: { value: 0 },
    }),
    [],
  );

  useFrame((_, dt) => {
    if (!material.current) return;
    const fever = feverOf();

    // Integrate the drift rather than scaling elapsed time. `elapsed * speed`
    // is the obvious form and it teleports: change the speed at t=40s and the
    // pattern jumps forty seconds' worth of distance in one frame. Speed is a
    // rate, so it has to be added up.
    drift.current += Math.min(dt, 0.1) * (CALM_DRIFT + (FEVERED_DRIFT - CALM_DRIFT) * fever);

    material.current.uniforms.uTime!.value = drift.current;
    material.current.uniforms.uFever!.value = fever;
  });

  return (
    // Sized to the *visible* frustum (plus margin for wide aspects), not "big
    // enough to be safe": the shader composes in UV space, and on a 170x96
    // plane the camera only ever saw the middle fifth — the well, the edge
    // falloff and the ember band all happened off-screen.
    <mesh position={[0, 0, -16]} frustumCulled={false}>
      <planeGeometry args={[64, 34]} />
      <shaderMaterial
        ref={material}
        vertexShader={vertex}
        fragmentShader={fragment}
        uniforms={uniforms}
        depthWrite={false}
      />
    </mesh>
  );
}
