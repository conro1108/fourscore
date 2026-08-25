/** Every shipped variant opens whole on the desk — nothing in a game scrolls. */

import { describe, expect, it } from "vitest";
import { VARIANTS } from "@fourscore/engine";
import { CELL, CELL_MIN, naturalCell, windowH, windowW } from "./boardfit.js";

/* Authored desk 1280x800, 36px taskbar, 8px seat (board.ts deskRoomH). */
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
