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
import { Beacon, BEACON_MS } from "./Beacon.js";
import { Bumpers, BUMPERS_MS } from "./Bumpers.js";
import { makeCallout, CALLOUT_MS } from "./Callout.js";
import { Cannon, CANNON_MS } from "./Cannon.js";
import { DeepSpace, DEEP_SPACE_MS } from "./DeepSpace.js";
import { Detonation, DETONATION_MS } from "./Detonation.js";
import { Finger, FINGER_MS } from "./Finger.js";
import { LaneSolve, SOLVE_MS } from "./LaneSolve.js";
import { MirrorBall, MIRROR_MS } from "./MirrorBall.js";
import { Piano, PIANO_MS } from "./Piano.js";
import { Washer, WASHER_MS } from "./Washer.js";
import { Wrecking, WRECKING_MS } from "./Wrecking.js";
import { makeMascot, MASCOT_MS } from "./Mascot.js";
import { Mower, MOWER_MS } from "./Mower.js";
import { Pins, PINS_MS } from "./Pins.js";
import { Pinsetter, PINSETTER_MS } from "./Pinsetter.js";
import { Rocket, ROCKET_MS } from "./Rocket.js";
import { Scoreboard, SCORE_MS } from "./Scoreboard.js";
import { Shells, SHELLS_MS } from "./Shells.js";
import { Slab, SLAB_MS } from "./Slab.js";
import { Stare, STARE_MS } from "./Stare.js";
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
  "beacon-drop": act("beacon-drop", BEACON_MS, 68, "right", Beacon, "spike-beacon"),
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
  // The same disc in sunglasses, at the wrong scale, doing nothing at all. The
  // cast is unexplained by law, so this needs no account of itself — and a
  // character that declines to react is the one register the roster was missing.
  "stare-down": act("stare-down", STARE_MS, 40, "right", Stare, "spike-stare"),
  // The act about nothing. It cannot comment on your move because it does not
  // know you made one, which is why it is the only thing that may answer an
  // ordinary one (see `gags.ts`).
  "deep-space": act("deep-space", DEEP_SPACE_MS, 74, "sky", DeepSpace, "spike-deep-space"),
  // The callouts: reactions, never results. `NICE.` is a screen having an
  // opinion; anything that names an outcome would be a claim the Director's
  // estimate cannot back (director/types.ts).
  //
  // Each one picks a WordArt preset (`texture.ts`) and keeps it. A gallery is
  // what WordArt *was* — you didn't have a house style, you had thirty and you
  // picked the loudest — but the pick is fixed per word, because the taste law
  // lets chance choose which gag fires and never how it looks. The presets are
  // assigned by what the word means rather than by rotation: acid for good
  // news, heat for bad, void for a shrug.
  "callout-nice": act(
    "callout-nice",
    CALLOUT_MS,
    2,
    "lens",
    makeCallout("NICE.", "acid"),
    "spike-callout",
  ),
  "callout-oof": act(
    "callout-oof",
    CALLOUT_MS,
    2,
    "lens",
    makeCallout("OOF.", "heat"),
    "spike-callout",
  ),
  "callout-huh": act(
    "callout-huh",
    CALLOUT_MS,
    2,
    "lens",
    makeCallout("HUH.", "void"),
    "spike-callout",
  ),
  "callout-heat": act(
    "callout-heat",
    CALLOUT_MS,
    2,
    "lens",
    makeCallout("HEATING UP", "heat"),
    "spike-callout",
  ),
  // The attract loop's one line. It is not about the game, which is the point:
  // a screen with nothing to react to still has something to say. It gets the
  // wordmark's own chrome, because on the menu it is the software talking about
  // itself.
  "callout-still-here": act(
    "callout-still-here",
    CALLOUT_MS,
    2,
    "lens",
    makeCallout("STILL HERE", "chrome"),
    "spike-callout",
  ),
  // The two words for ordinary moves, and they are the joke from both ends.
  // `INCREDIBLE` is a screen at full volume about a move that was merely
  // allowed — the only word in the gallery set in `rainbow`, the preset with no
  // dark band and therefore no horizon and no volume, so it reads as a sticker
  // stuck on the frame rather than as an object in it. `A MOVE.` is the same
  // screen having run out of things to say and saying that, in the flattest
  // preset there is. Neither names a result, so both stay inside the claims law
  // on a graded event (`director/types.ts`).
  "callout-incredible": act(
    "callout-incredible",
    CALLOUT_MS,
    2,
    "lens",
    makeCallout("INCREDIBLE", "rainbow"),
    "spike-callout",
  ),
  "callout-a-move": act(
    "callout-a-move",
    CALLOUT_MS,
    2,
    "lens",
    makeCallout("A MOVE.", "void"),
    "spike-callout",
  ),
  // -- what used to be the tow plane -----------------------------------------
  // `banner-rising` / `-collapsing` / `-draw` were a plane towing a banner over
  // a fairground, and phase 6½ names them the clearest miss in the roster: the
  // beat is right and the venue is wrong. A lane screen does this exact beat as
  // a word at the lens, and the detonation has been showing how since phase 3.
  // So the three of them are gone and these three answer the same three events,
  // with the same copy where the copy still fits — `NEVERMIND` was always the
  // best line in the game and it never needed a plane.
  //
  // The two tension words stay hedged: `tension-shift` is the Director's
  // estimate (`director/types.ts`), so the screen may shout about the weather
  // and may not name a result.
  "callout-happening": act(
    "callout-happening",
    CALLOUT_MS,
    2,
    "lens",
    makeCallout("IT'S HAPPENING", "heat"),
    "spike-callout",
  ),
  "callout-nevermind": act(
    "callout-nevermind",
    CALLOUT_MS,
    2,
    "lens",
    makeCallout("NEVERMIND", "void"),
    "spike-callout",
  ),
  // A draw is a fact, so this one gets to be flat, and gets the chrome the
  // software uses to talk about itself.
  "callout-draw": declaring(
    act("callout-draw", CALLOUT_MS, 2, "lens", makeCallout("A DRAW.", "chrome"), "spike-callout"),
  ),

  // -- the signatures (phase 5) ----------------------------------------------
  // One clip per opponent, wired to them in `bots/identity.ts` and written out
  // in VISION.md. Berths are spread deliberately: an opponent's clip has to be
  // able to share the menu with a general one, and two acts in one corner is
  // the only thing the berth rule exists to stop. None of them declares —
  // a signature answers a threat or a grade, and both are estimates.
  "bumpers-up": act("bumpers-up", BUMPERS_MS, 24, "floor", Bumpers, "spike-bumpers"),
  // Moss's, and the sprinkler's replacement: same persona, same pace, a
  // character instead of a piece of equipment.
  "mower-crawl": act("mower-crawl", MOWER_MS, 124, "floor", Mower, "spike-mower"),
  "slab-drop": act("slab-drop", SLAB_MS, 24, "sky", Slab, "spike-slab"),
  "pin-scatter": act("pin-scatter", PINS_MS, 120, "floor", Pins, "spike-pins"),
  "shell-game": act("shell-game", SHELLS_MS, 84, "right", Shells, "spike-shells"),
  "score-lie": act("score-lie", SCORE_MS, 26, "left", Scoreboard, "spike-score"),
  "lane-solve": act("lane-solve", SOLVE_MS, 32, "lens", LaneSolve, "spike-solve"),
  "pinsetter": act("pinsetter", PINSETTER_MS, 72, "sky", Pinsetter, "spike-pinsetter"),

  // -- the full-frame acts (phase 9) -----------------------------------------
  // The roster above grew up along one edge. The truck, both mascots, the mower
  // and the pins all cross the floor; the rocket climbs one corner; everything
  // else arrives at the lens. Played end to end that reads as a strip of
  // activity under a board, with the whole upper stage empty — which is what
  // Connor saw and what these six are for.
  //
  // Each one crosses or fills the frame rather than sitting at the edge of it,
  // and the berths are picked to spread them: two on `left`, two on `sky`, one
  // each on `right` and `lens`, and none at all on the crowded `floor`. That
  // spread is load-bearing on the menu, where two acts run at once.
  //
  // None of them declares — they answer grades, threats and tension, and all
  // three are the Director's estimate (`director/types.ts`).
  "cannon-shot": act("cannon-shot", CANNON_MS, 140, "left", Cannon, "spike-cannon"),
  "piano-drop": act("piano-drop", PIANO_MS, 76, "sky", Piano, "spike-piano"),
  "wrecking-ball": act("wrecking-ball", WRECKING_MS, 162, "sky", Wrecking, "spike-wrecking"),
  "mirror-ball": act("mirror-ball", MIRROR_MS, 84, "lens", MirrorBall, "spike-mirror"),
  "window-washer": act("window-washer", WASHER_MS, 102, "left", Washer, "spike-washer"),
  "foam-finger": act("foam-finger", FINGER_MS, 48, "right", Finger, "spike-finger"),
};
