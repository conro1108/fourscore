/**
 * The picture format has to survive Notepad, because Notepad is a legal
 * editor for it — so the parser is tested mostly on what a person could
 * plausibly type, not on what PAINT.EXE would save.
 */

import { describe, expect, it } from "vitest";
import {
  SPR_MAX,
  blankCells,
  cellsToRows,
  fillCells,
  isSpriteFile,
  parseSprite,
  serializeCells,
} from "./sprite.js";

describe("parseSprite", () => {
  it("round-trips what serialize writes", () => {
    const cells = blankCells(4, 3);
    cells[1]![2] = "r";
    cells[0]![0] = "k";
    expect(parseSprite(serializeCells(cells))).toEqual(cells);
  });

  it("pads ragged rows to the widest", () => {
    const cells = parseSprite("rr\nr\nrrrr")!;
    expect(cellsToRows(cells)).toEqual(["rr..", "r...", "rrrr"]);
  });

  it("reads unknown letters as transparent", () => {
    expect(cellsToRows(parseSprite("rZr")!)).toEqual(["r.r"]);
  });

  it("crops past the cap instead of failing", () => {
    const wide = "r".repeat(SPR_MAX + 10);
    const cells = parseSprite(Array.from({ length: SPR_MAX + 10 }, () => wide).join("\n"))!;
    expect(cells.length).toBe(SPR_MAX);
    expect(cells[0]!.length).toBe(SPR_MAX);
  });

  it("refuses only the empty file", () => {
    expect(parseSprite("")).toBeNull();
    expect(parseSprite("\n  \n")).toBeNull();
    expect(parseSprite(".")).not.toBeNull();
  });

  it("keeps CRLF files and surrounding blank lines out of the picture", () => {
    expect(cellsToRows(parseSprite("\nrr\r\nrr\n\n")!)).toEqual(["rr", "rr"]);
  });
});

describe("fillCells", () => {
  it("floods a region and stops at a boundary", () => {
    const cells = parseSprite(["....", ".kk.", ".k.k", "...."].join("\n"))!;
    fillCells(cells, 0, 0, "r");
    expect(cellsToRows(cells)).toEqual(["rrrr", "rkkr", "rkrk", "rrrr"]);
    // the cell fenced off by the k's kept its color
    expect(cells[2]![3]).toBe("k");
  });

  it("does nothing off the canvas or onto its own color", () => {
    const cells = blankCells(2, 2);
    fillCells(cells, 5, 5, "r");
    fillCells(cells, 0, 0, ".");
    expect(cellsToRows(cells)).toEqual(["..", ".."]);
  });
});

it("isSpriteFile is an extension check, DOS-cased", () => {
  expect(isSpriteFile("rocket.spr")).toBe(true);
  expect(isSpriteFile("ROCKET.SPR")).toBe(true);
  expect(isSpriteFile("rocket.txt")).toBe(false);
});
