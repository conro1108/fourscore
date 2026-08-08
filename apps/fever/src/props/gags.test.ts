/**
 * The picker's contract. Which act is funnier is a question for the harness;
 * what a test can hold is that the draw is fair, that it doesn't clump, and —
 * the one that actually matters — that no estimate can ever draw an act that
 * states a result.
 */

import { describe, expect, it } from "vitest";
import { candidatesFor, pickGag } from "./gags.js";
import { PROP_ACTS } from "./registry.js";
import { EVENT_KINDS, type SpectacleEvent } from "../director/types.js";

/** One representative event per kind — the same set the debug panel fires. */
const SAMPLES: SpectacleEvent[] = [
  { kind: "move", player: "red", col: 3, quality: "brilliant" },
  { kind: "move", player: "red", col: 3, quality: "dubious" },
  { kind: "move", player: "red", col: 3, quality: "blunder" },
  { kind: "threat", player: "yellow" },
  { kind: "tension-shift", direction: "rising" },
  { kind: "tension-shift", direction: "collapsing" },
  { kind: "win", player: "red", line: [] },
  { kind: "draw" },
  { kind: "idle-beat" },
];

/** A cycling stand-in for `Math.random`, so a draw is a decision not a dice roll. */
const rolls = (...values: number[]): (() => number) => {
  let i = 0;
  return () => values[i++ % values.length]!;
};

describe("the gag pools", () => {
  it("names only acts that exist, for every event", () => {
    for (const event of SAMPLES) {
      for (const c of candidatesFor(event)) {
        expect(PROP_ACTS[c.name], `${event.kind}: ${c.name}`).toBeDefined();
        expect(c.weight, c.name).toBeGreaterThan(0);
      }
    }
  });

  it("has an act for every event kind but the ordinary move", () => {
    for (const kind of EVENT_KINDS) {
      const pools = SAMPLES.filter((e) => e.kind === kind).map(candidatesFor);
      expect(pools.length, kind).toBeGreaterThan(0);
      expect(
        pools.some((pool) => pool.length > 0),
        kind,
      ).toBe(true);
    }
    expect(candidatesFor({ kind: "move", player: "red", col: 3, quality: "fine" })).toEqual([]);
    expect(pickGag({ kind: "move", player: "red", col: 3, quality: "fine" }, Math.random)).toBeNull();
  });

  /**
   * The claims law, mechanically. `win` and `draw` are the only facts on the
   * bus, so they are the only pools allowed to hold an act that says how the
   * game went — everything else may be as loud as it likes and may not name an
   * outcome (`director/types.ts`).
   */
  it("never lets an estimate draw an act that declares a result", () => {
    for (const event of SAMPLES) {
      const fact = event.kind === "win" || event.kind === "draw";
      for (const c of candidatesFor(event)) {
        if (PROP_ACTS[c.name]!.declares) expect(fact, `${event.kind} -> ${c.name}`).toBe(true);
      }
    }
    // And the two that do declare are still there to be drawn.
    expect(candidatesFor({ kind: "win", player: "red", line: [] })[0]!.name).toBe("win-detonation");
    expect(candidatesFor({ kind: "draw" })[0]!.name).toBe("banner-draw");
  });

  it("ends the game the same way every time", () => {
    const ends: SpectacleEvent[] = [{ kind: "win", player: "red", line: [] }, { kind: "draw" }];
    for (const event of ends) {
      const drawn = new Set([0, 0.3, 0.999].map((r) => pickGag(event, () => r)));
      expect(drawn.size, event.kind).toBe(1);
    }
  });
});

describe("drawing a gag", () => {
  const blunder: SpectacleEvent = { kind: "move", player: "red", col: 3, quality: "blunder" };

  it("spreads a grade over its whole pool", () => {
    const seen = new Set<string>();
    const rng = rolls(0.05, 0.4, 0.6, 0.9);
    // Four draws with no `avoid`, so this is the weights alone.
    for (let i = 0; i < 8; i++) seen.add(pickGag(blunder, rng)!);
    expect(seen).toEqual(new Set(candidatesFor(blunder).map((c) => c.name)));
  });

  it("respects the weights", () => {
    // `mascot-flop` 3, `rocket-fizzle` 3, `callout-oof` 2, of 8.
    expect(pickGag(blunder, () => 0.1)).toBe("mascot-flop");
    expect(pickGag(blunder, () => 0.5)).toBe("rocket-fizzle");
    expect(pickGag(blunder, () => 0.9)).toBe("callout-oof");
  });

  it("never plays the same act twice running", () => {
    // The rng is pinned to the first candidate; only `avoid` can move it.
    const first = pickGag(blunder, () => 0)!;
    const second = pickGag(blunder, () => 0, { avoid: first })!;
    expect(second).not.toBe(first);
  });

  it("plays a repeat rather than nothing when the pool is one deep", () => {
    const collapsing: SpectacleEvent = { kind: "tension-shift", direction: "collapsing" };
    const only = pickGag(collapsing, () => 0.5)!;
    expect(pickGag(collapsing, () => 0.5, { avoid: only })).toBe(only);
  });

  it("loses the act to a veto, not the reaction", () => {
    // The stage's rule: the drawn act's berth is taken, so the draw happens
    // again over what's left instead of the event going unanswered.
    const busy = (berth: string) =>
      pickGag(blunder, () => 0.1, { eligible: (act) => act.berth !== berth });
    expect(busy("floor")).not.toBe("mascot-flop");
    expect(busy("floor")).not.toBeNull();
    // Everything vetoed is the one case that gives nothing back.
    expect(pickGag(blunder, () => 0.1, { eligible: () => false })).toBeNull();
  });
});
