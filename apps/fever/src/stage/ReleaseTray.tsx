/**
 * The Connect 4 slider: the board's floor is a tray that pulls out to the
 * right, with a handle sticking past the frame edge the way the real toy's
 * does. After a finished game this is the main way out — pull it, the floor
 * opens from the left, and the discs pour through the bottom; when the last
 * one is gone the next game starts (`Stage.tsx` model wiring).
 *
 * Interaction rules:
 * - The handle only answers when armed (`ready`) — a finished, settled game.
 *   The rest of the time it's board furniture, part of the toy's silhouette.
 * - Passing the first occupied column commits (a disc is out; see release.ts):
 *   let go and the tray finishes opening on its own. Let go *before* that and
 *   it snaps shut — instantly, per the hard-edged timing law.
 * - `auto` is the software pulling its own handle: the outcome window's
 *   AGAIN. routes here so the button and the hand are one gesture.
 *
 * The drag is measured in pixels and converted through the camera's actual
 * world-per-pixel at the board, so the tray tracks the finger at any zoom and
 * board size instead of at one lucky framing.
 */

import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { playSpike } from "../audio/index.js";
import { materialFrom, RAIL_T, sandwichDepth } from "./BoardRig.js";
import { stageFx } from "./fx.js";
import { CAMERA_TARGET, type StageLayout } from "./layout.js";
import { AUTO_PULL_RATE, commitPull, type Tray } from "./release.js";
import { useTheme } from "./theme.js";

const target = new THREE.Vector3(...CAMERA_TARGET);

/**
 * The hand's mechanical advantage. 1:1 with the world means a full pull is
 * most of the board's width in screen pixels — a reach no phone has. The toy
 * loses a little honesty and the gesture keeps its whole arc on a thumb.
 */
const DRAG_GAIN = 1.6;

export function ReleaseTray({
  layout,
  tray,
  moves,
  ready,
  auto,
}: {
  layout: StageLayout;
  tray: Tray;
  moves: readonly number[];
  ready: boolean;
  auto: boolean;
}) {
  const theme = useTheme();
  const group = useRef<THREE.Group>(null);
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);
  const grip = useRef<{ startX: number; startPull: number } | null>(null);

  const { frameW, frameH } = layout;
  const gap = sandwichDepth(layout);
  const commitAt = useMemo(() => commitPull(layout, moves), [layout, moves]);

  // Visible to scripted runs (tools/, via __fever.stageFx) — see fx.ts.
  useEffect(() => {
    stageFx.tray = tray;
    return () => {
      if (stageFx.tray === tray) stageFx.tray = null;
    };
  }, [tray]);

  const trayMat = useMemo(() => materialFrom(theme.board.rail), [theme]);
  // The handle gets its own material so the armed blink can drive emissive
  // without lighting up the rails it matches.
  const handleMat = useMemo(() => {
    const m = materialFrom(theme.board.eyelet);
    m.emissive = new THREE.Color(theme.board.eyelet.color);
    m.emissiveIntensity = 0;
    return m;
  }, [theme]);
  useEffect(
    () => () => {
      trayMat.dispose();
      handleMat.dispose();
    },
    [trayMat, handleMat],
  );

  // The drag lives on window listeners for the same reason the orbit's does:
  // it continues off the canvas and ends wherever it ends.
  useEffect(() => {
    const move = (e: PointerEvent) => {
      if (!tray.grabbed || !grip.current) return;
      // World units per screen pixel at the board's depth, from the camera the
      // player is actually looking through.
      const dist = camera.position.distanceTo(target);
      const perPx =
        (2 * dist * Math.tan(((camera as THREE.PerspectiveCamera).fov * Math.PI) / 360)) /
        size.height;
      const world = (e.clientX - grip.current.startX) * perPx * DRAG_GAIN;
      tray.pull = Math.max(0, Math.min(1, grip.current.startPull + world / frameW));
    };
    const end = () => {
      if (!tray.grabbed) return;
      tray.grabbed = false;
      grip.current = null;
      // Short of the first disc, nothing happened: the tray snaps shut. No
      // tween — stepped timing is the law and a spring here would read as UI.
      if (!tray.committed) tray.pull = 0;
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
    };
  }, [tray, camera, size, frameW]);

  useFrame(({ clock }, dt) => {
    // Disarmed (a new game landed, or the board was never finished): the tray
    // closes instantly and forgets. This is also what resets after a release —
    // `newGame` clears the moves, the model stops being `ready`, and the next
    // frame the floor is back under an empty board.
    if (!ready && !tray.grabbed) {
      tray.pull = 0;
      tray.committed = false;
    }

    // The software or a committed hand-off finishes the pull.
    if (ready && (auto || tray.committed) && !tray.grabbed && tray.pull < 1) {
      tray.pull = Math.min(1, tray.pull + dt * AUTO_PULL_RATE);
    }

    // Crossing the first occupied column is the point of no return; it sounds
    // like what it is — the floor letting go.
    if (ready && !tray.committed && tray.pull >= commitAt) {
      tray.committed = true;
      playSpike("disc-drop", 0.6);
      playSpike("spike-pins", 0.4);
    }

    if (group.current) group.current.position.x = tray.pull * frameW;

    // Armed and untouched, the handle blinks — the same deadpan square wave
    // the winning line uses, slower. It is the only thing on the board asking
    // to be touched, which is what "the main way to start over" means here.
    handleMat.emissiveIntensity =
      ready && !tray.committed ? (clock.elapsedTime % 1.1 < 0.55 ? 0.85 : 0.12) : 0;
  });

  const railY = -(frameH - RAIL_T) / 2;

  return (
    <group ref={group}>
      {/* The floor itself — the bottom rail, now a tray. */}
      <mesh material={trayMat} position={[0, railY, 0]}>
        <boxGeometry args={[frameW, RAIL_T, gap]} />
      </mesh>
      {/* The handle, proud of the right frame edge like the toy's, with a
          grip lip on its end so it reads as pullable. One handler for both. */}
      <group
        onPointerDown={(e) => {
          if (!ready) return;
          e.stopPropagation();
          tray.grabbed = true;
          grip.current = { startX: e.clientX, startPull: tray.pull };
        }}
        onClick={(e) => ready && e.stopPropagation()}
      >
        <mesh material={handleMat} position={[frameW / 2 + 0.4, railY, 0]}>
          <boxGeometry args={[0.8, RAIL_T + 0.14, gap + 0.24]} />
        </mesh>
        <mesh material={handleMat} position={[frameW / 2 + 0.78, railY, 0]}>
          <boxGeometry args={[0.14, RAIL_T + 0.34, gap + 0.34]} />
        </mesh>
      </group>
    </group>
  );
}
