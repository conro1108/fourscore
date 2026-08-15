/**
 * The window manager. Real windows with real z-order, focus and drag —
 * dialogs included, because a dialog you can't drag breaks the fiction
 * (DIRECTION.md: don't draw the OS, run it).
 *
 * Timing law: window operations are instant. Nothing in here animates.
 */

import { el, onPointerDrag } from "./dom.js";
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
  /** Real resize borders, like the OS the fiction claims to be. The window
      gets `sized` on first drag and its body flexes (chrome.css). */
  resizable?: boolean;
  /** Floors for a resize drag. Left unset, the floor is the window's own
      natural size, captured the moment a drag starts on an un-sized window —
      a fixed-content window grows but never crushes its contents. */
  minW?: number;
  minH?: number;
  /** Fires during a resize drag, after each new size lands. */
  onResize?: () => void;
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
/* A phone can't hold a 1280x800 desk at a readable size, so when the screen
   is touched rather than pointed at and the base fit would put a 64px cell
   under ~40 device px, the monitor gets smaller instead of the pixels: a desk
   just wide enough to hold BOARD.EXE in portrait, just tall enough for it in
   landscape. Everything stays authored against 1280x800; `place()` clamps
   windows onto the smaller desk. */
const FIT_W = 512;
const FIT_H = 600;
const MIN_CELL_PX = 40;
let scale = 1;
let deskW = DESIGN_W;
let deskH = DESIGN_H;
/** Home-indicator inset (desk px). The taskbar thickens by this much. */
let taskbarPad = 0;
const resizeCbs: (() => void)[] = [];

export const stageScale = (): number => scale;
export const deskWidth = (): number => deskW;
export const deskHeight = (): number => deskH;
/** Taskbar's real height: 36px of chrome plus the home-indicator inset. */
export const taskbarH = (): number => 36 + taskbarPad;
/** Fires after the desk changes size, so placed things can re-anchor. */
export const onDeskResize = (cb: () => void): void => void resizeCbs.push(cb);

/* ---- how a window's contents answer a resize ----
   Drag a window bigger and the game inside gets bigger — the frame growing
   while the playfield sits in a corner is a window manager admitting it isn't
   one. But the playfield never takes a fractional scale: this desktop is 1px
   bevels and 64px-nearest art all the way down, and a bevel drawn at 1.37x is
   mush. So one whole-pixel cell size steps through a fixed ladder and every
   derived number (disc, hole, gutter, piece) comes off it. Stepping is also
   the timing law falling out for free: a slow drag lands on a handful of
   sizes instead of shivering a pixel at a time.

   `count` may be fractional — the board's picker row is three quarters of a
   cell tall, so its height budget is `rows + 0.75` cells. */
export interface CellFit {
  /** px the whole field may occupy on this axis. */
  space: number;
  /** cells across it. */
  count: number;
  /** The authored size. A natural-sized window measures back to exactly this,
      so nothing moves until you actually drag. */
  base: number;
  /** Ladder rung, in px. Keep it a divisor of `base`, or natural won't round-trip. */
  step?: number;
  min?: number;
  max?: number;
}
export function fitCell(f: CellFit): number {
  const step = f.step ?? Math.max(1, Math.round(f.base / 8));
  const min = f.min ?? Math.max(step, Math.round(f.base / 2));
  const max = f.max ?? f.base * 3;
  const raw = Math.floor(f.space / f.count);
  return Math.max(min, Math.min(max, Math.floor(raw / step) * step));
}

/** Everything a window needs to answer its own resize with a size. */
export interface FieldFit {
  /** The window element, measured live — a resize drag is mid-flight. */
  win(): HTMLElement;
  /** Cells across and down. Live, because a level or a variant can change it,
      and fractional where something else on the axis is a fraction of a cell. */
  grid(): { cols: number; rows: number };
  /** Window px that are never the field, per axis. Measure these off a natural
      window rather than adding up the stylesheet — then the natural size
      round-trips to exactly `cell.base` and nothing moves until you drag. */
  chrome: { w: number; h: number };
  cell: { base: number; step: number; min: number; max: number };
  /** Hand the size to the DOM. `wide` is true once the window has been dragged
      or maximized, which is when the well should centre in the extra gray. */
  apply(size: number, wide: boolean): void;
}

/**
 * The one way a game window on this desktop grows: build a scaler, hand it to
 * `onResize` and `onMaximize`, and call it once after the first paint. Five
 * games and the board share this so that "drag it bigger" means the same thing
 * everywhere — and so that the stepping law lives in one place.
 */
export function fieldScaler(f: FieldFit): () => void {
  return (): void => {
    const el = f.win();
    const { cols, rows } = f.grid();
    const size = Math.min(
      fitCell({ space: el.offsetWidth - f.chrome.w, count: cols, ...f.cell }),
      fitCell({ space: el.offsetHeight - f.chrome.h, count: rows, ...f.cell }),
    );
    f.apply(size, el.classList.contains("sized") || el.classList.contains("max"));
  };
}

/** A well's margin with its horizontal halves handed to `auto`, so it centres
    in a window that has more gray than it needs. `""` leaves it to the CSS. */
export function centered(margin: string): string {
  const p = margin.trim().split(/\s+/);
  if (p.length === 2) return `${p[0]} auto`;
  if (p.length === 3) return `${p[0]} auto ${p[2]}`;
  if (p.length === 4) return `${p[0]} auto ${p[2]} auto`;
  return margin;
}

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
  // The notch and the home indicator are pixels the desk can't use (iOS PWA,
  // viewport-fit=cover). env() only resolves inside CSS, so a hidden probe
  // wears the insets as padding and the fit reads them back.
  const probe = el(
    `<div style="position:fixed;left:0;top:0;visibility:hidden;pointer-events:none;padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)"></div>`,
  );
  document.body.appendChild(probe);
  const fit = (): void => {
    const cs = getComputedStyle(probe);
    const safeT = parseFloat(cs.paddingTop) || 0;
    const safeR = parseFloat(cs.paddingRight) || 0;
    const safeB = parseFloat(cs.paddingBottom) || 0;
    const safeL = parseFloat(cs.paddingLeft) || 0;
    // The desk keeps the bottom inset — the taskbar thickens to cover it, so
    // the chrome still reaches the physical edge and the clock stays tappable.
    const availW = innerWidth - safeL - safeR;
    const availH = innerHeight - safeT;
    scale = Math.min(availW / w, availH / h);
    if (matchMedia("(pointer: coarse)").matches && scale * 64 < MIN_CELL_PX)
      scale = Math.max(scale, Math.min(availW / FIT_W, availH / FIT_H));
    deskW = Math.round(availW / scale);
    deskH = Math.round(availH / scale);
    taskbarPad = safeB / scale;
    stage.style.transformOrigin = "top left";
    stage.style.transform = `translate(${safeL}px,${safeT}px) scale(${scale})`;
    stage.style.width = `${deskW}px`;
    stage.style.height = `${deskH}px`;
    stage.style.setProperty("--taskbar-pad", `${taskbarPad}px`);
    for (const cb of resizeCbs) cb();
  };
  fit();
  addEventListener("resize", fit);
  // iOS resizes the visual viewport (keyboard, orientation) without always
  // firing a window resize in standalone mode
  visualViewport?.addEventListener("resize", fit);
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
      let x = anchorX(authored[0], spec.ax);
      let y = anchorY(authored[1], spec.ay);
      // On a desk smaller than the authored 1280x800 (a phone), an authored
      // position can land off the monitor entirely. Clamp fully on-desk on the
      // cramped axis only, so a full-size desk keeps every hand-tuned position
      // — including the win cascade's intentional half-off-screen dialog.
      if (deskW < DESIGN_W) x = Math.max(0, Math.min(x, deskW - w.offsetWidth));
      if (deskH < DESIGN_H) y = Math.max(0, Math.min(y, deskH - taskbarH() - w.offsetHeight));
      w.style.left = `${x}px`;
      w.style.top = `${y}px`;
    };
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
    spec.body.classList.add("winbody");
    w.appendChild(spec.body);
    stage.appendChild(w);
    // placed after it's in the DOM: the clamp needs a measured size
    place();

    // resize borders — instant, 1:1, no easing, same as the titlebar drag
    if (spec.resizable) {
      let natural: { w: number; h: number } | null = null;
      for (const dir of ["n", "s", "e", "w", "ne", "nw", "se", "sw"]) {
        const h = el(`<div class="rz rz-${dir}"></div>`);
        onPointerDrag(h, (e) => {
          if (maximized) return null;
          e.preventDefault();
          e.stopPropagation();
          win.focus();
          if (!w.classList.contains("sized"))
            natural = { w: w.offsetWidth, h: w.offsetHeight };
          const minW = spec.minW ?? natural?.w ?? 180;
          const minH = spec.minH ?? natural?.h ?? 120;
          const sx = e.clientX / scale;
          const sy = e.clientY / scale;
          const r = { left: w.offsetLeft, top: w.offsetTop, width: w.offsetWidth, height: w.offsetHeight };
          return (ev: PointerEvent): void => {
            const dx = ev.clientX / scale - sx;
            const dy = ev.clientY / scale - sy;
            let { left, top, width, height } = r;
            if (dir.includes("e")) width = Math.max(minW, Math.round(r.width + dx));
            if (dir.includes("s")) height = Math.max(minH, Math.round(r.height + dy));
            if (dir.includes("w")) {
              width = Math.max(minW, Math.round(r.width - dx));
              left = r.left + (r.width - width);
            }
            if (dir.includes("n")) {
              height = Math.max(minH, Math.round(r.height - dy));
              top = r.top + (r.height - height);
              if (top < 0) {
                height += top;
                top = 0;
              }
            }
            dragged = true; // you sized it; a desk resize doesn't get to move it
            w.classList.add("sized");
            Object.assign(w.style, {
              left: `${left}px`,
              top: `${top}px`,
              width: `${width}px`,
              height: `${height}px`,
            });
            spec.onResize?.();
          };
        });
        w.appendChild(h);
      }
    }

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
          Object.assign(w.style, { left: "0px", top: "0px", width: `${deskW}px`, height: `${deskH - taskbarH()}px` });
          w.classList.add("max");
          spec.onMaximize?.(true);
        }
      }
    });

    // press anywhere raises; pointerdown so it raises before the click lands
    w.addEventListener("pointerdown", () => win.focus());

    // drag by titlebar — instant, 1:1, no easing
    onPointerDrag(bar, (e) => {
      if ((e.target as HTMLElement).closest(".tbtn")) return null;
      if (maximized) return null;
      e.preventDefault();
      dragged = true; // you put it there; a resize doesn't get to move it back
      const startX = e.clientX / scale - w.offsetLeft;
      const startY = e.clientY / scale - w.offsetTop;
      return (ev: PointerEvent): void => {
        // a sliver has to stay reachable: a window shoved fully off a phone's
        // desk has no mouse precision to rescue it with
        const x = Math.min(
          deskW - 48,
          Math.max(48 - w.offsetWidth, Math.round(ev.clientX / scale - startX)),
        );
        const y = Math.min(
          deskH - taskbarH() - 22,
          Math.max(0, Math.round(ev.clientY / scale - startY)),
        );
        w.style.left = `${x}px`;
        w.style.top = `${y}px`;
        for (const cb of dragCbs) cb(win, x, y);
      };
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
