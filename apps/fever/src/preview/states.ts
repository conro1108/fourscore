/**
 * Named scene states for the preview harness. Every phase adds its states
 * here; every visual change ships with a screenshot of the relevant ones,
 * actually looked at. `fever` is carried per state so later phases can pin a
 * state at mid- or full-fever.
 */

import { CONNECT4, CONNECT5, type Player, type Variant } from "@fourscore/engine";

export interface PreviewCase {
  id: string;
  caption: string;
  variant: Variant;
  moves: number[];
  hoverCol?: number;
  ghostPlayer?: Player;
  fever?: number;
  /** Freeze a prop act at a phase of its choreography (see ScenePin). */
  prop?: { name: string; phase: number };
}

export const PREVIEW_STATES: PreviewCase[] = [
  { id: "idle-c4", caption: "idle board — Connect 4", variant: CONNECT4, moves: [] },
  { id: "idle-c5", caption: "idle board — Connect 5", variant: CONNECT5, moves: [] },
  {
    id: "mid-c4",
    caption: "mid-game with hover ghost — Connect 4",
    variant: CONNECT4,
    moves: [3, 3, 4, 2, 4, 4, 5, 3, 2, 1],
    hoverCol: 2,
    ghostPlayer: "red",
  },
  {
    id: "mid-c5",
    caption: "mid-game — Connect 5",
    variant: CONNECT5,
    moves: [4, 4, 5, 3, 5, 5, 6, 4, 3, 2, 6, 6, 7, 5, 2],
  },
  // The fever ladder: one position, three temperatures. Read these three side
  // by side — they have to look like three moods of one world, not three
  // different games (that's phase 2's accept criterion, and this is the row it
  // gets judged on).
  {
    id: "fever-0",
    caption: "same board, fever 0.0 — uncanny idle",
    variant: CONNECT4,
    moves: [3, 3, 4, 2, 4, 4, 5, 3, 2, 1],
    fever: 0,
  },
  {
    id: "fever-mid",
    caption: "same board, fever 0.5",
    variant: CONNECT4,
    moves: [3, 3, 4, 2, 4, 4, 5, 3, 2, 1],
    fever: 0.5,
  },
  {
    id: "fever-full",
    caption: "same board, fever 1.0 — full fever",
    variant: CONNECT4,
    moves: [3, 3, 4, 2, 4, 4, 5, 3, 2, 1],
    fever: 1,
  },
  // THE THESIS FRAME (phase 2). Mid-fever, both budgets in one shot: the
  // expensive void and lacquered board sharing the frame with a 180-triangle
  // monster truck frozen at the apex of its jump, held a beat too long.
  // Phases 3-8 judge their output against this state by name.
  {
    id: "thesis",
    caption: "THE THESIS — mid-fever, truck at apex; both budgets in one frame",
    variant: CONNECT4,
    moves: [3, 3, 4, 2, 4, 4, 5, 3, 2, 1],
    fever: 0.55,
    prop: { name: "truck-lap", phase: 0.48 },
  },
  {
    id: "thesis-entrance",
    caption: "thesis gag — truck mid-wheelie on the way in",
    variant: CONNECT4,
    moves: [3, 3, 4, 2, 4, 4, 5, 3, 2, 1],
    fever: 0.55,
    prop: { name: "truck-lap", phase: 0.22 },
  },
  {
    id: "win-c4",
    caption: "win moment — Connect 4 (red, vertical)",
    variant: CONNECT4,
    moves: [3, 0, 3, 1, 3, 2, 3],
  },
  {
    id: "win-c5",
    caption: "win moment — Connect 5 (red, vertical)",
    variant: CONNECT5,
    moves: [4, 0, 4, 1, 4, 2, 4, 3, 4],
  },
];
