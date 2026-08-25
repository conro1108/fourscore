/**
 * BOARD.EXE geometry as pure functions of variant and size. Law: the whole
 * cabinet is on the desk when it opens — a variant that doesn't fit gets a
 * smaller cell, never a scrollbar. Chrome numbers are measured: a natural
 * Connect 4 window is 480x529 around 7x6 cells of 64px, so 32 = frame margins
 * + well padding and 77 = titlebar + menu + statusbar + margins.
 */

import { fitCell } from "./wm.js";
import type { Variant } from "@fourscore/engine";

/** The authored cell. */
export const CELL = 64;
export const DISC_RATIO = 3 / 4;
/* Drag step. 8 keeps the disc (3/4 cell) an integer and stops pixel shiver. */
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
export const windowW = (v: Variant, cell: number): number => v.width * cell + CHROME_W;
export const windowH = (v: Variant, cell: number): number =>
  CHROME_H + pickerH(cell) + frameH(v, cell);

/**
 * Biggest cell a window this size holds; tighter axis wins. Both axes
 * round-trip (a natural window measures back to exactly `CELL`). Height
 * counts rows + 0.75 cells: the picker row is 0.75c + PICKER_PAD.
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

/** Undragged cell: `CELL` if it fits, else the biggest that does. `roomH` =
    desk minus taskbar minus seat. */
export const naturalCell = (v: Variant, deskW: number, roomH: number): number =>
  Math.min(CELL, cellFor(v, deskW, roomH));
