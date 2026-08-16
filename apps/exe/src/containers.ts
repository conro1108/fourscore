/**
 * Container windows: the games folder, the player's own folders, and the
 * rest. One implementation — a pane of icons over a status bar — because
 * they are all the same piece of furniture; only the title, the seed
 * position and what they'll accept differ (and acceptance is shellfs's law,
 * not the window's).
 *
 * The panes deliberately do not repack while you watch. An icon that leaves
 * goes invisible in place and an icon that returns lights back up in its old
 * slot, so nothing else jumps; a fresh open lays the survivors out packed.
 * The rest keeps its poem as the empty state — the fictional losses stay
 * unrestorable, the real ones drag right back out.
 */

import { el, onPointerDrag } from "./dom.js";
import { ICONS, iconCanvas } from "./icons.js";
import { BIN_TEXT, TITLES } from "./copy.js";
import { stageScale, type WM, type Win } from "./wm.js";
import { GAME_ITEMS, type GameLaunchers } from "./games/folder.js";
import { fileOf, gameOf, type ShellFs, type ShellLoc } from "./shellfs.js";

/** A container's key doubles as its window id; folder keys are the item id. */
export type ContainerKey = "games" | "bin" | string;

export const locOfKey = (key: ContainerKey): ShellLoc =>
  key === "games" || key === "bin" ? key : { folder: key };

export interface ContainerDeps {
  wm: WM;
  fs: ShellFs;
  launch: GameLaunchers;
  /** A disk file was double-clicked — main opens it in Notepad. */
  openFile(name: string): void;
  /** An icon left this container on a drag — main decides where it lands. */
  drop(id: string, ev: PointerEvent, from: ContainerKey): void;
}

/** What an item looks like, wherever it appears. */
export function itemFace(fs: ShellFs, id: string): { rows: readonly string[]; label: string } {
  const g = gameOf(id);
  if (g !== null) {
    const item = GAME_ITEMS.find((x) => x.id === g);
    if (item) return { rows: item.rows, label: item.label };
  }
  const f = fileOf(id);
  if (f !== null) return { rows: ICONS.file, label: f };
  return { rows: ICONS.folder, label: fs.folderName(id) };
}

const open = new Map<ContainerKey, { win: Win; sync(): void }>();

/** Every open container re-reads the shell — after any move or rename. */
export function syncContainers(): void {
  for (const [key, c] of open) {
    if (!c.win.isOpen()) open.delete(key);
    else c.sync();
  }
}

const title = (fs: ShellFs, key: ContainerKey): string =>
  key === "games" ? TITLES.games : key === "bin" ? TITLES.bin : fs.folderName(key);

let cascade = 0;

export function openContainer(deps: ContainerDeps, key: ContainerKey): void {
  const existing = open.get(key);
  if (existing?.win.isOpen()) {
    existing.win.focus();
    return;
  }
  const { wm, fs, launch } = deps;
  const loc = locOfKey(key);

  const body = el(`<div></div>`);
  const pane = el(`<div class="sunken folderpane flexwell"></div>`);
  const poem = el(`<div class="binpoem"></div>`);
  poem.textContent = BIN_TEXT;
  if (key === "bin") pane.appendChild(poem);
  const count = el(`<div></div>`);
  const status = el(`<div class="statusbar"></div>`);
  status.appendChild(count);
  body.append(pane, status);

  const shown = new Map<string, HTMLElement>();

  const openItem = (id: string): void => {
    const g = gameOf(id);
    const f = fileOf(id);
    if (g !== null) launch[g as keyof GameLaunchers]();
    else if (f !== null) deps.openFile(f);
    else openContainer(deps, id);
  };

  const makeIcon = (id: string): HTMLElement => {
    const face = itemFace(fs, id);
    const ic = el(`<div class="fic"></div>`);
    ic.appendChild(iconCanvas(face.rows, 32));
    const lbl = el(`<span class="lbl"></span>`);
    lbl.textContent = face.label;
    ic.appendChild(lbl);
    ic.addEventListener("click", () => {
      shown.forEach((x) => x.classList.remove("sel"));
      ic.classList.add("sel");
    });
    ic.addEventListener("dblclick", () => openItem(id));

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
          if (!cancelled && ev.pointerType === "touch") openItem(id);
          return;
        }
        ghost.remove();
        if (cancelled) return;
        const winR = win.el.getBoundingClientRect();
        const inHere =
          ev.clientX >= winR.left && ev.clientX <= winR.right &&
          ev.clientY >= winR.top && ev.clientY <= winR.bottom;
        if (inHere) return; // put back; the folder does not rearrange
        deps.drop(id, ev, key);
      },
    );
    return ic;
  };

  const sync = (): void => {
    const items = fs.itemsIn(loc);
    const present = new Set(items);
    for (const [id, ic] of shown)
      if (!present.has(id)) {
        // gone, but its slot stays — everything else just chills
        ic.style.visibility = "hidden";
        ic.style.pointerEvents = "none";
        ic.classList.remove("sel");
      }
    for (const id of items) {
      const ic = shown.get(id);
      if (ic) {
        ic.style.visibility = "";
        ic.style.pointerEvents = "";
      } else {
        const fresh = makeIcon(id);
        shown.set(id, fresh);
        pane.appendChild(fresh);
      }
    }
    count.textContent = `${items.length} object(s)`;
    if (key === "bin") poem.style.display = items.length ? "none" : "block";
    win.setTitle(title(fs, key));
  };

  const seat =
    key === "games"
      ? { x: 330, y: 470 }
      : key === "bin"
        ? { x: 470, y: 170 }
        : { x: 260 + (cascade % 5) * 26, y: 190 + (cascade++ % 5) * 26 };
  const win = wm.open({
    id: key,
    title: title(fs, key),
    icon: key === "bin" ? ICONS.bin : key === "games" ? ICONS.gamesFolder : ICONS.folder,
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
  win.el.dataset.drop = key;
  open.set(key, { win, sync });
  sync();
}
