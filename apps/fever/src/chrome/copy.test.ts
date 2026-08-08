/**
 * The copy table's only real logic is its fallbacks, and every one of them is a
 * sentence a player reads. A missing persona line has to degrade to a plain
 * one, not to `undefined is thinking.`
 */

import { describe, expect, it } from "vitest";
import { CONNECT4, CONNECT5, ROSTER, byId } from "@fourscore/engine";
import { COPY } from "./copy.js";

describe("copy", () => {
  it("gives every bot a thinking line and a defeat line", () => {
    for (const bot of ROSTER) {
      // Shouting surface: all caps, ending in a stop of some kind. Acorn is
      // the reason the punctuation class isn't just a full stop.
      expect(COPY.thinking(bot)).toMatch(/^[A-Z][A-Z .]+[.!]+$/);
      expect(COPY.lost(bot)).toContain(bot.name.toUpperCase());
    }
  });

  it("speaks in every opponent's own voice, not a template", () => {
    // Phase 5 filled both tables from VISION.md's personas, so all eight rungs
    // now say something only they would say. Sampled across the ladder rather
    // than asserted in full — the table is the copy, and phase 9 reads it.
    expect(COPY.thinking(byId("moss"))).toBe("MOSS IS THINKING ABOUT DIRT.");
    expect(COPY.thinking(byId("vane"))).toBe("VANE IS THINKING ABOUT SOMETHING ELSE.");
    expect(COPY.lost(byId("oracle"))).toBe("THE ORACLE WINS. IT DOES NOT SAY WHEN IT KNEW.");
    // Nobody is left on the generic line.
    for (const bot of ROSTER) {
      expect(COPY.thinking(bot), bot.id).not.toBe(`${bot.name.toUpperCase()} IS THINKING.`);
      expect(COPY.lost(bot), bot.id).not.toBe(`${bot.name.toUpperCase()} WINS.`);
    }
  });

  it("still degrades to a plain line for an opponent it has never heard of", () => {
    // The fallback is what stops a new rung reading `undefined is thinking.`
    // before anyone has written it a voice.
    const stranger = { ...byId("moss"), id: "nobody", name: "Nobody" };
    expect(COPY.thinking(stranger)).toBe("NOBODY IS THINKING.");
    expect(COPY.lost(stranger)).toBe("NOBODY WINS.");
  });

  it("names the variants the way the voice sample does", () => {
    expect(COPY.variant(CONNECT4.id)).toBe("CONNECT 4");
    expect(COPY.variant(CONNECT5.id)).toBe("CONNECT 5 (more)");
  });

  it("says who starts in the second person and the third", () => {
    const moss = byId("moss");
    expect(COPY.swap(moss, true)).toBe("Rematch, Moss starts");
    expect(COPY.swap(moss, false)).toBe("Rematch, you start");
  });

  it("reads an empty record as never played, and drops a zero draw count", () => {
    expect(COPY.record(0, 0, 0)).toBe("You have not played this one.");
    expect(COPY.record(3, 1, 0)).toBe("You 3–1.");
    expect(COPY.record(3, 1, 2)).toBe("You 3–1–2.");
  });
});
