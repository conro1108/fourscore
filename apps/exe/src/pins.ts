/**
 * Pinned pictures: a .spr put up on the desk big — the furniture role the
 * hardcoded rocket used to play, except the player draws it now. A pin is a
 * view of a file, not a copy: editing the file repaints the pin, renaming it
 * carries the pin along, deleting it takes the pin down. One localStorage
 * key holds which files are up and where.
 */

import { el, onPointerDrag } from "./dom.js";
import { px } from "./icons.js";
import { cellsToRows, isSpriteFile, parseSprite } from "./sprite.js";
import { deskHeight, deskWidth, stageScale, taskbarH } from "./wm.js";
import type { Disk } from "./fs.js";

const KEY = "exe.pins";
/** Pinned art is shown at the same period ratio the rocket wore (12px → 60). */
const SCALE = 5;

export interface Pins {
  isPinned(name: string): boolean;
  pin(name: string, x: number, y: number): void;
  unpin(name: string): void;
}

export interface PinDeps {
  stage: HTMLElement;
  disk: Disk;
  /** A double-click on a pin opens the picture for editing. */
  edit(name: string): void;
  /** The desk's own context menu machinery. */
  menu(e: MouseEvent, entries: [string, () => void][]): void;
}

export function installPins(deps: PinDeps): Pins {
  const { stage, disk } = deps;
  let state: Record<string, { x: number; y: number }> = {};
  try {
    state = JSON.parse(localStorage.getItem(KEY) ?? "{}") as typeof state;
  } catch {
    /* a corrupt pinboard is a bare wall, not a crash */
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

  /** Paint (or repaint) one pin from what the disk holds right now. */
  const render = (lower: string): void => {
    const spot = state[lower];
    if (!spot) return;
    const cells = parseSprite(disk.read(lower) ?? "");
    if (!cells) {
      // the file left, or stopped being a picture; the wall follows the disk
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
