/**
 * What a test can hold onto about sound, which is not the sound.
 *
 * Whether `spike-beacon` is funny is a question for ears, and
 * `tools/audio-check.mjs` renders every recipe in a real browser and writes
 * wavs for exactly that. What lives here is the wiring around it — the things
 * that rot silently when phase 5 adds a bot with a signature act: a gag whose
 * one-shot doesn't exist, a shopping list that drifted from the recipes it
 * describes, a sound that outlasts the prop it belongs to.
 */

import { describe, expect, it } from "vitest";
import { RECIPES, SOUND_NAMES, type SoundName } from "./library.js";
import { PROP_ACTS } from "../props/registry.js";
// The shipped artifact itself, not a copy of it: this test is only worth
// anything if it reads the file the browser will fetch.
import shipped from "../../public/samples/manifest.json";

const manifest: Record<string, { want: string; file?: string }> = shipped;

describe("the sound library", () => {
  it("gives every recipe a length and something to go find", () => {
    for (const name of SOUND_NAMES) {
      const recipe = RECIPES[name];
      expect(recipe.seconds, name).toBeGreaterThan(0);
      expect(recipe.seconds, name).toBeLessThan(10);
      expect(recipe.want.length, name).toBeGreaterThan(8);
    }
  });

  it("ships a manifest entry per sound and no strays", () => {
    expect(Object.keys(manifest).sort()).toEqual([...SOUND_NAMES].sort());
  });

  it("keeps the shopping list saying what the recipes say", () => {
    // The `want` string lives next to the placeholder it describes; the
    // manifest is the shipped copy. If this fails, edit public/samples/manifest.json.
    for (const name of SOUND_NAMES) {
      expect(manifest[name]?.want, name).toBe(RECIPES[name].want);
    }
  });
});

describe("the gag roster's sound", () => {
  it("gives every act a one-shot that exists", () => {
    for (const act of Object.values(PROP_ACTS)) {
      expect(SOUND_NAMES, act.name).toContain(act.spike);
    }
  });

  it("has no orphan spikes — every spike-* belongs to an act", () => {
    const used = new Set(Object.values(PROP_ACTS).map((a) => a.spike));
    const declared = SOUND_NAMES.filter((n) => n.startsWith("spike-"));
    expect([...used].sort()).toEqual([...declared].sort());
  });

  it("never lets a sound outlast the act it belongs to", () => {
    // An act is choreographed to end off-stage; a spike still going after the
    // prop has left is the same law broken where you can't see it. (Fever
    // plays spikes slightly sharp, which only ever shortens them.)
    for (const act of Object.values(PROP_ACTS)) {
      const seconds = RECIPES[act.spike as SoundName].seconds;
      expect(seconds * 1000, act.name).toBeLessThanOrEqual(act.durationMs);
    }
  });
});
