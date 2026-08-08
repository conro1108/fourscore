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
      expect(COPY.thinking(bot)).toMatch(/^[A-Z][A-Z .]+\.$/);
      expect(COPY.lost(bot)).toContain(bot.name.toUpperCase());
    }
  });

  it("uses the written persona line where there is one", () => {
    // Moss is VISION.md's template; the other seven are phase 5's.
    expect(COPY.thinking(byId("moss"))).toBe("MOSS IS THINKING ABOUT DIRT.");
    expect(COPY.thinking(byId("vane"))).toBe("VANE IS THINKING.");
    expect(COPY.lost(byId("oracle"))).toBe("THE ORACLE WINS.");
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
