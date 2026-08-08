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

const FINE: SpectacleEvent = { kind: "move", player: "red", col: 3, quality: "fine" };

describe("the gag pools", () => {
  it("names only acts that exist, for every event", () => {
    for (const event of [...SAMPLES, FINE]) {
      for (const mode of ["match", "attract"] as const) {
        for (const c of candidatesFor(event, mode)) {
          if (c.name !== null) expect(PROP_ACTS[c.name], `${event.kind}: ${c.name}`).toBeDefined();
          expect(c.weight, c.name ?? "silence").toBeGreaterThan(0);
        }
      }
    }
  });

  it("has an act for every event kind", () => {
    for (const kind of EVENT_KINDS) {
      const pools = SAMPLES.filter((e) => e.kind === kind).map((e) => candidatesFor(e));
      expect(pools.length, kind).toBeGreaterThan(0);
      expect(
        pools.some((pool) => pool.some((c) => c.name !== null)),
        kind,
      ).toBe(true);
    }
  });

  /**
   * The ordinary move, which is ~85% of them. It has a pool now — a lane screen
   * reacts to throws and not to quality — but the pool is mostly silence, and
   * these two numbers are the whole of the tuning: a screen that answers every
   * move is a screen with no spikes left for the moves that matter.
   */
  it("leaves most ordinary moves alone", () => {
    const pool = candidatesFor(FINE);
    const total = pool.reduce((sum, c) => sum + c.weight, 0);
    const silence = pool.find((c) => c.name === null)!.weight;
    expect(silence / total).toBeGreaterThan(0.7);
    expect(silence / total).toBeLessThan(0.95);
  });

  /**
   * And what it does answer with may not read as a verdict. The grade is this
   * engine's estimate either way, but `fine` is the one grade where the screen
   * is reacting to the *fact* that you moved — so its acts are the two that
   * cannot be mistaken for an opinion about the move: an interlude that has
   * nothing to do with the game and a word with nothing in it.
   */
  it("answers an ordinary move only with acts that claim nothing", () => {
    for (const c of candidatesFor(FINE)) {
      if (c.name === null) continue;
      expect(PROP_ACTS[c.name]!.declares, c.name).toBeFalsy();
      expect(["deep-space", "callout-incredible", "callout-a-move"]).toContain(c.name);
    }
  });

  /**
   * The menu and a match answer the same beat from different lists: on the menu
   * the props are the content, in a game they are punctuation.
   */
  it("runs a smaller idle pool in a match than on the menu", () => {
    const beat: SpectacleEvent = { kind: "idle-beat" };
    const match = candidatesFor(beat, "match");
    const attract = candidatesFor(beat, "attract");
    expect(attract.length).toBeGreaterThan(match.length);
    // Nothing loud in the in-match pool: every act it can draw is one that
    // costs nothing to see again.
    for (const c of match) expect(["truck-lap", "win-detonation"]).not.toContain(c.name);
  });

  /**
   * The claims law, mechanically. `win` and `draw` are the only facts on the
   * bus, so they are the only pools allowed to hold an act that says how the
   * game went — everything else may be as loud as it likes and may not name an
   * outcome (`director/types.ts`).
   */
  it("never lets an estimate draw an act that declares a result", () => {
    for (const event of [...SAMPLES, FINE]) {
      const fact = event.kind === "win" || event.kind === "draw";
      for (const mode of ["match", "attract"] as const) {
        for (const c of candidatesFor(event, mode)) {
          if (c.name === null) continue;
          if (PROP_ACTS[c.name]!.declares) expect(fact, `${event.kind} -> ${c.name}`).toBe(true);
        }
      }
    }
    // And the two that do declare are still there to be drawn.
    expect(candidatesFor({ kind: "win", player: "red", line: [] })[0]!.name).toBe("win-detonation");
    expect(candidatesFor({ kind: "draw" })[0]!.name).toBe("callout-draw");
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

  /**
   * Silence is drawn, not decided beforehand — so it keeps its share of the
   * pool whatever else is going on. A busy stage must not make the screen
   * *more* talkative about ordinary moves, which is what a coin flipped before
   * the draw would have done: the silence entry would have been the only
   * candidate left standing and then been vetoed into an act.
   */
  it("draws silence for an ordinary move, and a veto can't undo it", () => {
    expect(pickGag(FINE, () => 0.1)).toBeNull();
    expect(pickGag(FINE, () => 0.95)).not.toBeNull();
    expect(pickGag(FINE, () => 0.1, { eligible: () => false })).toBeNull();
    // `avoid` can't reach it either: the screen may do nothing twice running.
    expect(pickGag(FINE, () => 0.1, { avoid: "deep-space" })).toBeNull();
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
