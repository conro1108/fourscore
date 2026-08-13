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
 *
 * ## The opponent's weather (phase 5)
 *
 * Four uniforms bend layers 2 and 3 into the void that opponent stands in
 * (`bots/identity.ts`): a tint mixed into the weather, its grain, its drift
 * rate and the oil slick's strength. Eight worlds, one shader — which is the
 * only way eight opponents can have their own look without the look coming
 * apart.
 *
 * Two things are deliberately *not* on the list. The heat layer is untouched by
 * every one of them, because heat means fever and an opponent who tinted it
 * would make escalation unreadable. And the neutral value of all four is the
 * phase-2 frame exactly, so a scene with no opponent — the thesis state, the
 * whole preview harness — renders what phase 2 shipped, to the bit.
 */

import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import { voidOf } from "../bots/identity.js";
import { useBotSource, useFeverSource } from "../director/scope.js";
import { CAMERA_TARGET } from "./layout.js";
import { useTheme } from "./theme.js";

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
  /* The opponent's weather. Neutral is (0,0,0) / 0.0 / 1.0 / 1.0. */
  uniform vec3 uTint;
  uniform float uTintAmount;
  uniform float uGrain;
  /* Signed: magnitude is the slick's strength, sign is which way it crawls. */
  uniform float uSlick;
  /* The theme's palette (stage/theme.ts) — the fever theme is the constants
     this shader was originally authored with, to the digit. The heat family
     is deliberately not a uniform: fever is arterial red in every theme. */
  uniform vec3 uWell;
  uniform vec3 uEdge;
  uniform vec3 uWeatherA;
  uniform vec3 uWeatherB;
  uniform float uWeatherGain;
  uniform vec3 uSlickA;
  uniform vec3 uSlickB;
  uniform vec3 uSlickC;
  uniform float uSlickGain;
  uniform vec3 uGrade;

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

  // The oil-slick ramp — magenta into teal into gold in the fever theme; the
  // theme picks the three stops. Mirrored so it cycles without a seam.
  vec3 slickRamp(float x) {
    vec3 c = mix(uSlickA, uSlickB, smoothstep(0.12, 0.52, x));
    return mix(c, uSlickC, smoothstep(0.58, 0.92, x));
  }

  void main() {
    vec2 p = (vUv - 0.5) * vec2(1.88, 1.0);
    float r = length(p);

    // Escalation response is curved: linear fever piles all visible change
    // into the top third, and 0.5 looks like 0 in a still. 0.55 keeps the
    // bottom half of the range doing real work.
    float f = pow(uFever, 0.55);

    float t = uTime;

    // Deep radial well: bruised purple center falling to near-black edges. The
    // well breathes — its mouth opens and closes a few percent on a slow cycle
    // — so the frame is never the same twice even at fever 0. Cheap, and it's
    // what stops the idle void reading as a still image.
    float breath = 0.5 + 0.5 * sin(t * 0.09);
    // The opponent reaches the well faintly — half the weather's dose — so the
    // frame's darkest region stays the void's own near-black rather than
    // becoming a coloured room.
    // Lifted for the polish lap (Connor: "the background is a bit dark") —
    // still bruised purple falling toward black, but the room has lights now.
    vec3 center = mix(uWell, uTint * 0.55, uTintAmount * 0.5);
    vec3 edge   = uEdge;
    vec3 col = mix(center, edge, smoothstep(0.11 + 0.07 * breath, 0.88 + 0.14 * breath, r));

    // Weather, drifting in two directions at two scales. The two fields move at
    // deliberately unrelated speeds and angles: matched motion reads as one
    // sliding texture, mismatched motion reads as depth. uGrain scales both
    // together — one opponent's weather is spores and another's is smoke, and
    // that difference is the field's size, not a second noise function.
    float n1 = noise(p * 2.6 * uGrain + vec2(t * 0.19, t * 0.075));
    float n2 = noise(p * 5.2 * uGrain + vec2(-t * 0.13, t * 0.21) + 17.0);

    // Soft bruises at rest, defined blotches at full fever.
    float sharpen = mix(2.0, 1.15, f);
    vec3 bruise = mix(uWeatherA, uTint, uTintAmount);
    vec3 tealNight = mix(uWeatherB, uTint * 0.5, uTintAmount * 0.7);
    // The two constants below are pivoted around mid-fever on purpose: the
    // idle end got livelier (a void that only wakes up when the game does has
    // nothing to escalate from) while the value at the thesis frame's 0.55
    // barely moves. Re-pivoted brighter again in phase 9 — same trick, more
    // light at rest.
    col += bruise * pow(n1, sharpen) * (0.92 + 0.55 * f) * uWeatherGain;
    col += tealNight * pow(n2, sharpen) * (0.44 + 0.27 * f) * uWeatherGain;
    // Trimmed with the phase-9 brightening: the base is lighter now, so the
    // full-fever central wash needs less gain to read as "gone hot" without
    // flooding the board's holes to lavender (the phase-3 open question).
    col *= 1.0 + 0.30 * f * smoothstep(0.55, 0.05, r);

    // The oil slick. A slow field picks where the film sits; its thickness
    // cycles the mirrored ramp so colors crawl the way a real slick does.
    // It lives inside the bruises (masked by n1) and favors the frame's
    // edges over the well, so the board keeps its dark backdrop.
    float slick = noise(p * 1.5 + vec2(t * 0.09, -t * 0.05) + 40.0);
    // The film thickness cycles on its own clock, faster than the field it
    // sits in — that difference is why the colors crawl *through* the slick
    // instead of travelling with it. A negative uSlick runs that clock
    // backwards, which is one opponent's entire tell: the colors crawl against
    // the weather, and nothing else about their void is wrong at all.
    float film = abs(fract(slick * 1.35 + t * 0.055 * sign(uSlick)) * 2.0 - 1.0);
    float sheenMask = pow(n1, 1.6) * smoothstep(0.10, 0.55, r);
    col += slickRamp(film) * sheenMask * (0.23 + 0.17 * f) * abs(uSlick) * uSlickGain;

    // The heat family, entering with fever and only with fever: embers low in
    // the frame, arterial red banking into hazard orange where they burn
    // brightest. At fever 0 this term is exactly zero — idle stays goth night.
    float heat = smoothstep(0.15, 0.85, uFever);
    float emberField = noise(p * 3.4 + vec2(t * 0.18, -t * 0.12) + 71.0);
    float ember = pow(emberField, mix(3.2, 1.7, heat));
    vec3 arterial = vec3(0.55, 0.05, 0.07);
    vec3 hazard   = vec3(0.93, 0.34, 0.05);
    float low = smoothstep(0.62, 0.05, vUv.y);
    col += mix(arterial, hazard, ember) * ember * heat * (0.26 + 0.62 * low);
    // A faint arterial underglow so the heat reads even between embers.
    col += arterial * heat * 0.10 * low;

    // A faint vertical grade so "up" exists in the nothing.
    col += uGrade * smoothstep(0.15, 0.85, vUv.y) * 0.55;

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

/**
 * Drift speed in noise-units per second, across the fever range. The calm end
 * used to be 0.6, which was honest to "uncanny idle" and read as a static
 * wallpaper in actual play — the void has to look alive *before* the game gets
 * sharp, or the escalation has nothing to escalate from.
 */
const CALM_DRIFT = 1.5;
const FEVERED_DRIFT = 6.5;

/** How far behind the board the void hangs. */
const BEHIND = 16;

const target = new THREE.Vector3(...CAMERA_TARGET);
const axis = new THREE.Vector3();
const TINT = new THREE.Vector3();

/**
 * A hex string as the screen values the shader is authored in.
 *
 * Deliberately not `THREE.Color`, which colour-manages a hex into the linear
 * working space — correct for a material, wrong here. Everything in this
 * fragment is written as what should reach the screen and the whole thing is
 * gamma-corrected once at the end, so a tint has to arrive in the same space
 * the constants next to it are in.
 */
const srgb = (hex: string): [number, number, number] => {
  const n = parseInt(hex.replace("#", ""), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
};

export function VoidBackdrop() {
  const material = useRef<THREE.ShaderMaterial>(null);
  const mesh = useRef<THREE.Mesh>(null);
  const drift = useRef(0);
  /**
   * False until the weather uniforms hold a real value. Frame one adopts the
   * opponent outright instead of ramping to them: a harness state pins a bot
   * and is screenshotted, and a half-second fade in is a half-second of the
   * wrong void in every shot.
   */
  const settled = useRef(false);
  const feverOf = useFeverSource();
  const botOf = useBotSource();
  const theme = useTheme();
  // The theme's palette as shader-space vectors, once per theme change rather
  // than sixty times a second.
  const palette = useMemo(() => {
    const v = theme.void;
    return {
      well: srgb(v.well),
      edge: srgb(v.edge),
      weatherA: srgb(v.weatherA),
      weatherB: srgb(v.weatherB),
      slickA: srgb(v.slick[0]),
      slickB: srgb(v.slick[1]),
      slickC: srgb(v.slick[2]),
      grade: srgb(v.grade),
      weatherGain: v.weatherGain,
      slickGain: v.slickGain,
    };
  }, [theme]);
  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uFever: { value: 0 },
      uTint: { value: new THREE.Vector3(0, 0, 0) },
      uTintAmount: { value: 0 },
      uGrain: { value: 1 },
      uSlick: { value: 1 },
      // Fever-theme defaults; the frame loop below keeps them at the theme.
      uWell: { value: new THREE.Vector3(0.118, 0.066, 0.196) },
      uEdge: { value: new THREE.Vector3(0.043, 0.026, 0.084) },
      uWeatherA: { value: new THREE.Vector3(0.141, 0.063, 0.2) },
      uWeatherB: { value: new THREE.Vector3(0.031, 0.11, 0.129) },
      uWeatherGain: { value: 1 },
      uSlickA: { value: new THREE.Vector3(0.72, 0.1, 0.55) },
      uSlickB: { value: new THREE.Vector3(0.05, 0.46, 0.47) },
      uSlickC: { value: new THREE.Vector3(0.8, 0.58, 0.16) },
      uSlickGain: { value: 1 },
      uGrade: { value: new THREE.Vector3(0.045, 0.02, 0.062) },
    }),
    [],
  );

  useFrame(({ camera }, dt) => {
    if (!material.current || !mesh.current) return;
    const fever = feverOf();
    // Read every frame rather than on a change: the opponent switches on the
    // menu while this is running, and there is no cheaper place to notice.
    const weather = voidOf(botOf());

    // The void has no edge, so the camera must never get to see one. Rather
    // than sit at a fixed z, the plane rides the view axis 16 units behind the
    // board and faces the camera, which is the same frame it filled before the
    // camera could orbit — the numbers below are still tuned against exactly
    // this framing. Reads the camera *this* frame: CameraRig subscribes first
    // (mount order, equal priority), so it has already moved.
    axis.subVectors(camera.position, target).normalize();
    mesh.current.position.copy(target).addScaledVector(axis, -BEHIND);
    mesh.current.quaternion.copy(camera.quaternion);

    // Integrate the drift rather than scaling elapsed time. `elapsed * speed`
    // is the obvious form and it teleports: change the speed at t=40s and the
    // pattern jumps forty seconds' worth of distance in one frame. Speed is a
    // rate, so it has to be added up.
    const step = Math.min(dt, 0.1);
    drift.current +=
      step * (CALM_DRIFT + (FEVERED_DRIFT - CALM_DRIFT) * fever) * weather.drift;

    const u = material.current.uniforms;
    u.uTime!.value = drift.current;
    u.uFever!.value = fever;

    // The weather changes over about half a second rather than cutting. The
    // taste law's hard-edged timing is a rule about *props*; this is the
    // expensive half of the frame, and a palette that snaps on the void reads
    // as a rendering fault rather than as a choice. Changing opponent on the
    // menu should look like weather coming in.
    const k = settled.current ? 1 - Math.exp(-step / 0.18) : 1;
    settled.current = true;
    const [tr, tg, tb] = srgb(weather.tint);
    (u.uTint!.value as THREE.Vector3).lerp(TINT.set(tr, tg, tb), k);
    u.uTintAmount!.value += (weather.tintAmount - u.uTintAmount!.value) * k;
    u.uGrain!.value += (weather.grain - u.uGrain!.value) * k;
    u.uSlick!.value += (weather.slick - u.uSlick!.value) * k;

    // The theme rides the same half-second ease as the opponent's weather, and
    // for the same reason: a palette that snaps on the expensive side of the
    // frame reads as a rendering fault, and a theme switch should look like
    // the weather changing its mind.
    const vec = (uniform: { value: THREE.Vector3 }, [r, g, b]: [number, number, number]) =>
      uniform.value.lerp(TINT.set(r, g, b), k);
    vec(u.uWell as { value: THREE.Vector3 }, palette.well);
    vec(u.uEdge as { value: THREE.Vector3 }, palette.edge);
    vec(u.uWeatherA as { value: THREE.Vector3 }, palette.weatherA);
    vec(u.uWeatherB as { value: THREE.Vector3 }, palette.weatherB);
    vec(u.uSlickA as { value: THREE.Vector3 }, palette.slickA);
    vec(u.uSlickB as { value: THREE.Vector3 }, palette.slickB);
    vec(u.uSlickC as { value: THREE.Vector3 }, palette.slickC);
    vec(u.uGrade as { value: THREE.Vector3 }, palette.grade);
    u.uWeatherGain!.value += (palette.weatherGain - u.uWeatherGain!.value) * k;
    u.uSlickGain!.value += (palette.slickGain - u.uSlickGain!.value) * k;
  });

  return (
    // Sized to the *visible* frustum (plus margin for wide aspects), not "big
    // enough to be safe": the shader composes in UV space, and on a 170x96
    // plane the camera only ever saw the middle fifth — the well, the edge
    // falloff and the ember band all happened off-screen. Placed every frame
    // above; the initial position only has to survive frame one.
    <mesh ref={mesh} position={[0, 0, -BEHIND]} frustumCulled={false}>
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
