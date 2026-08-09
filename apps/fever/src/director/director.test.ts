/**
 * The Director is the only part of the spectacle machinery that can be tested
 * without eyes, which is exactly why it's pure. Two things are worth pinning:
 * the *shape* of the fever curve (monotone in the things it claims to respond
 * to, continuous, clamped) and the debouncing (each event fires once, for a
 * reason, and not in a stream).
 */

import { describe, expect, it } from "vitest";
import {
  TUNING,
  advance,
  feverTarget,
  initialDirectorState,
  type DirectorInput,
  type DirectorState,
} from "./director.js";
import type { EvalPoint } from "./feed.js";
import type { SpectacleEvent } from "./types.js";

const est = (advantage: number): EvalPoint => ({ advantage, source: "estimated" });
const proven = (advantage: number): EvalPoint => ({ advantage, source: "proven" });

function input(over: Partial<DirectorInput> = {}): DirectorInput {
  return {
    generation: 1,
    moves: [],
    points: [est(0)],
    status: "playing",
    winner: null,
    winningLine: [],
    immediateThreats: { red: 0, yellow: 0 },
    cells: 42,
    mode: "match",
    bot: "moss",
    ...over,
  };
}

/** A level game `n` plies long, so the disc-count floor can be isolated. */
const levelGame = (n: number): Partial<DirectorInput> => ({
  moves: Array.from({ length: n }, (_, i) => i % 7),
  points: Array.from({ length: n + 1 }, () => est(0)),
});

/** Run `ms` of ticks at 16ms, collecting every event emitted along the way. */
function run(
  state: DirectorState,
  inp: DirectorInput,
  ms: number,
): { state: DirectorState; events: SpectacleEvent[] } {
  const events: SpectacleEvent[] = [];
  let s = state;
  for (let t = 0; t < ms; t += 16) {
    const r = advance(s, inp, 16);
    s = r.state;
    events.push(...r.frame.events);
  }
  return { state: s, events };
}

/** Fever after settling on a fixed input, which is what the target means. */
function settle(inp: DirectorInput, ms = 20_000): number {
  let s = advance(initialDirectorState(0), inp, 16).state;
  return run(s, inp, ms).state.fever;
}

describe("fever curve", () => {
  it("stays in 0..1 across the whole range of inputs", () => {
    for (const a of [-1, -0.55, -0.2, 0, 0.2, 0.55, 1]) {
      for (const plies of [0, 10, 41]) {
        const f = feverTarget(
          input({ ...levelGame(plies), points: [est(0), est(a), est(-a), est(a)] }),
        );
        expect(f).toBeGreaterThanOrEqual(0);
        expect(f).toBeLessThanOrEqual(1);
      }
    }
  });

  it("rises with |advantage|, whichever side is winning", () => {
    const at = (a: number) =>
      feverTarget(input({ moves: [0], points: [est(0), est(a)] }));
    expect(at(0.3)).toBeGreaterThan(at(0.1));
    expect(at(0.5)).toBeGreaterThan(at(0.3));
    expect(at(-0.4)).toBeCloseTo(at(0.4), 10);
  });

  it("rises with volatility at the same |advantage|", () => {
    const calm = feverTarget(input({ moves: [0, 1, 2, 3], points: [est(0.2), est(0.2), est(0.2), est(0.2), est(0.2)] }));
    const wild = feverTarget(input({ moves: [0, 1, 2, 3], points: [est(-0.2), est(0.2), est(-0.2), est(0.2), est(0.2)] }));
    expect(wild).toBeGreaterThan(calm);
  });

  it("creeps up with disc count even in a dead level game", () => {
    const early = feverTarget(input(levelGame(4)));
    const late = feverTarget(input(levelGame(38)));
    expect(early).toBeLessThan(late);
    expect(late).toBeGreaterThan(0.3);
    // The floor is a floor, not the whole curve: a level game never maxes out.
    expect(late).toBeLessThan(TUNING.floorMax + 0.01);
  });

  it("creeps up in a straight line, not in a late rush", () => {
    // Equal quarters of a level game should each add about the same fever. The
    // curve has been sub-linear before and read as "nothing, then the finale";
    // this is the assertion that noticed.
    const at = (n: number) => feverTarget(input(levelGame(n)));
    const steps = [at(10) - at(0), at(20) - at(10), at(30) - at(20), at(40) - at(30)];
    for (const step of steps) expect(step).toBeCloseTo(steps[0]!, 6);
    expect(steps[0]!).toBeGreaterThan(0.1);
  });

  it("derives the floor from the variant's cell count, not from 42", () => {
    const c4 = feverTarget(input({ ...levelGame(21), cells: 42 }));
    const c5 = feverTarget(input({ ...levelGame(21), cells: 72 }));
    expect(c5).toBeLessThan(c4);
  });

  it("approaches its target and never overshoots it", () => {
    const inp = input({ moves: [0], points: [est(0), est(0.5)] });
    const target = feverTarget(inp);
    let s = advance(initialDirectorState(0), inp, 16).state;
    for (let i = 0; i < 400; i++) {
      s = advance(s, inp, 16).state;
      expect(s.fever).toBeLessThanOrEqual(target + 1e-9);
    }
    expect(s.fever).toBeCloseTo(target, 3);
  });

  it("moves continuously — no tick jumps, except a win", () => {
    const sharp = input({ moves: [0], points: [est(0), est(0.55)] });
    let s = advance(initialDirectorState(0), sharp, 16).state;
    let previous = s.fever;
    for (let i = 0; i < 200; i++) {
      s = advance(s, sharp, 16).state;
      expect(Math.abs(s.fever - previous)).toBeLessThan(0.05);
      previous = s.fever;
    }

    const won = input({
      ...sharp,
      status: "won",
      winner: "red",
      winningLine: [1, 2, 3, 4],
    });
    const after = advance(s, won, 16);
    expect(after.state.fever).toBe(1);
    expect(after.frame.events).toContainEqual({
      kind: "win",
      player: "red",
      line: [1, 2, 3, 4],
    });
  });

  it("rises faster than it falls", () => {
    const hot = input({ moves: [0], points: [est(0), est(0.55)] });
    const cold = input({ moves: [0], points: [est(0), est(0)] });
    const risen = run(initialDirectorState(1), hot, 600).state;
    const fallen = run(risen, cold, 600).state;
    expect(risen.fever).toBeGreaterThan(0.3);
    // Six hundred milliseconds of nothing does not undo it.
    expect(fallen.fever).toBeGreaterThan(risen.fever * 0.5);
  });

  it("settles high for a decided game and low for a level opening", () => {
    expect(settle(input({ moves: [0], points: [est(0), est(0.55)] }))).toBeGreaterThan(0.5);
    expect(settle(input(levelGame(2)))).toBeLessThan(0.1);
  });

  it("resets to a cold, silent world on a new game", () => {
    const hot = run(
      initialDirectorState(1),
      input({ moves: [0], points: [est(0), est(0.55)], immediateThreats: { red: 1, yellow: 0 } }),
      2000,
    ).state;
    expect(hot.fever).toBeGreaterThan(0.4);

    const next = advance(hot, input({ generation: 2 }), 16);
    expect(next.state.fever).toBe(0);
    expect(next.state.generation).toBe(2);
    expect(next.frame.events).toEqual([]);
  });
});

describe("move events", () => {
  const played = (cols: number[], advantages: number[]) =>
    input({ moves: cols, points: advantages.map(est) });

  it("fires once per move, as soon as the eval lands", () => {
    let s = advance(initialDirectorState(0), input(), 16).state;

    // Move committed, eval not back yet: held, not fired.
    const pending = played([3], [0]);
    const first = advance(s, pending, 16);
    expect(first.frame.events).toEqual([]);

    const graded = played([3], [0, -0.05]);
    const second = advance(first.state, graded, 16);
    expect(second.frame.events).toEqual([
      { kind: "move", player: "red", col: 3, quality: "fine" },
    ]);

    // And not again on every subsequent tick.
    expect(run(second.state, graded, 2000).events.filter((e) => e.kind === "move")).toEqual(
      [],
    );
  });

  it("gives up waiting for an eval and fires ungraded", () => {
    let s = advance(initialDirectorState(0), input(), 16).state;
    const pending = played([3], [0]);
    const r = run(s, pending, TUNING.gradeWait + 200);
    const moves = r.events.filter((e) => e.kind === "move");
    expect(moves).toEqual([{ kind: "move", player: "red", col: 3, quality: "fine" }]);
  });

  it("grades by what the move gave up, from the mover's side", () => {
    /** Play the game out one ply at a time and grade the final move. */
    const quality = (cols: number[], advantages: number[]) => {
      let s = initialDirectorState(1);
      const events: SpectacleEvent[] = [];
      for (let n = 0; n <= cols.length; n++) {
        const r = advance(s, played(cols.slice(0, n), advantages.slice(0, n + 1)), 16);
        s = r.state;
        events.push(...r.frame.events);
      }
      const moves = events.filter((e) => e.kind === "move");
      const last = moves[moves.length - 1];
      return last?.kind === "move" ? last.quality : null;
    };

    // Even plies are red's. Advantage is red's point of view, so red's own
    // number falling is red giving something up.
    expect(quality([3, 4, 5], [0, 0, 0, -0.4])).toBe("blunder");
    expect(quality([3, 4, 5], [0, 0, 0, -0.15])).toBe("dubious");
    expect(quality([3, 4, 5], [0, 0, 0, -0.02])).toBe("fine");

    // Yellow moves on odd plies, so the same red-POV drop is yellow's gain.
    expect(quality([3, 4], [0, 0, 0.4])).toBe("blunder");
    expect(quality([3, 4], [0, 0, -0.4])).toBe("brilliant");
  });

  it("calls the move that wins the game brilliant without mixing scales", () => {
    let s = advance(initialDirectorState(0), input(), 16).state;
    const before = input({ moves: [3, 4], points: [est(0), est(0.05), est(0.05)] });
    s = advance(s, before, 16).state;
    const won = input({
      moves: [3, 4, 5],
      points: [est(0), est(0.05), est(0.05), proven(1)],
      status: "won",
      winner: "red",
      winningLine: [0, 1, 2, 3],
    });
    const r = advance(s, won, 16);
    expect(r.frame.events).toContainEqual({
      kind: "move",
      player: "red",
      col: 5,
      quality: "brilliant",
    });
  });
});

describe("event debouncing", () => {
  it("fires a threat when one appears, then holds off", () => {
    let s = advance(initialDirectorState(0), input(), 16).state;
    const threatened = input({ immediateThreats: { red: 1, yellow: 0 } });
    const first = advance(s, threatened, 16);
    expect(first.frame.events).toEqual([{ kind: "threat", player: "red" }]);

    // A standing threat is not a new one.
    const quiet = run(first.state, threatened, 5000);
    expect(quiet.events.filter((e) => e.kind === "threat")).toEqual([]);

    // A second, separate threat inside the cooldown stays quiet.
    let s2 = advance(first.state, input({ immediateThreats: { red: 2, yellow: 0 } }), 16);
    expect(s2.frame.events.filter((e) => e.kind === "threat")).toEqual([]);
  });

  it("tells the two players' threats apart", () => {
    let s = advance(initialDirectorState(0), input(), 16).state;
    const r = advance(s, input({ immediateThreats: { red: 1, yellow: 1 } }), 16);
    expect(r.frame.events).toEqual([
      { kind: "threat", player: "red" },
      { kind: "threat", player: "yellow" },
    ]);
  });

  it("emits a tension shift as a beat, not a stream", () => {
    const hot = input({ moves: [0], points: [est(0), est(0.55)] });
    const r = run(initialDirectorState(1), hot, 12_000);
    const shifts = r.events.filter((e) => e.kind === "tension-shift");
    expect(shifts.length).toBeGreaterThan(0);
    expect(shifts.length).toBeLessThanOrEqual(2);
    expect(shifts[0]).toEqual({ kind: "tension-shift", direction: "rising" });

    // Coming back down reads as collapsing.
    const cold = input({ moves: [0], points: [est(0), est(0)] });
    const down = run(r.state, cold, 12_000);
    expect(down.events).toContainEqual({ kind: "tension-shift", direction: "collapsing" });
  });

  /**
   * The ambient rule (Connor, 2026-08-09): in a match the stage answers what
   * happened and does nothing otherwise. Two minutes of a game in which
   * nothing whatsoever occurs produces nothing whatsoever.
   *
   * This is the assertion the whole change rests on, and it is worth stating as
   * "zero" rather than as "few": the previous two attempts at this were tuning
   * — 7s to 16s, then a smaller pool — and a rate that is merely low still
   * makes the screen something that performs on its own schedule.
   */
  it("never beats idly in a match", () => {
    const idle = run(initialDirectorState(1), input(), 120_000);
    expect(idle.events.filter((e) => e.kind === "idle-beat")).toEqual([]);
  });

  it("beats on the menu, where they are the whole show", () => {
    const beats = run(initialDirectorState(1), input({ mode: "attract" }), 30_000).events.filter(
      (e) => e.kind === "idle-beat",
    );
    expect(beats.length).toBeGreaterThan(8);
    // The quiet rule still holds: an idle beat waits for a gap.
    expect(30_000 / beats.length).toBeGreaterThanOrEqual(TUNING.attractIdlePeriod);

    // And it waits for the *stage* to be quiet, not just the clock. A threat
    // resets the gap, so no beat lands on top of one.
    let s = advance(initialDirectorState(0), input({ mode: "attract" }), 16).state;
    s = run(s, input({ mode: "attract" }), TUNING.attractIdlePeriod).state;
    const threatened = input({ mode: "attract", immediateThreats: { red: 1, yellow: 0 } });
    const busy = advance(s, threatened, 16);
    const after = run(busy.state, threatened, 1000);
    expect(after.events.filter((e) => e.kind === "idle-beat")).toEqual([]);
  });

  it("ends the game exactly once", () => {
    const drawn = input({ status: "draw", moves: Array.from({ length: 42 }, (_, i) => i % 7) });
    const r = run(initialDirectorState(1), drawn, 5000);
    expect(r.events.filter((e) => e.kind === "draw")).toEqual([{ kind: "draw" }]);
  });
});
