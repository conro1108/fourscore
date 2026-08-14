/**
 * The Connect 4 release slider, as an object: a flat ladder of rungs lying
 * under the bottom row of discs, with a tab sticking past the right edge of the
 * frame. The rungs are the floor. Pull the tab half a column and the slots
 * between the rungs come up under the columns instead, the whole board loses
 * its floor at once, and the discs go through — the toy's one trick, which is
 * a shift of alignment and not a drawer coming out.
 *
 * You can see it work: `BoardRig` cuts a window through the front plate along
 * the bar's channel (`barWindow`), so the rungs and the slots between them are
 * in plain sight under the grid, and what moves when you pull is visibly the
 * thing the discs are standing on.
 *
 * Interaction rules:
 * - The handle only answers when armed (`ready`) — a finished, settled game.
 *   The rest of the time it's board furniture, part of the toy's silhouette.
 * - The travel is short (half a cell), so the gesture is a shove, not a haul.
 *   Past the detent (`COMMIT_PULL`) it finishes itself and can't be pushed
 *   back; short of it, let go and it snaps shut. No tween — stepped timing is
 *   the law and a spring here would read as UI.
 * - `auto` is the software pulling its own handle: the outcome window's
 *   AGAIN. routes here so the button and the hand are one gesture.
 *
 * The drag is measured in pixels and converted through the camera's actual
 * world-per-pixel at the board, so the bar tracks the finger at any zoom and
 * board size instead of at one lucky framing.
 */

import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { playSpike } from "../audio/index.js";
import { materialFrom, sandwichDepth } from "./BoardRig.js";
import { stageFx } from "./fx.js";
import { CAMERA_TARGET, type StageLayout } from "./layout.js";
import {
  AUTO_PULL_RATE,
  BAR_H,
  BAR_TRAVEL,
  commitPull,
  floorY,
  releasePull,
  rungWidth,
  type Slider,
} from "./release.js";
import { useTheme } from "./theme.js";

const target = new THREE.Vector3(...CAMERA_TARGET);
const handleWorld = new THREE.Vector3();

/**
 * The hand's mechanical advantage — one, deliberately. The whole travel is
 * half a cell, which is about forty pixels at the resting framing, so there is
 * nothing to gear up: the tab goes exactly where the finger goes and the throw
 * is short for the same reason the real one is.
 */
const DRAG_GAIN = 1;

/** How much of the slot's depth the spine takes, behind the discs' plane. */
const SPINE_D = 0.07;

/** And how tall it is: a rail along the bar's bottom edge, not a back wall. */
const SPINE_H = 0.12;

export function ReleaseSlider({
  layout,
  slider,
  moves,
  ready,
  auto,
  hold,
}: {
  layout: StageLayout;
  slider: Slider;
  moves: readonly number[];
  ready: boolean;
  auto: boolean;
  /** Harness only: pin the pull, so a still frame can show the bar mid-shift. */
  hold?: number;
}) {
  const theme = useTheme();
  const group = useRef<THREE.Group>(null);
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);
  const grip = useRef<{ startX: number; startPull: number } | null>(null);
  /** The discs have already gone this pull; the clatter only happens once. */
  const poured = useRef(false);

  const { frameW, boardW, variant } = layout;
  const commitAt = useMemo(() => commitPull(moves), [moves]);
  const freeAt = useMemo(() => releasePull(layout), [layout]);

  // Visible to scripted runs (tools/, via __fever.stageFx) — see fx.ts.
  useEffect(() => {
    stageFx.slider = slider;
    return () => {
      if (stageFx.slider === slider) {
        stageFx.slider = null;
        stageFx.handleAt = null;
      }
    };
  }, [slider]);

  // The rungs are the bright chrome the eyelets are, not the duller rail: they
  // are what the player has to be able to find, and a flat mirror face at this
  // angle reflects the dim half of the sky. The spine behind them stays rail —
  // it's structure, and two bright bars would read as one solid floor.
  const rungMat = useMemo(() => materialFrom(theme.board.eyelet), [theme]);
  const barMat = useMemo(() => materialFrom(theme.board.rail), [theme]);
  // The handle gets its own material so the armed blink can drive emissive
  // without lighting up the rungs it matches.
  const handleMat = useMemo(() => {
    const m = materialFrom(theme.board.eyelet);
    m.emissive = new THREE.Color(theme.board.eyelet.color);
    m.emissiveIntensity = 0;
    return m;
  }, [theme]);
  useEffect(
    () => () => {
      rungMat.dispose();
      barMat.dispose();
      handleMat.dispose();
    },
    [rungMat, barMat, handleMat],
  );

  // The ladder, in three parts and one lattice. The rungs sit on the column
  // centres; the slots between them are what a disc falls through; the end
  // caps carry the pattern out to the frame, far enough that a full pull never
  // opens a gap at the left end of the channel. A spine runs the length of the
  // bar along its bottom edge, set back where the discs clear it — without it
  // this is a comb of loose teeth rather than one part with holes in it.
  const bar = useMemo(() => {
    const rungW = rungWidth(layout);
    const depth = layout.slotHalf * 2 + layout.plateDepth;
    // Frame edge to the outer edge of the outermost slot. The border is wider
    // than half a slot on every shipped board, so this stays material.
    const capW = layout.border - (1 - rungW) / 2;
    const y = floorY(layout) - BAR_H / 2;
    return {
      // Flush with the front plate's face, closed off at the back of the slot.
      z: layout.plateDepth / 2,
      y,
      spineY: y - (BAR_H - SPINE_H) / 2,
      capX: boardW / 2 + (1 - rungW) / 2 + capW / 2,
      rung: new THREE.BoxGeometry(rungW, BAR_H, depth),
      cap: new THREE.BoxGeometry(capW, BAR_H, depth),
      spine: new THREE.BoxGeometry(frameW, SPINE_H, SPINE_D),
    };
  }, [layout, boardW, frameW]);
  useEffect(
    () => () => {
      bar.rung.dispose();
      bar.cap.dispose();
      bar.spine.dispose();
    },
    [bar],
  );

  // The drag lives on window listeners for the same reason the orbit's does:
  // it continues off the canvas and ends wherever it ends.
  useEffect(() => {
    const move = (e: PointerEvent) => {
      if (!slider.grabbed || !grip.current) return;
      // World units per screen pixel at the board's depth, from the camera the
      // player is actually looking through.
      const dist = camera.position.distanceTo(target);
      const perPx =
        (2 * dist * Math.tan(((camera as THREE.PerspectiveCamera).fov * Math.PI) / 360)) /
        size.height;
      const world = (e.clientX - grip.current.startX) * perPx * DRAG_GAIN;
      const pull = Math.max(0, Math.min(1, grip.current.startPull + world / BAR_TRAVEL));
      // Past the detent the bar doesn't come back, even with a hand on it.
      slider.pull = slider.committed ? Math.max(slider.pull, pull) : pull;
    };
    const end = () => {
      if (!slider.grabbed) return;
      slider.grabbed = false;
      grip.current = null;
      // Short of the detent, nothing happened: the bar snaps shut.
      if (!slider.committed) slider.pull = 0;
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
    };
  }, [slider, camera, size]);

  useFrame(({ clock }, dt) => {
    // A pinned pull is the harness holding the bar still for the camera. It
    // owns the whole mechanism for as long as it's set — no drag, no detent,
    // no self-finishing — because a frozen frame that keeps sliding is a
    // screenshot of something else.
    if (hold !== undefined) {
      slider.pull = hold;
    } else {
      // Disarmed (a new game landed, or the board was never finished): the bar
      // locks instantly and forgets. This is also what resets after a release —
      // `newGame` clears the moves, the model stops being `ready`, and the next
      // frame the floor is back under an empty board.
      if (!ready && !slider.grabbed) {
        slider.pull = 0;
        slider.committed = false;
        poured.current = false;
      }

      // The software or a committed hand-off finishes the shove.
      if (ready && (auto || slider.committed) && !slider.grabbed && slider.pull < 1) {
        slider.pull = Math.min(1, slider.pull + dt * AUTO_PULL_RATE);
      }

      // The detent: a small hard click, the bar going past the point where the
      // hand still decides anything.
      if (ready && !slider.committed && slider.pull >= commitAt) {
        slider.committed = true;
        playSpike("disc-land", 0.4);
      }

      // Alignment. Everything on the board is falling as of this frame, so
      // this is the clatter — one sound for a whole board of discs.
      if (ready && !poured.current && slider.pull >= freeAt) {
        poured.current = true;
        playSpike("disc-drop", 0.7);
        playSpike("spike-pins", 0.55);
      }
    }

    if (group.current) {
      group.current.position.x = slider.pull * BAR_TRAVEL;
      // Where a scripted hand should reach for (fx.ts). The handle is a child
      // of a group that the board's levitation moves, so this has to come off
      // the object's world matrix rather than off the layout.
      handleWorld.setFromMatrixPosition(group.current.matrixWorld);
      handleWorld.x += frameW / 2 + 0.4;
      handleWorld.y += bar.y;
      handleWorld.project(camera);
      stageFx.handleAt = {
        x: ((handleWorld.x + 1) / 2) * size.width,
        y: ((1 - handleWorld.y) / 2) * size.height,
      };
    }

    // Armed and untouched, the handle blinks — the same deadpan square wave
    // the winning line uses, slower. It is the only thing on the board asking
    // to be touched, which is what "the main way to start over" means here.
    handleMat.emissiveIntensity =
      ready && !slider.committed ? (clock.elapsedTime % 1.1 < 0.55 ? 0.85 : 0.12) : 0;
  });

  return (
    <group ref={group}>
      {/* One rung per column, on the column's centre line. */}
      {Array.from({ length: variant.width }, (_, col) => (
        <mesh
          key={col}
          geometry={bar.rung}
          material={rungMat}
          position={[layout.xOf(col), bar.y, bar.z]}
        />
      ))}
      {[-1, 1].map((side) => (
        <mesh
          key={side}
          geometry={bar.cap}
          material={rungMat}
          position={[side * bar.capX, bar.y, bar.z]}
        />
      ))}
      <mesh
        geometry={bar.spine}
        material={barMat}
        position={[0, bar.spineY, -layout.slotHalf + SPINE_D / 2]}
      />
      {/* The tab, proud of the right frame edge like the toy's, with a grip lip
          on its end so it reads as pullable. One handler for both. */}
      <group
        onPointerDown={(e) => {
          if (!ready) return;
          e.stopPropagation();
          slider.grabbed = true;
          grip.current = { startX: e.clientX, startPull: slider.pull };
        }}
        onClick={(e) => ready && e.stopPropagation()}
      >
        <mesh material={handleMat} position={[frameW / 2 + 0.4, bar.y, 0]}>
          <boxGeometry args={[0.8, BAR_H + 0.14, sandwichDepth(layout) + 0.24]} />
        </mesh>
        <mesh material={handleMat} position={[frameW / 2 + 0.78, bar.y, 0]}>
          <boxGeometry args={[0.14, BAR_H + 0.34, sandwichDepth(layout) + 0.34]} />
        </mesh>
      </group>
    </group>
  );
}
