/**
 * The review's one load-bearing claim is "this deal could be won", and the
 * only thing that makes it worth saying is that the search hands back the
 * line it won with. So the test replays that line through the *game's* own
 * rules — `solstate.ts`, the same functions the felt calls when you drag a
 * card — and requires it to arrive at fifty-two home.
 *
 * The search's own move generator could be wrong in a way the search can't
 * see; the game's rules can't be, because you would be playing an illegal
 * game. Two implementations, one answer, and the disagreement is the bug.
 */

import { describe, expect, it } from "vitest";
import {
  canFoundation,
  canStackTableau,
  deal,
  drawFromStock,
  isWon,
  type Card,
  type SolState,
} from "./solstate.js";
import { reviewGame, solve, type Mv } from "./solreview.js";

const seeded = (seed: number) => {
  let s = seed;
  return (): number => ((s = (s * 48271) % 2147483647) / 2147483647);
};

const copy = (s: SolState): SolState => ({
  stock: [...s.stock],
  waste: [...s.waste],
  found: s.found.map((p) => [...p]),
  tab: s.tab.map((t) => ({ down: [...t.down], up: [...t.up] })),
});

const top = (p: readonly Card[]): Card | null => (p.length ? p[p.length - 1]! : null);

/** Play the search's line on a real table, refusing anything illegal. */
function replay(start: SolState, line: readonly Mv[]): SolState {
  const s = copy(start);
  const flip = (i: number): void => {
    const t = s.tab[i]!;
    if (!t.up.length && t.down.length) t.up.push(t.down.pop()!);
  };
  for (const m of line) {
    if (m.k === "draw") {
      expect(s.stock.length + s.waste.length).toBeGreaterThan(0);
      drawFromStock(s);
      continue;
    }
    if (m.k === "wf") {
      const c = top(s.waste)!;
      expect(c).toBeTruthy();
      expect(canFoundation(c, s.found[c.suit]!)).toBe(true);
      s.found[c.suit]!.push(s.waste.pop()!);
      continue;
    }
    if (m.k === "wt") {
      const c = top(s.waste)!;
      expect(c).toBeTruthy();
      expect(canStackTableau(c, top(s.tab[m.to]!.up))).toBe(true);
      // a king only lands in a column with nothing under it either
      if (!s.tab[m.to]!.up.length) expect(s.tab[m.to]!.down.length).toBe(0);
      s.tab[m.to]!.up.push(s.waste.pop()!);
      continue;
    }
    if (m.k === "tf") {
      const c = top(s.tab[m.from]!.up)!;
      expect(c).toBeTruthy();
      expect(canFoundation(c, s.found[c.suit]!)).toBe(true);
      s.found[c.suit]!.push(s.tab[m.from]!.up.pop()!);
      flip(m.from);
      continue;
    }
    const from = s.tab[m.from]!;
    const head = from.up[m.at];
    expect(head).toBeTruthy();
    expect(canStackTableau(head!, top(s.tab[m.to]!.up))).toBe(true);
    if (!s.tab[m.to]!.up.length) expect(s.tab[m.to]!.down.length).toBe(0);
    s.tab[m.to]!.up.push(...from.up.splice(m.at));
    flip(m.from);
  }
  return s;
}

/* Deals this machine wins in a few hundred nodes — the suite is not the place
   to spend a second a deal, and the point here is the line, not the search. */
const WINNABLE = [1, 5, 9, 11].map((i) => i * 7919);

describe("solve", () => {
  for (const seed of WINNABLE) {
    it(`wins deal ${seed} with a line the game's own rules accept`, () => {
      const start = deal(seeded(seed));
      const r = solve(start, { nodes: 60_000, ms: 5000 });
      expect(r.verdict).toBe("won");
      expect(r.line.length).toBeGreaterThan(0);
      expect(isWon(replay(start, r.line))).toBe(true);
    });
  }

  it("says unknown, never lost, when there is nothing left to do", () => {
    // one card, in the wrong place, with nothing to draw: dead, and the
    // search still only reports that it couldn't find a way
    const stuck: SolState = {
      stock: [],
      waste: [],
      found: [[], [], [], []],
      tab: [
        { down: [{ rank: 5, suit: 0 }], up: [{ rank: 7, suit: 1 }] },
        ...Array.from({ length: 6 }, () => ({ down: [] as Card[], up: [] as Card[] })),
      ],
    };
    const r = solve(stuck, { nodes: 10_000, ms: 1000 });
    expect(r.verdict).toBe("unknown");
    expect(r.line).toEqual([]);
    expect(r.nodes).toBeLessThan(100);
  });
});

describe("reviewGame", () => {
  /** A deal, a draw, a draw, and the deck going round. */
  const journalOf = (start: SolState): SolState[] => {
    const out = [copy(start)];
    const s = copy(start);
    // empty the stock into the waste, then round it goes
    while (s.stock.length) {
      drawFromStock(s);
      out.push(copy(s));
    }
    drawFromStock(s);
    out.push(copy(s));
    return out;
  };

  it("counts what you did, off the journal alone", () => {
    const start = deal(seeded(3 * 7919));
    const j = journalOf(start);
    const r = reviewGame(j, { nodes: 1, ms: 1 }); // no search: counts only
    expect(r.draws).toBe(24);
    expect(r.passes).toBe(1);
    expect(r.moves).toBe(0);
    expect(r.flipped).toBe(0);
    expect(r.homed).toBe(0);
    expect(r.won).toBe(false);
    expect(r.spent).toBe(true);
  });

  it("asks nothing of a game you won", () => {
    const done: SolState = {
      stock: [],
      waste: [],
      found: [0, 1, 2, 3].map((suit) => Array.from({ length: 13 }, (_, i) => ({ rank: i + 1, suit }))),
      tab: Array.from({ length: 7 }, () => ({ down: [] as Card[], up: [] as Card[] })),
    };
    const r = reviewGame([done, done]);
    expect(r.won).toBe(true);
    expect(r.deal).toBe("won");
    expect(r.end).toBe("won");
    expect(r.homed).toBe(52);
    expect(r.spent).toBe(false);
  });

  it("finds the last state it can still win from, and proves that one", () => {
    const live = deal(seeded(1 * 7919)); // winnable in a few hundred nodes
    const dead: SolState = {
      stock: [],
      waste: [],
      found: [[], [], [], []],
      tab: [
        { down: [{ rank: 5, suit: 0 }], up: [{ rank: 7, suit: 1 }] },
        ...Array.from({ length: 6 }, () => ({ down: [] as Card[], up: [] as Card[] })),
      ],
    };
    // the journal is only ever a list of positions to this function
    const r = reviewGame([live, live, live, dead, dead], { nodes: 200_000, ms: 5000 });
    expect(r.deal).toBe("won");
    expect(r.end).toBe("unknown");
    expect(r.lastWinnable).toBe(2);
    // and the claim it makes about that state is one it can still make good on
    expect(solve(live, { nodes: 60_000, ms: 5000 }).verdict).toBe("won");
  });
});
