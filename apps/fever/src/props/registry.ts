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
 */

import type { SoundName } from "../audio/library.js";
import type { StageLayout } from "../stage/layout.js";
import { makeBanner, BANNER_MS } from "./Banner.js";
import { Beacon, BEACON_MS } from "./Beacon.js";
import { Detonation, DETONATION_MS } from "./Detonation.js";
import { Rocket, ROCKET_MS } from "./Rocket.js";
import { makeSign, SIGN_MS } from "./Sign.js";
import { Sprinkler, SPRINKLER_MS } from "./Sprinkler.js";
import { Truck, TRUCK_LAP_MS } from "./Truck.js";

export interface PropAct {
  name: string;
  durationMs: number;
  /** Audited triangle count. The law is <= 300. */
  tris: number;
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
  Component: PropAct["Component"],
  spike: SoundName,
): PropAct => ({ name, durationMs, tris, Component, spike });

export const PROP_ACTS: Record<string, PropAct> = {
  "truck-lap": act("truck-lap", TRUCK_LAP_MS, 180, Truck, "spike-truck"),
  "rocket-fizzle": act("rocket-fizzle", ROCKET_MS, 84, Rocket, "spike-rocket"),
  "sign-hmm": act("sign-hmm", SIGN_MS, 24, makeSign("HMM."), "spike-sign"),
  "beacon-drop": act("beacon-drop", BEACON_MS, 68, Beacon, "spike-beacon"),
  // The tension banners are weather, not verdicts — `tension-shift` rides the
  // Director's estimate and may not assert a result. Their PA barks step up or
  // down in pitch and never say a word, which is the same rule in sound: an
  // announcement with no content can't overclaim.
  "banner-rising": act("banner-rising", BANNER_MS, 60, makeBanner("SUNDAY", 3), "spike-banner-rising"),
  "banner-collapsing": act(
    "banner-collapsing",
    BANNER_MS,
    60,
    makeBanner("NEVERMIND", 1),
    "spike-banner-collapsing",
  ),
  // A draw is a fact, so this one gets to be flat. One bark, no bend.
  "banner-draw": act("banner-draw", BANNER_MS, 60, makeBanner("A DRAW", 2), "spike-banner-draw"),
  "sprinkler": act("sprinkler", SPRINKLER_MS, 64, Sprinkler, "spike-sprinkler"),
  "win-detonation": act("win-detonation", DETONATION_MS, 110, Detonation, "spike-win"),
};
