import { describe, expect, it } from "vitest";
import { CONNECT4, CONNECT5, CONNECT6, CONNECT7 } from "@fourscore/engine";
import { layoutFor } from "./layout.js";
import {
  BAR_TRAVEL,
  COMMIT_PULL,
  barWindow,
  commitPull,
  createSlider,
  floorY,
  releasePull,
  rungWidth,
} from "./release.js";

const VARIANTS = [CONNECT4, CONNECT5, CONNECT6, CONNECT7];

type Layout = ReturnType<typeof layoutFor>;

/**
 * Where a column's rung sits at this pull, measured from that column's centre
 * line — the whole mechanism in two numbers. Every column has the same one,
 * because the rungs are one part on the cell lattice.
 */
const rungSpan = (layout: Layout, pull: number): [number, number] => {
  const half = rungWidth(layout) / 2;
  return [pull * BAR_TRAVEL - half, pull * BAR_TRAVEL + half];
};

/** How much rung is still under the disc: positive is held, zero is falling. */
const overhang = (layout: Layout, pull: number): number =>
  layout.discRadius - rungSpan(layout, pull)[0];

describe("the release slider", () => {
  it("puts a rung under every column when it's locked", () => {
    for (const variant of VARIANTS) {
      const layout = layoutFor(variant);
      // Locked, the rung straddles the column's centre line: the disc is
      // standing on it, not balanced beside it.
      const [left, right] = rungSpan(layout, 0);
      expect(left).toBeLessThan(0);
      expect(right).toBeGreaterThan(0);
    }
  });

  it("shifts exactly half a cell, so the slots land under the columns", () => {
    const layout = layoutFor(CONNECT4);
    // A rung's home is a column centre; a full pull walks it to the midpoint
    // between that column and the next. Any other travel leaves the floor
    // half-open under every column at once.
    expect(layout.xOf(0) + BAR_TRAVEL).toBeCloseTo((layout.xOf(0) + layout.xOf(1)) / 2);
  });

  it("opens a slot a disc actually fits through", () => {
    for (const variant of VARIANTS) {
      const layout = layoutFor(variant);
      // Rung plus slot is one cell — that's what keeps the ladder in step with
      // the grid — so the slot is what's left over, and it has to clear a disc.
      expect(1 - rungWidth(layout)).toBeGreaterThan(2 * layout.discRadius);
    }
  });

  it("frees the whole board at one pull, near the end of the travel", () => {
    for (const variant of VARIANTS) {
      const layout = layoutFor(variant);
      const free = releasePull(layout);
      expect(free).toBeLessThanOrEqual(1);
      // Just short of it every disc is still held; at it, none are. There is
      // no per-column threshold to be wrong about.
      expect(overhang(layout, free - 0.02)).toBeGreaterThan(0);
      expect(overhang(layout, free)).toBeLessThanOrEqual(0);
      // A rung holds its disc until the last sliver of it is past, so this is
      // an event at the end of the pull rather than a slow leak.
      expect(free).toBeGreaterThan(0.9);
    }
  });

  it("commits at the detent, and never on an empty board", () => {
    expect(commitPull([3, 5, 1])).toBe(COMMIT_PULL);
    expect(commitPull([])).toBe(Infinity);
    // The detent has to come before the discs go, or letting go of a bar that
    // has already emptied the board would snap it shut under falling discs.
    expect(COMMIT_PULL).toBeLessThan(releasePull(layoutFor(CONNECT4)));
  });

  it("stands the bottom row on the bar and keeps the window clear of the holes", () => {
    for (const variant of VARIANTS) {
      const layout = layoutFor(variant);
      // The discs rest on the rungs — the floor is the mechanism, not a
      // decoration under it.
      expect(floorY(layout)).toBeCloseTo(layout.yOf(0) - layout.discRadius);
      const w = barWindow(layout);
      // Cut clear of the bottom row's holes above and the frame's edge below,
      // or the plate stops being one connected piece of geometry.
      expect(w.top).toBeLessThan(layout.yOf(0) - layout.holeRadius);
      expect(w.bottom).toBeGreaterThan(-layout.frameH / 2);
      expect(w.halfW).toBeLessThan(layout.frameW / 2);
    }
  });

  it("starts locked and uncommitted", () => {
    expect(createSlider()).toEqual({ pull: 0, grabbed: false, committed: false });
  });
});
