/**
 * REVIEW.EXE: the finished game, walkable (←/→, row click, curve click).
 * One request per opening, on the analysis worker so live play never queues
 * behind it. Confidence law (CLAUDE.md): one solid line, no legend, hedged
 * copy for estimates. Positions are replayed through the engine's `Match`.
 */

import { el } from "./dom.js";
import { ICONS } from "./icons.js";
import { REVIEW, TITLES } from "./copy.js";
import { Match, byId, type Cell, type CurvePoint, type PlyRecord, type Review, type Variant } from "@fourscore/engine";
import type { WM } from "./wm.js";
import type { EndResult } from "./board.js";

export interface ReviewDeps {
  wm: WM;
  /** The last finished game, or null before anything has ended. */
  last(): EndResult | null;
  /** Ask the analysis worker to grade it. */
  review(variantId: string, history: readonly number[]): Promise<Review>;
}

/** Reopening mid-solve must not leave a stale answer landing in a new window. */
let generation = 0;

/* Walked board thumbnail; cell size fits 304px (Connect 7 gets a small one). */
const PAN_W = 304;
const PAN_MAX_H = 156;
const PAN_CELL_MAX = 28;
const FRAME = 6;
const HOLE = "#1c1c1c";
const CHIP = { red: ["#e0332e", "#7a0f14"], yellow: ["#f0b400", "#8a5c00"] } as const;

/** `startAt` backs `?state=review&ply=N` for the screenshot harness. */
export function openReview({ wm, last, review }: ReviewDeps, startAt?: number): void {
  const end = last();
  if (!end || end.kind === "forfeit" || end.history.length === 0) {
    wm.dialog({ ...REVIEW.none, x: 470, y: 300, ax: "center", w: 330 });
    return;
  }

  wm.get("review")?.close();
  const gen = ++generation;

  const variant = end.variant;
  // hoisted functions below can't narrow `end`, so pull these out here
  const history = end.history;
  // frame i = board after i plies, same numbering as the curve
  const frames = replay(variant, history);
  const cellPx = Math.min(
    PAN_CELL_MAX,
    Math.floor((PAN_W - 2 * FRAME) / variant.width),
    Math.floor((PAN_MAX_H - 2 * FRAME) / variant.height),
  );

  const body = el(`<div style="padding:6px 8px 8px"></div>`);
  const head = el(`<div style="font-weight:bold;margin:2px 2px 6px"></div>`);
  const cv = el(`<canvas class="sunken" width="304" height="88" style="display:block;width:304px;height:88px;background:#fff"></canvas>`) as HTMLCanvasElement;
  const pan = el(
    `<canvas width="${variant.width * cellPx + 2 * FRAME}" height="${variant.height * cellPx + 2 * FRAME}"
       style="display:block;margin:6px auto 0;image-rendering:pixelated"></canvas>`,
  ) as HTMLCanvasElement;
  const cap = el(`<div style="margin:4px 2px 0;height:13px;overflow:hidden;white-space:nowrap"></div>`);
  const list = el(
    `<div class="sunken notepad" style="height:110px;overflow:auto;margin-top:6px;background:#fff"></div>`,
  );
  const foot = el(`<div style="margin:6px 2px 0"></div>`);
  const status = el(`<div class="statusbar" style="margin-top:6px"><div></div></div>`);
  status.firstElementChild!.textContent = REVIEW.walk;
  body.append(head, cv, pan, cap, list, foot, status);

  const botName = byId(end.botId).name.toUpperCase();
  head.textContent =
    end.kind === "win" ? REVIEW.result.win : end.kind === "loss" ? REVIEW.result.loss(botName) : REVIEW.result.draw;
  list.textContent = REVIEW.working;
  foot.textContent = REVIEW.workingSub;

  let curve: readonly CurvePoint[] = [{ ply: 0, advantage: 0, source: "estimated" }];
  /** The graded plies, by ply index — empty until the worker answers. */
  const graded = new Map<number, PlyRecord>();
  let at = startAt ?? frames.length - 1;

  function show(): void {
    at = Math.max(0, Math.min(frames.length - 1, at));
    drawCurve(cv, curve, at);
    drawBoard(pan, variant, frames[at]!, cellPx, at === 0 ? -1 : history[at - 1]!);
    cap.textContent = caption();
    for (const row of list.querySelectorAll<HTMLElement>(".lrow")) {
      const sel = Number(row.dataset.ply) === at - 1;
      row.classList.toggle("sel", sel);
      // not scrollIntoView: it would scroll #stage too when the window overhangs
      if (!sel) continue;
      const top = row.offsetTop;
      const bottom = top + row.offsetHeight;
      if (top < list.scrollTop) list.scrollTop = top;
      else if (bottom > list.scrollTop + list.clientHeight)
        list.scrollTop = bottom - list.clientHeight;
    }
  }

  function caption(): string {
    if (at === 0) return REVIEW.pan.start;
    const ply = at - 1;
    const col = history[ply]! + 1;
    // red always moves first, so even plies are yours
    if (ply % 2 === 1) return REVIEW.pan.theirs(at, col, botName);
    const p = graded.get(ply);
    const remark = p ? REVIEW.remark[p.source === "proven" ? "proven" : "estimated"][p.grade] : "";
    return remark ? REVIEW.pan.yoursGraded(at, col, remark) : REVIEW.pan.yours(at, col);
  }

  const win = wm.open({
    id: "review",
    title: TITLES.review,
    icon: ICONS.moves,
    x: 620,
    y: 96,
    w: 336,
    body,
    buttons: ["min", "close"],
  });

  // window-level keys: the window has no focusable control; unbinds on close
  const onKey = (e: KeyboardEvent): void => {
    if (!win.isOpen()) {
      removeEventListener("keydown", onKey);
      return;
    }
    if (wm.focused()?.id !== "review" || e.ctrlKey || e.metaKey || e.altKey) return;
    const step =
      e.key === "ArrowLeft" ? -1 : e.key === "ArrowRight" ? 1 : e.key === "Home" ? -frames.length : e.key === "End" ? frames.length : 0;
    if (!step) return;
    e.preventDefault();
    at += step;
    show();
  };
  addEventListener("keydown", onKey);

  cv.addEventListener("pointerdown", (e) => {
    const r = cv.getBoundingClientRect();
    const t = (e.clientX - r.left) / (r.width || 1);
    at = Math.round(t * (frames.length - 1));
    show();
  });

  show();

  review(variant.id, history).then(
    (r) => {
      if (gen !== generation || !win.isOpen()) return;
      curve = r.curve;
      list.textContent = "";
      // your (red) moves only
      for (const p of r.plies) {
        graded.set(p.ply, p);
        if (p.player !== "red") continue;
        const row = el(`<div class="lrow"></div>`);
        row.dataset.ply = String(p.ply);
        const remark = REVIEW.remark[p.source === "proven" ? "proven" : "estimated"][p.grade];
        row.textContent = `${REVIEW.moveRow(p.ply + 1, p.col + 1)}${remark ? ` — ${remark}` : ""}`;
        row.addEventListener("click", () => {
          at = p.ply + 1;
          show();
        });
        list.appendChild(row);
      }
      const tp = r.turningPoint;
      const yours = tp && tp.player === "red" ? tp : null;
      foot.textContent = yours
        ? REVIEW.turningPoint(yours.ply + 1)
        : r.biggestSwing && r.biggestSwing.player === "red"
          ? REVIEW.biggestSwing(r.biggestSwing.ply + 1)
          : REVIEW.clean;
      show();
    },
    () => {
      if (gen !== generation || !win.isOpen()) return;
      win.close();
      wm.dialog({ ...REVIEW.failed, icon: "!", x: 470, y: 300, ax: "center", w: 330 });
    },
  );
}

/** Every position the game passed through, played by the engine's own Match. */
function replay(variant: Variant, history: readonly number[]): Cell[][][] {
  const m = new Match(variant);
  const frames = [m.grid()];
  for (const col of history) {
    m.play(col);
    frames.push(m.grid());
  }
  return frames;
}

/** One solid line; midline even, up is yours. Cursor is a 1px dotted focus rule. */
function drawCurve(cv: HTMLCanvasElement, curve: readonly CurvePoint[], at: number): void {
  const ctx = cv.getContext("2d")!;
  const w = cv.width;
  const h = cv.height;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = "#c0c0c0";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, Math.floor(h / 2) + 0.5);
  ctx.lineTo(w, Math.floor(h / 2) + 0.5);
  ctx.stroke();
  const n = Math.max(1, curve.length - 1);
  const xOf = (i: number): number => 4 + (i / n) * (w - 8);
  if (at <= n) {
    ctx.strokeStyle = "#000";
    ctx.setLineDash([1, 1]);
    ctx.beginPath();
    ctx.moveTo(Math.floor(xOf(at)) + 0.5, 0);
    ctx.lineTo(Math.floor(xOf(at)) + 0.5, h);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  ctx.strokeStyle = "#000080";
  ctx.lineWidth = 2;
  ctx.beginPath();
  curve.forEach((p, i) => {
    const x = xOf(i);
    const y = 4 + ((1 - p.advantage) / 2) * (h - 8);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();
}

/** Board at this ply; the disc that just landed gets the dotted focus rect. */
function drawBoard(
  cv: HTMLCanvasElement,
  variant: Variant,
  grid: readonly (readonly Cell[])[],
  cell: number,
  lastCol: number,
): void {
  const ctx = cv.getContext("2d")!;
  ctx.fillStyle = "#c0c0c0";
  ctx.fillRect(0, 0, cv.width, cv.height);
  ctx.fillStyle = "#808080";
  ctx.fillRect(0, 0, cv.width, 1);
  ctx.fillRect(0, 0, 1, cv.height);
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, cv.height - 1, cv.width, 1);
  ctx.fillRect(cv.width - 1, 0, 1, cv.height);

  const r = Math.floor((cell * 3) / 4 / 2);
  let lastRow = -1;
  for (let row = 0; row < variant.height; row++) {
    for (let col = 0; col < variant.width; col++) {
      const v = grid[row]![col]!;
      const cx = FRAME + col * cell + cell / 2;
      const cy = FRAME + row * cell + cell / 2;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      if (v === null) {
        ctx.fillStyle = HOLE;
        ctx.fill();
      } else {
        const [face, edge] = CHIP[v];
        ctx.fillStyle = face;
        ctx.fill();
        ctx.strokeStyle = edge;
        ctx.lineWidth = Math.max(1, Math.round(cell / 16));
        ctx.stroke();
      }
      if (col === lastCol && lastRow < 0 && v !== null) lastRow = row;
    }
  }
  if (lastCol >= 0 && lastRow >= 0) {
    ctx.strokeStyle = "#000";
    ctx.setLineDash([1, 1]);
    ctx.lineWidth = 1;
    ctx.strokeRect(FRAME + lastCol * cell + 0.5, FRAME + lastRow * cell + 0.5, cell - 1, cell - 1);
    ctx.setLineDash([]);
  }
}
