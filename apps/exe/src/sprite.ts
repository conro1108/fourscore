/**
 * .spr — the machine's picture format. A picture is rows of palette letters,
 * the same alphabet the desk's own icons are drawn in (icons.ts PAL), with
 * "." for transparency — so a picture is a text file like everything else on
 * C:\: TYPE prints it, Notepad can edit it, and PAINT.EXE is just the door
 * with a pencil behind it.
 *
 * Parsing is forgiving on purpose, because Notepad is a legal editor for
 * this format: a letter the palette doesn't know reads as transparent, a
 * ragged row is padded, an oversize picture is cropped to the cap. What
 * never happens is a crash over a file a person typed.
 */

import { PAL } from "./icons.js";

/** cells[y][x] — a palette letter, or "." for transparent. */
export type Cells = string[][];

export const SPR_MAX = 32;

export const isSpriteFile = (name: string): boolean => name.toLowerCase().endsWith(".spr");

const legal = (ch: string): string => (ch === "." || PAL[ch] !== undefined ? ch : ".");

/** Null only when there is no drawable area at all (an empty file). */
export function parseSprite(text: string): Cells | null {
  const lines = text.replace(/\r/g, "").split("\n");
  while (lines.length && lines[0]!.trim() === "") lines.shift();
  while (lines.length && lines[lines.length - 1]!.trim() === "") lines.pop();
  if (lines.length === 0) return null;
  const rows = lines.slice(0, SPR_MAX);
  const w = Math.min(SPR_MAX, Math.max(...rows.map((r) => r.length)));
  if (w === 0) return null;
  return rows.map((r) => Array.from({ length: w }, (_, x) => legal(r[x] ?? ".")));
}

export const blankCells = (w: number, h: number): Cells =>
  Array.from({ length: h }, () => Array.from({ length: w }, () => "."));

export const cellsToRows = (cells: Cells): string[] => cells.map((r) => r.join(""));

export const serializeCells = (cells: Cells): string => cellsToRows(cells).join("\n") + "\n";

/** Flood fill in place — the paint can, on letter equality. */
export function fillCells(cells: Cells, x: number, y: number, ch: string): void {
  const from = cells[y]?.[x];
  if (from === undefined || from === ch) return;
  const stack: [number, number][] = [[x, y]];
  while (stack.length) {
    const [cx, cy] = stack.pop()!;
    if (cells[cy]?.[cx] !== from) continue;
    cells[cy]![cx] = ch;
    stack.push([cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]);
  }
}
