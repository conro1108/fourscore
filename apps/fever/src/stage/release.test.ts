import { describe, expect, it } from "vitest";
import { CONNECT4, CONNECT5 } from "@fourscore/engine";
import { layoutFor } from "./layout.js";
import { commitPull, createTray, pullToFree } from "./release.js";

describe("release tray math", () => {
  it("frees columns left to right as the tray opens", () => {
    for (const variant of [CONNECT4, CONNECT5]) {
      const layout = layoutFor(variant);
      let prev = 0;
      for (let col = 0; col < variant.width; col++) {
        const p = pullToFree(layout, col);
        expect(p).toBeGreaterThan(prev);
        expect(p).toBeLessThanOrEqual(1);
        prev = p;
      }
    }
  });

  it("frees every column by a full pull", () => {
    const layout = layoutFor(CONNECT4);
    expect(pullToFree(layout, CONNECT4.width - 1)).toBeLessThanOrEqual(1);
  });

  it("commits at the leftmost occupied column, and never on an empty board", () => {
    const layout = layoutFor(CONNECT4);
    expect(commitPull(layout, [3, 5, 1])).toBe(pullToFree(layout, 1));
    expect(commitPull(layout, [])).toBe(Infinity);
  });

  it("starts closed and uncommitted", () => {
    expect(createTray()).toEqual({ pull: 0, grabbed: false, committed: false });
  });
});
