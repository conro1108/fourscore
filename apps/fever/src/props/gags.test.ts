/**
 * The picker's contract. Which act is funnier is a question for the harness;
 * what a test can hold is that the draw is fair, that it doesn't clump, and —
 * the one that actually matters — that no estimate can ever draw an act that
 * states a result.
 */

import { describe, expect, it } from "vitest";
import { candidatesFor, pickGag } from "./gags.js";
import { PROP_ACTS } from "./registry.js";
import { IDENTITIES } from "../bots/identity.js";
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

  /**
   * Every event still has something to answer it — except the idle beat in a
   * match, which has nothing on purpose and is checked separately below.
   */
  it("has an act for every event kind", () => {
    for (const kind of EVENT_KINDS) {
      const mode = kind === "idle-beat" ? "attract" : "match";
      const pools = SAMPLES.filter((e) => e.kind === kind).map((e) => candidatesFor(e, mode));
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
   * The ambient rule (Connor, 2026-08-09). In a match the stage answers what
   * you did and does nothing else — so the in-match idle pool is empty, and an
   * idle beat that somehow reached it would still draw nothing.
   *
   * The Director doesn't emit one in a match at all (`director.test.ts` holds
   * that end); this is the second lock, because the two halves of "no ambient"
   * live in different files and either alone would let it back in.
   */
  it("has nothing to answer an idle beat in a match", () => {
    const beat: SpectacleEvent = { kind: "idle-beat" };
    expect(candidatesFor(beat, "match")).toEqual([]);
    expect(pickGag(beat, () => 0.5, { mode: "match" })).toBeNull();
    // Not even the opponent's: a signature rides the idle beat on the menu
    // only, so it can't be the one thing that keeps ambient alive in a game.
    const moss = { bot: IDENTITIES.moss!, mode: "match" as const };
    expect(pickGag(beat, () => 0.5, moss)).toBeNull();

    // The menu still has its whole library, and the signature still rides it.
    expect(candidatesFor(beat, "attract").length).toBeGreaterThan(5);
    const attract = new Set(
      [0.1, 0.3, 0.5, 0.7, 0.9].map((r) =>
        pickGag(beat, () => r, { bot: IDENTITIES.moss!, mode: "attract" }),
      ),
    );
    expect(attract.has("mower-crawl")).toBe(true);
  });

  /**
   * What replaced the ambient beat: the acts that used to fill a quiet game now
   * answer moves, and there are enough of them per grade that three blunders
   * are not three identical clips. Two was the old floor and it was thin.
   */
  it("gives every grade that gets a reaction a real spread of them", () => {
    for (const quality of ["brilliant", "dubious", "blunder"] as const) {
      const pool = candidatesFor({ kind: "move", player: "red", col: 3, quality });
      expect(pool.length, quality).toBeGreaterThanOrEqual(3);
    }
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
    const rng = rolls(0.05, 0.3, 0.5, 0.7, 0.95);
    // One roll per candidate, with no `avoid`, so this is the weights alone.
    for (let i = 0; i < 10; i++) seen.add(pickGag(blunder, rng)!);
    expect(seen).toEqual(new Set(candidatesFor(blunder).map((c) => c.name)));
  });

  it("respects the weights", () => {
    // `mascot-flop` 3, `rocket-fizzle` 3, `callout-oof` 2, `piano-drop` 3,
    // `window-washer` 2 — thirteen, in that order.
    expect(pickGag(blunder, () => 0.1)).toBe("mascot-flop");
    expect(pickGag(blunder, () => 0.3)).toBe("rocket-fizzle");
    expect(pickGag(blunder, () => 0.5)).toBe("callout-oof");
    expect(pickGag(blunder, () => 0.7)).toBe("piano-drop");
    expect(pickGag(blunder, () => 0.95)).toBe("window-washer");
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
