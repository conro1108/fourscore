/**
 * moves.txt — Notepad. The OS keeps minutes on your game: move numbers in
 * lines of eight, and commentary when you earn it ("and then you hesitated").
 * It scrolls because it's a text box; that's the law.
 */

import { el } from "./dom.js";
import { ICONS } from "./icons.js";
import { GAMES_COPY, TITLES } from "./copy.js";
import { menubar } from "./games/ui.js";
import type { AnchorX, WM, Win } from "./wm.js";

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
      ax: "right",
      w: 240,
      body,
      buttons: ["close"],
      resizable: true,
      minW: 180,
      minH: 120,
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

/**
 * untitled.txt — a Notepad you can actually type in, because a text editor
 * that doesn't edit would break the fiction harder than any flame. File
 * genuinely News, Saves (to the only disk this machine has: localStorage)
 * and Exits; Edit does what period Notepad's Edit did, including inserting
 * the time and date, both of which are wrong in the usual direction.
 */
export function openUntitled(wm: WM): void {
  const existing = wm.get("untitled");
  if (existing?.isOpen()) {
    existing.focus();
    return;
  }
  const body = el(`<div></div>`);
  const ta = el(
    `<textarea class="notepad notepad-edit" spellcheck="false"></textarea>`,
  ) as HTMLTextAreaElement;
  ta.value = localStorage.getItem("exe.untitled") ?? "";
  const wrap = el(`<div class="sunken" style="margin:3px;background:#fff"></div>`);
  wrap.appendChild(ta);

  const bar = menubar([
    {
      label: "File",
      items: [
        ["New", () => {
          if (!ta.value) return;
          ta.value = "";
          wm.dialog({ ...GAMES_COPY.notepad.cleared, x: 320, y: 300, w: 330 });
        }],
        ["Save", () => {
          localStorage.setItem("exe.untitled", ta.value);
          wm.dialog({ ...GAMES_COPY.notepad.saved, x: 320, y: 300, w: 330 });
        }],
        ["-", () => {}],
        ["Exit", () => win.close()],
      ],
    },
    {
      label: "Edit",
      items: [
        ["Select All", () => {
          ta.focus();
          ta.select();
        }],
        ["Time/Date", () => {
          ta.setRangeText("6:66 PM 8/14/1996", ta.selectionStart, ta.selectionEnd, "end");
          ta.focus();
        }],
      ],
    },
  ]);
  body.append(bar, wrap);
  const win = wm.open({
    id: "untitled",
    title: TITLES.untitled,
    icon: ICONS.moves,
    x: 214,
    y: 138,
    w: 300,
    body,
    buttons: ["min", "close"],
    resizable: true,
    minW: 220,
    minH: 160,
  });
  ta.focus();
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
  ax: AnchorX = "left",
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
  wm.open({ id, title, icon: ICONS.moves, x, y, ax, w, body, buttons: ["close"], resizable: true, minW: 180, minH: 120 });
}
