/**
 * The stage: canvas, camera, lights, void, board, discs, input. Pure view —
 * it renders a `StageModel` and reports gestures upward, which is what lets
 * the preview harness mount any scene state with no store and no bot.
 *
 * The camera is fit from the variant every frame (geometry is a value), sways
 * slowly because a perfectly still camera reads as a screenshot, and dips hard
 * for one beat when a disc lands — the whole stage flinches.
 */

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { EffectComposer, Bloom } from "@react-three/postprocessing";
import { useMemo } from "react";
import * as THREE from "three";
import type { Player, Variant } from "@fourscore/engine";
import { useDebugStore } from "../debug/store.js";
import { FeverProvider } from "../director/scope.js";
import { BoardRig } from "./BoardRig.js";
import { ColumnInput, GhostDisc } from "./ColumnInput.js";
import { Discs } from "./Discs.js";
import { stageFx } from "./fx.js";
import { fitDistance, layoutFor, type StageLayout } from "./layout.js";
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
   * Pin this scene's fever. Harness-only: the app leaves it undefined so the
   * scene follows the Director. It's here, at the top of the scene, rather than
   * threaded through every subsystem — see `director/scope.tsx`.
   */
  fever?: number;
}

const FOV = 38;

function CameraRig({ layout }: { layout: StageLayout }) {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const aspect = useThree((s) => s.viewport.aspect);

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    const dist = fitDistance(layout, FOV, aspect);
    // Slow drift, so the frame is alive even when nothing happens.
    const x = Math.sin(t * 0.11) * 0.22;
    let y = 0.4 + Math.sin(t * 0.07) * 0.16;
    // The land flinch: a hard dip, held one beat, released. No easing.
    if (performance.now() - stageFx.lastLandAt < 70) y -= 0.09;
    camera.fov = FOV;
    camera.position.set(x, y, dist);
    camera.lookAt(0, 0.1, 0);
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

  return (
    <Canvas
      dpr={[1, 2]}
      gl={{ antialias: true, powerPreference: "high-performance" }}
      camera={{ fov: FOV, near: 0.1, far: 80, position: [0, 0.4, 14] }}
    >
      <FeverProvider fever={model.fever}>
        <CameraRig layout={layout} />
        <Lights />
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
        {interactive && (
          <ColumnInput
            layout={layout}
            onColumn={model.onColumn!}
            onHover={model.onHover ?? (() => {})}
          />
        )}
      </FeverProvider>
      {postEnabled && (
        // Placeholder post stack: phase 2's Fable step owns the real one. It
        // exists now so the pipeline (and its perf cost) is real from day one.
        <EffectComposer multisampling={0}>
          <Bloom mipmapBlur intensity={0.6} luminanceThreshold={0.6} luminanceSmoothing={0.15} />
        </EffectComposer>
      )}
    </Canvas>
  );
}
