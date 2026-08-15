/**
 * SNAKE.EXE — the QBasic lineage, genuinely stepping on its own clock. The
 * snake moves in steps because that is what snakes in 1995 did (and the
 * timing law would demand it anyway). It eats the board's chips; nobody has
 * asked why the chips are in this program.
 */

import { el } from "../dom.js";
import { GAMES_COPY, TITLES } from "../copy.js";
import { play } from "../audio/index.js";
import type { WM } from "../wm.js";
import { menubar } from "./ui.js";

const COLS = 22;
const ROWS = 16;
const PX = 4; // canvas pixels per cell
const STEP_MS = 110;

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
  const frame = el(`<div class="sunken" style="margin:6px 10px 4px;background:#000;width:max-content;padding:3px"></div>`);
  const canvas = el(
    `<canvas class="pix" width="${COLS * PX}" height="${ROWS * PX}" style="width:${COLS * PX * 4}px;height:${ROWS * PX * 4}px"></canvas>`,
  ) as HTMLCanvasElement;
  frame.appendChild(canvas);
  const status = el(`<div class="statusbar"><div id="snakeStatus"></div></div>`);
  const statusEl = status.firstElementChild as HTMLElement;
  const ctx = canvas.getContext("2d")!;

  let snake: [number, number][] = [];
  let dir: Dir | null = null;
  let pending: Dir | null = null;
  let grow = 0;
  let chip: [number, number] = [0, 0];
  let chipColor: "r" | "y" = "r";
  let alive = true;
  let timer: ReturnType<typeof setInterval> | null = null;

  const free = (): [number, number] => {
    for (;;) {
      const c: [number, number] = [(Math.random() * COLS) | 0, (Math.random() * ROWS) | 0];
      if (!snake.some(([x, y]) => x === c[0] && y === c[1])) return c;
    }
  };

  const cell = (x: number, y: number, color: string, round = false): void => {
    ctx.fillStyle = color;
    if (round) {
      // a 4x4 disc: the corners stay dark, which is all a circle is down here
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

  function die(kind: "dead" | "wall"): void {
    alive = false;
    play("chord", 0.7);
    const spec = GAMES_COPY.snake[kind];
    setTimeout(() => {
      wm.dialog({ ...spec, x: 260, y: 480, w: 330 });
    }, 500);
  }

  function step(): void {
    if (!alive || !dir) return;
    // the snake waits politely while its window is not the one you're using
    if (wm.focused()?.id !== "snake") return;
    if (pending) {
      dir = pending;
      pending = null;
    }
    const head: [number, number] = [snake[0]![0] + dir[0], snake[0]![1] + dir[1]];
    // the sides go around; the top and the bottom are final
    head[0] = (head[0] + COLS) % COLS;
    if (head[1] < 0 || head[1] >= ROWS) {
      die("wall");
      return;
    }
    if (snake.some(([x, y]) => x === head[0] && y === head[1])) {
      die("dead");
      return;
    }
    snake.unshift(head);
    if (head[0] === chip[0] && head[1] === chip[1]) {
      // it eats the board's chips, so it eats them with the board's own knock
      play("disc-land", 0.55);
      grow += 2;
      chip = free();
      chipColor = chipColor === "r" ? "y" : "r";
      statusEl.textContent = GAMES_COPY.snake.score(snake.length + grow);
    }
    if (grow > 0) grow--;
    else snake.pop();
    paint();
  }

  function reset(): void {
    const cy = ROWS >> 1;
    snake = [[10, cy], [9, cy], [8, cy], [7, cy]];
    dir = null;
    pending = null;
    grow = 0;
    alive = true;
    chip = free();
    chipColor = "r";
    statusEl.textContent = GAMES_COPY.snake.idle;
    paint();
  }

  const onKey = (e: KeyboardEvent): void => {
    if (!win.isOpen()) {
      removeEventListener("keydown", onKey);
      return;
    }
    const d = DIRS[e.key];
    if (!d || wm.focused()?.id !== "snake") return;
    e.preventDefault();
    if (!alive) return;
    if (!dir) {
      // first arrow: any way but backwards into your own body
      if (d[0] === -1) return;
      dir = d;
      statusEl.textContent = GAMES_COPY.snake.score(snake.length);
      return;
    }
    const cur = pending ?? dir;
    if (d[0] === -cur[0] && d[1] === -cur[1]) return; // no U-turns
    pending = d;
  };
  addEventListener("keydown", onKey);

  const bar = menubar([
    { label: "Game", items: [["New", reset], ["-", () => {}], ["Exit", () => win.close()]] },
    {
      label: "Help",
      items: [[
        "Contents",
        () => wm.dialog({ ...GAMES_COPY.snake.help, x: 300, y: 450, w: 330 }),
      ]],
    },
  ]);

  body.append(bar, frame, status);
  const win = wm.open({
    id: "snake",
    title: TITLES.snake,
    icon: SNAKE_ICON,
    x: 120,
    y: 380,
    w: COLS * PX * 4 + 32,
    body,
    buttons: ["min", "close"],
    onClose: () => {
      if (timer) clearInterval(timer);
      timer = null;
    },
  });
  reset();
  timer = setInterval(step, STEP_MS);
}

export const SNAKE_ICON = [
  "................", "................", "....gggggggg....", "...gggggggggg...",
  "...gg......gg...", "...gg...........", "...ggggggggg....", "....gggggggggg..",
  "..........ggg...", "...........gg...", "...gggggggggg...", "..gggggggggg....",
  "..ggw...........", "..gg............", "...rr...........", "................",
] as const;
