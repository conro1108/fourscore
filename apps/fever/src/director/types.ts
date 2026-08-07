/**
 * The Director's output contract — the one interface every spectacle subsystem
 * consumes. This is the load-bearing idea of the whole redesign: one module
 * turns game truth into spectacle instructions, and scene, post, props, audio
 * and DOM chrome all subscribe to `DirectorFrame` and nothing else. Subsystems
 * never read match state directly and never talk to each other.
 *
 * Phase 0 ships the contract and a debug-driven store; phase 1 ships the real
 * Director behind it. Consumers written against this file should not need to
 * change when that happens.
 */

import type { Player } from "@fourscore/engine";

/** Continuous 0..1. 0 = uncanny idle, 1 = full fever. */
export type Fever = number;

export type SpectacleEvent =
  | {
      kind: "move";
      player: Player;
      col: number;
      quality: "brilliant" | "fine" | "dubious" | "blunder";
    }
  | { kind: "threat"; player: Player }
  | { kind: "tension-shift"; direction: "rising" | "collapsing" }
  | { kind: "win"; player: Player; line: number[] }
  | { kind: "draw" }
  /** Fired occasionally so ambient gags have a hook. */
  | { kind: "idle-beat" };

export interface DirectorFrame {
  /** Smoothed; never jumps discontinuously except on "win". */
  fever: Fever;
  /** This tick's spikes, already debounced. */
  events: SpectacleEvent[];
}

export const EVENT_KINDS = [
  "move",
  "threat",
  "tension-shift",
  "win",
  "draw",
  "idle-beat",
] as const;
