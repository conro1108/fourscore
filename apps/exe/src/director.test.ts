import { describe, expect, it } from "vitest";
import { Match } from "@fourscore/engine";
import { makeDirector, type Beat } from "./director.js";
import { POOL_KEYS, pickAct } from "./beats.js";
import { BEAT_DIALOGS, BEAT_NOTES, BEAT_TITLES } from "./copy.js";

describe("director", () => {
  it("a win shoves fever high immediately", () => {
    const d = makeDirector();
    d.event("win");
    expect(d.snapshot().fever).toBeGreaterThanOrEqual(0.8);
    d.step(10);
    expect(d.snapshot().fever).toBeGreaterThan(0.8);
  });

  it("leaving the ending starts the desktop coming down at once", () => {
    const d = makeDirector();
    d.event("win");
    for (let i = 0; i < 12; i++) d.step(0.5); // the crescendo, mid-hold
    expect(d.snapshot().tier).toBe(4);
    d.event("dismissed");
    for (let i = 0; i < 4; i++) d.step(0.5);
    expect(d.snapshot().tier).toBeLessThan(4); // and it is already letting go
    for (let i = 0; i < 40; i++) d.step(0.5);
    expect(d.snapshot().tier).toBe(0);
  });


  it("a sharp late position on the real estimate scale gets past tier 1", () => {
    const d = makeDirector();
    // 0.42 is inside the estimated band (p90 of real games is ~0.40)
    d.feedEval(0.42, 34, 42);
    for (let i = 0; i < 120; i++) d.step(0.5);
    expect(d.snapshot().tier).toBeGreaterThanOrEqual(3);
  });
});

function fromKey(key: string): Beat {
  const [kind, rest] = key.split(":") as [string, string];
  if (kind === "move") return { kind: "move", by: "you", grade: rest as "fine" };
  if (kind === "threat") return { kind: "threat", by: rest as "you" };
  return { kind: "swing", direction: rest as "rising" };
}

describe("the beat roster", () => {
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
});

describe("the harness game scripts stay legal", () => {
  // main.ts deep-links replay these; if the engine ever rejects one, the
  // screenshot harness dies silently. Keep them honest here.
  it("win, loss and midgame all replay to the state they claim", () => {
    const win = Match.fromMoves([3, 4, 4, 3, 5, 2, 3, 2, 2, 4, 2]);
    expect([win.status, win.winner]).toEqual(["won", "red"]);
    const loss = Match.fromMoves([0, 6, 1, 6, 0, 6, 1, 6]);
    expect([loss.status, loss.winner]).toEqual(["won", "yellow"]);
    const mid = Match.fromMoves([3, 2, 3, 3, 2, 4, 1]);
    expect([mid.status, mid.turn]).toEqual(["playing", "yellow"]);
  });
});
