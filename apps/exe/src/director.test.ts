import { describe, expect, it } from "vitest";
import { Match } from "@fourscore/engine";
import { makeDirector, tierOf, type Beat } from "./director.js";
import { clockText } from "./desktop.js";
import { BEAT_ACTS, POOL_KEYS, pickAct, poolKey } from "./beats.js";
import { BEAT_DIALOGS, BEAT_NOTES, BEAT_TITLES } from "./copy.js";

/** Run a director forward, collecting every beat it raises. */
const collect = (
  d: ReturnType<typeof makeDirector>,
  seconds: number,
  step = 0.5,
): Beat[] => {
  const out: Beat[] = [];
  for (let t = 0; t < seconds; t += step) {
    d.step(step);
    out.push(...d.takeBeats());
  }
  return out;
};

describe("tierOf", () => {
  it("cuts at the mock's thresholds", () => {
    expect(tierOf(0)).toBe(0);
    expect(tierOf(0.24)).toBe(0);
    expect(tierOf(0.25)).toBe(1);
    expect(tierOf(0.5)).toBe(2);
    expect(tierOf(0.75)).toBe(3);
    expect(tierOf(1)).toBe(4);
  });
});

describe("director", () => {
  it("idles low on a quiet position", () => {
    const d = makeDirector();
    d.feedEval(0.05, 4, 42);
    for (let i = 0; i < 120; i++) d.step(1);
    expect(d.snapshot().fever).toBeLessThan(0.25);
    expect(d.snapshot().tier).toBe(0);
  });

  it("climbs as the position sharpens, and crossing tiers takes time", () => {
    const d = makeDirector();
    d.feedEval(0.9, 30, 42);
    let crossed = 0;
    for (let i = 0; i < 60; i++) {
      const s = d.step(1);
      if (s && s.tier > crossed) crossed = s.tier;
    }
    expect(d.snapshot().fever).toBeGreaterThan(0.5);
    expect(crossed).toBeGreaterThanOrEqual(2);
  });

  it("a win shoves fever high immediately", () => {
    const d = makeDirector();
    d.event("win");
    expect(d.snapshot().fever).toBeGreaterThanOrEqual(0.8);
    d.step(10);
    expect(d.snapshot().fever).toBeGreaterThan(0.8);
  });

  it("the win peaks, holds, and then lets go on its own", () => {
    const d = makeDirector();
    d.event("win");
    // it gets all the way up: the screensaver is the point of the crescendo
    for (let i = 0; i < 20; i++) d.step(0.5);
    expect(d.snapshot().tier).toBe(4);
    // and it does not stay there — no new game, no input, just time
    for (let i = 0; i < 20; i++) d.step(0.5);
    expect(d.snapshot().tier).toBeLessThan(4);
    for (let i = 0; i < 80; i++) d.step(0.5);
    expect(d.snapshot().tier).toBe(0);
  });

  it("stewing on a loss still escalates before it lets go", () => {
    const d = makeDirector();
    d.event("loss");
    for (let i = 0; i < 30; i++) d.step(0.5);
    expect(d.snapshot().fever).toBeGreaterThan(0.75); // the stew
    for (let i = 0; i < 60; i++) d.step(0.5);
    expect(d.snapshot().tier).toBe(0);
  });

  it("a new game does not inherit the last one's fever", () => {
    const d = makeDirector();
    d.event("win");
    d.step(6);
    const hot = d.snapshot().fever;
    d.event("newGame");
    d.step(10);
    const cooler = d.snapshot().fever;
    expect(cooler).toBeLessThan(hot);
    expect(cooler).toBeLessThan(0.55); // Again shouldn't deal you a tier-4 board
  });

  it("cooling stops when it gets there, so the next game rises normally", () => {
    const d = makeDirector();
    d.event("win");
    for (let i = 0; i < 200; i++) d.step(0.5);
    d.event("newGame");
    d.feedEval(0.9, 30, 42);
    const before = d.snapshot().fever;
    d.step(1);
    expect(d.snapshot().fever).toBeGreaterThan(before);
  });

  it("pin overrides everything until unpinned", () => {
    const d = makeDirector();
    d.pin(0.85);
    expect(d.snapshot().tier).toBe(3);
    d.pin(null);
    expect(d.snapshot().tier).toBe(0);
  });

  /**
   * The regression this whole retune exists for. The live feed is `estimated`
   * and `advantageOf` caps an estimate at 0.5, so a director that reads
   * |advantage| as a 0..1 axis peaks around tier 1 and the desktop never
   * escalates. A late, sharp position has to clear tier 2 on the feed's own
   * numbers — not on numbers the feed cannot produce.
   */
  it("a sharp late position on the real estimate scale gets past tier 1", () => {
    const d = makeDirector();
    // 0.42 is inside the estimated band (p90 of real games is ~0.40)
    d.feedEval(0.42, 34, 42);
    for (let i = 0; i < 120; i++) d.step(0.5);
    expect(d.snapshot().tier).toBeGreaterThanOrEqual(3);
  });

  it("a level game still escalates on disc count alone", () => {
    const d = makeDirector();
    for (let ply = 1; ply <= 42; ply++) {
      d.feedEval(0.02, ply, 42); // dead level the whole way
      for (let i = 0; i < 6; i++) d.step(0.5);
    }
    // not tier 3 — nothing happened — but the desktop noticed the board filling
    expect(d.snapshot().tier).toBeGreaterThanOrEqual(2);
    expect(d.snapshot().tier).toBeLessThan(3);
  });

  it("tiers are sticky on the way down, so a level game stops flapping", () => {
    const d = makeDirector();
    d.feedEval(0.5, 20, 42);
    while (d.snapshot().tier < 1) d.step(0.5);
    // drift back just under the boundary — a wobble, not a retreat
    d.feedEval(0.0, 20, 42);
    let flaps = 0;
    let last = d.snapshot().tier;
    for (let i = 0; i < 12; i++) {
      d.step(0.5);
      if (d.snapshot().tier !== last) flaps++;
      last = d.snapshot().tier;
      d.feedEval(i % 2 ? 0.3 : 0.0, 20, 42);
    }
    expect(flaps).toBeLessThanOrEqual(1);
  });
});

describe("beats", () => {
  it("grades a move by what the mover gave up", () => {
    const d = makeDirector();
    d.feedPly({ mover: "you", threats: 0 });
    d.feedEval(0.1, 9, 42); // red to have moved at ply 9
    collect(d, 10);
    d.feedPly({ mover: "bot", threats: 0 });
    d.feedEval(0.5, 10, 42); // yellow moved and handed red 0.4
    const beats = collect(d, 5);
    expect(beats).toContainEqual({ kind: "move", by: "bot", grade: "blunder" });
  });

  it("an ordinary move is still a beat — that is the point", () => {
    const d = makeDirector();
    d.feedPly({ mover: "you", threats: 0 });
    d.feedEval(0.1, 9, 42);
    collect(d, 10);
    d.feedPly({ mover: "bot", threats: 0 });
    d.feedEval(0.09, 10, 42);
    expect(collect(d, 5)).toContainEqual({ kind: "move", by: "bot", grade: "fine" });
  });

  /**
   * The confidence law (CLAUDE.md). A finished game is scored `proven` (±1) and
   * the proven band starts above anything an estimate can reach, so grading
   * across the two would be arithmetic on different scales — and the resulting
   * "blunder" would be the software declaring that a move lost the game off an
   * estimate. The endgame is already the biggest thing on screen.
   */
  it("never grades across the proven/estimated boundary", () => {
    const d = makeDirector();
    d.feedPly({ mover: "you", threats: 0 });
    d.feedEval(0.2, 9, 42, "estimated");
    collect(d, 10);
    d.feedPly({ mover: "bot", threats: 0 });
    d.feedEval(-1, 10, 42, "proven"); // yellow just won
    expect(collect(d, 5).filter((b) => b.kind === "move")).toEqual([]);
  });

  it("a live threat is raised for whoever is about to move", () => {
    const d = makeDirector();
    d.feedPly({ mover: "you", threats: 2 });
    expect(collect(d, 2)).toContainEqual({ kind: "threat", by: "bot" });
  });

  it("an ordinary move cannot swallow a threat", () => {
    const d = makeDirector();
    // a `fine` beat, then a threat one ply later
    d.feedPly({ mover: "you", threats: 0 });
    d.feedEval(0.1, 9, 42);
    collect(d, 3);
    d.feedPly({ mover: "bot", threats: 0 });
    d.feedEval(0.1, 10, 42);
    collect(d, 2);
    d.feedPly({ mover: "you", threats: 1 });
    expect(collect(d, 2)).toContainEqual({ kind: "threat", by: "bot" });
  });

  it("the desktop does not machine-gun ordinary moves", () => {
    const d = makeDirector();
    for (let ply = 1; ply <= 12; ply++) {
      d.feedPly({ mover: ply % 2 ? "you" : "bot", threats: 0 });
      d.feedEval(0.1, ply, 42);
      collect(d, 1); // a ply a second, far faster than anyone plays
    }
    const fine = collect(d, 1).length;
    expect(fine).toBe(0);
  });

  it("a game that has ended raises nothing", () => {
    const d = makeDirector();
    d.event("win");
    d.feedPly({ mover: "you", threats: 3 });
    d.feedEval(0.4, 20, 42);
    expect(collect(d, 20)).toEqual([]);
  });

  it("a new game starts the beat clock over", () => {
    const d = makeDirector();
    d.event("win");
    collect(d, 5);
    d.event("newGame");
    d.feedPly({ mover: "you", threats: 1 });
    expect(collect(d, 2)).toContainEqual({ kind: "threat", by: "bot" });
  });
});

describe("the beat roster", () => {
  const always = (): number => 0.999999;
  const never = (): number => 0;

  it("every beat the director can raise has a pool", () => {
    const kinds: Beat[] = [
      { kind: "move", by: "you", grade: "brilliant" },
      { kind: "move", by: "you", grade: "fine" },
      { kind: "move", by: "you", grade: "dubious" },
      { kind: "move", by: "you", grade: "blunder" },
      { kind: "threat", by: "you" },
      { kind: "threat", by: "bot" },
      { kind: "swing", direction: "rising" },
      { kind: "swing", direction: "collapsing" },
    ];
    for (const b of kinds) expect(POOL_KEYS).toContain(poolKey(b));
  });

  it("every act that needs copy has copy in every pool that draws it", () => {
    // A `dialog` act with no dialog filed under its key is a beat that fires
    // and does nothing — silent, untypecheckable, and exactly the failure this
    // whole change is fixing.
    for (const key of POOL_KEYS) {
      const drawn = new Set<string>();
      for (let i = 0; i < 400; i++) {
        const act = pickAct(fromKey(key), () => i / 400, { fever: 1 });
        if (act) drawn.add(act);
      }
      if (drawn.has("dialog")) expect(BEAT_DIALOGS[key]?.length ?? 0).toBeGreaterThan(0);
      if (drawn.has("title-slip")) expect(BEAT_TITLES[key]?.length ?? 0).toBeGreaterThan(0);
      if (drawn.has("note")) expect(BEAT_NOTES[key]?.length ?? 0).toBeGreaterThan(0);
    }
  });

  it("an ordinary move is mostly silence", () => {
    // The share, not the literal weights — what matters is how often an
    // ordinary move is answered at all. Too high and the stage is empty; too
    // low and a reaction every move stops being a reaction.
    let silent = 0;
    const n = 2000;
    for (let i = 0; i < n; i++) {
      const act = pickAct({ kind: "move", by: "you", grade: "fine" }, () => i / n, { fever: 1 });
      if (!act) silent++;
    }
    expect(silent / n).toBeGreaterThan(0.5);
    expect(silent / n).toBeLessThan(0.68);
  });

  it("something always answers a blunder or a live threat", () => {
    for (const b of [
      { kind: "move", by: "you", grade: "blunder" },
      { kind: "threat", by: "bot" },
    ] as Beat[])
      for (const rng of [always, never, () => 0.5])
        expect(pickAct(b, rng, { fever: 1 })).not.toBeNull();
  });

  it("a cool desktop still reacts, just quietly", () => {
    // The fever gate loses the draw, not the beat.
    const loud = Object.entries(BEAT_ACTS)
      .filter(([, a]) => a.minFever > 0)
      .map(([k]) => k);
    for (let i = 0; i < 200; i++) {
      const act = pickAct({ kind: "move", by: "you", grade: "blunder" }, () => i / 200, { fever: 0 });
      expect(act).not.toBeNull();
      expect(loud).not.toContain(act);
    }
  });

  it("never plays the same act twice running when it has a choice", () => {
    for (const key of POOL_KEYS)
      for (let i = 0; i < 200; i++) {
        const act = pickAct(fromKey(key), () => i / 200, { avoid: "dialog", fever: 1 });
        expect(act).not.toBe("dialog");
      }
  });
});

/** The inverse of `poolKey`, for tests that iterate the pools. */
function fromKey(key: string): Beat {
  const [kind, rest] = key.split(":") as [string, string];
  if (kind === "move") return { kind: "move", by: "you", grade: rest as "fine" };
  if (kind === "threat") return { kind: "threat", by: rest as "you" };
  return { kind: "swing", direction: rest as "rising" };
}

describe("the clock", () => {
  it("keeps honest minutes from 6:66", () => {
    expect(clockText(0, 0)).toBe("6:66 PM");
    expect(clockText(2, 0)).toBe("6:68 PM");
    expect(clockText(2, 5)).toBe("6:73 PM");
  });
  it("never rolls over into sense", () => {
    expect(clockText(50, 22)).toBe("6:99 PM");
  });
});

describe("the harness game scripts stay legal", () => {
  // main.ts deep-links replay these; if the engine ever rejects one, the
  // screenshot harness dies silently. Keep them honest here.
  it("?state=win ends with red winning", () => {
    const m = Match.fromMoves([3, 4, 4, 3, 5, 2, 3, 2, 2, 4, 2]);
    expect(m.status).toBe("won");
    expect(m.winner).toBe("red");
  });
  it("?state=loss ends with yellow winning", () => {
    const m = Match.fromMoves([0, 6, 1, 6, 0, 6, 1, 6]);
    expect(m.status).toBe("won");
    expect(m.winner).toBe("yellow");
  });
  it("?state=midgame leaves yellow to move", () => {
    const m = Match.fromMoves([3, 2, 3, 3, 2, 4, 1]);
    expect(m.status).toBe("playing");
    expect(m.turn).toBe("yellow");
  });
});
