/**
 * PAINT.EXE — a pencil for the machine's picture format (sprite.ts). The
 * canvas is a zoomed grid with the transparency checker under it, the colors
 * are the system palette because that is every color this machine has, and
 * File does what Notepad's File does, against the same disk through the same
 * picker. A picture saved here is a text file COMMAND.COM can TYPE and
 * Notepad can edit, which is the whole point.
 *
 * One window per file, Notepad's own arrangement: a per-file map, window ids
 * off a running counter so Save As renames a window without reopening it.
 */

import { el, onPointerDrag } from "./dom.js";
import { ICONS, PAL, px } from "./icons.js";
import { menubar } from "./games/ui.js";
import { GAMES_COPY, TITLES } from "./copy.js";
import { openFilePicker } from "./notepad.js";
import {
  type Cells,
  blankCells,
  cellsToRows,
  fillCells,
  parseSprite,
  serializeCells,
} from "./sprite.js";
import type { Disk } from "./fs.js";
import type { WM, Win } from "./wm.js";

const openPainters = new Map<string, Win>();
let painterSeq = 0;
const painterKey = (name: string | null): string => name?.toLowerCase() ?? "untitled";

/** The checker that means "nothing here" — kept apart from every PAL gray. */
const CHECKER = ["#f4f4f4", "#dcdcdc"] as const;

export function openPaint(wm: WM, disk: Disk, name: string | null): void {
  const existing = openPainters.get(painterKey(name));
  if (existing?.isOpen()) {
    existing.focus();
    return;
  }

  let fileName = name;
  let cells: Cells;
  if (fileName !== null && disk.exists(fileName)) {
    const parsed = parseSprite(disk.read(fileName) ?? "");
    if (!parsed) {
      // a .txt is not a picture; refuse rather than offer to overwrite it
      wm.dialog({ ...GAMES_COPY.paint.notAPicture(fileName), x: 340, y: 300, w: 340 });
      return;
    }
    cells = parsed;
  } else {
    cells = blankCells(16, 16);
  }
  const W = cells[0]!.length;
  const H = cells.length;
  // one stepped whole-pixel zoom per picture, sized so the cap still fits
  const Z = Math.max(6, Math.min(14, Math.floor(280 / Math.max(W, H))));

  /* ---- the grid, the previews ---- */
  const grid = el<HTMLCanvasElement>(`<canvas class="paintgrid"></canvas>`);
  grid.width = W * Z;
  grid.height = H * Z;
  const preview = (scale: number): HTMLCanvasElement => {
    const c = el<HTMLCanvasElement>(`<canvas class="pix"></canvas>`);
    c.width = W;
    c.height = H;
    c.style.width = `${W * scale}px`;
    c.style.height = `${H * scale}px`;
    return c;
  };
  const p1 = preview(1);
  const p2 = preview(2);

  const redraw = (): void => {
    const g = grid.getContext("2d")!;
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const ch = cells[y]![x]!;
        if (ch === ".") {
          const q = Z / 2;
          for (let i = 0; i < 2; i++)
            for (let j = 0; j < 2; j++) {
              g.fillStyle = CHECKER[(i + j) % 2]!;
              g.fillRect(x * Z + i * q, y * Z + j * q, q, q);
            }
        } else {
          g.fillStyle = PAL[ch]!;
          g.fillRect(x * Z, y * Z, Z, Z);
        }
      }
    g.fillStyle = "rgba(0,0,0,.12)";
    for (let x = 1; x < W; x++) g.fillRect(x * Z, 0, 1, H * Z);
    for (let y = 1; y < H; y++) g.fillRect(0, y * Z, W * Z, 1);
    const rows = cellsToRows(cells);
    for (const c of [p1, p2]) {
      const ctx = c.getContext("2d")!;
      ctx.clearRect(0, 0, W, H);
      px(c, rows);
    }
  };

  /* ---- tools and colors ---- */
  let color = "k";
  let tool: "pencil" | "fill" = "pencil";

  const strip = el(`<div class="palstrip sunken"></div>`);
  const swatches = new Map<string, HTMLElement>();
  for (const ch of [".", ...Object.keys(PAL)]) {
    const sw = el(`<div class="swatch${ch === "." ? " none" : ""}"></div>`);
    if (ch !== ".") sw.style.background = PAL[ch]!;
    sw.addEventListener("click", () => {
      color = ch;
      swatches.forEach((s) => s.classList.remove("sel"));
      sw.classList.add("sel");
    });
    swatches.set(ch, sw);
    strip.appendChild(sw);
  }
  swatches.get("k")!.classList.add("sel");

  const toolBtn = (label: string, id: typeof tool): HTMLElement => {
    const b = el(`<div class="btn ptool"></div>`);
    b.textContent = label;
    b.addEventListener("click", () => {
      tool = id;
      toolEls.forEach((t) => t.classList.remove("down"));
      b.classList.add("down");
    });
    return b;
  };
  const toolEls = [toolBtn("Pencil", "pencil"), toolBtn("Fill", "fill")];
  toolEls[0]!.classList.add("down");

  /* ---- painting ---- */
  const cellAt = (e: PointerEvent | MouseEvent): [number, number] => {
    const r = grid.getBoundingClientRect();
    return [
      Math.max(0, Math.min(W - 1, Math.floor(((e.clientX - r.left) / r.width) * W))),
      Math.max(0, Math.min(H - 1, Math.floor(((e.clientY - r.top) / r.height) * H))),
    ];
  };
  const set = (x: number, y: number, ch: string): void => {
    cells[y]![x] = ch;
  };
  onPointerDrag(grid, (e) => {
    e.preventDefault();
    let [lx, ly] = cellAt(e);
    if (tool === "fill") {
      fillCells(cells, lx, ly, color);
      redraw();
      return null;
    }
    set(lx, ly, color);
    redraw();
    return (ev: PointerEvent): void => {
      // walk the gap a fast drag leaves, so a stroke is a stroke
      const [nx, ny] = cellAt(ev);
      const steps = Math.max(Math.abs(nx - lx), Math.abs(ny - ly));
      for (let i = 1; i <= steps; i++)
        set(Math.round(lx + ((nx - lx) * i) / steps), Math.round(ly + ((ny - ly) * i) / steps), color);
      [lx, ly] = [nx, ny];
      redraw();
    };
  });
  // the period's other mouse button: right-click (or a held finger) erases
  grid.addEventListener("contextmenu", (e) => {
    e.preventDefault();
    const [x, y] = cellAt(e);
    set(x, y, ".");
    redraw();
  });

  /* ---- File, against the same disk as everything else ---- */
  const savedDialog = (n: string): void => {
    wm.dialog({ ...GAMES_COPY.paint.saved(n), x: 330, y: 300, w: 330 });
  };
  const saveAs = (): void => {
    openFilePicker(wm, disk, "save", fileName ?? "", (typed) => {
      // a name with no extension is a picture; say so on its behalf
      const n = typed.includes(".") ? typed : `${typed}.spr`;
      const commit = (): void => {
        openPainters.delete(painterKey(fileName));
        fileName = n;
        openPainters.set(painterKey(n), win);
        disk.write(n, serializeCells(cells));
        win.setTitle(TITLES.paint(n));
        savedDialog(n);
      };
      if (painterKey(fileName) !== n.toLowerCase() && disk.exists(n))
        wm.dialog({
          ...GAMES_COPY.paint.replace(n),
          icon: "!",
          buttons: ["Yes", "No"],
          x: 340,
          y: 300,
          w: 330,
          onButton: (i) => {
            if (i === 0) commit();
          },
        });
      else commit();
    });
  };
  const bar = menubar([
    {
      label: "File",
      items: [
        ["New", () => openPaint(wm, disk, null)],
        ["Open...", () => {
          openFilePicker(wm, disk, "open", "", (n) => openPaint(wm, disk, n));
        }],
        ["Save", () => {
          if (fileName === null) saveAs();
          else {
            disk.write(fileName, serializeCells(cells));
            savedDialog(fileName);
          }
        }],
        ["Save As...", saveAs],
        ["-", () => {}],
        ["Exit", () => win.close()],
      ],
    },
    {
      label: "Image",
      items: [
        ["Clear", () => {
          for (const row of cells) row.fill(".");
          redraw();
        }],
      ],
    },
  ]);

  /* ---- the furniture ---- */
  const body = el(`<div></div>`);
  const main = el(`<div style="display:flex;gap:4px;margin:3px;align-items:flex-start"></div>`);
  const well = el(`<div class="sunken" style="padding:3px;line-height:0"></div>`);
  well.appendChild(grid);
  const side = el(`<div style="display:flex;flex-direction:column;gap:4px;width:76px"></div>`);
  const pbox = el(
    `<div class="sunken paintpreview"></div>`,
  );
  pbox.append(p1, p2);
  side.appendChild(pbox);
  for (const t of toolEls) side.appendChild(t);
  main.append(well, side);
  body.append(bar, main, strip);
  strip.style.margin = "0 3px 3px";

  const win = wm.open({
    id: `paint${painterSeq++}`,
    title: TITLES.paint(fileName ?? "untitled"),
    icon: ICONS.paint,
    x: 240 + (painterSeq % 5) * 24,
    y: 110 + (painterSeq % 5) * 20,
    w: W * Z + 76 + 22,
    body,
    buttons: ["min", "close"],
    onClose: () => {
      if (openPainters.get(painterKey(fileName)) === win) openPainters.delete(painterKey(fileName));
    },
  });
  openPainters.set(painterKey(fileName), win);
  redraw();
}
