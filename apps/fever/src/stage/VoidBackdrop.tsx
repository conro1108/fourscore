/**
 * The void. Placeholder for phase 2's real shader work, but a placeholder that
 * already obeys the law: the void is the *expensive* side — full resolution,
 * smooth, never crunchy. Near-black purples, never pure black, with slow
 * drifting bruises of color.
 *
 * `uDrift` is the knob phase 1 wires fever into (its accept criterion is
 * "slider and a real game both visibly move the void"), so it's already a
 * uniform rather than a constant.
 */

import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";

const vertex = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const fragment = /* glsl */ `
  varying vec2 vUv;
  uniform float uTime;
  uniform float uDrift;

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
    float t = uTime * uDrift;
    float n1 = noise(p * 2.6 + vec2(t * 0.11, t * 0.05));
    float n2 = noise(p * 5.2 + vec2(-t * 0.04, t * 0.09) + 17.0);

    vec3 bruise = vec3(0.141, 0.063, 0.200);  // violet
    vec3 tealNight = vec3(0.031, 0.110, 0.129);
    col += bruise * (n1 * n1) * 0.55;
    col += tealNight * (n2 * n2) * 0.30;

    // A faint vertical grade so "up" exists in the nothing.
    col += vec3(0.045, 0.020, 0.062) * smoothstep(0.15, 0.85, vUv.y) * 0.4;

    // The colors above are authored as what should reach the screen, but the
    // post chain treats this output as linear and applies linear->sRGB at the
    // end — without this the whole void renders as washed-out daylight purple.
    col = pow(col, vec3(2.2));

    gl_FragColor = vec4(col, 1.0);
  }
`;

export function VoidBackdrop() {
  const material = useRef<THREE.ShaderMaterial>(null);
  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uDrift: { value: 1 },
    }),
    [],
  );

  useFrame(({ clock }) => {
    if (material.current) material.current.uniforms.uTime!.value = clock.elapsedTime;
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
