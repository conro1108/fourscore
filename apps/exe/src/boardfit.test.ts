/**
 * The law this file exists for: every variant BOARD.EXE ships is entirely on
 * the desk the moment it opens. Nothing inside a game scrolls, so a variant
 * whose natural window is taller than the desk isn't a scrollbar any more —
 * it's a bug, and this is what says so before a screenshot does.
 *
 * Add a variant and this test is the one that tells you it doesn't fit.
 */

import { describe, expect, it } from "vitest";
import { VARIANTS, variantById } from "@fourscore/engine";
import { CELL, CELL_MIN, cellFor, naturalCell, windowH, windowW } from "./boardfit.js";

/* The authored desk: 1280x800 with a 36px taskbar, and the 8px of seat a
   natural window keeps above and below itself (board.ts, deskRoomH). */
const DESK_W = 1280;
const DESK_H = 800;
const TASKBAR = 36;
const ROOM_H = DESK_H - TASKBAR - 8;

describe("the natural board fits the desk", () => {
  for (const v of VARIANTS) {
    it(`${v.id} opens whole`, () => {
      const c = naturalCell(v, DESK_W, ROOM_H);
      expect(c).toBeGreaterThanOrEqual(CELL_MIN);
      expect(c).toBeLessThanOrEqual(CELL);
      expect(windowW(v, c)).toBeLessThanOrEqual(DESK_W);
      expect(windowH(v, c)).toBeLessThanOrEqual(DESK_H - TASKBAR);
    });
  }

  it("leaves the two boards that always fitted at the authored cell", () => {
    // Connect 4 is untouched by construction, and Connect 5 still fits at 64
    expect(naturalCell(variantById("connect4"), DESK_W, ROOM_H)).toBe(CELL);
    expect(naturalCell(variantById("connect5"), DESK_W, ROOM_H)).toBe(CELL);
  });

  it("shrinks the cell on the two that don't", () => {
    expect(naturalCell(variantById("connect6"), DESK_W, ROOM_H)).toBe(56);
    expect(naturalCell(variantById("connect7"), DESK_W, ROOM_H)).toBe(48);
  });

  it("fits a phone-sized desk too", () => {
    // the smaller monitor a coarse pointer gets (wm.ts, FIT_W/FIT_H)
    for (const v of VARIANTS) {
      const c = naturalCell(v, 512, 600 - TASKBAR - 8);
      expect(windowW(v, c)).toBeLessThanOrEqual(512);
      expect(windowH(v, c)).toBeLessThanOrEqual(600 - TASKBAR);
    }
  });

  it("round-trips: a natural window measures back to the cell it was given", () => {
    // the drag law — resizing to exactly the natural size must not move a pixel
    for (const v of VARIANTS) {
      const c = naturalCell(v, DESK_W, ROOM_H);
      expect(cellFor(v, windowW(v, c), windowH(v, c))).toBe(c);
    }
  });
});
