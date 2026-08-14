/**
 * moves.txt — Notepad. The OS keeps minutes on your game: move numbers in
 * lines of eight, and commentary when you earn it ("and then you hesitated").
 * It scrolls because it's a text box; that's the law.
 */

import { el } from "./dom.js";
import { ICONS } from "./icons.js";
import { TITLES } from "./copy.js";
import type { WM, Win } from "./wm.js";

export interface MovesPad {
  open(): void;
  move(col: number): void;
  lines(text: readonly string[]): void;
  reset(): void;
}

export function makeMovesPad(wm: WM): MovesPad {
  let notesLines: string[] = [];
  let lineBuf: (number | string)[] = [];
  let win: Win | null = null;
  let bodyEl: HTMLElement | null = null;

  function render(): void {
    if (!bodyEl) return;
    const all = [...notesLines];
    if (lineBuf.length) all.push(lineBuf.join(" "));
    bodyEl.textContent = all.join("\n") || " ";
    bodyEl.scrollTop = bodyEl.scrollHeight;
  }

  function open(): void {
    if (win?.isOpen()) {
      win.focus();
      return;
    }
    bodyEl = el(`<div class="sunken notepad" style="max-height:300px;overflow:auto"></div>`);
    const body = el(`<div></div>`);
    body.appendChild(bodyEl);
    win = wm.open({
      id: "moves",
      title: TITLES.moves,
      icon: ICONS.moves,
      x: 920,
      y: 110,
      w: 240,
      body,
      buttons: ["close"],
    });
    render();
  }

  return {
    open,
    move(col: number) {
      lineBuf.push(col + 1);
      if (lineBuf.length === 8) {
        notesLines.push(lineBuf.join(" "));
        lineBuf = [];
      }
      render();
    },
    lines(text: readonly string[]) {
      if (lineBuf.length) {
        notesLines.push(lineBuf.join(" "));
        lineBuf = [];
      }
      notesLines.push(...text);
      render();
    },
    reset() {
      notesLines = [];
      lineBuf = [];
      render();
    },
  };
}

/** A read-only Notepad window (help.txt, the rest). */
export function textWindow(
  wm: WM,
  id: string,
  title: string,
  text: string,
  x: number,
  y: number,
  w = 230,
): void {
  const existing = wm.get(id);
  if (existing?.isOpen()) {
    existing.focus();
    return;
  }
  const body = el(`<div></div>`);
  const pad = el(`<div class="sunken notepad" style="max-height:420px;overflow:auto"></div>`);
  pad.textContent = text;
  body.appendChild(pad);
  wm.open({ id, title, icon: ICONS.moves, x, y, w, body, buttons: ["close"] });
}
