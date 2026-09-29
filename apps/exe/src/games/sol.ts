/**
 * SOL.EXE — Klondike, draw one. Drag or click-click to move, double-click sends
 * home. The win bounces cards across the desktop on a canvas that never clears.
 * Rules live in solstate.ts (re-exported here); the review runs in solworker.ts.
 */

import { el } from "../dom.js";
import { PAL } from "../icons.js";
import { GAMES_COPY, TITLES } from "../copy.js";
import { play } from "../audio/index.js";
import { deskHeight, deskWidth, fieldScaler, stageScale, taskbarH, type FieldFit, type WM } from "../wm.js";
import { menubar } from "./ui.js";
import {
  canFoundation,
  canStackTableau,
  cloneState,
  deal,
  drawFromStock,
  isRed,
  isWon,
  type Card,
  type SolState,
} from "./solstate.js";
import type { SolReview } from "./solreview.js";
import type { SolReviewRequest, SolReviewResponse } from "./solworker.js";

export {
  canFoundation,
  canStackTableau,
  cloneState,
  deal,
  drawFromStock,
  isRed,
  isWon,
  makeDeck,
  type Card,
  type SolState,
} from "./solstate.js";

/* cards */

const RANKS = ["", "A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"] as const;
/* Authored sizes at column pitch 68. Everything on the felt is a fraction of the
   live pitch, rounded to whole px (a half-px card rule is a smudge). */
const PITCH = 68;
const CARD_W = 62;
const CARD_H = 84;
const FELT_H = 560;
const scaleOf = (u: number, at68: number): number => Math.round((u * at68) / PITCH);

/* Faces are bitmaps, never font glyphs. Small suit for the corner index, large for pips. */
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

/* Pip positions as card fractions; `true` = drawn upside down (bottom half). */
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

/* Court figures: point-symmetric, so only the top half is authored. One per rank, shared across suits. */
const mirror = (top: readonly string[]): string[] => [
  ...top,
  ...[...top].reverse().map((r) => [...r].reverse().join("")),
];

const COURT: Record<number, readonly string[]> = {
  11: mirror([
    // every patch of face is fenced in k, or white skin dissolves into the card
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

/* card back lattice */
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

/* 1px-per-cell sprite canvases, cached; drawn scaled with smoothing off. */
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

/** Filled rect with stepped corners. */
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

/** The one card renderer (table, drag ghost, win bounce). `c` null is the back; `u` is the live pitch. */
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

  // corner index, drawn twice (second rotated)
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

/** Seeded shuffle for harness poses, so screenshots are stable. */
const seededRand = (seed: number) => {
  let v = seed;
  return (): number => ((v = (v * 48271) % 2147483647) / 2147483647);
};

/** `rig` is a harness pose: "won" (one double-click from the bounce), "review"
    (fixed deal, review open), "deal" (the same fixed deal, nothing else) or
    "decided" (stock spent, four runs K..6 face up: one move from the machine finishing). */
export function openSol(wm: WM, rig?: string): void {
  const existing = wm.get("sol");
  if (existing?.isOpen()) {
    existing.focus();
    return;
  }

  let s = rig === "review" || rig === "deal" ? deal(seededRand(7919)) : deal();
  if (rig === "won") {
    s = {
      stock: [],
      waste: [],
      found: [0, 1, 2, 3].map((suit) => Array.from({ length: 12 }, (_, i) => ({ rank: i + 1, suit }))),
      tab: Array.from({ length: 7 }, (_, i) => ({ down: [], up: i < 4 ? [{ rank: 13, suit: i }] : [] })),
    };
  }
  if (rig === "decided") {
    // suit order per column alternates colour down each run
    const runs = [
      [0, 1],
      [1, 0],
      [2, 3],
      [3, 2],
    ];
    s = {
      stock: [],
      waste: [],
      found: [0, 1, 2, 3].map((suit) => Array.from({ length: 5 }, (_, i) => ({ rank: i + 1, suit }))),
      tab: Array.from({ length: 7 }, (_, i) => ({
        down: [],
        up: i < 4 ? Array.from({ length: 8 }, (_, j) => ({ rank: 13 - j, suit: runs[i]![j % 2]! })) : [],
      })),
    };
  }
  let won = false;

  // Snapshot before every real move. `hist` (undo) is capped; `journal` (the review's
  // input) keeps every state, sharing the objects. Undo pops both.
  const hist: SolState[] = [];
  const journal: SolState[] = [];
  const snap = (): void => {
    const shot = cloneState(s);
    hist.push(shot);
    journal.push(shot);
    if (hist.length > 300) hist.shift();
  };
  const undo = (): void => {
    if (won || finishing !== null) return;
    const prev = hist.pop();
    if (!prev) {
      statusEl.textContent = GAMES_COPY.sol.nothingToUndo;
      return;
    }
    journal.pop();
    s = prev;
    statusEl.textContent = "";
    render();
  };

  const body = el(`<div></div>`);
  const felt = el(`<div class="sunken felt flexwell"></div>`);

  // `u` is the live column pitch; all felt geometry derives from it.
  let u = PITCH;
  const cardW = (): number => scaleOf(u, CARD_W);
  const cardH = (): number => Math.round((cardW() * CARD_H) / CARD_W);
  const COL_X = (i: number): number => scaleOf(u, 10) + i * u;
  // a finger needs a wider strip of each face-up card than a mouse does
  const coarse = matchMedia("(pointer: coarse)").matches;
  const UP_DY = (): number => scaleOf(u, coarse ? 32 : 20);
  const DOWN_DY = (): number => scaleOf(u, 6);

  /** A card div with its own canvas at the live pitch. Rebuilt every render.
      A face-up card says what it is (`data-card="13s"`) — for harnesses, not styling. */
  function cardEl(c: Card, faceUp: boolean): HTMLElement {
    const d = el(`<div class="card"></div>`);
    if (faceUp) d.dataset.card = `${c.rank}${"shdc"[c.suit]}`;
    const cv = document.createElement("canvas");
    const w = cardW();
    const h = cardH();
    cv.width = w;
    cv.height = h;
    paintCard(cv.getContext("2d")!, faceUp ? c : null, 0, 0, w, h, u);
    d.appendChild(cv);
    return d;
  }

  /* drag state */
  let drag: {
    cards: Card[];
    from: PileRef;
    ghost: HTMLElement;
    hidden: HTMLElement[];
    dx: number;
    dy: number;
    /** Where the pointer went down (client px); a drag is real past `slop`. */
    x0: number;
    y0: number;
    slop: number;
    moved: boolean;
  } | null = null;
  /** dblclick fires for a touch double-tap too; the pointerup path already answered it. */
  let lastPointerType = "mouse";

  /* click-to-move: tag of the chosen run's head card */
  let selTag: string | null = null;

  /** The run a drag tag names. */
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

    // stock
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

    // foundations
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

    // tableau: the column div is the full-height drop target
    const colTop = top + cardH() + scaleOf(u, 14);
    // a column that would run off the felt closes up (the period's own trick)
    const room = felt.clientHeight - colTop - 6 - cardH();
    for (let i = 0; i < 7; i++) {
      const col = el(
        `<div class="tabcol" data-pile="t${i}" style="left:${COL_X(i)}px;top:${colTop}px"></div>`,
      );
      const pile = s.tab[i]!;
      const need = pile.down.length * DOWN_DY() + Math.max(0, pile.up.length - 1) * UP_DY();
      const k = room > 0 && need > room ? room / need : 1;
      const downDy = Math.max(2, Math.floor(DOWN_DY() * k));
      const upDy = Math.max(scaleOf(u, 12), Math.floor(UP_DY() * k));
      let y = 0;
      for (const c of pile.down) {
        const e = cardEl(c, false);
        e.style.top = `${y}px`;
        col.appendChild(e);
        y += downDy;
      }
      pile.up.forEach((c, j) => {
        const e = cardEl(c, true);
        e.style.top = `${y}px`;
        e.dataset.drag = `t${i}:${j}`;
        col.appendChild(e);
        y += upDy;
      });
      if (!pile.down.length && !pile.up.length) col.classList.add("empty");
      felt.appendChild(col);
    }
    applySel();
  }

  /* piles */
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
      // any foundation slot accepts; the card goes to its suit's pile
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

  /* input */
  const turnDeck = (): void => {
    play("click", 0.5);
    clearSel();
    if (s.stock.length || s.waste.length) snap();
    const recycled = drawFromStock(s);
    if (recycled) statusEl.textContent = GAMES_COPY.sol.stuckDeal;
    render();
  };
  felt.addEventListener("pointerdown", (e) => {
    if (won || e.button !== 0 || !e.isPrimary) return;
    lastPointerType = e.pointerType;
    const target = e.target as HTMLElement;
    if (pileAt(e.clientX, e.clientY) === "stock") {
      turnDeck();
      return;
    }
    const tag = target.closest<HTMLElement>("[data-drag]")?.dataset.drag;
    if (!tag) {
      tableDown = { x: e.clientX, y: e.clientY };
      return;
    }
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

    // ghost lives on the stage, not the felt, and carries the live card size with it
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
      x0: e.clientX,
      y0: e.clientY,
      // a finger wobbles on a tap; a mouse doesn't
      slop: e.pointerType === "touch" ? 8 : 3,
      moved: false,
    };
    ghost.style.left = `${(cardBox.left - stageR.left) / k}px`;
    ghost.style.top = `${(cardBox.top - stageR.top) / k}px`;
    wm.stage.appendChild(ghost);
  });

  addEventListener("pointermove", (e) => {
    if (!drag) return;
    if (!drag.moved) {
      if (Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) < drag.slop) return;
      // originals hide only once the drag is real, so a double-click never disturbs the DOM under the cursor
      drag.moved = true;
      clearSel();
      for (const hEl of drag.hidden) hEl.style.visibility = "hidden";
    }
    const stageR = wm.stage.getBoundingClientRect();
    const k = stageScale();
    drag.ghost.style.left = `${(e.clientX - stageR.left) / k - drag.dx}px`;
    drag.ghost.style.top = `${(e.clientY - stageR.top) / k - drag.dy}px`;
  });

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
    // the pointer decides; failing that, the middle of the card being carried
    // (a finger holds a card by its edge and sees the pile under the card)
    const carried = ghost.firstElementChild?.getBoundingClientRect();
    ghost.remove();
    if (moved) {
      const to =
        pileAt(e.clientX, e.clientY) ??
        (carried ? pileAt(carried.left + carried.width / 2, carried.top + carried.height / 2) : null);
      if (to && to !== "stock" && tryDrop(cards, from, to)) {
        play("disc-land", 0.4);
        settle();
        return;
      }
    }
    // no rebuild, so a double-click still lands on the same element
    for (const hEl of hidden) hEl.style.visibility = "";
  });

  // click-to-move: click the run, then click where it goes
  felt.addEventListener("pointerup", (e) => {
    if (won || e.button !== 0 || !e.isPrimary || drag?.moved) return;
    const to = pileAt(e.clientX, e.clientY);
    if (to === "stock") return; // pointerdown already drew
    if (selTag) {
      const src = runOf(selTag);
      if (src && to && tryDrop(src.cards, src.from, to)) {
        play("disc-land", 0.4);
        clearSel();
        settle();
        return;
      }
    }
    const tag = (e.target as HTMLElement).closest<HTMLElement>("[data-drag]")?.dataset.drag ?? null;
    if (!tag || tag === selTag) {
      const down = tableDown;
      tableDown = null;
      const had = selTag !== null;
      clearSel();
      if (!down || tag || finishing) return;
      const dx = e.clientX - down.x;
      const dy = e.clientY - down.y;
      // a swipe left on the table takes a move back
      if (dx < -40 && Math.abs(dy) < -dx) {
        undo();
        return;
      }
      if (Math.hypot(dx, dy) > 12) return; // a stroke that meant nothing
      // with a run chosen, a tap on the table only lets go of it
      if (!had) tableTap();
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
      settle();
    }
  };

  /* The table (felt with no card under the finger — the stock is a reach for
     a thumb): one tap turns the deck, two send a card home, a swipe left
     undoes. The single tap waits a short beat so the second can cancel it;
     the beat is the lag on every deal, so it stays tight. */
  const TABLE_TAP_MS = 170;
  let tableDown: { x: number; y: number } | null = null;
  let tableTapTimer: number | null = null;
  const tableTap = (): void => {
    if (tableTapTimer !== null) {
      clearTimeout(tableTapTimer);
      tableTapTimer = null;
      homeOne();
      return;
    }
    tableTapTimer = window.setTimeout(() => {
      tableTapTimer = null;
      if (!won) turnDeck();
    }, TABLE_TAP_MS);
  };
  /** The first card that can leave — waste top, then tableau tops. */
  const homeOne = (): void => {
    if (won) return;
    const w = s.waste[s.waste.length - 1];
    if (w && sendHome({ kind: "waste" }, w)) {
      play("disc-land", 0.4);
      settle();
      return;
    }
    for (let i = 0; i < 7; i++) {
      const up = s.tab[i]!.up;
      const c = up[up.length - 1];
      if (c && sendHome({ kind: "tab", i }, c)) {
        play("disc-land", 0.4);
        settle();
        return;
      }
    }
    statusEl.textContent = GAMES_COPY.sol.nothingHome;
  };

  /* Stock and waste empty, nothing face down: the game is decided, and the
     rest is a card home every 90ms until the bounce. Stepped, not eased. */
  let finishing: number | null = null;
  const decided = (): boolean =>
    !s.stock.length && !s.waste.length && s.tab.every((p) => !p.down.length);
  const stopFinishing = (): void => {
    if (finishing !== null) clearTimeout(finishing);
    finishing = null;
    // a table tap still waiting on its second must not deal into the next game
    if (tableTapTimer !== null) clearTimeout(tableTapTimer);
    tableTapTimer = null;
  };
  function settle(): void {
    render();
    checkWin();
    if (won || finishing !== null || !decided()) return;
    statusEl.textContent = GAMES_COPY.sol.finishing;
    const step = (): void => {
      finishing = null;
      if (won) return;
      // the lowest card that can leave, so the piles climb together
      let best: { i: number; card: Card } | null = null;
      s.tab.forEach((p, i) => {
        const c = p.up[p.up.length - 1];
        if (c && canFoundation(c, s.found[c.suit]!) && (!best || c.rank < best.card.rank)) best = { i, card: c };
      });
      if (!best) return;
      const b: { i: number; card: Card } = best;
      sendHome({ kind: "tab", i: b.i }, b.card);
      play("disc-land", 0.3);
      render();
      checkWin();
      if (!won) finishing = window.setTimeout(step, 90);
    };
    finishing = window.setTimeout(step, 400);
  }
  felt.addEventListener("dblclick", (e) => {
    if (lastPointerType !== "touch") autoHome(e.target as HTMLElement);
  });

  // touch: two quick taps on the same card send it home
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

  /* win bounce */
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

    const k = stageScale();
    const stageR = wm.stage.getBoundingClientRect();
    const starts: [number, number][] = [];
    felt.querySelectorAll<HTMLElement>(".slot.found").forEach((f) => {
      const r = f.getBoundingClientRect();
      starts.push([(r.left - stageR.left) / k, (r.top - stageR.top) / k]);
    });

    const cw = cardW();
    const ch = cardH();
    const floor = deskHeight() - taskbarH() - ch;
    let raf = 0;
    let idx = 0; // 0..51: kings first, cycling suits
    let card: { c: Card; x: number; y: number; vx: number; vy: number } | null = null;
    let done = false;

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
        if (Math.abs(card.vy) < 1.2) card.vy = -8; // kick a settled card back up
      }
      paint(card.c, card.x, card.y);
      if (card.x < -cw - 10 || card.x > deskWidth() + 10) card = null;
      raf = requestAnimationFrame(frame);
    };

    const finish = (): void => {
      if (done) return;
      done = true;
      cancelAnimationFrame(raf);
      // the smears stay behind the windows until the next deal
      cv.style.zIndex = "30";
      cv.style.pointerEvents = "none";
      wm.dialog({ ...GAMES_COPY.sol.win, x: 470, y: 330, ax: "center", w: 340 });
    };

    // a click ends it early
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
    stopFinishing();
    bounceStop?.();
    bounceStop = null;
    wm.stage.querySelectorAll(".solbounce").forEach((c) => c.remove());
    s = deal();
    won = false;
    hist.length = 0;
    journal.length = 0;
    statusEl.textContent = "";
    render();
  }

  /** One worker per review, terminated on answer or on window close. */
  function askReview(path: SolState[]): { answer: Promise<SolReview>; stop: () => void } {
    const w = new Worker(new URL("./solworker.ts", import.meta.url), { type: "module" });
    const answer = new Promise<SolReview>((resolve, reject) => {
      const done = (fn: () => void): void => {
        w.terminate();
        fn();
      };
      w.onmessage = (e: MessageEvent<SolReviewResponse>): void =>
        done(() =>
          "review" in e.data ? resolve(e.data.review) : reject(new Error(e.data.error)),
        );
      w.onerror = (): void => done(() => reject(new Error("the review worker failed")));
      w.postMessage({ journal: path } satisfies SolReviewRequest);
    });
    return { answer, stop: () => w.terminate() };
  }

  // Game > Review: searches the journal (the line actually played, undos and all),
  // proven verdicts stated flat, unproven ones hedged.
  let reviewGen = 0;
  function openReview(): void {
    const path = [...journal, cloneState(s)];
    if (path.length < 2) {
      wm.dialog({ ...GAMES_COPY.sol.review.none, x: 420, y: 320, w: 340 });
      return;
    }
    wm.get("solreview")?.close();
    const gen = ++reviewGen;

    const rbody = el(`<div style="padding:6px 8px 8px"></div>`);
    const head = el(`<div style="font-weight:bold;margin:2px 2px 6px"></div>`);
    const list = el(
      `<div class="sunken notepad" style="height:56px;overflow:auto;margin-bottom:6px;background:#fff"></div>`,
    );
    const foot = el(`<div style="margin:0 2px"></div>`);
    rbody.append(head, list, foot);
    const R = GAMES_COPY.sol.review;
    head.textContent = R.head(s.found.reduce((n, p) => n + p.length, 0));
    list.textContent = R.working;
    foot.textContent = R.workingSub;

    const { answer, stop } = askReview(path);
    const rwin = wm.open({
      id: "solreview",
      title: TITLES.solReview,
      icon: SOL_ICON,
      x: 380,
      y: 220,
      w: 320,
      body: rbody,
      buttons: ["min", "close"],
      onClose: stop,
    });

    const rowIn = (parent: HTMLElement, text: string): void => {
      const row = el(`<div style="padding:1px 4px"></div>`);
      row.textContent = text;
      parent.appendChild(row);
    };

    answer.then(
      (r) => {
        if (gen !== reviewGen || !rwin.isOpen()) return;
        // whether the verdict line already said the search ran out
        let saidRanOut = false;
        head.textContent = R.head(r.homed);
        list.textContent = "";
        foot.textContent = "";
        rowIn(list, R.counts.moves(r.moves, r.draws));
        if (r.passes) rowIn(list, R.counts.passes(r.passes));
        if (r.flipped) rowIn(list, R.counts.flipped(r.flipped));
        if (r.won) rowIn(foot, R.won);
        else if (r.deal !== "won") {
          rowIn(foot, R.dealCold);
          rowIn(foot, R.dealColdSub);
        } else if (r.end === "won") rowIn(foot, R.alive);
        else if (r.lastWinnable !== null) {
          // a closed bracket names the play; an open one only says "somewhere after"
          rowIn(foot, R.stillAt(r.lastWinnable));
          const ranOut = !r.converged;
          rowIn(
            foot,
            ranOut
              ? R.lostSomewhereAfter
              : r.lastWinnable === 0
                ? R.lostAfterFirst
                : R.lostAfter,
          );
          saidRanOut = ranOut;
        }
        // Not gated on `converged`: that flag is about the bisection and is false
        // on the cold-deal path, which needs this sentence most.
        if (r.spent && !r.won && !saidRanOut) rowIn(foot, R.spent);
      },
      () => {
        if (gen !== reviewGen || !rwin.isOpen()) return;
        rwin.close();
        wm.dialog({ ...GAMES_COPY.sol.review.failed, icon: "!", x: 420, y: 320, w: 340 });
      },
    );
  }

  const bar = menubar([
    {
      label: "Game",
      items: [
        ["Deal\tCtrl+D", newDeal],
        ["Undo\tCtrl+Z", undo],
        ["-", () => {}],
        ["Review", openReview],
        ["-", () => {}],
        ["Exit", () => win.close()],
      ],
    },
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

  // chrome measured: natural window is 512 wide around seven 68px pitches, 640 tall around a 560px felt
  let feltH = 0;
  const fit: FieldFit = {
    win: () => win.el,
    grid: () => ({ cols: 7, rows: FELT_H / PITCH }),
    chrome: { w: 36, h: 80 },
    cell: { base: PITCH, step: 2, min: 44, max: 110 },
    apply(next) {
      const changed = next !== u || felt.clientHeight !== feltH;
      u = next;
      feltH = felt.clientHeight;
      body.style.setProperty("--cw", `${cardW()}px`);
      body.style.setProperty("--ch", `${cardH()}px`);
      // piles are laid out in px; re-render only when the pitch or the felt's height moved
      if (changed) render();
    },
  };
  const relayout = fieldScaler(fit);

  const win = wm.open({
    id: "sol",
    title: TITLES.sol,
    icon: SOL_ICON,
    x: 620,
    y: 60,
    w: 7 * PITCH + 16 + 20,
    body,
    buttons: ["min", "close"],
    resizable: true,
    minW: 7 * 44 + 36,
    minH: Math.round((FELT_H * 44) / PITCH) + 80,
    fit,
    onResize: relayout,
    onMaximize: relayout,
    onClose: () => {
      stopFinishing();
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
    // Cmd answers as well as Ctrl
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

  if (rig === "review") {
    // a dozen draws gives the pose a journal to review
    for (let i = 0; i < 12; i++) {
      snap();
      drawFromStock(s);
    }
    render();
    openReview();
  }
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
