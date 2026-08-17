/**
 * SOL.EXE — Klondike, draw one, genuinely playing (the law: run it, never
 * illustrate it). Drag a run, drop it where it's legal, double-click sends a
 * card home. And the win is the period's one true special effect: the cards
 * leave their foundations and bounce across the whole desktop on a canvas
 * that never repaints, because the not-repainting IS the effect — this
 * desktop has believed that from the start.
 */

import { el } from "../dom.js";
import { PAL } from "../icons.js";
import { GAMES_COPY, TITLES } from "../copy.js";
import { play } from "../audio/index.js";
import { deskHeight, deskWidth, fieldScaler, stageScale, taskbarH, type WM } from "../wm.js";
import { menubar } from "./ui.js";

/* ---- the pure part (the tests live on this) ---- */

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

/* ---- the cards as things ---- */

const RANKS = ["", "A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"] as const;
/* The authored table, in one unit: the column pitch. Everything else on the
   felt is a fixed fraction of it, so dragging the window bigger deals a bigger
   deck instead of a bigger green rectangle — and every fraction rounds to a
   whole pixel, because a card is a 1px black rule and half of one is a smudge. */
const PITCH = 68;
const CARD_W = 62;
const CARD_H = 84;
const FELT_H = 560;
const scaleOf = (u: number, at68: number): number => Math.round((u * at68) / PITCH);

/* The faces are drawn, not typeset — the period's cards were bitmaps
   (CARDS.DLL), and a font glyph in a div is the tell of a modern deck.
   Suits come in the two sizes the bitmaps came in: a small one for the
   corner index, a large one for the pip field. */
const CARD_RED = "#c00000";

const SUIT_SM: readonly (readonly string[])[] = [
  // spade
  ["...X...", "..XXX..", ".XXXXX.", "XXXXXXX", "XXXXXXX", "XX.X.XX", "...X...", "..XXX.."],
  // heart
  [".XX.XX.", "XXXXXXX", "XXXXXXX", "XXXXXXX", ".XXXXX.", "..XXX..", "...X..."],
  // diamond
  ["...X...", "..XXX..", ".XXXXX.", "XXXXXXX", "XXXXXXX", ".XXXXX.", "..XXX..", "...X..."],
  // club
  ["..XXX..", ".XXXXX.", "XXXXXXX", "XX.X.XX", "...X...", "..XXX.."],
];

const SUIT_LG: readonly (readonly string[])[] = [
  [
    ".....X.....",
    "....XXX....",
    "...XXXXX...",
    "..XXXXXXX..",
    ".XXXXXXXXX.",
    "XXXXXXXXXXX",
    "XXXXXXXXXXX",
    "XXXXXXXXXXX",
    ".XXX.X.XXX.",
    ".....X.....",
    "....XXX....",
    "..XXXXXXX..",
  ],
  [
    ".XXX...XXX.",
    "XXXXX.XXXXX",
    "XXXXXXXXXXX",
    "XXXXXXXXXXX",
    "XXXXXXXXXXX",
    ".XXXXXXXXX.",
    "..XXXXXXX..",
    "...XXXXX...",
    "....XXX....",
    ".....X.....",
  ],
  [
    ".....X.....",
    "....XXX....",
    "...XXXXX...",
    "..XXXXXXX..",
    ".XXXXXXXXX.",
    "XXXXXXXXXXX",
    ".XXXXXXXXX.",
    "..XXXXXXX..",
    "...XXXXX...",
    "....XXX....",
    ".....X.....",
  ],
  [
    "....XXX....",
    "...XXXXX...",
    "...XXXXX...",
    ".XX.XXX.XX.",
    "XXXXXXXXXXX",
    "XXXXXXXXXXX",
    ".XXX.X.XXX.",
    ".....X.....",
    "....XXX....",
    "..XXXXXXX..",
  ],
];

/* The standard pip arrangement, as fractions of the card; `true` marks the
   bottom half, whose pips hang upside down like a real deck's. */
type Pip = readonly [number, number, boolean?];
const L = 0.32;
const C = 0.5;
const R = 0.68;
const PIP_LAYOUT: readonly (readonly Pip[])[] = [
  [],
  [[C, 0.5]],
  [[C, 0.24], [C, 0.76, true]],
  [[C, 0.24], [C, 0.5], [C, 0.76, true]],
  [[L, 0.24], [R, 0.24], [L, 0.76, true], [R, 0.76, true]],
  [[L, 0.24], [R, 0.24], [C, 0.5], [L, 0.76, true], [R, 0.76, true]],
  [[L, 0.24], [R, 0.24], [L, 0.5], [R, 0.5], [L, 0.76, true], [R, 0.76, true]],
  [[L, 0.24], [R, 0.24], [C, 0.37], [L, 0.5], [R, 0.5], [L, 0.76, true], [R, 0.76, true]],
  [[L, 0.24], [R, 0.24], [C, 0.37], [L, 0.5], [R, 0.5], [C, 0.63, true], [L, 0.76, true], [R, 0.76, true]],
  [[L, 0.22], [R, 0.22], [L, 0.41], [R, 0.41], [C, 0.5], [L, 0.59, true], [R, 0.59, true], [L, 0.78, true], [R, 0.78, true]],
  [[L, 0.22], [R, 0.22], [C, 0.315], [L, 0.41], [R, 0.41], [L, 0.59, true], [R, 0.59, true], [C, 0.685, true], [L, 0.78, true], [R, 0.78, true]],
];

/* The courts: a bust in the machine's own palette, point-symmetric like a
   real court card — the bottom half is the top half rotated, so only the top
   is authored. One figure per rank; the deck the period shipped recolored
   nobody per suit either. */
const mirror = (top: readonly string[]): string[] => [
  ...top,
  ...[...top].reverse().map((r) => [...r].reverse().join("")),
];

const COURT: Record<number, readonly string[]> = {
  11: mirror([
    // jack: the flat cap and the feather, tunic with a badge. Every patch of
    // face is fenced in k — white skin on a white card otherwise dissolves.
    "......nn........",
    ".....nnn........",
    "...rrrrrrrrrr...",
    "..rrrrrrrrrrrr..",
    "...kwwwwwwwwk...",
    "...kwkwwwwkwk...",
    "...kwwwwwwwwk...",
    "...kwwwkkwwwk...",
    "....kwwwwwwk....",
    "...ggkwwwwkgg...",
    "..ggggkwwkgggg..",
    ".gggggkrrkggggg.",
    "ggggggkrrkgggggg",
    "gggggkrrrrkggggg",
    "gggggkrrrrkggggg",
  ]),
  12: mirror([
    // queen: the tiara, the hair around the face, the gold panel gown
    "................",
    ".....y..y..y....",
    "....yyyyyyyy....",
    "...kkwwwwwwkk...",
    "...kkwkwwkwkk...",
    "...kkwwwwwwkk...",
    "...kkwwkkwwkk...",
    "....kwwwwwwk....",
    "....kkkwwkkk....",
    "...bbbkwwkbbb...",
    "..bbbbkyykbbbb..",
    ".bbbbkyyyykbbbb.",
    "bbbbbkyyyykbbbbb",
    "bbbbkyyyyyykbbbb",
    "bbbbkyyyyyykbbbb",
  ]),
  13: mirror([
    // king: the banded crown, the beard, the trimmed robe
    "...y..y..y..y...",
    "...yyyyyyyyyy...",
    "...kwwwwwwwwk...",
    "...kwkwwwwkwk...",
    "...kwwwwwwwwk...",
    "...kwwwkkwwwk...",
    "..kddwwwwwwddk..",
    "..kddddddddddk..",
    ".rrkddddddddkrr.",
    ".rrrkddddddkrrr.",
    "rrrrrkyyyykrrrrr",
    "rrrrrkyyyykrrrrr",
    "rrrrbkyyyykbrrrr",
    "rrrbbkyyyykbbrrr",
    "rrrbbkyyyykbbrrr",
  ]),
};

/* the back: a drawn lattice, the way the deck's backs were drawings */
const BACK_TILE: readonly string[] = [
  "X......X",
  ".X....X.",
  "..X..X..",
  "...XX...",
  "...XX...",
  "..X..X..",
  ".X....X.",
  "X......X",
];
const BACK_FIELD = "#1058c8";
const BACK_LINE = "#c8dcf8";

/* 1px-per-cell sprite canvases, cached — the painter scales them out with
   smoothing off, which is the same nearest-neighbour the icons get. */
const sprCache = new Map<string, HTMLCanvasElement>();
function spr(key: string, rows: readonly string[], pal: Record<string, string>): HTMLCanvasElement {
  let c = sprCache.get(key);
  if (c) return c;
  c = document.createElement("canvas");
  c.width = Math.max(...rows.map((r) => r.length));
  c.height = rows.length;
  const ctx = c.getContext("2d")!;
  rows.forEach((row, y) =>
    [...row].forEach((ch, x) => {
      if (ch === ".") return;
      ctx.fillStyle = pal[ch]!;
      ctx.fillRect(x, y, 1, 1);
    }),
  );
  sprCache.set(key, c);
  return c;
}
const suitSpr = (suit: number, large: boolean): HTMLCanvasElement =>
  spr(`s${suit}${large ? "L" : "S"}`, (large ? SUIT_LG : SUIT_SM)[suit]!, {
    X: isRed(suit) ? CARD_RED : "#000",
  });
const courtSpr = (rank: number): HTMLCanvasElement => spr(`c${rank}`, COURT[rank]!, PAL);
const backTile = (): HTMLCanvasElement => spr("back", BACK_TILE, { X: BACK_LINE });

/** A filled rectangle with the bitmap deck's stepped corners. */
function stepRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color: string): void {
  ctx.fillStyle = color;
  ctx.fillRect(x + 2, y, w - 4, h);
  ctx.fillRect(x + 1, y + 1, w - 2, h - 2);
  ctx.fillRect(x, y + 2, w, h - 4);
}

function drawSpr(
  ctx: CanvasRenderingContext2D,
  s: HTMLCanvasElement,
  x: number,
  y: number,
  w: number,
  h: number,
): void {
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(s, Math.round(x), Math.round(y), Math.round(w), Math.round(h));
}

/**
 * The one card renderer — the table, the drag ghost and the win ceremony all
 * paint through here, so the cards bouncing across the desk are the cards you
 * were holding. `c` null is the back. Everything is a rounded fraction of the
 * live pitch `u`, at68 numbers like the rest of the felt.
 */
export function paintCard(
  ctx: CanvasRenderingContext2D,
  c: Card | null,
  x: number,
  y: number,
  w: number,
  h: number,
  u: number,
): void {
  const S = (n: number): number => Math.max(1, scaleOf(u, n));
  stepRect(ctx, x, y, w, h, "#000");
  stepRect(ctx, x + 1, y + 1, w - 2, h - 2, "#fff");

  if (!c) {
    // the back: a white margin, a rule, the lattice
    const m = S(4);
    ctx.fillStyle = "#000";
    ctx.fillRect(x + m - 1, y + m - 1, w - 2 * m + 2, h - 2 * m + 2);
    ctx.fillStyle = BACK_FIELD;
    ctx.fillRect(x + m, y + m, w - 2 * m, h - 2 * m);
    const t = S(8);
    const tile = document.createElement("canvas");
    tile.width = t;
    tile.height = t;
    const tctx = tile.getContext("2d")!;
    tctx.imageSmoothingEnabled = false;
    tctx.drawImage(backTile(), 0, 0, t, t);
    ctx.save();
    ctx.beginPath();
    ctx.rect(x + m, y + m, w - 2 * m, h - 2 * m);
    ctx.clip();
    ctx.translate(x + m, y + m);
    ctx.fillStyle = ctx.createPattern(tile, "repeat")!;
    ctx.fillRect(0, 0, w - 2 * m, h - 2 * m);
    ctx.restore();
    return;
  }

  const ink = isRed(c.suit) ? CARD_RED : "#000";
  const sm = suitSpr(c.suit, false);
  const smW = S(7);
  const smH = Math.round((smW * sm.height) / sm.width);

  // the corner index — rank over a small pip, and the same again rotated,
  // because a card in a fan is read from whichever end is showing
  const index = (): void => {
    ctx.fillStyle = ink;
    ctx.font = `bold ${S(11)}px "Times New Roman",serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    ctx.fillText(RANKS[c.rank]!, S(8), S(12));
    drawSpr(ctx, sm, S(8) - smW / 2, S(14), smW, smH);
  };
  ctx.save();
  ctx.translate(x, y);
  index();
  ctx.translate(w, h);
  ctx.rotate(Math.PI);
  index();
  ctx.restore();

  if (c.rank <= 10) {
    const lg = suitSpr(c.suit, true);
    const pw = c.rank === 1 ? S(22) : S(12);
    const ph = Math.round((pw * lg.height) / lg.width);
    for (const [fx, fy, flip] of PIP_LAYOUT[c.rank]!) {
      const cx = x + fx * w;
      const cy = y + fy * h;
      if (flip) {
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(Math.PI);
        drawSpr(ctx, lg, -pw / 2, -ph / 2, pw, ph);
        ctx.restore();
      } else {
        drawSpr(ctx, lg, cx - pw / 2, cy - ph / 2, pw, ph);
      }
    }
  } else {
    // a court card: the framed figure, a pip in each corner of the frame
    const fx = x + S(14);
    const fy = y + S(11);
    const fw = w - 2 * S(14);
    const fh = h - 2 * S(11);
    ctx.strokeStyle = "#000";
    ctx.lineWidth = 1;
    ctx.strokeRect(fx + 0.5, fy + 0.5, fw - 1, fh - 1);
    drawSpr(ctx, courtSpr(c.rank), fx + 1, fy + 1, fw - 2, fh - 2);
    drawSpr(ctx, sm, fx + 2, fy + 2, smW, smH);
    ctx.save();
    ctx.translate(fx + fw - 2, fy + fh - 2);
    ctx.rotate(Math.PI);
    drawSpr(ctx, sm, 0, 0, smW, smH);
    ctx.restore();
  }
}

type PileRef =
  | { kind: "waste" }
  | { kind: "found"; i: number }
  | { kind: "tab"; i: number };

/** `rig: "won"` is a harness pose — foundations at the queens, four kings
    one double-click from the ceremony. Live play never passes it. */
export function openSol(wm: WM, rig?: string): void {
  const existing = wm.get("sol");
  if (existing?.isOpen()) {
    existing.focus();
    return;
  }

  let s = deal();
  if (rig === "won") {
    s = {
      stock: [],
      waste: [],
      found: [0, 1, 2, 3].map((suit) => Array.from({ length: 12 }, (_, i) => ({ rank: i + 1, suit }))),
      tab: Array.from({ length: 7 }, (_, i) => ({ down: [], up: i < 4 ? [{ rank: 13, suit: i }] : [] })),
    };
  }
  let won = false;

  /* undo: a snapshot before every real move. Klondike without takebacks is
     mostly a lecture about the one card you buried three moves ago. */
  const hist: SolState[] = [];
  const snap = (): void => {
    hist.push({
      stock: [...s.stock],
      waste: [...s.waste],
      found: s.found.map((p) => [...p]),
      tab: s.tab.map((t) => ({ down: [...t.down], up: [...t.up] })),
    });
    if (hist.length > 300) hist.shift();
  };
  const undo = (): void => {
    if (won) return;
    const prev = hist.pop();
    if (!prev) {
      statusEl.textContent = GAMES_COPY.sol.nothingToUndo;
      return;
    }
    s = prev;
    statusEl.textContent = "";
    render();
  };

  const body = el(`<div></div>`);
  const felt = el(`<div class="sunken felt flexwell"></div>`);

  /* The live table. `u` is the column pitch; everything on the felt is a
     rounded fraction of it, and at the authored 68 every one of them lands
     back on its authored number. */
  let u = PITCH;
  const cardW = (): number => scaleOf(u, CARD_W);
  const cardH = (): number => Math.round((cardW() * CARD_H) / CARD_W);
  const COL_X = (i: number): number => scaleOf(u, 10) + i * u;
  const UP_DY = (): number => scaleOf(u, 20);
  const DOWN_DY = (): number => scaleOf(u, 6);

  /** A card as a DOM thing: a div holding its own painted canvas, at the
      live pitch. Rebuilt by every render, so a resize re-deals crisp faces. */
  function cardEl(c: Card, faceUp: boolean): HTMLElement {
    const d = el(`<div class="card"></div>`);
    const cv = document.createElement("canvas");
    const w = cardW();
    const h = cardH();
    cv.width = w;
    cv.height = h;
    paintCard(cv.getContext("2d")!, faceUp ? c : null, 0, 0, w, h, u);
    d.appendChild(cv);
    return d;
  }

  /* drag state: a run of cards riding the cursor while its originals hide */
  let drag: {
    cards: Card[];
    from: PileRef;
    ghost: HTMLElement;
    hidden: HTMLElement[];
    dx: number;
    dy: number;
    moved: boolean;
  } | null = null;

  /* click-to-move state: the tag of the chosen run's head card. The chosen
     cards wear the OS's own selection — the blue dither an icon puts on. */
  let selTag: string | null = null;

  /** The run a drag tag names, read off the live state. */
  const runOf = (tag: string): { from: PileRef; cards: Card[] } | null => {
    if (tag === "waste") {
      if (!s.waste.length) return null;
      return { from: { kind: "waste" }, cards: [s.waste[s.waste.length - 1]!] };
    }
    if (tag.startsWith("f")) {
      const i = Number(tag.slice(1));
      const pile = s.found[i]!;
      if (!pile.length) return null;
      return { from: { kind: "found", i }, cards: [pile[pile.length - 1]!] };
    }
    const [i, j] = tag.slice(1).split(":").map(Number) as [number, number];
    const cards = s.tab[i]!.up.slice(j);
    return cards.length ? { from: { kind: "tab", i }, cards } : null;
  };

  const selEls = (): HTMLElement[] => {
    if (!selTag) return [];
    if (selTag.startsWith("t")) {
      const [pile, j] = selTag.split(":") as [string, string];
      return [...felt.querySelectorAll<HTMLElement>(`[data-drag^="${pile}:"]`)].filter(
        (c) => Number(c.dataset.drag!.split(":")[1]) >= Number(j),
      );
    }
    const one = felt.querySelector<HTMLElement>(`[data-drag="${selTag}"]`);
    return one ? [one] : [];
  };
  const clearSel = (): void => {
    selTag = null;
    felt.querySelectorAll(".card.sel").forEach((c) => c.classList.remove("sel"));
  };
  const applySel = (): void => {
    const els = selEls();
    if (!els.length) {
      selTag = null;
      return;
    }
    for (const c of els) c.classList.add("sel");
  };

  function render(): void {
    felt.innerHTML = "";

    // stock — empty, it wears the period's circle: the deck goes around again
    const top = scaleOf(u, 10);
    const stock = el(`<div class="slot" data-pile="stock" style="left:${COL_X(0)}px;top:${top}px"></div>`);
    if (s.stock.length) stock.appendChild(cardEl(s.stock[s.stock.length - 1]!, false));
    else stock.appendChild(el(`<span class="redeal"></span>`));
    felt.appendChild(stock);

    // waste
    const waste = el(`<div class="slot" data-pile="waste" style="left:${COL_X(1)}px;top:${top}px"></div>`);
    if (s.waste.length) {
      const c = s.waste[s.waste.length - 1]!;
      const e = cardEl(c, true);
      e.dataset.drag = "waste";
      waste.appendChild(e);
    }
    felt.appendChild(waste);

    // foundations — empty ones are plain outlined slots, like the real table
    for (let i = 0; i < 4; i++) {
      const f = el(
        `<div class="slot found" data-pile="f${i}" style="left:${COL_X(3 + i)}px;top:${top}px"></div>`,
      );
      const pile = s.found[i]!;
      if (pile.length) {
        const e = cardEl(pile[pile.length - 1]!, true);
        e.dataset.drag = `f${i}`;
        f.appendChild(e);
      }
      felt.appendChild(f);
    }

    // tableau: the column div is the drop target, full height
    for (let i = 0; i < 7; i++) {
      const col = el(
        `<div class="tabcol" data-pile="t${i}" style="left:${COL_X(i)}px;top:${top + cardH() + scaleOf(u, 14)}px"></div>`,
      );
      const pile = s.tab[i]!;
      let y = 0;
      for (const c of pile.down) {
        const e = cardEl(c, false);
        e.style.top = `${y}px`;
        col.appendChild(e);
        y += DOWN_DY();
      }
      pile.up.forEach((c, j) => {
        const e = cardEl(c, true);
        e.style.top = `${y}px`;
        e.dataset.drag = `t${i}:${j}`;
        col.appendChild(e);
        y += UP_DY();
      });
      if (!pile.down.length && !pile.up.length) col.classList.add("empty");
      felt.appendChild(col);
    }
    // a rebuilt table keeps its chosen run, if the run is still there
    applySel();
  }

  /* ---- resolving piles ---- */
  const pileAt = (x: number, y: number): PileRef | "stock" | null => {
    for (const elmt of document.elementsFromPoint(x, y)) {
      const p = (elmt as HTMLElement).dataset?.pile;
      if (!p) continue;
      if (p === "stock") return "stock";
      if (p === "waste") return { kind: "waste" };
      if (p.startsWith("f")) return { kind: "found", i: Number(p.slice(1)) };
      if (p.startsWith("t")) return { kind: "tab", i: Number(p.slice(1)) };
    }
    return null;
  };

  function takeFrom(ref: PileRef, count: number): Card[] {
    if (ref.kind === "waste") return s.waste.splice(s.waste.length - 1, 1);
    if (ref.kind === "found") return s.found[ref.i]!.splice(s.found[ref.i]!.length - 1, 1);
    const up = s.tab[ref.i]!.up;
    return up.splice(up.length - count, count);
  }

  function afterTableauLift(i: number): void {
    const pile = s.tab[i]!;
    if (!pile.up.length && pile.down.length) pile.up.push(pile.down.pop()!);
  }

  function tryDrop(cards: Card[], from: PileRef, to: PileRef): boolean {
    if (to.kind === "found") {
      if (cards.length !== 1 || from.kind === "found") return false;
      if (!canFoundation(cards[0]!, s.found[cards[0]!.suit]!)) return false;
      // foundations are one per suit; any foundation slot accepts the card home
      snap();
      takeFrom(from, 1);
      s.found[cards[0]!.suit]!.push(cards[0]!);
      if (from.kind === "tab") afterTableauLift(from.i);
      return true;
    }
    if (to.kind === "tab") {
      if (from.kind === "tab" && from.i === to.i) return false;
      const pile = s.tab[to.i]!;
      const onto = pile.up.length ? pile.up[pile.up.length - 1]! : null;
      if (onto === null && pile.down.length) return false;
      if (!canStackTableau(cards[0]!, onto)) return false;
      snap();
      takeFrom(from, cards.length);
      pile.up.push(...cards);
      if (from.kind === "tab") afterTableauLift(from.i);
      return true;
    }
    return false;
  }

  function sendHome(ref: PileRef, card: Card): boolean {
    if (!canFoundation(card, s.found[card.suit]!)) return false;
    snap();
    takeFrom(ref, 1);
    s.found[card.suit]!.push(card);
    if (ref.kind === "tab") afterTableauLift(ref.i);
    return true;
  }

  /* ---- input ---- */
  felt.addEventListener("pointerdown", (e) => {
    if (won || e.button !== 0 || !e.isPrimary) return;
    const target = e.target as HTMLElement;
    if (pileAt(e.clientX, e.clientY) === "stock") {
      play("click", 0.5);
      clearSel();
      if (s.stock.length || s.waste.length) snap();
      const recycled = drawFromStock(s);
      if (recycled) statusEl.textContent = GAMES_COPY.sol.stuckDeal;
      render();
      return;
    }
    const tag = target.closest<HTMLElement>("[data-drag]")?.dataset.drag;
    if (!tag) return;
    e.preventDefault();

    const src = runOf(tag);
    if (!src) return;
    const { from, cards } = src;
    const hidden =
      from.kind === "tab"
        ? [...felt.querySelectorAll<HTMLElement>(`[data-drag^="t${from.i}:"]`)].filter(
            (c) => Number(c.dataset.drag!.split(":")[1]) >= Number(tag.split(":")[1]),
          )
        : [target.closest<HTMLElement>("[data-drag]")!];

    // the run rides the cursor in a ghost pile
    // the ghost rides the stage, not the felt, so it carries the table's size
    // with it or its cards fall back to the authored 62x84 mid-drag
    const ghost = el(`<div class="solghost"></div>`);
    ghost.style.setProperty("--cw", `${cardW()}px`);
    ghost.style.setProperty("--ch", `${cardH()}px`);
    cards.forEach((c, j) => {
      const ce = cardEl(c, true);
      ce.style.top = `${j * UP_DY()}px`;
      ghost.appendChild(ce);
    });
    const stageR = wm.stage.getBoundingClientRect();
    const k = stageScale();
    const cardBox = target.closest<HTMLElement>("[data-drag]")!.getBoundingClientRect();
    drag = {
      cards,
      from,
      ghost,
      hidden,
      dx: (e.clientX - cardBox.left) / k,
      dy: (e.clientY - cardBox.top) / k,
      moved: false,
    };
    ghost.style.left = `${(cardBox.left - stageR.left) / k}px`;
    ghost.style.top = `${(cardBox.top - stageR.top) / k}px`;
    wm.stage.appendChild(ghost);
  });

  addEventListener("pointermove", (e) => {
    if (!drag) return;
    if (!drag.moved) {
      // the originals lift only once the drag is real, so a plain double-
      // click never disturbs the DOM under the cursor — and a real drag
      // supersedes whatever the last click had chosen
      drag.moved = true;
      clearSel();
      for (const hEl of drag.hidden) hEl.style.visibility = "hidden";
    }
    const stageR = wm.stage.getBoundingClientRect();
    const k = stageScale();
    drag.ghost.style.left = `${(e.clientX - stageR.left) / k - drag.dx}px`;
    drag.ghost.style.top = `${(e.clientY - stageR.top) / k - drag.dy}px`;
  });

  // a cancelled touch (the browser took the gesture) puts the cards back too
  addEventListener("pointercancel", () => {
    if (!drag) return;
    const { ghost, hidden } = drag;
    drag = null;
    ghost.remove();
    for (const hEl of hidden) hEl.style.visibility = "";
  });

  addEventListener("pointerup", (e) => {
    if (!drag) return;
    const { cards, from, ghost, hidden, moved } = drag;
    drag = null;
    ghost.remove();
    if (moved) {
      const to = pileAt(e.clientX, e.clientY);
      if (to && to !== "stock" && tryDrop(cards, from, to)) {
        // a card landing on a pile is the same knock the board has, softer
        play("disc-land", 0.4);
        render();
        checkWin();
        return;
      }
    }
    // nothing changed: put the originals back without a rebuild, so a
    // double-click still lands on the same element
    for (const hEl of hidden) hEl.style.visibility = "";
  });

  /* the other grammar: click the run, then click where it goes. Same legality,
     same knock — dragging never stopped working, this is for the hand that
     would rather point twice than hold. */
  felt.addEventListener("pointerup", (e) => {
    if (won || e.button !== 0 || !e.isPrimary || drag?.moved) return;
    const to = pileAt(e.clientX, e.clientY);
    if (to === "stock") return; // pointerdown already drew
    if (selTag) {
      const src = runOf(selTag);
      if (src && to && tryDrop(src.cards, src.from, to)) {
        play("disc-land", 0.4);
        clearSel();
        render();
        checkWin();
        return;
      }
    }
    const tag = (e.target as HTMLElement).closest<HTMLElement>("[data-drag]")?.dataset.drag ?? null;
    if (!tag || tag === selTag) {
      clearSel();
      return;
    }
    clearSel();
    selTag = tag;
    applySel();
  });

  const autoHome = (target: HTMLElement): void => {
    if (won) return;
    const tag = target.closest<HTMLElement>("[data-drag]")?.dataset.drag;
    if (!tag || tag.startsWith("f")) return;
    let ref: PileRef;
    let card: Card;
    if (tag === "waste") {
      if (!s.waste.length) return;
      ref = { kind: "waste" };
      card = s.waste[s.waste.length - 1]!;
    } else {
      const [i, j] = tag.slice(1).split(":").map(Number) as [number, number];
      const up = s.tab[i]!.up;
      if (j !== up.length - 1) return; // only the top card goes home
      ref = { kind: "tab", i };
      card = up[up.length - 1]!;
    }
    if (sendHome(ref, card)) {
      play("disc-land", 0.4);
      render();
      checkWin();
    }
  };
  felt.addEventListener("dblclick", (e) => autoHome(e.target as HTMLElement));

  // the double-click, translated for a finger: two quick taps on the same
  // card send it home
  let lastTap: { tag: string; at: number } | null = null;
  felt.addEventListener("pointerup", (e) => {
    if (e.pointerType !== "touch" || won) return;
    if (drag?.moved) {
      lastTap = null;
      return;
    }
    const target = e.target as HTMLElement;
    const tag = target.closest<HTMLElement>("[data-drag]")?.dataset.drag;
    if (!tag) {
      lastTap = null;
      return;
    }
    const now = performance.now();
    if (lastTap && lastTap.tag === tag && now - lastTap.at < 400) {
      lastTap = null;
      autoHome(target);
    } else {
      lastTap = { tag, at: now };
    }
  });

  /* ---- the win: the bounce ---- */
  let bounceStop: (() => void) | null = null;

  function checkWin(): void {
    if (won || !isWon(s)) return;
    won = true;
    play("tada");
    bounceStop = runBounce();
  }

  function runBounce(): () => void {
    const cv = el(`<canvas class="solbounce"></canvas>`) as HTMLCanvasElement;
    cv.width = deskWidth();
    cv.height = deskHeight();
    wm.stage.appendChild(cv);
    const ctx = cv.getContext("2d")!;

    // where the foundations are on the desk right now
    const k = stageScale();
    const stageR = wm.stage.getBoundingClientRect();
    const starts: [number, number][] = [];
    felt.querySelectorAll<HTMLElement>(".slot.found").forEach((f) => {
      const r = f.getBoundingClientRect();
      starts.push([(r.left - stageR.left) / k, (r.top - stageR.top) / k]);
    });

    // the ceremony deals the same cards the table was playing with
    const cw = cardW();
    const ch = cardH();
    const floor = deskHeight() - taskbarH() - ch;
    let raf = 0;
    let idx = 0; // 0..51: kings first, cycling suits
    let card: { c: Card; x: number; y: number; vx: number; vy: number } | null = null;
    let done = false;

    // the ceremony paints the same faces the table deals — one renderer,
    // whole pixels, so the smears it leaves are smears of real cards
    const paint = (c: Card, x: number, y: number): void =>
      paintCard(ctx, c, Math.round(x), Math.round(y), cw, ch, u);

    const frame = (): void => {
      if (done) return;
      if (!card) {
        if (idx >= 52) {
          finish();
          return;
        }
        const rank = 13 - ((idx / 4) | 0);
        const suit = idx % 4;
        const [sx, sy] = starts[suit] ?? [600, 20];
        card = {
          c: { rank, suit },
          x: sx,
          y: sy,
          vx: (Math.random() < 0.5 ? -1 : 1) * (2 + Math.random() * 4),
          vy: -(2 + Math.random() * 6),
        };
        idx++;
      }
      card.vy += 0.6;
      card.x += card.vx;
      card.y += card.vy;
      if (card.y > floor) {
        card.y = floor;
        card.vy = -card.vy * 0.72;
        if (Math.abs(card.vy) < 1.2) card.vy = -8; // tired cards get a second wind out
      }
      paint(card.c, card.x, card.y);
      if (card.x < -cw - 10 || card.x > deskWidth() + 10) card = null;
      raf = requestAnimationFrame(frame);
    };

    const finish = (): void => {
      if (done) return;
      done = true;
      cancelAnimationFrame(raf);
      // the ceremony owned the screen; what it painted stays behind the
      // windows as desktop litter (the smears' layer) until the next deal
      cv.style.zIndex = "30";
      cv.style.pointerEvents = "none";
      wm.dialog({ ...GAMES_COPY.sol.win, x: 470, y: 330, ax: "center", w: 340 });
    };

    // a click ends the ceremony early, like the period key-press did
    const skip = (): void => {
      finish();
      removeEventListener("pointerdown", skip);
    };
    setTimeout(() => addEventListener("pointerdown", skip), 800);
    raf = requestAnimationFrame(frame);
    return () => {
      done = true;
      cancelAnimationFrame(raf);
      cv.remove();
      removeEventListener("pointerdown", skip);
    };
  }

  function newDeal(): void {
    bounceStop?.();
    bounceStop = null;
    wm.stage.querySelectorAll(".solbounce").forEach((c) => c.remove());
    s = deal();
    won = false;
    hist.length = 0;
    statusEl.textContent = "";
    render();
  }

  const bar = menubar([
    { label: "Game", items: [["Deal\tCtrl+D", newDeal], ["Undo\tCtrl+Z", undo], ["-", () => {}], ["Exit", () => win.close()]] },
    {
      label: "Help",
      items: [[
        "Contents",
        () => wm.dialog({ ...GAMES_COPY.sol.help, x: 420, y: 320, w: 340 }),
      ]],
    },
  ]);

  const status = el(`<div class="statusbar"><div></div></div>`);
  const statusEl = status.firstElementChild as HTMLElement;

  body.append(bar, felt, status);

  /* The felt already grew with the window; now the deck does too. The unit is
     the column pitch, so the seven columns keep their proportions and the
     ceremony bounces cards the size you were playing with. Measured chrome: a
     natural window is 512 wide around seven 68px pitches, and 640 tall around
     a 560px felt. */
  const relayout = fieldScaler({
    win: () => win.el,
    grid: () => ({ cols: 7, rows: FELT_H / PITCH }),
    chrome: { w: 36, h: 80 },
    cell: { base: PITCH, step: 2, min: 44, max: 110 },
    apply(next) {
      const changed = next !== u;
      u = next;
      body.style.setProperty("--cw", `${cardW()}px`);
      body.style.setProperty("--ch", `${cardH()}px`);
      // the piles are laid out in px, so a new pitch has to re-deal them —
      // but only when it actually moved; every resize drag calls this
      if (changed) render();
    },
  });

  const win = wm.open({
    id: "sol",
    title: TITLES.sol,
    icon: SOL_ICON,
    x: 620,
    y: 60,
    w: 7 * PITCH + 16 + 20,
    body,
    buttons: ["min", "close"],
    // the table scales with the window now, so the floor is the smallest deck
    // still worth dealing rather than the authored one
    resizable: true,
    minW: 7 * 44 + 36,
    minH: Math.round((FELT_H * 44) / PITCH) + 80,
    onResize: relayout,
    onMaximize: relayout,
    onClose: () => {
      bounceStop?.();
      bounceStop = null;
    },
  });

  const onKey = (e: KeyboardEvent): void => {
    if (!win.isOpen()) {
      removeEventListener("keydown", onKey);
      return;
    }
    if (wm.focused()?.id !== "sol") return;
    // the menu says Ctrl+, the period spelling; Cmd answers too, like undo
    const cmd = e.metaKey || e.ctrlKey;
    if (cmd && e.key.toLowerCase() === "z") {
      e.preventDefault();
      undo();
    } else if (e.key === "F2" || (cmd && e.key.toLowerCase() === "d")) {
      e.preventDefault();
      newDeal();
    }
  };
  addEventListener("keydown", onKey);

  render();
  relayout();
}

export const SOL_ICON = [
  "................",
  "..kkkkkkk.......",
  "..kwwwwwk.......",
  "..kwkwwwk.......",
  "..kwwwwkkkkkkk..",
  "..kwwwwkwwwwwk..",
  "..kwwwwkwrwrwk..",
  "..kwwwwkwrrrwk..",
  "..kwwwwkwwrwwk..",
  "..kwwwwkwwwwwk..",
  "..kkkkkkwwwwwk..",
  ".......kwwwwwk..",
  ".......kwwwwwk..",
  ".......kkkkkkk..",
  "................",
  "................",
] as const;
