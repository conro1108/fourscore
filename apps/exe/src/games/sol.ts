/**
 * SOL.EXE — Klondike, draw one, genuinely playing (the law: run it, never
 * illustrate it). Drag a run, drop it where it's legal, double-click sends a
 * card home. And the win is the period's one true special effect: the cards
 * leave their foundations and bounce across the whole desktop on a canvas
 * that never repaints, because the not-repainting IS the effect — this
 * desktop has believed that from the start.
 */

import { el } from "../dom.js";
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

const SUITS = ["♠", "♥", "♦", "♣"] as const;
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

function cardEl(c: Card, faceUp: boolean): HTMLElement {
  if (!faceUp) return el(`<div class="card back"></div>`);
  const d = el(`<div class="card ${isRed(c.suit) ? "red" : "blk"}"></div>`);
  d.innerHTML = `<span class="rk">${RANKS[c.rank]}${SUITS[c.suit]}</span><span class="pip">${SUITS[c.suit]}</span>`;
  return d;
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

  function render(): void {
    felt.innerHTML = "";

    // stock
    const top = scaleOf(u, 10);
    const stock = el(`<div class="slot" data-pile="stock" style="left:${COL_X(0)}px;top:${top}px"></div>`);
    if (s.stock.length) stock.appendChild(cardEl(s.stock[s.stock.length - 1]!, false));
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
        `<div class="slot found" data-pile="f${i}" style="left:${COL_X(3 + i)}px;top:${top}px"><span class="ghostpip">${SUITS[i]}</span></div>`,
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
      if (cards.length !== 1) return false;
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
      if (s.stock.length || s.waste.length) snap();
      const recycled = drawFromStock(s);
      if (recycled) statusEl.textContent = GAMES_COPY.sol.stuckDeal;
      render();
      return;
    }
    const tag = target.closest<HTMLElement>("[data-drag]")?.dataset.drag;
    if (!tag) return;
    e.preventDefault();

    let from: PileRef;
    let cards: Card[];
    let hidden: HTMLElement[];
    if (tag === "waste") {
      from = { kind: "waste" };
      cards = [s.waste[s.waste.length - 1]!];
      hidden = [target.closest<HTMLElement>("[data-drag]")!];
    } else if (tag.startsWith("f")) {
      from = { kind: "found", i: Number(tag.slice(1)) };
      const pile = s.found[from.i]!;
      cards = [pile[pile.length - 1]!];
      hidden = [target.closest<HTMLElement>("[data-drag]")!];
    } else {
      const [i, j] = tag.slice(1).split(":").map(Number) as [number, number];
      from = { kind: "tab", i };
      cards = s.tab[i]!.up.slice(j);
      hidden = [...felt.querySelectorAll<HTMLElement>(`[data-drag^="t${i}:"]`)].filter(
        (c) => Number(c.dataset.drag!.split(":")[1]) >= j,
      );
    }

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
      // click never disturbs the DOM under the cursor
      drag.moved = true;
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

    const paint = (c: Card, x: number, y: number): void => {
      ctx.fillStyle = "#fff";
      ctx.fillRect(x, y, cw, ch);
      ctx.strokeStyle = "#000";
      ctx.strokeRect(x + 0.5, y + 0.5, cw - 1, ch - 1);
      ctx.fillStyle = isRed(c.suit) ? "#c00000" : "#000";
      ctx.font = `bold ${scaleOf(u, 13)}px Tahoma`;
      ctx.fillText(`${RANKS[c.rank]}${SUITS[c.suit]}`, x + scaleOf(u, 5), y + scaleOf(u, 16));
      ctx.font = `${scaleOf(u, 26)}px Tahoma`;
      ctx.fillText(SUITS[c.suit]!, x + cw / 2 - scaleOf(u, 9), y + ch / 2 + scaleOf(u, 10));
    };

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
    { label: "Game", items: [["Deal", newDeal], ["Undo", undo], ["-", () => {}], ["Exit", () => win.close()]] },
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
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z" && wm.focused()?.id === "sol") {
      e.preventDefault();
      undo();
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
