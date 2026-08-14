import { describe, expect, it } from "vitest";
import { floodReveal, makeMinesBoard, neighbors, type MinesBoard } from "./mines.js";

/** A hand-laid 4x3 field:  M . . .      adjacency laid out by eye.
 *                          . . . .
 *                          . . . M  */
const laid: MinesBoard = (() => {
  const w = 4;
  const h = 3;
  const mines = Array<boolean>(w * h).fill(false);
  mines[0] = true;
  mines[11] = true;
  const adj = mines.map((_, i) => neighbors(w, h, i).filter((n) => mines[n]).length);
  return { w, h, mines, adj };
})();

describe("makeMinesBoard", () => {
  it("lays the right count and never on the safe cell", () => {
    for (let seed = 0; seed < 20; seed++) {
      let s = seed + 1;
      const rand = (): number => ((s = (s * 48271) % 2147483647) / 2147483647);
      const b = makeMinesBoard(9, 9, 10, 40, rand);
      expect(b.mines.filter(Boolean).length).toBe(10);
      expect(b.mines[40]).toBe(false);
    }
  });

  it("counts adjacency like a neighbor count should", () => {
    expect(laid.adj[1]).toBe(1); // beside the corner mine
    expect(laid.adj[5]).toBe(1); // diagonal to it
    expect(laid.adj[6]).toBe(1); // diagonal to the far mine
    expect(laid.adj[2]).toBe(0);
  });
});

describe("floodReveal", () => {
  it("opens only the clicked cell on a number", () => {
    expect(floodReveal(laid, 1, new Set())).toEqual([1]);
  });

  it("floods through zeros and stops at the numbered rim", () => {
    // cell 3 (top-right corner) is a zero pocket walled by the two mines' rims
    const opened = floodReveal(laid, 3, new Set());
    expect(opened).toContain(3);
    expect(opened).toContain(2);
    // it never opens a mine
    for (const i of opened) expect(laid.mines[i]).toBe(false);
    // zeros drag their whole numbered rim open
    expect(opened).toContain(6);
  });

  it("returns nothing for a mine or an already-open cell", () => {
    expect(floodReveal(laid, 0, new Set())).toEqual([]);
    expect(floodReveal(laid, 1, new Set([1]))).toEqual([]);
  });
});
