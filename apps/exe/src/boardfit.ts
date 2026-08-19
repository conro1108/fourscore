/**
 * BOARD.EXE's geometry, kept outside the window so a test can hold it.
 *
 * Every number here is a pure function of a variant and a size: the cell a
 * window this big can hold, the window a variant asks for at that cell, and
 * the law that binds them — the whole cabinet is on the desk the moment it
 * opens. Connect 6 and 7 don't fit at the authored 64px cell and the answer
 * is a smaller cell, never a scrollbar (DIRECTION.md); `boardfit.test.ts` is
 * what tells you when a new variant breaks that.
 *
 * The chrome numbers are measured, not guessed: a natural Connect 4 window is
 * 480x529 around a 7x6 field of 64px cells, so 32 is the two frame margins
 * and the well's padding, and 77 is the titlebar, the menu, the statusbar and
 * every margin between them — none of which scale with the cell.
 */

import { fitCell } from "./wm.js";
import type { Variant } from "@fourscore/engine";

/** The authored cell. A natural-sized Connect 4 board is exactly this. */
export const CELL = 64;
/** A chip is three quarters of its cell, at every size. */
export const DISC_RATIO = 3 / 4;
/* The ladder the cell steps through when the window is dragged. 8 keeps the
   disc whole (3/4 of a multiple of 8 is an integer) and keeps a slow drag on
   a handful of sizes instead of shivering a pixel at a time. */
export const CELL_STEP = 8;
export const CELL_MIN = 32;
export const CELL_MAX = 128;

export const CHROME_W = 32;
export const CHROME_H = 77;
/** The sunken well's 6px on each side. */
export const FRAME_PAD = 12;
/** 4px above and below the hover disc. */
export const PICKER_PAD = 8;

export const frameH = (v: Variant, cell: number): number => v.height * cell + FRAME_PAD;
export const pickerH = (cell: number): number => cell * DISC_RATIO + PICKER_PAD;
/** The window a variant fills at this cell — chrome, picker row and frame. */
export const windowW = (v: Variant, cell: number): number => v.width * cell + CHROME_W;
export const windowH = (v: Variant, cell: number): number =>
  CHROME_H + pickerH(cell) + frameH(v, cell);

/**
 * The biggest cell a window this size can hold — the tighter axis wins, and
 * both round-trip: a natural window measures back to exactly `CELL`, so
 * nothing moves until you actually drag. Height budget: the frame needs
 * rows*c + FRAME_PAD and the picker row 0.75c + PICKER_PAD on top of the
 * fixed chrome, so the cells across the height axis come to rows + 0.75.
 */
export const cellFor = (v: Variant, w: number, h: number): number =>
  Math.min(
    fitCell({
      space: w - CHROME_W,
      count: v.width,
      base: CELL,
      step: CELL_STEP,
      min: CELL_MIN,
      max: CELL_MAX,
    }),
    fitCell({
      space: h - CHROME_H - PICKER_PAD - FRAME_PAD,
      count: v.height + DISC_RATIO,
      base: CELL,
      step: CELL_STEP,
      min: CELL_MIN,
      max: CELL_MAX,
    }),
  );

/**
 * The cell a board takes when nobody has dragged it: the authored one where
 * the desk holds it, the biggest one that fits where it doesn't. `roomH` is
 * what a natural window actually has — the desk minus the taskbar minus the
 * seat it seats itself in.
 */
export const naturalCell = (v: Variant, deskW: number, roomH: number): number =>
  Math.min(CELL, cellFor(v, deskW, roomH));
