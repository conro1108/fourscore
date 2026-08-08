/**
 * Named scene states for the preview harness. Every phase adds its states
 * here; every visual change ships with a screenshot of the relevant ones,
 * actually looked at. `fever` is carried per state so later phases can pin a
 * state at mid- or full-fever.
 */

import { CONNECT4, CONNECT5, type Player, type Variant } from "@fourscore/engine";
import type { PinnedAct } from "../director/scope.js";
import type { ChromeState } from "./chrome.js";

export interface PreviewCase {
  id: string;
  caption: string;
  variant: Variant;
  moves: number[];
  hoverCol?: number;
  ghostPlayer?: Player;
  fever?: number;
  /** Freeze one act, or several at once, at a phase each (see ScenePin). */
  prop?: PinnedAct | PinnedAct[];
  /**
   * Whose void this scene stands in (`bots/identity.ts`). Undefined is nobody,
   * which is the phase-2 thesis frame exactly — so every state written before
   * phase 5 renders what it always did.
   */
  bot?: string;
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
  { act: "mascot-cheer", phase: 0.46, caption: "brilliant — the mascot, mid-hop" },
  { act: "mascot-flop", phase: 0.5, caption: "blunder — the mascot, flat, holding it" },
  { act: "callout-nice", phase: 0.4, caption: "brilliant — the callout, held at the lens" },
  { act: "callout-oof", phase: 0.14, caption: "blunder — the callout, still spinning in" },
  { act: "rocket-fizzle", phase: 0.56, caption: "blunder — the rocket, out of ideas" },
  { act: "sign-hmm", phase: 0.4, caption: "dubious — HMM." },
  { act: "beacon-drop", phase: 0.5, caption: "threat — the hazard beacon, strobing" },
  { act: "banner-rising", phase: 0.5, caption: "tension rising — AS SCHEDULED" },
  { act: "banner-collapsing", phase: 0.5, caption: "tension collapsing — NEVERMIND" },
  { act: "banner-draw", phase: 0.5, caption: "draw — A DRAW A DRAW" },
  { act: "sprinkler", phase: 0.32, caption: "idle beat — Moss waters nothing" },
  { act: "win-detonation", phase: 0.42, caption: "WIN — the detonation, banner at the lens" },
];

/**
 * The eight opponents, in ladder order, each with the frame their signature
 * clip should be photographed in. Same picking rule as the gag roster above:
 * by eye, at the pose that says what the act is — the slab sitting rather than
 * falling, the cups all lifted rather than mid-swap, the pins in the air with
 * the survivor still up.
 */
const BOTS: { id: string; name: string; act: string; phase: number }[] = [
  { id: "acorn", name: "Acorn", act: "bumpers-up", phase: 0.5 },
  { id: "pebble", name: "Pebble", act: "slab-drop", phase: 0.5 },
  { id: "moss", name: "Moss", act: "sprinkler", phase: 0.32 },
  { id: "bramble", name: "Bramble", act: "pin-scatter", phase: 0.42 },
  { id: "cinder", name: "Cinder", act: "shell-game", phase: 0.76 },
  { id: "vane", name: "Vane", act: "score-lie", phase: 0.6 },
  { id: "quill", name: "Quill", act: "lane-solve", phase: 0.55 },
  { id: "oracle", name: "The Oracle", act: "pinsetter", phase: 0.5 },
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
  // THE ROSTER AS CHARACTERS (phase 5). One state per opponent: their void
  // variation and their signature clip, on one board at one fever, in ladder
  // order. This row is the phase's accept criterion and it only works read
  // left to right — a stranger should be able to tell the rungs apart with
  // everything else about the game hidden, and the thing that makes that true
  // is the *difference between neighbours*, which no single frame can show.
  ...BOTS.map((b) => ({
    id: `bot-${b.id}`,
    caption: `${b.name} — ${b.act}`,
    variant: CONNECT4,
    moves: [3, 3, 4, 2, 4, 4, 5, 3, 2, 1],
    fever: 0.55,
    bot: b.id,
    prop: { name: b.act, phase: b.phase },
  })),
  // The same opponent's void at rest and at full fever. The variations bend
  // the weather and never the heat, so escalation has to read identically on
  // every stage in the game — this is the pair that proves it on the one whose
  // idle is furthest from the thesis frame.
  {
    id: "bot-oracle-cold",
    caption: "the Oracle's void at fever 0 — still, and the calmest in the game",
    variant: CONNECT4,
    moves: [3, 3, 4, 2, 4, 4, 5, 3, 2, 1],
    fever: 0,
    bot: "oracle",
  },
  {
    id: "bot-oracle-hot",
    caption: "the Oracle's void at fever 1 — same weather, all the heat",
    variant: CONNECT4,
    moves: [3, 3, 4, 2, 4, 4, 5, 3, 2, 1],
    fever: 1,
    bot: "oracle",
  },
  {
    id: "chrome-menu",
    caption: "the menu — wordmark, marquee, live void behind",
    variant: CONNECT4,
    moves: [],
    chrome: { state: "menu" },
  },
  // THE ATTRACT LOOP. The menu is a lane screen with nothing to react to, and
  // per VISION.md it is never blank: two acts at once, in different berths, so
  // they hang around the window rather than behind it. This is the state that
  // judges the whole idea — one prop at a time and one screenshot each cannot
  // show whether the composition works.
  {
    id: "attract-menu",
    caption: "the attract loop — mascot and callout around the window",
    variant: CONNECT4,
    moves: [],
    fever: 0.35,
    prop: [
      { name: "mascot-cheer", phase: 0.46 },
      { name: "callout-still-here", phase: 0.4 },
    ],
    chrome: { state: "menu" },
  },
  {
    id: "attract-menu-2",
    caption: "the attract loop again — a different pair, same window",
    variant: CONNECT4,
    moves: [],
    fever: 0.35,
    prop: [
      { name: "sprinkler", phase: 0.35 },
      { name: "rocket-fizzle", phase: 0.56 },
    ],
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
