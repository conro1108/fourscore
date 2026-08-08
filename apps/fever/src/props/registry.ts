/**
 * The prop-act registry — the founding structure of the prop system.
 *
 * An act is a named, fixed-length choreography: a component that takes the
 * stage layout and a phase getter (0..1 through the act) and draws itself.
 * Acts are pure theater — they read the phase and the layout and touch no
 * game state, which is what lets the harness freeze one mid-act for a
 * screenshot and lets phase 3 add gags without touching the stage.
 *
 * The taste law binds every entry: <= 300 audited triangles, <= 64px nearest
 * textures, flat shading, all motion through `stepped`, and a choreographed
 * entrance AND exit — an act ends off-stage, never by vanishing.
 */

import type { StageLayout } from "../stage/layout.js";
import { Truck, TRUCK_LAP_MS } from "./Truck.js";

export interface PropAct {
  name: string;
  durationMs: number;
  Component: React.ComponentType<{ layout: StageLayout; phase: () => number }>;
}

export const PROP_ACTS: Record<string, PropAct> = {
  "truck-lap": { name: "truck-lap", durationMs: TRUCK_LAP_MS, Component: Truck },
};
