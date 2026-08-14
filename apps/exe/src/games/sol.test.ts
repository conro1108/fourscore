import { describe, expect, it } from "vitest";
import {
  canFoundation,
  canStackTableau,
  deal,
  drawFromStock,
  isRed,
  isWon,
  makeDeck,
  type Card,
} from "./sol.js";

const c = (rank: number, suit: number): Card => ({ rank, suit });

const seeded = (seed: number) => {
  let s = seed;
  return (): number => ((s = (s * 48271) % 2147483647) / 2147483647);
};

describe("deal", () => {
  it("lays klondike: 1..7 columns, one up each, 24 in stock, 52 total", () => {
    const s = deal(seeded(7));
    expect(s.tab.map((t) => t.down.length)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(s.tab.every((t) => t.up.length === 1)).toBe(true);
    expect(s.stock.length).toBe(24);
    const all = [
      ...s.stock,
      ...s.tab.flatMap((t) => [...t.down, ...t.up]),
    ];
    expect(new Set(all.map((x) => `${x.rank}-${x.suit}`)).size).toBe(52);
  });

  it("shuffles a full deck", () => {
    expect(makeDeck(seeded(3)).length).toBe(52);
  });
});

describe("tableau law", () => {
  it("descends alternating colors", () => {
    expect(canStackTableau(c(6, 1), c(7, 0))).toBe(true); // red 6 on black 7
    expect(canStackTableau(c(6, 1), c(7, 2))).toBe(false); // red on red
    expect(canStackTableau(c(6, 1), c(8, 0))).toBe(false); // gap
  });
  it("only kings found empty columns", () => {
    expect(canStackTableau(c(13, 0), null)).toBe(true);
    expect(canStackTableau(c(12, 0), null)).toBe(false);
  });
});

describe("foundation law", () => {
  it("aces first, then up", () => {
    expect(canFoundation(c(1, 2), [])).toBe(true);
    expect(canFoundation(c(2, 2), [])).toBe(false);
    expect(canFoundation(c(2, 2), [c(1, 2)])).toBe(true);
    expect(canFoundation(c(4, 2), [c(1, 2), c(2, 2)])).toBe(false);
  });
});

describe("the stock", () => {
  it("draws one, and takes the waste back in first-drawn-first order", () => {
    const s = deal(seeded(11));
    const first = s.stock[s.stock.length - 1]!;
    drawFromStock(s);
    expect(s.waste[s.waste.length - 1]).toEqual(first);
    while (s.stock.length) drawFromStock(s);
    expect(s.waste.length).toBe(24);
    const recycled = drawFromStock(s);
    expect(recycled).toBe(true);
    expect(s.waste.length).toBe(0);
    drawFromStock(s);
    // the same card comes off first again
    expect(s.waste[0]).toEqual(first);
  });
});

describe("isWon", () => {
  it("wants all 52 home", () => {
    const s = deal(seeded(5));
    expect(isWon(s)).toBe(false);
    s.found = [0, 1, 2, 3].map((suit) =>
      Array.from({ length: 13 }, (_, i) => c(i + 1, suit)),
    );
    expect(isWon(s)).toBe(true);
  });
});

describe("isRed", () => {
  it("hearts and diamonds", () => {
    expect([0, 1, 2, 3].map(isRed)).toEqual([false, true, true, false]);
  });
});
