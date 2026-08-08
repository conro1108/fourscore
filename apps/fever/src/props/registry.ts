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
 *
 * `tris` is the audited count from the component's own header comment, carried
 * here so the budget is visible in one list (and printed by the preview
 * harness). It is checked by hand, because the whole point is that somebody
 * counted.
 *
 * Which act fires for which event is *not* here — that's `gags.ts`, because it
 * is a weighted choice rather than a property of the act.
 */

import type { SoundName } from "../audio/library.js";
import type { StageLayout } from "../stage/layout.js";
import { makeBanner, BANNER_MS } from "./Banner.js";
import { Beacon, BEACON_MS } from "./Beacon.js";
import { Bumpers, BUMPERS_MS } from "./Bumpers.js";
import { makeCallout, CALLOUT_MS } from "./Callout.js";
import { Detonation, DETONATION_MS } from "./Detonation.js";
import { LaneSolve, SOLVE_MS } from "./LaneSolve.js";
import { makeMascot, MASCOT_MS } from "./Mascot.js";
import { Pins, PINS_MS } from "./Pins.js";
import { Pinsetter, PINSETTER_MS } from "./Pinsetter.js";
import { Rocket, ROCKET_MS } from "./Rocket.js";
import { Scoreboard, SCORE_MS } from "./Scoreboard.js";
import { Shells, SHELLS_MS } from "./Shells.js";
import { makeSign, SIGN_MS } from "./Sign.js";
import { Slab, SLAB_MS } from "./Slab.js";
import { Sprinkler, SPRINKLER_MS } from "./Sprinkler.js";
import { Truck, TRUCK_LAP_MS } from "./Truck.js";

/**
 * Where on the stage an act happens.
 *
 * Only one act may hold a berth at a time. That's what lets the menu run two
 * at once without them standing in each other — and it is also documentation:
 * five berths is the whole stage, and an act that doesn't fit one of them is
 * an act that has wandered out of frame.
 */
export type Berth = "left" | "right" | "floor" | "sky" | "lens";

export interface PropAct {
  name: string;
  durationMs: number;
  /** Audited triangle count. The law is <= 300. */
  tris: number;
  berth: Berth;
  /**
   * This act says something flatly declarative about the result — `GAME OVER`,
   * `A DRAW`. Only `win` and `draw` are facts (`director/types.ts`), so an act
   * with this set may never be drawn for anything else, and `gags.test.ts`
   * enforces exactly that. Everything else on the stage may be as loud as it
   * likes and may not name an outcome.
   */
  declares?: boolean;
  /**
   * The one-shot fired when the act starts. Every act has one: an act is a
   * fixed-length piece of choreography, so its sound is written against that
   * length and carries the act's whole shape in one buffer — the rocket's
   * sputter and the beat of silence before it lands off-stage are inside
   * `spike-rocket`, not scheduled here. One trigger, one sound.
   */
  spike: SoundName;
  Component: React.ComponentType<{ layout: StageLayout; phase: () => number }>;
}

const act = (
  name: string,
  durationMs: number,
  tris: number,
  berth: Berth,
  Component: PropAct["Component"],
  spike: SoundName,
): PropAct => ({ name, durationMs, tris, berth, Component, spike });

/** Marks the two acts that are allowed to state the result. */
const declaring = (a: PropAct): PropAct => ({ ...a, declares: true });

export const PROP_ACTS: Record<string, PropAct> = {
  "truck-lap": act("truck-lap", TRUCK_LAP_MS, 180, "floor", Truck, "spike-truck"),
  "rocket-fizzle": act("rocket-fizzle", ROCKET_MS, 84, "right", Rocket, "spike-rocket"),
  "sign-hmm": act("sign-hmm", SIGN_MS, 24, "left", makeSign("HMM."), "spike-sign"),
  "beacon-drop": act("beacon-drop", BEACON_MS, 68, "right", Beacon, "spike-beacon"),
  // The tension banners are weather, not verdicts — `tension-shift` rides the
  // Director's estimate and may not assert a result. Their PA barks step up or
  // down in pitch and never say a word, which is the same rule in sound: an
  // announcement with no content can't overclaim.
  "banner-rising": act(
    "banner-rising",
    BANNER_MS,
    60,
    "sky",
    makeBanner("AS SCHEDULED", 1),
    "spike-banner-rising",
  ),
  "banner-collapsing": act(
    "banner-collapsing",
    BANNER_MS,
    60,
    "sky",
    makeBanner("NEVERMIND", 1),
    "spike-banner-collapsing",
  ),
  // A draw is a fact, so this one gets to be flat. One bark, no bend.
  "banner-draw": declaring(
    act("banner-draw", BANNER_MS, 60, "sky", makeBanner("A DRAW", 2), "spike-banner-draw"),
  ),
  "sprinkler": act("sprinkler", SPRINKLER_MS, 64, "left", Sprinkler, "spike-sprinkler"),
  "win-detonation": declaring(
    act("win-detonation", DETONATION_MS, 110, "lens", Detonation, "spike-win"),
  ),

  // -- the lane screen (VISION.md pillar 2, after the reference change) -------
  // The cast: one character, one canned reaction per outcome, and the same
  // reaction next time.
  "mascot-cheer": act(
    "mascot-cheer",
    MASCOT_MS,
    40,
    "floor",
    makeMascot("cheer"),
    "spike-mascot-cheer",
  ),
  "mascot-flop": act("mascot-flop", MASCOT_MS, 40, "floor", makeMascot("flop"), "spike-mascot-flop"),
  // The callouts: reactions, never results. `NICE.` is a screen having an
  // opinion; anything that names an outcome would be a claim the Director's
  // estimate cannot back (director/types.ts).
  "callout-nice": act("callout-nice", CALLOUT_MS, 2, "lens", makeCallout("NICE."), "spike-callout"),
  "callout-oof": act("callout-oof", CALLOUT_MS, 2, "lens", makeCallout("OOF."), "spike-callout"),
  "callout-huh": act("callout-huh", CALLOUT_MS, 2, "lens", makeCallout("HUH."), "spike-callout"),
  "callout-heat": act(
    "callout-heat",
    CALLOUT_MS,
    2,
    "lens",
    makeCallout("HEATING UP"),
    "spike-callout",
  ),
  // The attract loop's one line. It is not about the game, which is the point:
  // a screen with nothing to react to still has something to say.
  "callout-still-here": act(
    "callout-still-here",
    CALLOUT_MS,
    2,
    "lens",
    makeCallout("STILL HERE"),
    "spike-callout",
  ),

  // -- the signatures (phase 5) ----------------------------------------------
  // One clip per opponent, wired to them in `bots/identity.ts` and written out
  // in VISION.md. Berths are spread deliberately: an opponent's clip has to be
  // able to share the menu with a general one, and two acts in one corner is
  // the only thing the berth rule exists to stop. None of them declares —
  // a signature answers a threat or a grade, and both are estimates.
  "bumpers-up": act("bumpers-up", BUMPERS_MS, 24, "floor", Bumpers, "spike-bumpers"),
  "slab-drop": act("slab-drop", SLAB_MS, 24, "sky", Slab, "spike-slab"),
  "pin-scatter": act("pin-scatter", PINS_MS, 120, "floor", Pins, "spike-pins"),
  "shell-game": act("shell-game", SHELLS_MS, 84, "right", Shells, "spike-shells"),
  "score-lie": act("score-lie", SCORE_MS, 26, "left", Scoreboard, "spike-score"),
  "lane-solve": act("lane-solve", SOLVE_MS, 32, "lens", LaneSolve, "spike-solve"),
  "pinsetter": act("pinsetter", PINSETTER_MS, 72, "sky", Pinsetter, "spike-pinsetter"),
};
