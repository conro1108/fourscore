/**
 * REVIEW.EXE — the finished game, gone back over in the OS's own furniture.
 *
 * The engine plumbing for this existed before the window did (the worker has
 * answered "review" since the port); this is the front half. One request per
 * opening, against the analysis worker so a game in progress never queues
 * behind it.
 *
 * The confidence law shapes everything visible (see REVIEW in copy.ts): the
 * result line is flat because the game is over; the curve is one solid line
 * with no legend, because "how the machine got each number" is not the
 * player's problem; the verdict at the bottom is declarative only when the
 * number under it is proven, and a lead ("looks like the loose one") when it
 * is this machine's read. The step where the line goes decisive is the game
 * going decisive, and it stays unexplained on purpose.
 */

import { el } from "./dom.js";
import { ICONS } from "./icons.js";
import { REVIEW, TITLES } from "./copy.js";
import { byId, type CurvePoint, type Review } from "@fourscore/engine";
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

export function openReview({ wm, last, review }: ReviewDeps): void {
  const end = last();
  if (!end || end.kind === "forfeit" || end.history.length === 0) {
    wm.dialog({ ...REVIEW.none, x: 470, y: 300, ax: "center", w: 330 });
    return;
  }

  wm.get("review")?.close();
  const gen = ++generation;

  const body = el(`<div style="padding:6px 8px 8px"></div>`);
  const head = el(`<div style="font-weight:bold;margin:2px 2px 6px"></div>`);
  const cv = el(`<canvas class="sunken" width="304" height="88" style="display:block;width:304px;height:88px;background:#fff"></canvas>`) as HTMLCanvasElement;
  const list = el(
    `<div class="sunken notepad" style="height:150px;overflow:auto;margin-top:6px;background:#fff"></div>`,
  );
  const foot = el(`<div style="margin:6px 2px 0"></div>`);
  body.append(head, cv, list, foot);

  const botName = byId(end.botId).name.toUpperCase();
  head.textContent =
    end.kind === "win" ? REVIEW.result.win : end.kind === "loss" ? REVIEW.result.loss(botName) : REVIEW.result.draw;
  list.textContent = REVIEW.working;
  foot.textContent = REVIEW.workingSub;
  drawCurve(cv, [{ ply: 0, advantage: 0, source: "estimated" }]);

  const win = wm.open({
    id: "review",
    title: TITLES.review,
    icon: ICONS.moves,
    x: 620,
    y: 120,
    w: 336,
    body,
    buttons: ["min", "close"],
  });

  review(end.variant.id, end.history).then(
    (r) => {
      if (gen !== generation || !win.isOpen()) return;
      drawCurve(cv, r.curve);
      list.textContent = "";
      // your moves only — red moves first in every game this machine hosts
      for (const p of r.plies.filter((p) => p.player === "red")) {
        const row = el(`<div style="padding:1px 4px;white-space:nowrap"></div>`);
        const remark = REVIEW.remark[p.source === "proven" ? "proven" : "estimated"][p.grade];
        row.textContent = `${REVIEW.moveRow(p.ply + 1, p.col + 1)}${remark ? ` — ${remark}` : ""}`;
        list.appendChild(row);
      }
      const tp = r.turningPoint;
      const yours = tp && tp.player === "red" ? tp : null;
      foot.textContent = yours
        ? REVIEW.turningPoint(yours.ply + 1)
        : r.biggestSwing && r.biggestSwing.player === "red"
          ? REVIEW.biggestSwing(r.biggestSwing.ply + 1)
          : REVIEW.clean;
    },
    () => {
      if (gen !== generation || !win.isOpen()) return;
      win.close();
      wm.dialog({ ...REVIEW.failed, icon: "!", x: 470, y: 300, ax: "center", w: 330 });
    },
  );
}

/**
 * One solid line, the whole game. The midline is even; up is yours. Proven
 * plies land in a band the estimates can't reach (the engine's scale does
 * this), so the visible step where the game went decisive is real and no
 * legend has to say so.
 */
function drawCurve(cv: HTMLCanvasElement, curve: readonly CurvePoint[]): void {
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
  ctx.strokeStyle = "#000080";
  ctx.lineWidth = 2;
  ctx.beginPath();
  const n = Math.max(1, curve.length - 1);
  curve.forEach((p, i) => {
    const x = 4 + (i / n) * (w - 8);
    const y = 4 + ((1 - p.advantage) / 2) * (h - 8);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();
}
