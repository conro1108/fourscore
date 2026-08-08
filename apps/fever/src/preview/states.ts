/**
 * Named scene states for the preview harness. Every phase adds its states
 * here; every visual change ships with a screenshot of the relevant ones,
 * actually looked at. `fever` is carried per state so later phases can pin a
 * state at mid- or full-fever.
 */

import { CONNECT4, CONNECT5, type Player, type Variant } from "@fourscore/engine";
import type { ChromeState } from "./chrome.js";

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
  /** Lay a chrome surface over the scene (see `preview/chrome.tsx`). */
  chrome?: { state: ChromeState; botId?: string; status?: string };
}

/**
 * The roster, and the phase each act is worth looking at — its one pose, the
 * frame it would be photographed in. Picked by eye, not by formula: the truck
 * is its apex freeze, the rocket is the stall, the detonation is the banner
 * pinned against the lens.
 */
const ROSTER: { act: string; phase: number; caption: string }[] = [
  { act: "rocket-fizzle", phase: 0.56, caption: "blunder — the rocket, out of ideas" },
  { act: "sign-hmm", phase: 0.4, caption: "dubious — HMM." },
  { act: "beacon-drop", phase: 0.5, caption: "threat — the hazard beacon, strobing" },
  { act: "banner-rising", phase: 0.5, caption: "tension rising — SUNDAY SUNDAY SUNDAY" },
  { act: "banner-collapsing", phase: 0.5, caption: "tension collapsing — NEVERMIND" },
  { act: "banner-draw", phase: 0.5, caption: "draw — A DRAW A DRAW" },
  { act: "sprinkler", phase: 0.32, caption: "idle beat — Moss waters nothing" },
  { act: "win-detonation", phase: 0.42, caption: "WIN — the detonation, banner at the lens" },
];

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
  // The fever ladder again on the bigger board (phase 3). Same three moods,
  // wider frame: the void composes in screen space, so Connect 5 is the test
  // of whether the look is a look or a lucky aspect ratio.
  {
    id: "fever-0-c5",
    caption: "Connect 5, fever 0.0",
    variant: CONNECT5,
    moves: [4, 4, 5, 3, 5, 5, 6, 4, 3, 2, 6, 6, 7, 5, 2],
    fever: 0,
  },
  {
    id: "fever-mid-c5",
    caption: "Connect 5, fever 0.5",
    variant: CONNECT5,
    moves: [4, 4, 5, 3, 5, 5, 6, 4, 3, 2, 6, 6, 7, 5, 2],
    fever: 0.5,
  },
  {
    id: "fever-full-c5",
    caption: "Connect 5, fever 1.0",
    variant: CONNECT5,
    moves: [4, 4, 5, 3, 5, 5, 6, 4, 3, 2, 6, 6, 7, 5, 2],
    fever: 1,
  },
  // THE GAG ROSTER (phase 3). Every act frozen mid-choreography, at the same
  // fever as the thesis frame so the row can be read against it directly: same
  // world, same two budgets, one new object each.
  ...ROSTER.map((gag) => ({
    id: `gag-${gag.act}`,
    caption: gag.caption,
    variant: CONNECT4,
    moves: [3, 3, 4, 2, 4, 4, 5, 3, 2, 1],
    fever: 0.55,
    prop: { name: gag.act, phase: gag.phase },
  })),
  // The detonation on the big board, on top of a real win: the blink and the
  // pyro share a frame here, which is the check the phase-2 ledger asked for.
  {
    id: "gag-win-c5",
    caption: "win detonation over a live win — Connect 5",
    variant: CONNECT5,
    moves: [4, 0, 4, 1, 4, 2, 4, 3, 4],
    fever: 1,
    prop: { name: "win-detonation", phase: 0.42 },
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
  // THE CHROME (phase 6). Every player-facing surface over a real board, at the
  // fever it would actually be seen at. Read the two outcome states side by
  // side: same window, one at rest and one sweating, which is the whole of
  // "the UI starts to sweat" in two frames.
  {
    id: "chrome-menu",
    caption: "the menu — wordmark, marquee, live void behind",
    variant: CONNECT4,
    moves: [],
    chrome: { state: "menu" },
  },
  {
    id: "chrome-roster",
    caption: "opponent select — the Oracle on Connect 5 (late crossover note)",
    variant: CONNECT5,
    moves: [],
    chrome: { state: "roster", botId: "oracle" },
  },
  {
    id: "chrome-hud",
    caption: "in match — HUD only, bot thinking",
    variant: CONNECT4,
    moves: [3, 3, 4, 2, 4, 4, 5, 3, 2, 1],
    fever: 0.55,
    chrome: { state: "hud" },
  },
  {
    id: "chrome-hud-c5",
    caption: "in match — Connect 5, your move, full fever",
    variant: CONNECT5,
    moves: [4, 4, 5, 3, 5, 5, 6, 4, 3, 2, 6, 6, 7, 5, 2],
    fever: 1,
    chrome: { state: "hud", botId: "vane", status: "YOUR MOVE." },
  },
  {
    id: "chrome-settings",
    caption: "settings — the two grooves",
    variant: CONNECT4,
    moves: [3, 3, 4, 2, 4, 4, 5, 3, 2, 1],
    fever: 0.55,
    chrome: { state: "settings" },
  },
  {
    id: "chrome-about",
    caption: "about — the exemplar system dialog, OK and OK",
    variant: CONNECT4,
    moves: [3, 3, 4, 2, 4, 4, 5, 3, 2, 1],
    chrome: { state: "about" },
  },
  {
    id: "chrome-quit",
    caption: "leaving a game in progress",
    variant: CONNECT4,
    moves: [3, 3, 4, 2, 4, 4, 5, 3, 2, 1],
    fever: 0.55,
    chrome: { state: "quit" },
  },
  {
    id: "chrome-error",
    caption: "the dead-worker dialog — joke in the title bar, facts in the body",
    variant: CONNECT4,
    moves: [3, 3, 4, 2, 4, 4, 5, 3, 2, 1],
    fever: 0.55,
    chrome: { state: "error" },
  },
  {
    id: "chrome-win",
    caption: "you win — over the lit winning line",
    variant: CONNECT4,
    moves: [3, 0, 3, 1, 3, 2, 3],
    fever: 1,
    // No status line: with the outcome window up, the real HUD has nothing to
    // say until you dismiss it.
    chrome: { state: "outcome-win", status: "" },
  },
  {
    id: "chrome-loss",
    caption: "you lose — full fever, title bar hot and sweating",
    variant: CONNECT4,
    moves: [3, 0, 3, 1, 3, 2, 3],
    fever: 1,
    chrome: { state: "outcome-loss", status: "" },
  },
];
