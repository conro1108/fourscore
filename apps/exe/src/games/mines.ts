/**
 * MINES.EXE — real minesweeper, not a picture of one (the law). Three
 * classic sizes, first click always safe, right-click flags, the face
 * watches you play. The timer counts honestly until 666 and then stays;
 * it is comfortable there.
 */

import { el } from "../dom.js";
import { px } from "../icons.js";
import { GAMES_COPY, TITLES } from "../copy.js";
import { play } from "../audio/index.js";
import { fieldScaler, type WM } from "../wm.js";
import { lcd, menubar } from "./ui.js";

interface Level {
  id: string;
  label: string;
  w: number;
  h: number;
  count: number;
}
/** The authored cell, and the smallest the ladder goes. */
const MC = 24;
const MC_MIN = 16;
const LEVELS: readonly Level[] = [
  { id: "beginner", label: "Beginner", w: 9, h: 9, count: 10 },
  { id: "intermediate", label: "Intermediate", w: 16, h: 16, count: 40 },
  { id: "expert", label: "Expert", w: 30, h: 16, count: 99 },
];

/* ---- the pure part (the tests live on this) ---- */

export interface MinesBoard {
  w: number;
  h: number;
  mines: readonly boolean[];
  adj: readonly number[];
}

export function neighbors(w: number, h: number, i: number): number[] {
  const x = i % w;
  const y = (i / w) | 0;
  const out: number[] = [];
  for (let dy = -1; dy <= 1; dy++)
    for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      const nx = x + dx;
      const ny = y + dy;
      if (nx >= 0 && nx < w && ny >= 0 && ny < h) out.push(ny * w + nx);
    }
  return out;
}

/** Lay the field after the first click — `safe` is never a mine. */
export function makeMinesBoard(
  w: number,
  h: number,
  count: number,
  safe: number,
  rand: () => number = Math.random,
): MinesBoard {
  const mines = new Array<boolean>(w * h).fill(false);
  let placed = 0;
  while (placed < count) {
    const i = Math.min(w * h - 1, (rand() * w * h) | 0);
    if (i === safe || mines[i]) continue;
    mines[i] = true;
    placed++;
  }
  const adj = mines.map((_, i) => neighbors(w, h, i).filter((n) => mines[n]).length);
  return { w, h, mines, adj };
}

/** Everything a click at `i` opens: itself, and the flood through zeros. */
export function floodReveal(b: MinesBoard, i: number, open: ReadonlySet<number>): number[] {
  if (open.has(i) || b.mines[i]) return [];
  const found: number[] = [];
  const seen = new Set<number>(open);
  const queue = [i];
  seen.add(i);
  while (queue.length) {
    const c = queue.shift()!;
    found.push(c);
    if (b.adj[c] !== 0) continue;
    for (const n of neighbors(b.w, b.h, c))
      if (!seen.has(n) && !b.mines[n]) {
        seen.add(n);
        queue.push(n);
      }
  }
  return found;
}

/* ---- the faces ---- */

const FACES: Record<"happy" | "o" | "dead" | "cool", readonly string[]> = {
  happy: [
    "....kkkkkkkk....", "..kkyyyyyyyykk..", ".kyyyyyyyyyyyyk.", ".kyyyyyyyyyyyyk.",
    "kyyyyyyyyyyyyyyk", "kyyykkyyyykkyyyk", "kyyykkyyyykkyyyk", "kyyyyyyyyyyyyyyk",
    "kyyyyyyyyyyyyyyk", "kyykyyyyyyyykyyk", "kyyykyyyyyykyyyk", "kyyyykkkkkkyyyyk",
    ".kyyyyyyyyyyyyk.", ".kyyyyyyyyyyyyk.", "..kkyyyyyyyykk..", "....kkkkkkkk....",
  ],
  o: [
    "....kkkkkkkk....", "..kkyyyyyyyykk..", ".kyyyyyyyyyyyyk.", ".kyyyyyyyyyyyyk.",
    "kyyyyyyyyyyyyyyk", "kyyykkyyyykkyyyk", "kyyykkyyyykkyyyk", "kyyyyyyyyyyyyyyk",
    "kyyyyyykkyyyyyyk", "kyyyyykyykyyyyyk", "kyyyyykyykyyyyyk", "kyyyyyykkyyyyyyk",
    ".kyyyyyyyyyyyyk.", ".kyyyyyyyyyyyyk.", "..kkyyyyyyyykk..", "....kkkkkkkk....",
  ],
  dead: [
    "....kkkkkkkk....", "..kkyyyyyyyykk..", ".kyyyyyyyyyyyyk.", ".kyyyyyyyyyyyyk.",
    "kyykykyyyykykyyk", "kyyykyyyyyykyyyk", "kyykykyyyykykyyk", "kyyyyyyyyyyyyyyk",
    "kyyyyyyyyyyyyyyk", "kyyyyyyyyyyyyyyk", "kyyyykkkkkkyyyyk", "kyyykyyyyyykyyyk",
    ".kyyyyyyyyyyyyk.", ".kyyyyyyyyyyyyk.", "..kkyyyyyyyykk..", "....kkkkkkkk....",
  ],
  cool: [
    "....kkkkkkkk....", "..kkyyyyyyyykk..", ".kyyyyyyyyyyyyk.", ".kkkkkkkkkkkkkk.",
    "kykkkkkyykkkkkyk", "kyykkkyyyykkkyyk", "kyyykkyyyykkyyyk", "kyyyyyyyyyyyyyyk",
    "kyyyyyyyyyyyyyyk", "kyykyyyyyyyykyyk", "kyyykyyyyyykyyyk", "kyyyykkkkkkyyyyk",
    ".kyyyyyyyyyyyyk.", ".kyyyyyyyyyyyyk.", "..kkyyyyyyyykk..", "....kkkkkkkk....",
  ],
};

const FLAG = [
  "............", "..rrrr......", "..rrrrrr....", "..rrrrrr....",
  "..rrrr......", "..k.........", "..k.........", "..k.........",
  "..k.........", ".kkk........", "kkkkk.......", "............",
] as const;

const MINE = [
  "............", ".....k......", "..k..k..k...", "...kkkkk....",
  "..kkkkkkk...", "kkkkwkkkkk..", "..kkkkkkk...", "...kkkkk....",
  "..k..k..k...", ".....k......", "............", "............",
] as const;

const NUM_COLORS = ["", "#0000ff", "#008000", "#ff0000", "#000080", "#800000", "#008080", "#000000", "#808080"];

/* ---- the window ---- */

export function openMines(wm: WM): void {
  const existing = wm.get("mines");
  if (existing?.isOpen()) {
    existing.focus();
    return;
  }

  let level: Level = LEVELS.find((l) => l.id === localStorage.getItem("exe.mines")) ?? LEVELS[0]!;
  let board: MinesBoard | null = null; // laid on the first click
  let open = new Set<number>();
  let flags = new Set<number>();
  let alive = true;
  let won = false;
  let timer: ReturnType<typeof setInterval> | null = null;
  let seconds = 0;
  let cells: HTMLElement[] = [];

  const body = el(`<div></div>`);
  const counter = lcd();
  const clock = lcd();
  const face = el(`<div class="mface"></div>`);
  const faceCanvas = el(`<canvas class="pix" width="16" height="16"></canvas>`) as HTMLCanvasElement;
  face.appendChild(faceCanvas);
  const setFace = (which: keyof typeof FACES): void => {
    faceCanvas.getContext("2d")!.clearRect(0, 0, 16, 16);
    px(faceCanvas, FACES[which]);
  };
  face.addEventListener("click", () => reset());

  const stopClock = (): void => {
    if (timer) clearInterval(timer);
    timer = null;
  };
  const startClock = (): void => {
    if (timer) return;
    timer = setInterval(() => {
      // it counts honestly to 666 and then it is comfortable there
      if (seconds < 666) clock.set(++seconds);
    }, 1000);
  };

  function reset(): void {
    board = null;
    open = new Set();
    flags = new Set();
    alive = true;
    won = false;
    seconds = 0;
    stopClock();
    clock.set(0);
    counter.set(level.count);
    setFace("happy");
    for (const c of cells) {
      c.className = "mcell";
      c.innerHTML = "";
    }
  }

  function setLevel(l: Level): void {
    level = l;
    localStorage.setItem("exe.mines", l.id);
    build();
  }

  function paintOpen(i: number): void {
    const c = cells[i]!;
    c.classList.add("open");
    const n = board!.adj[i]!;
    if (n) {
      c.textContent = String(n);
      c.style.color = NUM_COLORS[n]!;
    }
  }

  function lose(hit: number): void {
    alive = false;
    stopClock();
    // the machine's other software runs on the same scheme — the error chord
    // is what this OS has for a thing going wrong, and MINES.EXE gets it too
    play("chord", 0.7);
    setFace("dead");
    board!.mines.forEach((m, i) => {
      if (!m) return;
      const c = cells[i]!;
      c.classList.add("open");
      if (i === hit) c.classList.add("hit");
      const cv = el(`<canvas class="pix" width="12" height="12"></canvas>`) as HTMLCanvasElement;
      px(cv, MINE);
      c.appendChild(cv);
    });
    setTimeout(() => {
      wm.dialog({ ...GAMES_COPY.mines.lose, x: 210, y: 330, w: 320 });
    }, 600);
  }

  function checkWin(): void {
    if (open.size !== level.w * level.h - level.count) return;
    won = true;
    alive = false;
    stopClock();
    setFace("cool");
    setTimeout(() => {
      wm.dialog({ ...GAMES_COPY.mines.win, x: 210, y: 330, w: 320 });
    }, 400);
  }

  /** Rebuild the window for the current level — menus and field both. */
  function build(): void {
    body.innerHTML = "";

    const top = el(`<div class="sunken minestop"></div>`);
    top.append(counter.el, face, clock.el);

    const gridEl = el(
      `<div class="minesgrid sunken" style="grid-template-columns:repeat(${level.w},var(--mc,24px))"></div>`,
    );
    cells = [];
    for (let i = 0; i < level.w * level.h; i++) {
      const c = el(`<div class="mcell" data-i="${i}"></div>`);
      gridEl.appendChild(c);
      cells.push(c);
    }

    const toggleFlag = (i: number, cell: HTMLElement): void => {
      if (open.has(i)) return;
      if (flags.has(i)) {
        flags.delete(i);
        cell.innerHTML = "";
      } else {
        flags.add(i);
        const cv = el(`<canvas class="pix" width="12" height="12"></canvas>`) as HTMLCanvasElement;
        px(cv, FLAG);
        cell.appendChild(cv);
      }
      counter.set(level.count - flags.size);
      play("click", 0.5);
    };

    // A finger has no right button, so a held finger is the flag: the
    // period gesture translated, not a new control.
    let press: ReturnType<typeof setTimeout> | null = null;
    let pressAt: [number, number] = [0, 0];
    let pressConsumed = false;
    const clearPress = (): void => {
      if (press) clearTimeout(press);
      press = null;
    };

    gridEl.addEventListener("contextmenu", (e) => e.preventDefault());
    gridEl.addEventListener("pointerdown", (e) => {
      const cell = (e.target as HTMLElement).closest<HTMLElement>(".mcell");
      if (!cell) return;
      if (alive && !won && e.button === 0) setFace("o");
      pressConsumed = false;
      if (e.pointerType === "touch" && alive && !won) {
        pressAt = [e.clientX, e.clientY];
        press = setTimeout(() => {
          press = null;
          pressConsumed = true;
          toggleFlag(Number(cell.dataset.i), cell);
        }, 450);
      }
    });
    gridEl.addEventListener("pointermove", (e) => {
      if (press && Math.hypot(e.clientX - pressAt[0], e.clientY - pressAt[1]) > 8) clearPress();
    });
    gridEl.addEventListener("pointercancel", () => {
      clearPress();
      if (alive && !won) setFace("happy");
    });
    gridEl.addEventListener("pointerup", (e) => {
      clearPress();
      if (pressConsumed) return; // the long-press already flagged this cell
      const cell = (e.target as HTMLElement).closest<HTMLElement>(".mcell");
      if (!cell || !alive) return;
      const i = Number(cell.dataset.i);
      if (e.button === 2) {
        toggleFlag(i, cell);
        return;
      }
      if (e.button !== 0 || flags.has(i) || open.has(i)) return;
      play("click", 0.45);
      if (!board) board = makeMinesBoard(level.w, level.h, level.count, i);
      startClock();
      if (board.mines[i]) {
        lose(i);
        return;
      }
      for (const j of floodReveal(board, i, open)) {
        open.add(j);
        paintOpen(j);
      }
      checkWin();
    });

    const bar = menubar([
      {
        label: "Game",
        items: [
          ["New", () => reset()],
          ["-", () => {}],
          ...LEVELS.map(
            (l) => [l.label, () => setLevel(l), l.id === level.id] as const,
          ),
          ["-", () => {}],
          ["Exit", () => win.close()],
        ],
      },
      {
        label: "Help",
        items: [[
          "Contents",
          () => wm.dialog({ ...GAMES_COPY.mines.help, x: 260, y: 300, w: 330 }),
        ]],
      },
    ]);

    body.append(bar, top, gridEl);
    // a difficulty change re-derives the window's size; a hand size from the
    // old grid would crush or strand the new one
    win.el.classList.remove("sized");
    win.el.style.height = "";
    win.el.style.width = `${level.w * MC + 32}px`;
    winSpec.minW = Math.max(level.w * MC_MIN + 32, 210); // the LCDs need a row
    winSpec.minH = level.h * MC_MIN + 112;
    relayout();
    reset();
  }

  /* Drag the window and the field grows, on the same stepped ladder the board
     uses. Measured chrome: a natural Beginner window is 248x328 around a 9x9
     field of 24px cells, so 32 and 112 are everything that isn't cells — the
     LCD row, the margins, and the sunken grid's own 3px of padding. */
  const relayout = fieldScaler({
    win: () => win.el,
    grid: () => ({ cols: level.w, rows: level.h }),
    chrome: { w: 32, h: 112 },
    cell: { base: MC, step: 4, min: MC_MIN, max: 48 },
    apply: (mc) => body.style.setProperty("--mc", `${mc}px`),
  });

  const winSpec = {
    id: "mines",
    title: TITLES.mines,
    icon: GAME_ICON_MINE,
    x: 96,
    y: 92,
    w: level.w * MC + 32,
    body,
    buttons: ["min", "close"] as const,
    resizable: true,
    minW: Math.max(level.w * MC_MIN + 32, 210),
    minH: level.h * MC_MIN + 112,
    onResize: () => relayout(),
    onMaximize: () => relayout(),
    onClose: stopClock,
  };
  const win = wm.open(winSpec);

  const onUp = (): void => {
    if (!win.isOpen()) {
      removeEventListener("pointerup", onUp);
      removeEventListener("pointercancel", onUp);
      return;
    }
    if (alive && !won) setFace("happy");
  };
  addEventListener("pointerup", onUp);
  addEventListener("pointercancel", onUp);

  build();
}

/** 16x16 titlebar/desktop icon: a mine on gray. */
export const GAME_ICON_MINE = [
  "................", "................", ".......k........", "...k...k...k....",
  "....k.kkk.k.....", ".....kkkkk......", "....kkkkkkk.....", "..kkkkwkkkkk....",
  "....kkkkkkk.....", ".....kkkkk......", "....k.kkk.k.....", "...k...k...k....",
  ".......k........", "................", "................", "................",
] as const;
