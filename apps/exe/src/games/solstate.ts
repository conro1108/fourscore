/**
 * Klondike's rules, with nothing on top of them.
 *
 * This is the half of SOL.EXE that has no window: the deal, the two legality
 * laws and the draw. It lives apart from `sol.ts` because two other things
 * need it and neither can touch the DOM — the review's solver, and the worker
 * that runs the solver off the desktop's thread. `sol.ts` re-exports all of
 * it, so the game and its tests still say `sol.js`.
 */

/** suit: 0 ♠  1 ♥  2 ♦  3 ♣ */
export interface Card {
  rank: number; // 1 (ace) .. 13 (king)
  suit: number;
}

export const isRed = (suit: number): boolean => suit === 1 || suit === 2;

export interface SolState {
  stock: Card[]; // face down; the end is the top
  waste: Card[]; // face up; the end is the top
  found: Card[][]; // one pile per suit
  tab: { down: Card[]; up: Card[] }[]; // 7 piles
}

export function makeDeck(rand: () => number = Math.random): Card[] {
  const deck: Card[] = [];
  for (let suit = 0; suit < 4; suit++)
    for (let rank = 1; rank <= 13; rank++) deck.push({ rank, suit });
  for (let i = deck.length - 1; i > 0; i--) {
    const j = (rand() * (i + 1)) | 0;
    [deck[i], deck[j]] = [deck[j]!, deck[i]!];
  }
  return deck;
}

export function deal(rand: () => number = Math.random): SolState {
  const deck = makeDeck(rand);
  const tab = Array.from({ length: 7 }, (_, i) => ({
    down: deck.splice(0, i),
    up: deck.splice(0, 1),
  }));
  return { stock: deck, waste: [], found: [[], [], [], []], tab };
}

/** Tableau law: kings found empty columns; everyone else descends, alternating color. */
export function canStackTableau(moving: Card, onto: Card | null): boolean {
  if (!onto) return moving.rank === 13;
  return onto.rank === moving.rank + 1 && isRed(onto.suit) !== isRed(moving.suit);
}

/** Foundation law: aces first, then up, one suit each. */
export function canFoundation(c: Card, pile: readonly Card[]): boolean {
  return pile.length === 0 ? c.rank === 1 : pile[pile.length - 1]!.rank === c.rank - 1;
}

/** Draw one; an empty stock takes the waste back, in order. Returns true if it recycled. */
export function drawFromStock(s: SolState): boolean {
  if (s.stock.length === 0) {
    if (s.waste.length === 0) return false;
    s.stock = s.waste.reverse();
    s.waste = [];
    return true;
  }
  s.waste.push(s.stock.pop()!);
  return false;
}

export const isWon = (s: SolState): boolean => s.found.every((p) => p.length === 13);

/** A state nothing else can reach into: undo's snapshot, and the journal's. */
export const cloneState = (s: SolState): SolState => ({
  stock: [...s.stock],
  waste: [...s.waste],
  found: s.found.map((p) => [...p]),
  tab: s.tab.map((t) => ({ down: [...t.down], up: [...t.up] })),
});
