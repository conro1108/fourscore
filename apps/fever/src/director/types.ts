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
 *
 * ## What a gag is allowed to claim
 *
 * The live feed the Director runs on is this engine's *estimate*, not the
 * solver's proof — one cheap search per ply, because the exact answer costs
 * seconds and fever has to keep moving. So of everything below, only `win` and
 * `draw` are facts about the game; they come from the board being finished, not
 * from a search.
 *
 * That maps straight onto the review's copy rule (repo `CLAUDE.md`, "Say what
 * the solver actually knows"): a gag hanging off `win` may be flatly
 * declarative — that's the detonation. A gag hanging off `move.quality`,
 * `threat` or `tension-shift` may be as loud as it likes but must not assert a
 * result: "THAT LOOKS BAD" is in bounds, "THAT LOST THE GAME" is not, however
 * much funnier it is. The player is never shown which kind of claim it was.
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
  /** This player can complete a run on their next turn unless it's answered. */
  | { kind: "threat"; player: Player }
  | { kind: "tension-shift"; direction: "rising" | "collapsing" }
  /** `line` holds the winning cells as `row * width + col`, top row first. */
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
