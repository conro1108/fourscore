/**
 * Container windows: folder windows over real directories, and the drive
 * window over the root. One implementation — a pane of icons over a status
 * bar — because they are all the same piece of furniture; only the seat and
 * the dressing differ, and what an item *is* lives on the disk (fs.ts), not
 * in the window.
 *
 * The panes deliberately do not repack while you watch. An icon that leaves
 * goes invisible in place and an icon that returns lights back up in its old
 * slot, so nothing else jumps; a fresh open lays the survivors out packed.
 * The rest (C:\DESKTOP\RECYCLED) keeps its poem as the empty state — the
 * fictional losses stay unrestorable, the real ones drag right back out.
 */

import { el, onPointerDrag } from "./dom.js";
import { iconCanvas, ICONS } from "./icons.js";
import { BIN_TEXT } from "./copy.js";
import { stageScale, type WM, type Win } from "./wm.js";
import { normPath, type Disk } from "./fs.js";

/** A container's key is the directory it shows; "" is the root. */
export type ContainerKey = string;

/** Marks an element as "drops land in this directory" for elementFromPoint. */
export const DROP_PREFIX = "dir:";

export interface ContainerDeps {
  wm: WM;
  disk: Disk;
  /** What an item looks like — main knows programs, pictures and the
      reserved folders. */
  face(path: string, isDir: boolean): { rows: readonly string[]; label: string };
  /** A file was double-clicked — main launches, paints or edits it. */
  openFile(name: string): void;
  /** An icon left this container on a drag — main decides where it lands. */
  drop(path: string, isDir: boolean, ev: PointerEvent, from: ContainerKey): void;
}

const open = new Map<string, { win: Win; sync(): void }>();
const keyOf = (dir: string): string => normPath(dir).toLowerCase();
const isBin = (key: ContainerKey): boolean => keyOf(key) === "desktop\\recycled";

/** Every open container re-reads the disk — after any change. */
export function syncContainers(): void {
  for (const [key, c] of open) {
    if (!c.win.isOpen()) open.delete(key);
    else c.sync();
  }
}

let cascade = 0;

export function openContainer(deps: ContainerDeps, dir: ContainerKey): void {
  const path = normPath(dir);
  const key = keyOf(path);
  const existing = open.get(key);
  if (existing?.win.isOpen()) {
    existing.win.focus();
    return;
  }
  const { wm, disk } = deps;

  const body = el(`<div></div>`);
  const pane = el(`<div class="sunken folderpane flexwell"></div>`);
  const poem = el(`<div class="binpoem"></div>`);
  poem.textContent = BIN_TEXT;
  if (isBin(path)) pane.appendChild(poem);
  const count = el(`<div></div>`);
  const status = el(`<div class="statusbar"></div>`);
  status.appendChild(count);
  body.append(pane, status);

  const shown = new Map<string, HTMLElement>();

  const openItem = (p: string, dirItem: boolean): void => {
    if (dirItem) openContainer(deps, p);
    else deps.openFile(p);
  };

  const makeIcon = (p: string, dirItem: boolean): HTMLElement => {
    const face = deps.face(p, dirItem);
    const ic = el(`<div class="fic"></div>`);
    if (dirItem) ic.dataset.drop = DROP_PREFIX + p;
    ic.appendChild(iconCanvas(face.rows, 32));
    const lbl = el(`<span class="lbl"></span>`);
    lbl.textContent = face.label;
    ic.appendChild(lbl);
    ic.addEventListener("click", () => {
      shown.forEach((x) => x.classList.remove("sel"));
      ic.classList.add("sel");
    });
    ic.addEventListener("dblclick", () => openItem(p, dirItem));

    // drag out: past a few pixels a ghost rides the cursor, and dropping it
    // off this window is main's problem to place. A finger-tap that never
    // became a drag opens instead — a touchscreen has no double-click.
    let ghost: HTMLElement | null = null;
    onPointerDrag(
      ic,
      (e) => {
        const startX = e.clientX;
        const startY = e.clientY;
        ghost = null;
        return (ev: PointerEvent): void => {
          if (!ghost && Math.hypot(ev.clientX - startX, ev.clientY - startY) < 6) return;
          if (!ghost) {
            ghost = el(`<div class="icon dragghost"></div>`);
            ghost.appendChild(iconCanvas(face.rows, 32));
            const gl = el(`<span class="lbl"></span>`);
            gl.textContent = face.label;
            ghost.appendChild(gl);
            wm.stage.appendChild(ghost);
          }
          const k = stageScale();
          const r = wm.stage.getBoundingClientRect();
          ghost.style.left = `${(ev.clientX - r.left) / k - 24}px`;
          ghost.style.top = `${(ev.clientY - r.top) / k - 20}px`;
        };
      },
      (ev, cancelled) => {
        if (!ghost) {
          if (!cancelled && ev.pointerType === "touch") openItem(p, dirItem);
          return;
        }
        ghost.remove();
        if (cancelled) return;
        const winR = win.el.getBoundingClientRect();
        const inHere =
          ev.clientX >= winR.left && ev.clientX <= winR.right &&
          ev.clientY >= winR.top && ev.clientY <= winR.bottom;
        if (inHere) return; // put back; the folder does not rearrange
        deps.drop(p, dirItem, ev, path);
      },
    );
    return ic;
  };

  const sync = (): void => {
    const listing = disk.listDir(path);
    if (!listing) {
      // the directory left the disk from under its own window
      win.close();
      return;
    }
    const items: { p: string; dirItem: boolean }[] = [
      ...listing.dirs.map((d) => ({ p: d, dirItem: true })),
      ...listing.files.map((f) => ({ p: f.name, dirItem: false })),
    ];
    const present = new Set(items.map((it) => it.p.toLowerCase()));
    for (const [id, ic] of shown)
      if (!present.has(id)) {
        // gone, but its slot stays — everything else just chills
        ic.style.visibility = "hidden";
        ic.style.pointerEvents = "none";
        ic.classList.remove("sel");
      }
    for (const it of items) {
      const id = it.p.toLowerCase();
      const ic = shown.get(id);
      if (ic) {
        ic.style.visibility = "";
        ic.style.pointerEvents = "";
      } else {
        const fresh = makeIcon(it.p, it.dirItem);
        shown.set(id, fresh);
        pane.appendChild(fresh);
      }
    }
    count.textContent = `${items.length} object(s)`;
    if (isBin(path)) poem.style.display = items.length ? "none" : "block";
    win.setTitle(deps.face(path, true).label);
  };

  const dress = deps.face(path, true);
  const seat =
    keyOf(path) === "desktop\\games"
      ? { x: 330, y: 470 }
      : isBin(path)
        ? { x: 470, y: 170 }
        : path === ""
          ? { x: 170, y: 140 }
          : { x: 260 + (cascade % 5) * 26, y: 190 + (cascade++ % 5) * 26 };
  const win = wm.open({
    id: `dir:${key}`,
    title: dress.label,
    icon: path === "" ? ICONS.drive : dress.rows,
    x: seat.x,
    y: seat.y,
    w: 420,
    body,
    buttons: ["min", "close"],
    resizable: true,
    minW: 200,
    minH: 120,
    onClose: () => open.delete(key),
  });
  win.el.dataset.drop = DROP_PREFIX + path;
  open.set(key, { win, sync });
  sync();
}
