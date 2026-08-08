/**
 * The stage: canvas, camera, lights, void, board, discs, props, input. Pure
 * view — it renders a `StageModel` and reports gestures upward, which is what
 * lets the preview harness mount any scene state with no store and no bot.
 *
 * The camera is fit from the variant every frame (geometry is a value), sways
 * slowly because a perfectly still camera reads as a screenshot, and dips hard
 * for one beat when a disc lands — the whole stage flinches.
 *
 * It also orbits: dragging anywhere on the canvas turns the board (`orbit.ts`).
 * The fit distance, the sway and the flinch are unchanged by that — the player
 * moves the camera around the authored framing, never replaces it, which is
 * why there's no zoom, no pan and a hard clamp on both angles.
 *
 * The environment is four Lightformers rendered once to a small cubemap: the
 * sky that isn't there. Chrome and lacquer in the scene reflect a magenta
 * horizon, a teal underlight and a gold slash that no visible object emits.
 */

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import * as THREE from "three";
import type { Player, Variant } from "@fourscore/engine";
import { useDebugStore } from "../debug/store.js";
import { ScenePinProvider, type ScenePin } from "../director/scope.js";
import { PropStage } from "../props/PropStage.js";
import { BoardRig } from "./BoardRig.js";
import { ColumnInput, GhostDisc } from "./ColumnInput.js";
import { Discs } from "./Discs.js";
import { stageFx } from "./fx.js";
import { CAMERA_TARGET, fitDistance, layoutFor, type StageLayout } from "./layout.js";
import { createOrbit, type Orbit } from "./orbit.js";
import { PostStack } from "./Post.js";
import { VoidBackdrop } from "./VoidBackdrop.js";

export interface StageModel {
  variant: Variant;
  moves: readonly number[];
  /** Discs settled so far; lags `moves` by one drop animation. */
  landed: number;
  winningCells: readonly { row: number; col: number }[];
  /** Column under the pointer, when the human may drop there. */
  hoverCol: number | null;
  /** Who the hover ghost belongs to; null hides input affordances entirely. */
  ghostPlayer: Player | null;
  onColumn?: (col: number) => void;
  onHover?: (col: number | null) => void;
  onDiscLanded?: () => void;
  /**
   * Pin this scene's fever and/or a prop act. Harness-only: the app leaves it
   * undefined so the scene follows the Director. See `director/scope.tsx`.
   */
  pin?: ScenePin;
}

const FOV = 38;

/**
 * The sway, still in world units: how far across the board's face the camera
 * drifts, and how far above the target it sits. Divided by the distance at
 * render time, which turns it into the angles the orbit is expressed in — so
 * it stays the same authored drift at any board size and at any orbit, rather
 * than growing with the camera's distance.
 */
const SWAY_X = 0.22;
const BASE_Y = 0.3;
const SWAY_Y = 0.16;

function CameraRig({ layout, orbit }: { layout: StageLayout; orbit: Orbit }) {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const aspect = useThree((s) => s.viewport.aspect);

  useFrame(({ clock }, dt) => {
    const t = clock.elapsedTime;
    orbit.step(dt);
    // Refit for the orbit, not just the variant: a turned board needs more
    // room than a flat one, and the fit is what keeps it in frame. Fit to the
    // orbit alone — the sway is a fraction of a degree, and feeding it back in
    // would make the distance breathe with it.
    const dist = fitDistance(layout, FOV, aspect, orbit.yaw, orbit.pitch);
    // Slow drift, so the frame is alive even when nothing happens.
    const yaw = orbit.yaw + (Math.sin(t * 0.11) * SWAY_X) / dist;
    const pitch = orbit.pitch + (BASE_Y + Math.sin(t * 0.07) * SWAY_Y) / dist;
    const flat = Math.cos(pitch) * dist;
    camera.fov = FOV;
    camera.position.set(
      CAMERA_TARGET[0] + Math.sin(yaw) * flat,
      CAMERA_TARGET[1] + Math.sin(pitch) * dist,
      CAMERA_TARGET[2] + Math.cos(yaw) * flat,
    );
    // The land flinch: a hard dip, held one beat, released. No easing.
    if (performance.now() - stageFx.lastLandAt < 70) camera.position.y -= 0.09;
    camera.lookAt(...CAMERA_TARGET);
    camera.updateProjectionMatrix();
  });

  return null;
}

function Lights() {
  return (
    <>
      <ambientLight intensity={0.5} color="#8f7bb0" />
      <directionalLight position={[6, 9, 8]} intensity={1.6} color="#ffeeda" />
      {/* Violet rim from behind-left, teal breath from below — the void's
          light, not a studio's. */}
      <pointLight position={[-7, 3, -5]} intensity={60} color="#7a2bd0" />
      <pointLight position={[3, -7, 7]} intensity={9} color="#1d5a6e" />
    </>
  );
}

/**
 * The sky that isn't there: a handful of over-bright panels rendered once
 * through PMREM into `scene.environment`. Nothing here is ever visible
 * directly — only as the oil-slick crawl on the board's lacquer and the
 * discs. Built by hand rather than through drei's Environment because a
 * five-quad scene doesn't need a portal, and this way what the chrome
 * reflects is exactly what this function says.
 */
function VoidSky() {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);

  useEffect(() => {
    const sky = new THREE.Scene();
    sky.background = new THREE.Color("#07040e");
    const panel = (
      color: [number, number, number],
      position: [number, number, number],
      scale: [number, number],
      lookAtOrigin = true,
    ) => {
      const mesh = new THREE.Mesh(
        new THREE.PlaneGeometry(scale[0], scale[1]),
        new THREE.MeshBasicMaterial({ color: new THREE.Color(...color), side: THREE.DoubleSide }),
      );
      mesh.position.set(...position);
      if (lookAtOrigin) mesh.lookAt(0, 0, 0);
      sky.add(mesh);
    };
    // Magenta horizon behind, teal underlight, a gold slash high right, a
    // violet pool below — the iridescence family, nothing else.
    panel([2.6, 0.5, 1.9], [0, 3, -9], [16, 3]);
    panel([0.2, 1.5, 1.4], [-5, -6, 5], [12, 4]);
    panel([2.4, 1.7, 0.5], [7, 6, 3], [2, 9]);
    panel([0.9, 0.3, 1.9], [0, -9, -3], [10, 6]);
    // Behind the camera, wide and dim: this is what the board's flat front
    // face actually reflects. Without it the lacquer reads as matte black —
    // a face mirrored at the viewer samples the sky *behind* the viewer.
    panel([0.55, 0.2, 0.8], [3, 2, 10], [18, 10]);
    panel([0.25, 0.45, 0.5], [-6, -2, 9], [8, 8]);

    const pmrem = new THREE.PMREMGenerator(gl);
    const env = pmrem.fromScene(sky, 0.06);
    scene.environment = env.texture;
    return () => {
      scene.environment = null;
      env.dispose();
      pmrem.dispose();
    };
  }, [gl, scene]);

  return null;
}

/** The whole act — board and discs together — levitates. Nothing to stand on. */
function Levitate({ children }: { children: React.ReactNode }) {
  const group = useMemo(() => new THREE.Group(), []);
  useFrame(({ clock }) => {
    group.position.y = Math.sin(clock.elapsedTime * 0.45) * 0.06;
  });
  return <primitive object={group}>{children}</primitive>;
}

export function StageView({ model }: { model: StageModel }) {
  const layout = useMemo(() => layoutFor(model.variant), [model.variant]);
  const postEnabled = useDebugStore((s) => s.postEnabled);
  const interactive = model.onColumn !== undefined;
  // One orbit per stage, not a module singleton: the preview harness mounts
  // several of these at once and dragging one tile must not turn the others.
  const orbit = useMemo(() => createOrbit(), []);

  // The drag continues off the canvas and ends wherever it ends — window
  // listeners rather than pointer capture, which would retarget the events
  // R3F needs for hover and for the click that drops a disc.
  useEffect(() => {
    // Primary pointer only: a second finger landing mid-drag would otherwise
    // teleport the camera to wherever it touched down.
    const move = (e: PointerEvent) => e.isPrimary && orbit.move(e.clientX, e.clientY);
    const end = () => orbit.release();
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
    };
  }, [orbit]);

  return (
    <Canvas
      dpr={[1, 2]}
      gl={{ antialias: true, powerPreference: "high-performance" }}
      camera={{ fov: FOV, near: 0.1, far: 80, position: [0, 0.4, 14] }}
      onPointerDown={(e) => e.isPrimary && orbit.press(e.clientX, e.clientY)}
    >
      <ScenePinProvider pin={model.pin}>
        <CameraRig layout={layout} orbit={orbit} />
        <Lights />
        <VoidSky />
        <VoidBackdrop />
        <Levitate>
          <BoardRig layout={layout} />
          <Discs
            layout={layout}
            moves={model.moves}
            landed={model.landed}
            winningCells={model.winningCells}
            onDiscLanded={model.onDiscLanded}
          />
          {model.ghostPlayer !== null && model.hoverCol !== null && (
            <GhostDisc layout={layout} col={model.hoverCol} player={model.ghostPlayer} />
          )}
        </Levitate>
        <PropStage layout={layout} />
        {interactive && (
          <ColumnInput
            layout={layout}
            orbit={orbit}
            onColumn={model.onColumn!}
            onHover={model.onHover ?? (() => {})}
          />
        )}
        {postEnabled && <PostStack />}
      </ScenePinProvider>
    </Canvas>
  );
}
