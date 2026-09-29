/** SNAKE.EXE. Stepped on its own clock, a little faster per chip; every edge
 * wraps. Arrow keys point it, and on a touchscreen four arrow buttons under
 * the field do the same. Turns queue, so a tight bend is two quick inputs. */

import { el, onPointerDrag } from "../dom.js";
import { GAMES_COPY, TITLES } from "../copy.js";
import { play } from "../audio/index.js";
import { centered, fieldScaler, type FieldFit, type WM } from "../wm.js";
import { menubar } from "./ui.js";

const COLS = 22;
const ROWS = 16;
const PX = 4; // canvas pixels per cell
/** Screen px per canvas px. Whole numbers only: a fractional nearest-neighbour upscale wobbles. */
const ZOOM = 4;
/** First step and the floor it speeds toward, ms; each chip takes off a little. */
const STEP_MS = 110;
const STEP_MIN_MS = 62;
const STEP_PER_CHIP_MS = 2;
/** Turns waiting to be taken. Three is a U-turn and a correction. */
const QUEUE = 3;
const BEST_KEY = "exe.snake.best";
/** The touch arrow pad's height, chrome the fit must count (chrome.css .snakepad). */
const PAD_H = 70;

type Dir = readonly [number, number];
const DIRS: Record<string, Dir> = {
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
};

export function openSnake(wm: WM): void {
  const existing = wm.get("snake");
  if (existing?.isOpen()) {
    existing.focus();
    return;
  }

  const body = el(`<div></div>`);
  const frame = el(`<div class="sunken snakefield" style="margin:6px 10px 4px;background:#000;width:max-content;padding:3px"></div>`);
  const canvas = el(
    `<canvas class="pix" width="${COLS * PX}" height="${ROWS * PX}" style="width:${COLS * PX * ZOOM}px;height:${ROWS * PX * ZOOM}px"></canvas>`,
  ) as HTMLCanvasElement;
  frame.appendChild(canvas);
  // a touchscreen gets the arrow keys as buttons; a keyboard already has them
  const coarse = matchMedia("(pointer: coarse)").matches;
  const pad = coarse
    ? el(`<div class="snakepad">
        <div class="btn" data-d="ArrowUp">↑</div>
        <div class="row"><div class="btn" data-d="ArrowLeft">←</div><div class="btn" data-d="ArrowDown">↓</div><div class="btn" data-d="ArrowRight">→</div></div>
      </div>`)
    : null;
  const status = el(`<div class="statusbar"><div id="snakeStatus"></div></div>`);
  const statusEl = status.firstElementChild as HTMLElement;
  const ctx = canvas.getContext("2d")!;

  let snake: [number, number][] = [];
  let dir: Dir | null = null;
  let queue: Dir[] = [];
  let grow = 0;
  let stepMs = STEP_MS;
  let chip: [number, number] = [0, 0];
  let chipColor: "r" | "y" = "r";
  let alive = true;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const length = (): number => snake.length + grow;

  const free = (): [number, number] => {
    for (;;) {
      const c: [number, number] = [(Math.random() * COLS) | 0, (Math.random() * ROWS) | 0];
      if (!snake.some(([x, y]) => x === c[0] && y === c[1])) return c;
    }
  };

  const cell = (x: number, y: number, color: string, round = false): void => {
    ctx.fillStyle = color;
    if (round) {
      // 4x4 disc: corners dark
      ctx.fillRect(x * PX + 1, y * PX, 2, 4);
      ctx.fillRect(x * PX, y * PX + 1, 4, 2);
    } else {
      ctx.fillRect(x * PX, y * PX, PX, PX);
    }
  };

  function paint(): void {
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    cell(chip[0], chip[1], chipColor === "r" ? "#e0332e" : "#f0b400", true);
    snake.forEach(([x, y], i) => cell(x, y, i === 0 ? "#3cd43c" : "#18a018"));
  }

  function die(): void {
    alive = false;
    play("chord", 0.7);
    const n = length();
    const best = Number(localStorage.getItem(BEST_KEY)) || 0;
    if (n > best) localStorage.setItem(BEST_KEY, String(n));
    setTimeout(() => {
      wm.dialog({ ...GAMES_COPY.snake.dead(n, best), x: 260, y: 480, w: 330 });
    }, 500);
  }

  function step(): void {
    if (!win.isOpen()) return;
    timer = setTimeout(step, stepMs);
    if (!alive || !dir) return;
    // paused while unfocused
    if (wm.focused()?.id !== "snake") return;
    const next = queue.shift();
    if (next) dir = next;
    const head: [number, number] = [
      (snake[0]![0] + dir[0] + COLS) % COLS,
      (snake[0]![1] + dir[1] + ROWS) % ROWS,
    ];
    if (snake.some(([x, y]) => x === head[0] && y === head[1])) {
      die();
      return;
    }
    snake.unshift(head);
    if (head[0] === chip[0] && head[1] === chip[1]) {
      play("disc-land", 0.55);
      grow += 2;
      stepMs = Math.max(STEP_MIN_MS, stepMs - STEP_PER_CHIP_MS);
      chip = free();
      chipColor = chipColor === "r" ? "y" : "r";
      statusEl.textContent = GAMES_COPY.snake.score(length());
    }
    if (grow > 0) grow--;
    else snake.pop();
    paint();
  }

  function reset(): void {
    const cy = ROWS >> 1;
    snake = [[10, cy], [9, cy], [8, cy], [7, cy]];
    dir = null;
    queue = [];
    grow = 0;
    stepMs = STEP_MS;
    alive = true;
    chip = free();
    chipColor = "r";
    statusEl.textContent = GAMES_COPY.snake.idle;
    paint();
  }

  /** The heading the next turn is relative to: the last one queued. */
  const heading = (): Dir => queue[queue.length - 1] ?? dir ?? [1, 0];
  const steer = (d: Dir): void => {
    if (!alive) return;
    if (!dir) {
      // first move: the body lies to the left, so not that way
      if (d[0] === -1) return;
      dir = d;
      statusEl.textContent = GAMES_COPY.snake.score(length());
      return;
    }
    const cur = heading();
    if (d[0] === -cur[0] && d[1] === -cur[1]) return; // straight back into the body
    if (d[0] === cur[0] && d[1] === cur[1]) return; // already going that way
    if (queue.length < QUEUE) queue.push(d);
  };
  // the pad answers on pointerdown: a snake can't wait for a click
  pad?.addEventListener("pointerdown", (e) => {
    const d = (e.target as HTMLElement).closest<HTMLElement>("[data-d]")?.dataset.d;
    if (!d) return;
    e.preventDefault();
    steer(DIRS[d]!);
  });

  const onKey = (e: KeyboardEvent): void => {
    if (!win.isOpen()) {
      removeEventListener("keydown", onKey);
      return;
    }
    if (wm.focused()?.id !== "snake") return;
    if (e.key === "F2" || ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "d")) {
      e.preventDefault();
      reset();
      return;
    }
    const d = DIRS[e.key];
    if (!d) return;
    e.preventDefault();
    steer(d);
  };
  addEventListener("keydown", onKey);

  // a swipe on the field points it too; a tap is not a direction
  let swipeFrom: [number, number] = [0, 0];
  onPointerDrag(
    frame,
    (e) => {
      if (e.pointerType !== "touch") return null;
      swipeFrom = [e.clientX, e.clientY];
      return () => {};
    },
    (e, cancelled) => {
      if (cancelled) return;
      const dx = e.clientX - swipeFrom[0];
      const dy = e.clientY - swipeFrom[1];
      if (Math.hypot(dx, dy) < 18) return;
      steer(Math.abs(dx) > Math.abs(dy) ? [Math.sign(dx), 0] : [0, Math.sign(dy)]);
    },
  );

  const bar = menubar([
    { label: "Game", items: [["New\tCtrl+D", reset], ["-", () => {}], ["Exit", () => win.close()]] },
    {
      label: "Help",
      items: [[
        "Contents",
        () => wm.dialog({ ...GAMES_COPY.snake.help, x: 300, y: 450, w: 330 }),
      ]],
    },
  ]);

  body.append(bar, frame, ...(pad ? [pad] : []), status);

  // Bitmap, so the scale ladder steps by whole px (88px of window per rung) to keep chips square.
  const naturalMargin = frame.style.margin;
  const fit: FieldFit = {
    win: () => win.el,
    grid: () => ({ cols: COLS * PX, rows: ROWS * PX }),
    chrome: { w: 32, h: 86 + (pad ? PAD_H : 0) },
    cell: { base: ZOOM, step: 1, min: 2, max: 12 },
    apply(z, wide) {
      canvas.style.width = `${COLS * PX * z}px`;
      canvas.style.height = `${ROWS * PX * z}px`;
      frame.style.margin = wide ? centered(naturalMargin) : naturalMargin;
    },
  };
  const relayout = fieldScaler(fit);

  const win = wm.open({
    id: "snake",
    title: TITLES.snake,
    icon: SNAKE_ICON,
    x: 120,
    y: 380,
    w: COLS * PX * ZOOM + 32,
    body,
    buttons: ["min", "close"],
    resizable: true,
    minW: COLS * PX * 2 + 32,
    minH: ROWS * PX * 2 + 86,
    fit,
    onResize: relayout,
    onMaximize: relayout,

    onClose: () => {
      if (timer) clearTimeout(timer);
      timer = null;
    },
  });
  reset();
  relayout();
  timer = setTimeout(step, stepMs);
}

// n, not g: g is the desktop teal and the icon would vanish against it
export const SNAKE_ICON = [
  "................", "................", "....nnnnnnnn....", "...nnnnnnnnnn...",
  "...nn......nn...", "...nn...........", "...nnnnnnnnn....", "....nnnnnnnnnn..",
  "..........nnn...", "...........nn...", "...nnnnnnnnnn...", "..nnnnnnnnnn....",
  "..nnw...........", "..nn............", "...rr...........", "................",
] as const;
