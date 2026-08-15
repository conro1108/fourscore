/**
 * The stepped cell ladder every resizable game window grows on. The law worth
 * pinning is the round trip: a window at its natural size has to measure back
 * to exactly the authored cell, or every board on the desk shifts a pixel the
 * moment it is touched — and the harness screenshots wouldn't show it, because
 * they never drag anything.
 */
import { describe, expect, it } from "vitest";
import { centered, fitCell } from "./wm.js";

const BOARD = { base: 64, step: 8, min: 32, max: 128 };
const SQUARE = { base: 40, step: 8, min: 24, max: 96 };

describe("fitCell", () => {
  it("gives back the authored cell at the authored size", () => {
    // BOARD.EXE: a natural Connect 4 window is 480x529 with 32/97 of chrome
    expect(fitCell({ space: 480 - 32, count: 7, ...BOARD })).toBe(64);
    expect(fitCell({ space: 529 - 97, count: 6 + 0.75, ...BOARD })).toBe(64);
    // CHESS.EXE / CHECKERS.EXE: 366x406 around eight 40px squares
    expect(fitCell({ space: 366 - 46, count: 8, ...SQUARE })).toBe(40);
    expect(fitCell({ space: 406 - 86, count: 8, ...SQUARE })).toBe(40);
  });

  it("only ever lands on the ladder", () => {
    for (let space = 200; space < 1400; space += 7) {
      const c = fitCell({ space, count: 7, ...BOARD });
      expect(c % BOARD.step).toBe(0);
      expect(c).toBeGreaterThanOrEqual(BOARD.min);
      expect(c).toBeLessThanOrEqual(BOARD.max);
    }
  });

  it("never overflows the space it was given", () => {
    for (let space = 300; space < 1400; space += 3) {
      const c = fitCell({ space, count: 7, ...BOARD });
      // below the floor the field is allowed to be bigger than the window —
      // that is what the scrollbar is for — but never above it
      if (c > BOARD.min) expect(c * 7).toBeLessThanOrEqual(space);
    }
  });

  it("grows with the window and never shrinks", () => {
    let last = 0;
    for (let space = 200; space < 1400; space += 11) {
      const c = fitCell({ space, count: 7, ...BOARD });
      expect(c).toBeGreaterThanOrEqual(last);
      last = c;
    }
  });

  it("clamps rather than vanishing on a space that can't hold the floor", () => {
    expect(fitCell({ space: 10, count: 7, ...BOARD })).toBe(32);
    expect(fitCell({ space: -50, count: 7, ...BOARD })).toBe(32);
  });
});

describe("centered", () => {
  it("hands the horizontal halves to auto, whatever the shorthand", () => {
    expect(centered("6px 10px 4px")).toBe("6px auto 4px");
    expect(centered("0px 10px")).toBe("0px auto");
    expect(centered("6px 10px 4px 10px")).toBe("6px auto 4px auto");
  });
  it("leaves a margin it doesn't understand alone", () => {
    expect(centered("")).toBe("");
    expect(centered("8px")).toBe("8px");
  });
});
