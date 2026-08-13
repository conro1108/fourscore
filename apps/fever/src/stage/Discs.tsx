/**
 * The discs, driven by the committed move list and nothing else. A settled
 * disc is `placements[i]` for i < landed; the disc at index `landed` (if any)
 * is mid-drop, and reports in when it stops. Clicks never reach this file —
 * that's what makes a wire move indistinguishable from a local one.
 *
 * The one exception to "settled" is the release tray: when its pull clears a
 * disc's column, the disc stops being furniture and falls out the bottom
 * (same heavy gravity as the drop, plus a lazy spin). When the last one is
 * gone `onReleased` fires — that's the moment the empty board belongs to the
 * next game.
 */

import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { Player } from "@fourscore/engine";
import { playSpike } from "../audio/index.js";
import { placements, type DiscPlacement } from "../match/store.js";
import { planDrop, squashAt } from "../match/timing.js";
import { coinGeometry } from "./coin.js";
import { stageFx } from "./fx.js";
import type { StageLayout } from "./layout.js";
import { EXIT_DEPTH, EXIT_GRAVITY, pullToFree, type Tray } from "./release.js";
import { useTheme, type Theme } from "./theme.js";

/**
 * Player colors come from the theme. In the fever theme the engine's "red" is
 * a lacquered garnet-magenta and "yellow" is tarnished gold — both from the
 * iridescence family, leaving arterial red / hazard orange unclaimed so the
 * fever's heat accent stays legible (palette law in VISION.md). Other themes
 * make other trades; the heat family stays off-limits in all of them.
 */
const styleOf = (theme: Theme, player: Player) =>
  player === "red" ? theme.discs.red : theme.discs.yellow;

interface WinKeys {
  has(colRow: string): boolean;
  any: boolean;
}

const keyOf = (col: number, row: number): string => `${col}:${row}`;

function SettledDisc({
  layout,
  geometry,
  disc,
  win,
  tray,
  onExit,
}: {
  layout: StageLayout;
  geometry: THREE.BufferGeometry;
  disc: DiscPlacement;
  win: WinKeys;
  tray: Tray;
  onExit: (ply: number) => void;
}) {
  const mesh = useRef<THREE.Mesh>(null);
  const material = useRef<THREE.MeshPhysicalMaterial>(null);
  /** performance.now() when the tray let this disc go; null while seated. */
  const fellAt = useRef<number | null>(null);
  const exited = useRef(false);
  const theme = useTheme();
  const style = styleOf(theme, disc.player);
  const winning = win.has(keyOf(disc.col, disc.row));
  const dimmed = win.any && !winning;

  const homeY = layout.yOf(disc.row);
  const freeAt = pullToFree(layout, disc.col);

  useFrame(({ clock }) => {
    if (!mesh.current || !material.current) return;

    // The tray's opening reached this column: let go. Every disc in the
    // column starts together and they fall as a stack, which is exactly what
    // the real toy does.
    if (fellAt.current === null && tray.committed && tray.pull >= freeAt) {
      fellAt.current = performance.now();
    }

    if (fellAt.current !== null) {
      const t = (performance.now() - fellAt.current) / 1000;
      mesh.current.position.y = homeY - 0.5 * EXIT_GRAVITY * t * t;
      // A lazy tumble on the way down — direction by column parity, because
      // randomness never gets to pick how a thing looks.
      mesh.current.rotation.z = (disc.col % 2 === 0 ? 1 : -1) * t * 2.4;
      if (!exited.current && mesh.current.position.y < -(layout.frameH / 2 + EXIT_DEPTH)) {
        exited.current = true;
        onExit(disc.ply);
      }
      return;
    }
    mesh.current.position.y = homeY;
    mesh.current.rotation.z = 0;

    // The winning line blinks as a hard square wave — bright, dark, bright —
    // not a breathing pulse. Deadpan alarm, per the timing rule. It glows in
    // its own body color so the bloom pass picks it up.
    if (winning) {
      material.current.emissiveIntensity = clock.elapsedTime % 0.7 < 0.35 ? 2.6 : 0.5;
    }
  });

  const finish = theme.discs.finish;
  return (
    <mesh
      ref={mesh}
      geometry={geometry}
      position={[layout.xOf(disc.col), homeY, 0]}
      rotation-x={Math.PI / 2}
    >
      <meshPhysicalMaterial
        ref={material}
        color={dimmed ? theme.discs.dimmed : style.color}
        emissive={winning ? style.color : style.emissive}
        emissiveIntensity={winning ? 2.6 : theme.discs.emissiveIntensity}
        roughness={finish.roughness}
        metalness={finish.metalness}
        iridescence={dimmed ? 0 : finish.iridescence}
        iridescenceIOR={finish.iridescenceIOR}
        envMapIntensity={dimmed ? 0.2 : finish.envMapIntensity}
      />
    </mesh>
  );
}

function FallingDisc({
  layout,
  geometry,
  disc,
  onLanded,
}: {
  layout: StageLayout;
  geometry: THREE.BufferGeometry;
  disc: DiscPlacement;
  onLanded: () => void;
}) {
  const group = useRef<THREE.Group>(null);
  const startedAt = useRef<number | null>(null);
  const impacted = useRef(false);
  const done = useRef(false);
  const theme = useTheme();
  const style = styleOf(theme, disc.player);

  const plan = useMemo(
    () => planDrop(layout.dropY, layout.yOf(disc.row)),
    [layout, disc.row],
  );

  useFrame(() => {
    if (!group.current || done.current) return;
    const now = performance.now();
    if (startedAt.current === null) {
      startedAt.current = now;
      // Both disc sounds fire off the drop animation, which runs off the move
      // list — so a move arriving over the wire in phase 8 will sound exactly
      // like one you made, for the same reason it looks like one.
      playSpike("disc-drop", 0.55);
    }
    const t = now - startedAt.current;

    group.current.position.y = plan.yAt(t);
    const squash = squashAt(t, plan.impactMs);
    group.current.scale.set(squash.x, squash.y, 1);

    if (t >= plan.impactMs && !impacted.current) {
      impacted.current = true;
      stageFx.lastLandAt = now;
      playSpike("disc-land", 0.85);
    }
    if (t >= plan.durationMs) {
      done.current = true;
      onLanded();
    }
  });

  const finish = theme.discs.finish;
  return (
    <group ref={group} position={[layout.xOf(disc.col), layout.dropY, 0]}>
      <mesh geometry={geometry} rotation-x={Math.PI / 2}>
        <meshPhysicalMaterial
          color={style.color}
          emissive={style.emissive}
          emissiveIntensity={theme.discs.emissiveIntensity}
          roughness={finish.roughness}
          metalness={finish.metalness}
          iridescence={finish.iridescence}
          iridescenceIOR={finish.iridescenceIOR}
        />
      </mesh>
    </group>
  );
}

export function Discs({
  layout,
  moves,
  landed,
  winningCells,
  onDiscLanded,
  tray,
  onReleased,
}: {
  layout: StageLayout;
  moves: readonly number[];
  landed: number;
  winningCells: readonly { row: number; col: number }[];
  onDiscLanded?: () => void;
  tray: Tray;
  onReleased?: () => void;
}) {
  const all = useMemo(() => placements(moves, layout.variant), [moves, layout.variant]);

  // Which plies have fallen out the bottom of the open tray. Rebuilt when the
  // move list changes, because a new game's ply 3 is not the old game's.
  const exited = useRef(new Set<number>());
  const reported = useRef(false);
  useEffect(() => {
    exited.current = new Set();
    reported.current = false;
  }, [moves]);
  const onExit = (ply: number) => {
    exited.current.add(ply);
    if (!reported.current && exited.current.size >= all.length && all.length > 0) {
      reported.current = true;
      onReleased?.();
    }
  };

  // One coin, forty-two meshes. Built here rather than per disc: the reeded
  // lathe is ~1.7k triangles, which is nothing once but real money times a
  // full board.
  const geometry = useMemo(
    () => coinGeometry(layout.discRadius, layout.discThickness),
    [layout.discRadius, layout.discThickness],
  );
  useEffect(() => () => geometry.dispose(), [geometry]);

  // Match reports winning cells with row 0 at the top; the stage counts rows
  // from the floor. The win only lights once the last disc has landed — the
  // fact is already true, but the theater hasn't caught up yet.
  const win: WinKeys = useMemo(() => {
    const settled = landed === moves.length && winningCells.length > 0;
    const keys = new Set(
      winningCells.map((c) => keyOf(c.col, layout.variant.height - 1 - c.row)),
    );
    return { has: (k: string) => settled && keys.has(k), any: settled };
  }, [winningCells, landed, moves.length, layout.variant.height]);

  const falling = landed < moves.length ? all[landed] : undefined;

  return (
    <group>
      {all.slice(0, landed).map((disc) => (
        <SettledDisc
          key={disc.ply}
          layout={layout}
          geometry={geometry}
          disc={disc}
          win={win}
          tray={tray}
          onExit={onExit}
        />
      ))}
      {falling && (
        <FallingDisc
          key={falling.ply}
          layout={layout}
          geometry={geometry}
          disc={falling}
          onLanded={onDiscLanded ?? (() => {})}
        />
      )}
    </group>
  );
}
