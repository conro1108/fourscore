/**
 * The window manager. Real windows with real z-order, focus and drag —
 * dialogs included, because a dialog you can't drag breaks the fiction
 * (DIRECTION.md: don't draw the OS, run it).
 *
 * Timing law: window operations are instant. Nothing in here animates.
 */

import { el } from "./dom.js";
import { iconCanvas } from "./icons.js";
import { play, type SoundName } from "./audio/index.js";

export interface WindowSpec {
  id: string;
  title: string;
  /** 16x16 pixel-icon rows for the titlebar. */
  icon?: readonly string[];
  x: number;
  y: number;
  /** Which edge of the desk x/y are measured from. Defaults left/top. */
  ax?: AnchorX;
  ay?: AnchorY;
  w?: number;
  /** Extra classes on the .win element (e.g. chips-flat). */
  cls?: string;
  body: HTMLElement;
  /** Titlebar buttons; a dialog usually gets just ["close"]. */
  buttons?: readonly ("min" | "max" | "close")[];
  /** Give the window a taskbar button. Default true. */
  taskbar?: boolean;
  onClose?: () => void;
  /** Fires after maximize/restore, so a window can re-frame its contents. */
  onMaximize?: (on: boolean) => void;
  /** Stay above the screensaver while it has the desktop. The board asks for
      this ("the board stays playable on top of it" — DIRECTION.md) and so does
      anything the machine is currently saying; dialogs get it by default. */
  overSaver?: boolean;
  /** A fixed z-index, opting out of the stack entirely. Dev chrome only. */
  z?: number;
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
  /** Re-place against the desk, in authored (1280x800) coordinates. */
  moveTo(x: number, y: number): void;
}

export interface DialogSpec {
  title: string;
  body: string;
  icon?: "i" | "!";
  buttons?: readonly string[];
  defIdx?: number;
  x: number;
  y: number;
  ax?: AnchorX;
  ay?: AnchorY;
  w?: number;
  taskbar?: boolean;
  /**
   * What it arrives with. Defaults to the scheme's Default sound, or the error
   * chord for a `!` — the two the icon already implies. Named explicitly when a
   * dialog means something else (Shut Down is not an error), and `null` when
   * something louder is about to play over it.
   */
  sound?: SoundName | null;
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
  /** Put `win` directly underneath `other` in the stack, and leave it there —
      the loss files one notice behind the board for you to find later. */
  sendBelow(win: Win, other: Win): void;
  /** The screensaver has (or has let go of) the desktop. While it has it, the
      `overSaver` windows are the only ones above it. */
  setSaverActive(on: boolean): void;
}

/* ---- stacking ----
   Windows are packed into a band in back-to-front order rather than counted up
   from an ever-climbing z. The counter walked into the chrome's own fixed
   layers over a long session (#taskbar is 200, #saver 240), and worse, it made
   `focus()` the thing that undid a raised window: the screensaver put the board
   at 250, and the next click on the board handed it back a number in the
   fifties, so the board vanished underneath the fire. A band is a property of
   the window, so clicking it can't lose it. */
const Z_BASE = 40;
/** Above #saver (240), below #startmenu (300). */
const Z_OVER_SAVER = 250;
/** Ordering headroom inside a band. The desk never holds this many windows;
    past it the extras tie and fall back to DOM order, which is fine. */
const Z_DEPTH = 45;

/* ---- the desk ----
   The desktop IS the screen (DIRECTION.md), so the stage fills the browser
   window instead of sitting inside it as a letterboxed card: the taskbar
   reaches both edges, the icons sit in the true corner, the clock is in the
   real right corner. It scales by whichever axis is tighter and then grows to
   cover the rest, so a wider window is a wider desk, not a bigger picture of
   one. At exactly 1280x800 the scale is 1 and every authored number lands
   where it was authored. */
const DESIGN_W = 1280;
const DESIGN_H = 800;
let scale = 1;
let deskW = DESIGN_W;
let deskH = DESIGN_H;
const resizeCbs: (() => void)[] = [];

export const stageScale = (): number => scale;
export const deskWidth = (): number => deskW;
export const deskHeight = (): number => deskH;
/** Fires after the desk changes size, so placed things can re-anchor. */
export const onDeskResize = (cb: () => void): void => void resizeCbs.push(cb);

/** Where a coordinate authored against a 1280x800 desk goes on this one. */
export type AnchorX = "left" | "center" | "right";
export type AnchorY = "top" | "bottom";
export function anchorX(x: number, a: AnchorX = "left"): number {
  const slack = deskW - DESIGN_W;
  return a === "left" ? x : a === "right" ? x + slack : Math.round(x + slack / 2);
}
export function anchorY(y: number, a: AnchorY = "top"): number {
  return a === "top" ? y : y + (deskH - DESIGN_H);
}

export function fitStage(stage: HTMLElement, w = DESIGN_W, h = DESIGN_H): void {
  const fit = (): void => {
    scale = Math.min(innerWidth / w, innerHeight / h);
    deskW = Math.round(innerWidth / scale);
    deskH = Math.round(innerHeight / scale);
    stage.style.transformOrigin = "top left";
    stage.style.transform = `scale(${scale})`;
    stage.style.width = `${deskW}px`;
    stage.style.height = `${deskH}px`;
    for (const cb of resizeCbs) cb();
  };
  fit();
  addEventListener("resize", fit);
}

export function makeWM(stage: HTMLElement, tasksEl: HTMLElement): WM {
  const wins = new Map<string, Win>();
  const tasks = new Map<string, HTMLElement>();
  const dragCbs: ((win: Win, x: number, y: number) => void)[] = [];
  let focusedWin: Win | undefined;
  let dialogSeq = 0;

  /** Every open window, back to front. Index in here IS the z-order. */
  interface Stacked {
    win: Win;
    overSaver: boolean;
    z?: number;
  }
  const order: Stacked[] = [];
  let saverOn = false;

  function restack(): void {
    order.forEach((s, i) => {
      if (s.z !== undefined) return; // fixed-z windows sit outside the stack
      const base = saverOn && s.overSaver ? Z_OVER_SAVER : Z_BASE;
      s.win.el.style.zIndex = String(base + Math.min(i, Z_DEPTH));
    });
  }

  /** Move a window to the front of the stack (or drop it, on close). */
  function reorder(win: Win, to: "front" | "out" | { below: Win }): void {
    const i = order.findIndex((s) => s.win === win);
    if (i < 0) return;
    const [s] = order.splice(i, 1);
    if (to === "front") order.push(s!);
    else if (typeof to === "object") {
      const j = order.findIndex((o) => o.win === to.below);
      order.splice(j < 0 ? 0 : j, 0, s!);
    }
    restack();
  }

  function setFocus(win: Win | undefined): void {
    focusedWin = win;
    for (const [id, w] of wins) {
      const bar = w.el.querySelector(".titlebar");
      bar?.classList.toggle("active", w === win);
      bar?.classList.toggle("inactive", w !== win);
      tasks.get(id)?.classList.toggle("down", w === win);
    }
  }

  /**
   * `quiet` is how a dialog gets in without the program-opening whoosh: a
   * dialog is not a program starting, it is the machine saying something, and
   * `dialog()` below plays the sentence's own sound instead.
   */
  function open(spec: WindowSpec, quiet = false): Win {
    const buttons = spec.buttons ?? ["min", "max", "close"];
    const w = el(`<div class="win bevel${spec.cls ? " " + spec.cls : ""}"${spec.w ? ` style="width:${spec.w}px"` : ""}></div>`);
    let maximized: { left: string; top: string; width: string; height: string } | null = null;
    // authored coordinates, kept so the window can re-anchor if the desk resizes
    const authored: [number, number] = [spec.x, spec.y];
    let dragged = false;
    const place = (): void => {
      w.style.left = `${anchorX(authored[0], spec.ax)}px`;
      w.style.top = `${anchorY(authored[1], spec.ay)}px`;
    };
    place();
    onDeskResize(() => {
      if (!dragged && !maximized && w.isConnected) place();
    });
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

    const win: Win = {
      id: spec.id,
      el: w,
      body: spec.body,
      focus() {
        if (!w.isConnected) return;
        w.style.display = ""; // undo minimize; the class decides the display
        reorder(win, "front");
        setFocus(win);
      },
      minimize() {
        if (w.style.display !== "none") play("window-min", 0.7);
        w.style.display = "none";
        if (focusedWin === win) setFocus(undefined);
      },
      close() {
        // Only a program closing gets the whoosh: a dialog going away is the
        // end of a sentence, and its OK already clicked. It matters more than
        // it sounds like — the win cascade dismisses eight of them at once.
        // A window that was already gone doesn't close twice either; the
        // endgame's `clear()` sweeps a stack that has half closed itself.
        if (w.isConnected && !quiet) play("window-close", 0.6);
        reorder(win, "out");
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
      moveTo(x, y) {
        authored[0] = x;
        authored[1] = y;
        // you put it there; the fever's re-staging doesn't get to move it back
        if (!dragged) place();
      },
    };

    bar.addEventListener("click", (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>(".tbtn")?.dataset.b;
      if (b === "close") win.close();
      else if (b === "min") win.minimize();
      else if (b === "max") {
        play(maximized ? "window-min" : "window-max", 0.7);
        // real maximize: fill the desktop above the taskbar, instantly
        if (maximized) {
          Object.assign(w.style, maximized);
          maximized = null;
          w.classList.remove("max");
          spec.onMaximize?.(false);
        } else {
          maximized = { left: w.style.left, top: w.style.top, width: w.style.width, height: w.style.height };
          Object.assign(w.style, { left: "0px", top: "0px", width: `${deskW}px`, height: `${deskH - 36}px` });
          w.classList.add("max");
          spec.onMaximize?.(true);
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
      dragged = true; // you put it there; a resize doesn't get to move it back
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
    order.push({ win, overSaver: spec.overSaver ?? false, z: spec.z });
    if (spec.z !== undefined) w.style.zIndex = String(spec.z);
    win.focus();
    if (!quiet) play("window-open", 0.7);
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
        play("click", 0.6);
        win.close();
        spec.onButton?.(i, label);
      });
      row.appendChild(btn);
    });
    body.appendChild(row);
    const win = open(
      {
        id: `dlg-${++dialogSeq}`,
        title: spec.title,
        x: spec.x,
        y: spec.y,
        ax: spec.ax,
        ay: spec.ay,
        w: spec.w ?? 340,
        body,
        buttons: ["close"],
        taskbar: spec.taskbar ?? false,
        // the machine gets to keep talking over its own screensaver: a win
        // cascade the fire had covered would be its biggest announcement,
        // unannounced
        overSaver: true,
      },
      true,
    );
    const sound = spec.sound === undefined ? (spec.icon === "!" ? "chord" : "ding") : spec.sound;
    if (sound) play(sound, 0.65);
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
    sendBelow: (win, other) => reorder(win, { below: other }),
    setSaverActive(on) {
      saverOn = on;
      restack();
    },
  };
}
