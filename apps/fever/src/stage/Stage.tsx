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
import { useSettingsStore } from "../settings/store.js";
import { ScenePinProvider, type ScenePin } from "../director/scope.js";
import { PropStage } from "../props/PropStage.js";
import { BoardRig } from "./BoardRig.js";
import { ColumnInput, GhostDisc } from "./ColumnInput.js";
import { Discs } from "./Discs.js";
import { stageFx } from "./fx.js";
import { CAMERA_TARGET, fitDistance, layoutFor, type StageLayout } from "./layout.js";
import { createOrbit, type Orbit } from "./orbit.js";
import { PostStack } from "./Post.js";
import { createTray } from "./release.js";
import { ReleaseTray } from "./ReleaseTray.js";
import { ThemeContext, themeById, useTheme, useThemeStore, type ThemeId } from "./theme.js";
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
  /**
   * Columns the review is pointing at, over a board wound back to that move:
   * `best` is what would have held, `played` is what was played instead. Empty
   * during a game — nothing in a live match marks a column.
   */
  marks?: readonly { col: number; kind: "best" | "played" }[];
  /** Whose move the marks belong to, so `best` reads in the mover's colour. */
  markPlayer?: Player;
  onColumn?: (col: number) => void;
  onHover?: (col: number | null) => void;
  onDiscLanded?: () => void;
  /**
   * The release tray (the Connect 4 slider under the board). `ready` arms the
   * handle; `auto` makes the software pull it itself (the AGAIN button routes
   * through the same animation the hand gets); `onDone` fires once every disc
   * is out the bottom — that's where the next game starts.
   */
  release?: { ready: boolean; auto: boolean; onDone: () => void };
  /**
   * Pin this scene's fever and/or a prop act. Harness-only: the app leaves it
   * undefined so the scene follows the Director. See `director/scope.tsx`.
   */
  pin?: ScenePin;
  /** Pin a theme. Harness-only; the app follows the theme store. */
  theme?: ThemeId;
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
    const dist = fitDistance(layout, FOV, aspect, orbit.yaw, orbit.pitch) * orbit.zoom;
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
  const { lights } = useTheme();
  return (
    <>
      <ambientLight intensity={lights.ambient.intensity} color={lights.ambient.color} />
      <directionalLight
        position={lights.key.position}
        intensity={lights.key.intensity}
        color={lights.key.color}
      />
      {/* A rim from behind-left, a breath from below — the void's light, not a
          studio's. Each theme picks the colors; the rig is the rig. */}
      <pointLight position={lights.rim.position} intensity={lights.rim.intensity} color={lights.rim.color} />
      <pointLight position={lights.fill.position} intensity={lights.fill.intensity} color={lights.fill.color} />
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
  const theme = useTheme();

  useEffect(() => {
    const sky = new THREE.Scene();
    sky.background = new THREE.Color(theme.sky.bg);
    // The theme's panels — the fever theme's are a magenta horizon, a teal
    // underlight, a gold slash, a violet pool. The last two sit behind the
    // camera, wide and dim: that's what the board's flat front face actually
    // reflects. Without them the lacquer reads as matte black — a face
    // mirrored at the viewer samples the sky *behind* the viewer.
    for (const p of theme.sky.panels) {
      const mesh = new THREE.Mesh(
        new THREE.PlaneGeometry(p.scale[0], p.scale[1]),
        new THREE.MeshBasicMaterial({ color: new THREE.Color(...p.color), side: THREE.DoubleSide }),
      );
      mesh.position.set(...p.position);
      mesh.lookAt(0, 0, 0);
      sky.add(mesh);
    }

    const pmrem = new THREE.PMREMGenerator(gl);
    const env = pmrem.fromScene(sky, 0.06);
    scene.environment = env.texture;
    return () => {
      scene.environment = null;
      env.dispose();
      pmrem.dispose();
    };
  }, [gl, scene, theme]);

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
  // One switch, two views: the settings window and the debug panel both write
  // this, so "turn the post stack off" means the same thing to a player
  // debugging a slow laptop and to an agent debugging a shader.
  const postEnabled = useSettingsStore((s) => s.effects);
  const interactive = model.onColumn !== undefined;
  // The model's pin wins so a harness tile can show a theme the store isn't
  // on; the app never pins, so it follows the store live.
  const storeThemeId = useThemeStore((s) => s.themeId);
  const theme = themeById(model.theme ?? storeThemeId);
  // One orbit per stage, not a module singleton: the preview harness mounts
  // several of these at once and dragging one tile must not turn the others.
  const orbit = useMemo(() => createOrbit(), []);
  // Same story for the release tray — its pull is this stage's, not the app's.
  const tray = useMemo(() => createTray(), []);

  /**
   * Live pointers, so two fingers can be told from one. Only the ones that
   * started on the canvas are in here — a finger that lands on a dialog isn't
   * half of a pinch.
   */
  const pointers = useMemo(() => new Map<number, { x: number; y: number }>(), []);
  const span = () => {
    const [a, b] = [...pointers.values()];
    return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
  };

  // The drag continues off the canvas and ends wherever it ends — window
  // listeners rather than pointer capture, which would retarget the events
  // R3F needs for hover and for the click that drops a disc.
  useEffect(() => {
    const move = (e: PointerEvent) => {
      if (pointers.has(e.pointerId)) pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size >= 2) return orbit.pinch(span());
      // Primary pointer only: a second finger landing mid-drag would otherwise
      // teleport the camera to wherever it touched down.
      if (e.isPrimary) orbit.move(e.clientX, e.clientY);
    };
    const end = (e: PointerEvent) => {
      pointers.delete(e.pointerId);
      // One finger left is not a pinch — but it doesn't become a drag either,
      // because its `press` is long gone and picking it up mid-gesture would
      // snap the board to wherever that finger happens to be.
      if (pointers.size < 2) orbit.endPinch();
      if (pointers.size === 0) orbit.release();
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
    };
  }, [orbit, pointers]);

  return (
    <Canvas
      dpr={[1, 2]}
      gl={{ antialias: true, powerPreference: "high-performance" }}
      camera={{ fov: FOV, near: 0.1, far: 80, position: [0, 0.4, 14] }}
      onPointerDown={(e) => {
        // The tray's handle claims its pointer before this bubbles up (R3F
        // dispatches mesh events from the canvas, a child of this div) — a
        // hand on the slider is not a hand on the camera.
        if (tray.grabbed) return;
        pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (pointers.size === 1) orbit.press(e.clientX, e.clientY);
        else orbit.pinch(span());
      }}
      /* A trackpad pinch arrives here as a ctrl-wheel, so the desktop gesture
         and the touch one are the same gesture; a plain wheel zooms too, at a
         gentler rate. `touch-action: none` on the canvas keeps the browser from
         taking either of them for a page zoom. */
      onWheel={(e) => orbit.zoomBy(Math.exp(e.deltaY * (e.ctrlKey ? 0.01 : 0.0016)))}
    >
      <ThemeContext.Provider value={theme}>
        <ScenePinProvider pin={model.pin}>
          <CameraRig layout={layout} orbit={orbit} />
          <Lights />
          <VoidSky />
          <VoidBackdrop />
          <Levitate>
            <BoardRig layout={layout} />
            <ReleaseTray
              layout={layout}
              tray={tray}
              moves={model.moves}
              ready={model.release?.ready ?? false}
              auto={model.release?.auto ?? false}
            />
            <Discs
              layout={layout}
              moves={model.moves}
              landed={model.landed}
              winningCells={model.winningCells}
              onDiscLanded={model.onDiscLanded}
              tray={tray}
              onReleased={model.release?.onDone}
            />
            {model.ghostPlayer !== null && model.hoverCol !== null && (
              <GhostDisc layout={layout} col={model.hoverCol} player={model.ghostPlayer} />
            )}
            {model.marks?.map((mark) => (
              <GhostDisc
                key={`${mark.kind}:${mark.col}`}
                layout={layout}
                col={mark.col}
                player={model.markPlayer ?? "red"}
                dim={mark.kind === "played"}
              />
            ))}
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
      </ThemeContext.Provider>
    </Canvas>
  );
}
