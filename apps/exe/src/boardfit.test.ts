/**
 * The law this file exists for: every variant BOARD.EXE ships is entirely on
 * the desk the moment it opens. Nothing inside a game scrolls, so a variant
 * whose natural window is taller than the desk isn't a scrollbar any more —
 * it's a bug, and this is what says so before a screenshot does.
 *
 * Add a variant and this test is the one that tells you it doesn't fit.
 */

import { describe, expect, it } from "vitest";
import { VARIANTS } from "@fourscore/engine";
import { CELL, CELL_MIN, naturalCell, windowH, windowW } from "./boardfit.js";

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

});
