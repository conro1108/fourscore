/**
 * The void. Placeholder for phase 2's real shader work, but a placeholder that
 * already obeys the law: the void is the *expensive* side — full resolution,
 * smooth, never crunchy. Near-black purples, never pure black, with slow
 * drifting bruises of color.
 *
 * Phase 1 makes it the Director's first consumer: fever drives how fast the
 * weather drifts, and how hard the bruises push through. Phase 2's Fable step
 * owns the actual look — this escalation stays inside the colors already here
 * (violet and teal night), because the heat family is a palette decision, not
 * an Opus one.
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
  /** Drift *distance*, not wall clock — see the note in useFrame below. */
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

  void main() {
    vec2 p = (vUv - 0.5) * vec2(1.78, 1.0);
    float r = length(p);

    // Deep radial well: bruised purple center falling to near-black edges.
    vec3 center = vec3(0.086, 0.047, 0.149);  // #160c26
    vec3 edge   = vec3(0.027, 0.016, 0.055);  // #07040e
    vec3 col = mix(center, edge, smoothstep(0.08, 0.62, r));

    // Two layers of slow weather, drifting in different directions.
    float t = uTime;
    float n1 = noise(p * 2.6 + vec2(t * 0.11, t * 0.05));
    float n2 = noise(p * 5.2 + vec2(-t * 0.04, t * 0.09) + 17.0);

    // Fever doesn't recolor the void, it leans on it: the same bruises push
    // harder and go blotchier, and the well tightens. A new hue would be a
    // palette decision (VISION.md reserves the heat family), so there isn't one.
    //
    // The ramp is curved because the response isn't linear in anything the eye
    // uses — with a straight uFever the whole escalation piled up in the top
    // third, and fever 0.5 was indistinguishable from fever 0 in a still.
    float f = pow(uFever, 0.65);
    // Soft weather at rest, defined blotches at full fever.
    float sharpen = mix(2.0, 1.15, f);

    vec3 bruise = vec3(0.141, 0.063, 0.200);  // violet
    vec3 tealNight = vec3(0.031, 0.110, 0.129);
    col += bruise * pow(n1, sharpen) * (0.55 + 1.05 * f);
    col += tealNight * pow(n2, sharpen) * (0.30 + 0.45 * f);
    col *= 1.0 + 0.45 * f * smoothstep(0.55, 0.05, r);

    // A faint vertical grade so "up" exists in the nothing.
    col += vec3(0.045, 0.020, 0.062) * smoothstep(0.15, 0.85, vUv.y) * 0.4;

    // The colors above are authored as what should reach the screen, but the
    // post chain treats this output as linear and applies linear->sRGB at the
    // end — without this the whole void renders as washed-out daylight purple.
    col = pow(col, vec3(2.2));

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
    <mesh position={[0, 0, -16]} frustumCulled={false}>
      <planeGeometry args={[170, 96]} />
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
