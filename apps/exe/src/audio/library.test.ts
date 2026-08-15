/**
 * What a test can hold onto about sound, which is not the sound.
 *
 * Whether `disc-land` knocks is a question for ears, and `npm run audio`
 * renders every recipe in a real browser and writes wavs for exactly that.
 * What lives here is the wiring around it — the parts that rot silently: a
 * sound the Control Panel lists but the library doesn't have (a dead Play
 * button, which the second law forbids), a sound in the library that no event
 * row names (a sound the player can never find), and a recipe long enough to
 * outlast the moment it answers.
 */

import { describe, expect, it } from "vitest";
import { RECIPES, SOUND_NAMES } from "./library.js";
import { SOUND_EVENTS } from "../copy.js";

describe("the sound library", () => {
  it("gives every recipe a length and a line about what it is", () => {
    for (const name of SOUND_NAMES) {
      expect(RECIPES[name].seconds, name).toBeGreaterThan(0);
      expect(RECIPES[name].seconds, name).toBeLessThanOrEqual(3);
      expect(RECIPES[name].note.length, name).toBeGreaterThan(8);
    }
  });

  /**
   * The furniture answers a click and has to be out of the way before the next
   * one. Only the five the machine *means* are allowed to be long, and they are
   * listed here rather than derived so that adding a two-second ding fails.
   */
  it("keeps everything that answers a click short", () => {
    const allowedLong = new Set(["startup", "tada", "shutdown-chime", "line-catch", "smolder"]);
    for (const name of SOUND_NAMES) {
      if (allowedLong.has(name)) continue;
      expect(RECIPES[name].seconds, name).toBeLessThanOrEqual(1.4);
    }
  });
});

describe("sounds.ctl", () => {
  it("lists every sound exactly once, and nothing that doesn't exist", () => {
    expect(SOUND_EVENTS.map((e) => e.sound).sort()).toEqual([...SOUND_NAMES].sort());
  });

  it("gives every event a label of its own", () => {
    const labels = SOUND_EVENTS.map((e) => e.label);
    expect(new Set(labels).size).toBe(labels.length);
  });
});
