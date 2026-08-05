/**
 * The play area: opponent, board and discs, drawn to a small fixed buffer that
 * CSS scales up crisply (`image-rendering: pixelated`).
 *
 * The buffer is 120x152 device-independent pixels and stays that size on every
 * screen. Letting the canvas match the display resolution instead would mean a
 * 12px disc drawn at some fractional size, and 1px outlines would double or
 * vanish depending on where they landed — the same failure cozy_sprites warns
 * about. Everything here draws at integer coordinates for that reason,
 * including the idle bob, which moves by whole pixels or not at all.
 *
 * The scene owns its own animation loop and is told about state changes; it
 * never reads game state directly. React holds the truth, calls `update` with a
 * snapshot, and calls `animateDrop` when a disc is played.
 */

import { CONNECT4, type Cell, type Mood, type Player, type Variant } from "@fourscore/engine";
import {
  BOARD_COLORS,
  DISC_MUTED,
  DISC_RED,
  DISC_SIZE,
  DISC_YELLOW,
  HOLE,
  bodyArt,
  faceArt,
  type FaceName,
} from "./art.js";
import { artCanvas, overlay, tint, type Art } from "./pixel.js";

export const CELL = 16;
const FRAME = 4;
const BOT_H = 34;
const GHOST_Y = 34;
const CREATURE_SCALE = 2;

/**
 * The scene's pixel geometry for a variant.
 *
 * The buffer used to be a hardcoded 120x152. It now grows with the board — 9x8
 * Connect 5 needs 152x184 — but every number in here is still an integer
 * multiple of the 16px cell, and nothing is ever scaled fractionally. A bigger
 * buffer is fine; a fractional one is what wrecks the art.
 */
export interface SceneLayout {
  cols: number;
  rows: number;
  width: number;
  height: number;
  boardY: number;
  boardH: number;
  creatureX: number;
}

export function layoutFor(v: Variant): SceneLayout {
  const cols = v.width;
  const rows = v.height;
  const width = cols * CELL + FRAME * 2;
  const boardH = rows * CELL + FRAME * 2;
  const boardY = BOT_H + 14;
  return {
    cols,
    rows,
    width,
    height: boardY + boardH,
    boardY,
    boardH,
    // Rounded to a whole pixel: the creature blits at exactly 2x, and an odd
    // buffer width would otherwise land it on a half pixel and resample it.
    creatureX: Math.round((width - 16 * CREATURE_SCALE) / 2),
  };
}

/** Connect 4's dimensions, for callers that just need a default canvas size. */
export const DEFAULT_LAYOUT = layoutFor(CONNECT4);
export const SCENE_W = DEFAULT_LAYOUT.width; // 120
export const SCENE_H = DEFAULT_LAYOUT.height; // 152
export const BOARD_Y = DEFAULT_LAYOUT.boardY;

const cellX = (col: number): number => FRAME + col * CELL + (CELL - DISC_SIZE) / 2;
const cellY = (row: number, L: SceneLayout): number =>
  L.boardY + FRAME + row * CELL + (CELL - DISC_SIZE) / 2;

export interface Coord {
  row: number;
  col: number;
}

/** A caret above a column, used by the review to point at moves. */
export interface ColumnMark {
  col: number;
  kind: "played" | "best";
}

export interface SceneModel {
  variant: Variant;
  grid: Cell[][];
  winningCells: readonly Coord[];
  hoverCol: number | null;
  /** Review annotations. Empty during play. */
  marks: readonly ColumnMark[];
  botId: string;
  botColors: { body: string; shade: string };
  mood: Mood;
  thinking: boolean;
  /** Which colour the human is playing, so the ghost disc matches. */
  humanPlayer: Player;
  /** True when a click would actually do something. */
  interactive: boolean;
  /** Dim the board — used behind the review overlay. */
  dimmed: boolean;
}

const EMPTY_MODEL: SceneModel = {
  variant: CONNECT4,
  grid: Array.from({ length: CONNECT4.height }, () => Array<Cell>(CONNECT4.width).fill(null)),
  winningCells: [],
  hoverCol: null,
  marks: [],
  botId: "pebble",
  botColors: { body: "#9aa5b1", shade: "#6b7684" },
  mood: "idle",
  thinking: false,
  humanPlayer: "red",
  interactive: false,
  dimmed: false,
};

/** Moods map onto the hand-drawn faces; `thinking` overrides while searching. */
const MOOD_FACE: Record<Mood, FaceName> = {
  idle: "idle",
  thinking: "thinking",
  pleased: "pleased",
  smug: "smug",
  worried: "worried",
  alarmed: "alarmed",
  resigned: "resigned",
};

interface DropAnim {
  col: number;
  row: number;
  player: Player;
  start: number;
  duration: number;
}

export class BoardScene {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private model: SceneModel = EMPTY_MODEL;
  private layout: SceneLayout = DEFAULT_LAYOUT;
  private drop: DropAnim | null = null;
  private raf = 0;
  private running = false;
  /** Resolves when the current drop lands, so callers can sequence turns. */
  private dropSettled: (() => void) | null = null;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    canvas.width = DEFAULT_LAYOUT.width;
    canvas.height = DEFAULT_LAYOUT.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("no 2d context");
    ctx.imageSmoothingEnabled = false;
    this.ctx = ctx;
    this.running = true;
    this.loop();
  }

  update(model: SceneModel): void {
    if (model.variant !== this.model.variant) this.resize(model.variant);
    this.model = model;
  }

  /**
   * Switch board geometry. Resizing the canvas resets its context state, so
   * smoothing has to be turned off again — leaving it on is exactly the bug
   * that makes the art go soft, and it wouldn't show up until someone changed
   * variant mid-session.
   */
  private resize(v: Variant): void {
    this.layout = layoutFor(v);
    this.canvas.width = this.layout.width;
    this.canvas.height = this.layout.height;
    this.ctx.imageSmoothingEnabled = false;
  }

  /**
   * Animate a disc falling into place. Resolves when it lands, which is how the
   * caller knows it's safe to let the next player move.
   */
  animateDrop(col: number, row: number, player: Player): Promise<void> {
    const distance = row + 1;
    this.drop = {
      col,
      row,
      player,
      start: performance.now(),
      duration: 90 + distance * 26,
    };
    return new Promise((resolve) => {
      this.dropSettled = resolve;
    });
  }

  /** The column under a pointer event, or null if it's off the board. */
  columnAt(clientX: number): number | null {
    const rect = this.canvas.getBoundingClientRect();
    if (rect.width === 0) return null;
    const x = ((clientX - rect.left) / rect.width) * this.layout.width;
    const col = Math.floor((x - FRAME) / CELL);
    return col >= 0 && col < this.layout.cols ? col : null;
  }

  destroy(): void {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  private loop = (): void => {
    if (!this.running) return;
    this.draw(performance.now());
    this.raf = requestAnimationFrame(this.loop);
  };

  private draw(now: number): void {
    const { ctx } = this;
    const m = this.model;

    ctx.fillStyle = m.dimmed ? "#1a141f" : "#241c2c";
    ctx.fillRect(0, 0, this.layout.width, this.layout.height);

    this.drawCreature(now);
    this.drawGhost();
    this.drawBoard(now);
    this.drawMarks();
  }

  /**
   * Carets above the columns during review: amber for what you played, green
   * for what was there instead. When they're the same column only the green one
   * draws, which is its own small reward.
   */
  private drawMarks(): void {
    const marks = this.model.marks;
    if (marks.length === 0) return;
    const { ctx } = this;

    const best = new Set(marks.filter((m) => m.kind === "best").map((m) => m.col));
    for (const mark of marks) {
      if (mark.kind === "played" && best.has(mark.col)) continue;
      ctx.fillStyle = mark.kind === "best" ? "#6fbf73" : "#e0a33c";
      const x = FRAME + mark.col * CELL + CELL / 2;
      const y = this.layout.boardY - 8;
      for (let i = 0; i < 4; i++) {
        ctx.fillRect(x - i, y + i, i * 2, 1);
      }
    }
  }

  // -- opponent -------------------------------------------------------------

  private drawCreature(now: number): void {
    const m = this.model;
    const face = m.thinking ? "thinking" : MOOD_FACE[m.mood];

    // Alarm gets a faster, shallower jitter; everything else breathes slowly.
    // Both are whole-pixel offsets — a half-pixel bob would resample the art.
    const bob =
      m.mood === "alarmed" && !m.thinking
        ? Math.floor(now / 90) % 2
        : Math.floor(now / 620) % 2;

    const art = this.creatureArt(m.botId, m.botColors, face);
    const sprite = artCanvas(art);

    this.ctx.drawImage(
      sprite.canvas,
      0,
      0,
      sprite.w,
      sprite.h,
      this.layout.creatureX,
      1 + bob,
      sprite.w * CREATURE_SCALE,
      sprite.h * CREATURE_SCALE,
    );

    if (m.thinking) this.drawThinkingDots(now);
  }

  /**
   * Body + tint + face, memoised.
   *
   * Compositing is cheap but `artCanvas` caches on object identity, so building
   * a fresh Art every frame would repaint the sprite sixty times a second and
   * leak a canvas each time.
   */
  private readonly creatureCache = new Map<string, Art>();

  private creatureArt(
    botId: string,
    colors: { body: string; shade: string },
    face: FaceName,
  ): Art {
    const key = `${botId}|${colors.body}|${face}`;
    let art = this.creatureCache.get(key);
    if (!art) {
      art = overlay(tint(bodyArt(botId), { b: colors.body, s: colors.shade }), faceArt(face));
      this.creatureCache.set(key, art);
    }
    return art;
  }

  private drawThinkingDots(now: number): void {
    const { ctx } = this;
    const lit = Math.floor(now / 260) % 4;
    ctx.fillStyle = "#c9c2d4";
    for (let i = 0; i < 3; i++) {
      if (i >= lit) continue;
      ctx.fillRect(this.layout.creatureX + 36 + i * 4, 6, 2, 2);
    }
  }

  // -- the disc waiting to be dropped ---------------------------------------

  private drawGhost(): void {
    const m = this.model;
    if (!m.interactive || m.hoverCol === null || this.drop) return;
    // A full column means there's nothing to preview.
    if (m.grid[0]?.[m.hoverCol] != null) return;

    const art = m.humanPlayer === "red" ? DISC_RED : DISC_YELLOW;
    const sprite = artCanvas(art);
    this.ctx.globalAlpha = 0.55;
    this.ctx.drawImage(sprite.canvas, cellX(m.hoverCol), GHOST_Y);
    this.ctx.globalAlpha = 1;
  }

  // -- board ----------------------------------------------------------------

  private drawBoard(now: number): void {
    const { ctx } = this;
    const m = this.model;
    const L = this.layout;

    ctx.fillStyle = m.dimmed ? "#332f4d" : BOARD_COLORS.face;
    ctx.fillRect(0, L.boardY, L.width, L.boardH);
    ctx.fillStyle = m.dimmed ? "#26243a" : BOARD_COLORS.edge;
    ctx.fillRect(0, L.boardY + L.boardH - 3, L.width, 3);
    ctx.fillStyle = m.dimmed ? "#413d63" : BOARD_COLORS.highlight;
    ctx.fillRect(0, L.boardY, L.width, 1);

    // Column tint under the pointer, so the target reads before you commit.
    if (m.interactive && m.hoverCol !== null && !this.drop) {
      ctx.fillStyle = "rgba(255,255,255,0.07)";
      ctx.fillRect(FRAME + m.hoverCol * CELL, L.boardY + FRAME - 2, CELL, L.rows * CELL + 4);
    }

    const hole = artCanvas(HOLE);
    const winning = new Set(m.winningCells.map((c) => `${c.row},${c.col}`));
    // Winning discs pulse; everything else is static so the pulse is legible.
    const pulseOn = Math.floor(now / 380) % 2 === 0;

    for (let row = 0; row < L.rows; row++) {
      for (let col = 0; col < L.cols; col++) {
        const x = cellX(col);
        const y = cellY(row, L);

        const hidden = this.drop && this.drop.row === row && this.drop.col === col;
        const cell = hidden ? null : m.grid[row]?.[col] ?? null;

        if (cell === null) {
          ctx.drawImage(hole.canvas, x, y);
          continue;
        }

        const isWinner = winning.has(`${row},${col}`);
        const art = m.dimmed && !isWinner ? DISC_MUTED : cell === "red" ? DISC_RED : DISC_YELLOW;
        ctx.drawImage(artCanvas(art).canvas, x, y);

        // A wash alone reads as almost nothing against an already-bright disc —
        // measured, a 32% white overlay moved a yellow disc from #e8b33a to
        // #efcb79, which is invisible at a glance. The ring is what actually
        // announces the win; the wash just makes it breathe.
        if (isWinner) {
          ctx.fillStyle = pulseOn ? "#fff6d8" : "#e0a33c";
          ctx.fillRect(x - 1, y - 1, DISC_SIZE + 2, 1);
          ctx.fillRect(x - 1, y + DISC_SIZE, DISC_SIZE + 2, 1);
          ctx.fillRect(x - 1, y, 1, DISC_SIZE);
          ctx.fillRect(x + DISC_SIZE, y, 1, DISC_SIZE);
          if (pulseOn) {
            ctx.fillStyle = "rgba(255,255,255,0.45)";
            ctx.fillRect(x + 2, y + 2, DISC_SIZE - 4, DISC_SIZE - 4);
          }
        }
      }
    }

    this.drawFallingDisc(now);
  }

  private drawFallingDisc(now: number): void {
    const drop = this.drop;
    if (!drop) return;

    const t = Math.min(1, (now - drop.start) / drop.duration);
    const from = GHOST_Y;
    const to = cellY(drop.row, this.layout);
    // Quadratic, so it accelerates like something falling rather than sliding.
    const y = Math.round(from + (to - from) * t * t);

    const art = drop.player === "red" ? DISC_RED : DISC_YELLOW;
    this.ctx.drawImage(artCanvas(art).canvas, cellX(drop.col), y);

    if (t >= 1) {
      this.drop = null;
      const settled = this.dropSettled;
      this.dropSettled = null;
      settled?.();
    }
  }
}
