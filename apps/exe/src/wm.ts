/**
 * The window manager. Real windows with real z-order, focus and drag —
 * dialogs included, because a dialog you can't drag breaks the fiction
 * (DIRECTION.md: don't draw the OS, run it).
 *
 * Timing law: window operations are instant. Nothing in here animates.
 */

import { el } from "./dom.js";
import { iconCanvas } from "./icons.js";

export interface WindowSpec {
  id: string;
  title: string;
  /** 16x16 pixel-icon rows for the titlebar. */
  icon?: readonly string[];
  x: number;
  y: number;
  w?: number;
  /** Extra classes on the .win element (e.g. chips-flat). */
  cls?: string;
  body: HTMLElement;
  /** Titlebar buttons; a dialog usually gets just ["close"]. */
  buttons?: readonly ("min" | "max" | "close")[];
  /** Give the window a taskbar button. Default true. */
  taskbar?: boolean;
  onClose?: () => void;
}

export interface Win {
  readonly id: string;
  readonly el: HTMLElement;
  readonly body: HTMLElement;
  focus(): void;
  close(): void;
  minimize(): void;
  setTitle(title: string): void;
  isOpen(): boolean;
}

export interface DialogSpec {
  title: string;
  body: string;
  icon?: "i" | "!";
  buttons?: readonly string[];
  defIdx?: number;
  x: number;
  y: number;
  w?: number;
  taskbar?: boolean;
  /** Called with the button index; the dialog closes itself first. */
  onButton?: (index: number, label: string) => void;
}

export interface WM {
  readonly stage: HTMLElement;
  open(spec: WindowSpec): Win;
  dialog(spec: DialogSpec): Win;
  get(id: string): Win | undefined;
  focused(): Win | undefined;
  /** Fires during any titlebar drag — the fever's smear hook. */
  onDrag(cb: (win: Win, x: number, y: number) => void): void;
  /** Fires on any focus change — roam.scr steals focus through this. */
  focusWin(win: Win): void;
}

/* ---- stage scaling ---- */
let scale = 1;
export const stageScale = (): number => scale;

export function fitStage(stage: HTMLElement, w = 1280, h = 800): void {
  const fit = (): void => {
    scale = Math.min(innerWidth / w, innerHeight / h);
    stage.style.transformOrigin = "top left";
    stage.style.transform = `scale(${scale}) translateX(${(innerWidth / scale - w) / 2}px)`;
  };
  fit();
  addEventListener("resize", fit);
}

export function makeWM(stage: HTMLElement, tasksEl: HTMLElement): WM {
  let zTop = 40;
  const wins = new Map<string, Win>();
  const tasks = new Map<string, HTMLElement>();
  const dragCbs: ((win: Win, x: number, y: number) => void)[] = [];
  let focusedWin: Win | undefined;
  let dialogSeq = 0;

  function setFocus(win: Win | undefined): void {
    focusedWin = win;
    for (const [id, w] of wins) {
      const bar = w.el.querySelector(".titlebar");
      bar?.classList.toggle("active", w === win);
      bar?.classList.toggle("inactive", w !== win);
      tasks.get(id)?.classList.toggle("down", w === win);
    }
  }

  function open(spec: WindowSpec): Win {
    const buttons = spec.buttons ?? ["min", "max", "close"];
    const w = el(`<div class="win bevel${spec.cls ? " " + spec.cls : ""}" style="left:${spec.x}px;top:${spec.y}px${spec.w ? `;width:${spec.w}px` : ""}"></div>`);
    const bar = el(`<div class="titlebar inactive"><span class="t"></span></div>`);
    bar.querySelector(".t")!.textContent = spec.title;
    if (spec.icon) bar.prepend(iconCanvas(spec.icon, 16));
    const glyphs = { min: "_", max: "□", close: "×" } as const;
    for (const b of buttons) {
      const btn = el(`<div class="tbtn" data-b="${b}">${glyphs[b]}</div>`);
      bar.appendChild(btn);
    }
    w.appendChild(bar);
    w.appendChild(spec.body);
    stage.appendChild(w);

    let maximized: { left: string; top: string; width: string } | null = null;

    const win: Win = {
      id: spec.id,
      el: w,
      body: spec.body,
      focus() {
        if (!w.isConnected) return;
        w.style.display = "block";
        w.style.zIndex = String(++zTop);
        setFocus(win);
      },
      minimize() {
        w.style.display = "none";
        if (focusedWin === win) setFocus(undefined);
      },
      close() {
        w.remove();
        tasks.get(spec.id)?.remove();
        tasks.delete(spec.id);
        wins.delete(spec.id);
        if (focusedWin === win) setFocus(undefined);
        spec.onClose?.();
      },
      setTitle(title: string) {
        bar.querySelector(".t")!.textContent = title;
        const task = tasks.get(spec.id);
        if (task) task.textContent = title;
      },
      isOpen: () => w.isConnected,
    };

    bar.addEventListener("click", (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>(".tbtn")?.dataset.b;
      if (b === "close") win.close();
      else if (b === "min") win.minimize();
      else if (b === "max") {
        // real maximize: fill the desktop above the taskbar, instantly
        if (maximized) {
          Object.assign(w.style, maximized);
          maximized = null;
        } else {
          maximized = { left: w.style.left, top: w.style.top, width: w.style.width };
          Object.assign(w.style, { left: "0px", top: "0px", width: "1280px" });
        }
      }
    });

    // click anywhere raises; mousedown so it raises before the click lands
    w.addEventListener("mousedown", () => win.focus());

    // drag by titlebar — instant, 1:1, no easing
    bar.addEventListener("mousedown", (e) => {
      if ((e.target as HTMLElement).closest(".tbtn")) return;
      if (maximized) return;
      e.preventDefault();
      const startX = e.clientX / scale - w.offsetLeft;
      const startY = e.clientY / scale - w.offsetTop;
      const move = (ev: MouseEvent): void => {
        const x = Math.round(ev.clientX / scale - startX);
        const y = Math.max(0, Math.round(ev.clientY / scale - startY));
        w.style.left = `${x}px`;
        w.style.top = `${y}px`;
        for (const cb of dragCbs) cb(win, x, y);
      };
      const up = (): void => {
        removeEventListener("mousemove", move);
        removeEventListener("mouseup", up);
      };
      addEventListener("mousemove", move);
      addEventListener("mouseup", up);
    });

    if (spec.taskbar !== false) {
      const task = el(`<div class="task"></div>`);
      task.textContent = spec.title;
      task.addEventListener("click", () => {
        if (focusedWin === win && w.style.display !== "none") win.minimize();
        else win.focus();
      });
      tasksEl.appendChild(task);
      tasks.set(spec.id, task);
    }

    wins.set(spec.id, win);
    win.focus();
    return win;
  }

  function dialog(spec: DialogSpec): Win {
    const body = el(`<div></div>`);
    const inner = el(`<div class="dlg-body">
        <div class="dlg-ico${spec.icon === "!" ? " warn" : ""}">${spec.icon ?? "i"}</div>
        <div style="padding-top:6px;line-height:1.5">${spec.body}</div>
      </div>`);
    body.appendChild(inner);
    const row = el(`<div class="btnrow"></div>`);
    const labels = spec.buttons ?? ["OK"];
    labels.forEach((label, i) => {
      const btn = el(`<div class="btn${i === (spec.defIdx ?? 0) ? " def" : ""}"></div>`);
      btn.textContent = label;
      btn.addEventListener("click", () => {
        win.close();
        spec.onButton?.(i, label);
      });
      row.appendChild(btn);
    });
    body.appendChild(row);
    const win = open({
      id: `dlg-${++dialogSeq}`,
      title: spec.title,
      x: spec.x,
      y: spec.y,
      w: spec.w ?? 340,
      body,
      buttons: ["close"],
      taskbar: spec.taskbar ?? false,
    });
    return win;
  }

  return {
    stage,
    open,
    dialog,
    get: (id) => wins.get(id),
    focused: () => focusedWin,
    onDrag: (cb) => dragCbs.push(cb),
    focusWin: (win) => win.focus(),
  };
}
