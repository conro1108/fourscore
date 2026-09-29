/**
 * Window manager: real z-order, focus, drag, resize — dialogs included.
 * Window operations are instant; nothing here animates (DIRECTION.md).
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
  /** Resize borders. The window gets `sized` on first drag; body flexes (chrome.css). */
  resizable?: boolean;
  /** Resize floors; default is the natural size captured at the first drag. */
  minW?: number;
  minH?: number;
  /** Fires during a resize drag, after each new size lands. */
  onResize?: () => void;
  /** On a phone-sized desk the window opens as big as the desk allows instead
      of at its authored size (needs `resizable`); re-fits on rotation until
      it's been dragged. The window's own first relayout() picks the size up. */
  fit?: GridFit;
  /** Stay above the screensaver (the board, and dialogs by default). */
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
  /** Re-run the phone-desk fit after the natural size changed (a level change). No-op on a full desk. */
  refit(): void;
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
  /** Arrival sound. Defaults to ding, or chord for `!`; `null` when something louder follows. */
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
  /** Put `win` directly underneath `other` in the stack. */
  sendBelow(win: Win, other: Win): void;
  /** While the saver is on, only `overSaver` windows sit above it. */
  setSaverActive(on: boolean): void;
}

/* ---- stacking: z is index-in-band, not a climbing counter (a counter walked
   into #taskbar 200 / #saver 240 and let focus() drop a raised board under the fire) ---- */
const Z_BASE = 40;
/** Above #saver (240), below #startmenu (300). */
const Z_OVER_SAVER = 250;
/** Headroom inside a band; past it windows tie and fall back to DOM order. */
const Z_DEPTH = 45;

/* ---- the desk: fills the browser window (not letterboxed), scaled by the
   tighter axis then grown to cover. At 1280x800 scale is 1. ---- */
const DESIGN_W = 1280;
const DESIGN_H = 800;
/* Coarse pointer + 64px cell under MIN_CELL_PX device px → shrink the desk
   to just fit BOARD.EXE instead. Coordinates stay authored at 1280x800; `place()` clamps. */
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
/** A phone: the desk was shrunk to FIT_W/FIT_H, so authored sizes don't fit. */
export const cramped = (): boolean => deskW < DESIGN_W || deskH < DESIGN_H;
/** Taskbar's real height: 36px of chrome plus the home-indicator inset. */
export const taskbarH = (): number => 36 + taskbarPad;
/** Fires after the desk changes size, so placed things can re-anchor. */
export const onDeskResize = (cb: () => void): void => void resizeCbs.push(cb);

/* ---- resize → whole-pixel cell size stepping a fixed ladder (never a
   fractional scale: 1px bevels turn to mush). `count` may be fractional —
   the board's picker row is 0.75 cell. ---- */
export interface CellFit {
  /** px the whole field may occupy on this axis. */
  space: number;
  /** cells across it. */
  count: number;
  /** Authored size; a natural window must round-trip to exactly this. */
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

/** A game window's geometry: what the phone-desk fit and `fieldScaler` both read. */
export interface GridFit {
  /** Live (level/variant can change it); may be fractional. */
  grid(): { cols: number; rows: number };
  /** Non-field px per axis. Measure off a natural window, don't sum the stylesheet,
      or the natural size won't round-trip to `cell.base`. */
  chrome: { w: number; h: number };
  cell: { base: number; step: number; min: number; max: number };
  /** The field uses any extra height it's given (sol's tableau); default keeps the grid's aspect. */
  tall?: boolean;
}

/** Everything a window needs to answer its own resize with a size. */
export interface FieldFit extends GridFit {
  /** Measured live, mid-drag. */
  win(): HTMLElement;
  /** `wide` once dragged or maximized — centre the well in the extra gray. */
  apply(size: number, wide: boolean): void;
}

/** The size a grid window takes on a cramped desk: snug around the biggest cell the desk holds. */
function fitToDesk(f: GridFit): { w: number; h: number } {
  const availW = deskW;
  const availH = deskH - taskbarH();
  const { cols, rows } = f.grid();
  const size = Math.min(
    fitCell({ space: availW - f.chrome.w, count: cols, ...f.cell }),
    fitCell({ space: availH - f.chrome.h, count: rows, ...f.cell }),
  );
  return {
    w: Math.min(availW, Math.ceil(cols * size + f.chrome.w)),
    h: f.tall ? availH : Math.min(availH, Math.ceil(rows * size + f.chrome.h)),
  };
}

/** The one resize path for game windows: hand to `onResize`/`onMaximize`, call once after first paint. */
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

/** Margin with horizontal halves set to `auto`. `""` leaves it to the CSS. */
export function centered(margin: string): string {
  const p = margin.trim().split(/\s+/);
  if (p.length === 2) return `${p[0]} auto`;
  if (p.length === 3) return `${p[0]} auto ${p[2]}`;
  if (p.length === 4) return `${p[0]} auto ${p[2]} auto`;
  return margin;
}

/** Map a coordinate authored at 1280x800 onto this desk. */
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
  // safe-area insets (iOS PWA): env() only resolves in CSS, so read them off a probe
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
    // bottom inset stays in the desk; the taskbar thickens to cover it
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
  // iOS standalone doesn't always fire window resize
  visualViewport?.addEventListener("resize", fit);
}

export function makeWM(stage: HTMLElement, tasksEl: HTMLElement): WM {
  const wins = new Map<string, Win>();
  const tasks = new Map<string, HTMLElement>();
  const dragCbs: ((win: Win, x: number, y: number) => void)[] = [];
  let focusedWin: Win | undefined;
  let dialogSeq = 0;

  /** Back to front; index IS the z-order. */
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

  /** `quiet`: no open/close whoosh — dialogs play their own sound. */
  function open(spec: WindowSpec, quiet = false): Win {
    const buttons = spec.buttons ?? ["min", "max", "close"];
    const w = el(`<div class="win bevel${spec.cls ? " " + spec.cls : ""}"${spec.w ? ` style="width:${spec.w}px"` : ""}></div>`);
    let maximized: { left: string; top: string; width: string; height: string } | null = null;
    // kept to re-anchor on desk resize
    const authored: [number, number] = [spec.x, spec.y];
    let dragged = false;
    let fitted = false;
    const place = (): void => {
      // wider than a phone desk: cap it (the terminal is authored at 520 on a 512 desk)
      if (!w.classList.contains("sized") && w.offsetWidth > deskW) w.style.width = `${deskW}px`;
      let x = anchorX(authored[0], spec.ax);
      let y = anchorY(authored[1], spec.ay);
      // clamp on-desk only on a cramped axis (or a window fitted to the desk):
      // a full desk keeps hand-tuned positions, including the win cascade's
      // intentional half-off dialog
      if (deskW < DESIGN_W || fitted) x = Math.max(0, Math.min(x, deskW - w.offsetWidth));
      if (deskH < DESIGN_H || fitted) y = Math.max(0, Math.min(y, deskH - taskbarH() - w.offsetHeight));
      w.style.left = `${x}px`;
      w.style.top = `${y}px`;
    };
    /** Phone desk: size to the desk (as if hand-resized, so it still drags).
        Back on a full desk the authored size returns. True if a fit applied. */
    const fitDesk = (): boolean => {
      if (!spec.fit) return false;
      if (cramped()) {
        const { w: fw, h: fh } = fitToDesk(spec.fit);
        w.classList.add("sized");
        w.style.width = `${fw}px`;
        w.style.height = `${fh}px`;
        fitted = true;
        return true;
      }
      if (!fitted) return false;
      fitted = false;
      w.classList.remove("sized");
      w.style.width = spec.w ? `${spec.w}px` : "";
      w.style.height = "";
      return true;
    };
    onDeskResize(() => {
      if (dragged || maximized || !w.isConnected) return;
      const refit = fitDesk();
      place();
      if (refit) spec.onResize?.();
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
    // after DOM insert: the clamp needs a measured size
    fitDesk();
    place();

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
            dragged = true; // a desk resize won't move it
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
        w.style.display = ""; // undo minimize
        reorder(win, "front");
        setFocus(win);
      },
      minimize() {
        if (w.style.display !== "none") play("window-min", 0.7);
        w.style.display = "none";
        if (focusedWin === win) setFocus(undefined);
      },
      close() {
        // no whoosh for dialogs (the win cascade dismisses eight at once) or
        // for a window already gone (endgame's clear() sweeps half-closed stacks)
        if (w.isConnected && !quiet) play("window-close", 0.6);
        reorder(win, "out");
        w.remove();
        tasks.get(spec.id)?.remove();
        tasks.delete(spec.id);
        wins.delete(spec.id);
        // focus the next window down, so F2 reaches the game once its dialog closes
        if (focusedWin === win)
          setFocus(
            [...order].reverse().find((s) => s.z === undefined && s.win.el.style.display !== "none")?.win,
          );
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
        // a dragged window isn't re-staged
        if (!dragged) place();
      },
      refit() {
        if (dragged || maximized) return;
        if (fitDesk()) {
          place();
          spec.onResize?.();
        }
      },
    };

    bar.addEventListener("click", (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>(".tbtn")?.dataset.b;
      if (b === "close") win.close();
      else if (b === "min") win.minimize();
      else if (b === "max") {
        play(maximized ? "window-min" : "window-max", 0.7);
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

    // pointerdown so it raises before the click lands
    w.addEventListener("pointerdown", () => win.focus());

    onPointerDrag(bar, (e) => {
      if ((e.target as HTMLElement).closest(".tbtn")) return null;
      if (maximized) return null;
      e.preventDefault();
      dragged = true;
      const startX = e.clientX / scale - w.offsetLeft;
      const startY = e.clientY / scale - w.offsetTop;
      return (ev: PointerEvent): void => {
        // keep a 48px sliver reachable (a phone can't rescue a fully off-desk window)
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
        // dialogs stay above the saver (else the win cascade hides under the fire)
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
