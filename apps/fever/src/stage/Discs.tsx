/**
 * The discs, driven by the committed move list and nothing else. A settled
 * disc is `placements[i]` for i < landed; the disc at index `landed` (if any)
 * is mid-drop, and reports in when it stops. Clicks never reach this file —
 * that's what makes a wire move indistinguishable from a local one.
 */

import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { Player } from "@fourscore/engine";
import { placements, type DiscPlacement } from "../match/store.js";
import { planDrop, squashAt } from "../match/timing.js";
import { coinGeometry } from "./coin.js";
import { stageFx } from "./fx.js";
import type { StageLayout } from "./layout.js";

/**
 * Player colors, restyled for the void. The engine's "red" is a lacquered
 * garnet-magenta and "yellow" is tarnished gold — both from the iridescence
 * family, leaving arterial red / hazard orange unclaimed so the fever's heat
 * accent stays legible when phase 2 brings it (palette law in VISION.md).
 */
const DISC_STYLE: Record<Player, { color: string; emissive: string }> = {
  red: { color: "#a3164e", emissive: "#5c0b2a" },
  yellow: { color: "#c8991f", emissive: "#6e510d" },
};

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
}: {
  layout: StageLayout;
  geometry: THREE.BufferGeometry;
  disc: DiscPlacement;
  win: WinKeys;
}) {
  const material = useRef<THREE.MeshPhysicalMaterial>(null);
  const style = DISC_STYLE[disc.player];
  const winning = win.has(keyOf(disc.col, disc.row));
  const dimmed = win.any && !winning;

  // The winning line blinks as a hard square wave — bright, dark, bright —
  // not a breathing pulse. Deadpan alarm, per the timing rule. It glows in
  // its own body color so the bloom pass picks it up.
  useFrame(({ clock }) => {
    if (!material.current) return;
    if (winning) {
      material.current.emissiveIntensity = clock.elapsedTime % 0.7 < 0.35 ? 2.6 : 0.5;
    }
  });

  return (
    <mesh
      geometry={geometry}
      position={[layout.xOf(disc.col), layout.yOf(disc.row), 0]}
      rotation-x={Math.PI / 2}
    >
      <meshPhysicalMaterial
        ref={material}
        color={dimmed ? "#3a2f42" : style.color}
        emissive={winning ? style.color : style.emissive}
        emissiveIntensity={winning ? 2.6 : 0.25}
        roughness={0.18}
        metalness={0.4}
        iridescence={dimmed ? 0 : 0.7}
        iridescenceIOR={1.4}
        envMapIntensity={dimmed ? 0.2 : 1.0}
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
  const style = DISC_STYLE[disc.player];

  const plan = useMemo(
    () => planDrop(layout.dropY, layout.yOf(disc.row)),
    [layout, disc.row],
  );

  useFrame(() => {
    if (!group.current || done.current) return;
    const now = performance.now();
    if (startedAt.current === null) startedAt.current = now;
    const t = now - startedAt.current;

    group.current.position.y = plan.yAt(t);
    const squash = squashAt(t, plan.impactMs);
    group.current.scale.set(squash.x, squash.y, 1);

    if (t >= plan.impactMs && !impacted.current) {
      impacted.current = true;
      stageFx.lastLandAt = now;
    }
    if (t >= plan.durationMs) {
      done.current = true;
      onLanded();
    }
  });

  return (
    <group ref={group} position={[layout.xOf(disc.col), layout.dropY, 0]}>
      <mesh geometry={geometry} rotation-x={Math.PI / 2}>
        <meshPhysicalMaterial
          color={style.color}
          emissive={style.emissive}
          emissiveIntensity={0.25}
          roughness={0.18}
          metalness={0.4}
          iridescence={0.7}
          iridescenceIOR={1.4}
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
}: {
  layout: StageLayout;
  moves: readonly number[];
  landed: number;
  winningCells: readonly { row: number; col: number }[];
  onDiscLanded?: () => void;
}) {
  const all = useMemo(() => placements(moves, layout.variant), [moves, layout.variant]);

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
        <SettledDisc key={disc.ply} layout={layout} geometry={geometry} disc={disc} win={win} />
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
