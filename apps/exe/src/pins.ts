/**
 * Pinned .spr pictures on the desk. A pin is a view of a file, not a copy:
 * writes repaint, renames carry, removes take down. State keyed by lowercase path.
 */

import { el, onPointerDrag } from "./dom.js";
import { px } from "./icons.js";
import { cellsToRows, isSpriteFile, parseSprite } from "./sprite.js";
import { deskHeight, deskWidth, stageScale, taskbarH } from "./wm.js";
import type { Disk } from "./fs.js";

const KEY = "exe.pins";
/** 12px art → 60px. */
const SCALE = 5;

export interface Pins {
  isPinned(name: string): boolean;
  pin(name: string, x: number, y: number): void;
  unpin(name: string): void;
}

export interface PinDeps {
  stage: HTMLElement;
  disk: Disk;
  edit(name: string): void;
  menu(e: MouseEvent, entries: [string, () => void][]): void;
}

export function installPins(deps: PinDeps): Pins {
  const { stage, disk } = deps;
  let state: Record<string, { x: number; y: number }> = {};
  try {
    state = JSON.parse(localStorage.getItem(KEY) ?? "{}") as typeof state;
  } catch {
    /* corrupt = empty */
  }
  const save = (): void => localStorage.setItem(KEY, JSON.stringify(state));
  const els = new Map<string, HTMLCanvasElement>();

  const takeDown = (lower: string): void => {
    els.get(lower)?.remove();
    els.delete(lower);
    if (state[lower]) {
      delete state[lower];
      save();
    }
  };

  const render = (lower: string): void => {
    const spot = state[lower];
    if (!spot) return;
    const cells = parseSprite(disk.read(lower) ?? "");
    if (!cells) {
      takeDown(lower);
      return;
    }
    const w = cells[0]!.length;
    const h = cells.length;
    let c = els.get(lower);
    if (!c) {
      c = el<HTMLCanvasElement>(`<canvas class="pix pin"></canvas>`);
      els.set(lower, c);
      onPointerDrag(
        c,
        (e) => {
          e.preventDefault();
          const k = stageScale();
          const sx = e.clientX / k - c!.offsetLeft;
          const sy = e.clientY / k - c!.offsetTop;
          return (ev: PointerEvent): void => {
            c!.style.left = `${Math.round(ev.clientX / k - sx)}px`;
            c!.style.top = `${Math.round(ev.clientY / k - sy)}px`;
          };
        },
        () => {
          const spotNow = state[lower];
          if (spotNow) {
            spotNow.x = c!.offsetLeft;
            spotNow.y = c!.offsetTop;
            save();
          }
        },
      );
      c.addEventListener("dblclick", () => deps.edit(lower));
      c.addEventListener("contextmenu", (e) => {
        e.preventDefault();
        e.stopPropagation();
        deps.menu(e, [
          ["Edit", () => deps.edit(lower)],
          ["Take down", () => takeDown(lower)],
        ]);
      });
      stage.appendChild(c);
    }
    c.width = w;
    c.height = h;
    c.style.width = `${w * SCALE}px`;
    c.style.height = `${h * SCALE}px`;
    c.style.left = `${Math.max(0, Math.min(deskWidth() - w * SCALE, spot.x))}px`;
    c.style.top = `${Math.max(0, Math.min(deskHeight() - taskbarH() - h * SCALE, spot.y))}px`;
    px(c, cellsToRows(cells));
  };

  for (const lower of Object.keys(state)) render(lower);

  disk.onChange((ev) => {
    const lower = ev.name.toLowerCase();
    if (ev.kind === "write" && isSpriteFile(lower)) render(lower);
    else if (ev.kind === "remove") takeDown(lower);
    else if (ev.kind === "rename" && ev.to && state[lower]) {
      const spot = state[lower]!;
      takeDown(lower);
      if (isSpriteFile(ev.to)) {
        state[ev.to.toLowerCase()] = spot;
        save();
        render(ev.to.toLowerCase());
      }
    }
  });

  return {
    isPinned: (name) => state[name.toLowerCase()] !== undefined,
    pin(name, x, y) {
      state[name.toLowerCase()] = { x, y };
      save();
      render(name.toLowerCase());
    },
    unpin: (name) => takeDown(name.toLowerCase()),
  };
}
