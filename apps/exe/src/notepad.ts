/**
 * moves.txt — Notepad. The OS keeps minutes on your game: move numbers in
 * lines of eight, and commentary when you earn it ("and then you hesitated").
 * It scrolls because it's a text box; that's the law.
 */

import { el } from "./dom.js";
import { ICONS } from "./icons.js";
import { GAMES_COPY, TITLES } from "./copy.js";
import { menubar } from "./games/ui.js";
import type { Disk } from "./fs.js";
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
    bodyEl = el(`<div class="sunken notepad flexwell" style="max-height:300px;overflow:auto"></div>`);
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
 * Notepad — a text editor that actually edits actual files, because a text
 * editor that didn't would break the fiction harder than any flame. Open,
 * Save and Save As all work against the disk (fs.ts), so a program written
 * here is a program COMMAND.COM can run; Edit still does what period
 * Notepad's Edit did, including inserting the time and date, both of which
 * are wrong in the usual direction.
 *
 * One window per file, tracked here by name — window ids are a running
 * counter so Save As can rename a window without reopening it.
 */
const openEditors = new Map<string, Win>();
let editorSeq = 0;

const editorKey = (name: string | null): string => name?.toLowerCase() ?? "untitled";

export function openEditor(wm: WM, disk: Disk, name: string | null): void {
  const existing = openEditors.get(editorKey(name));
  if (existing?.isOpen()) {
    existing.focus();
    return;
  }

  let fileName = name;
  const body = el(`<div></div>`);
  const ta = el(
    `<textarea class="notepad notepad-edit" spellcheck="false"></textarea>`,
  ) as HTMLTextAreaElement;
  ta.value = fileName === null ? "" : (disk.read(fileName) ?? "");
  const wrap = el(`<div class="sunken flexwell" style="margin:3px;background:#fff"></div>`);
  wrap.appendChild(ta);

  const saveDialog = (n: string): void => {
    wm.dialog({ ...GAMES_COPY.notepad.saved(n), x: 320, y: 300, w: 330 });
  };

  const saveAs = (): void => {
    openFilePicker(wm, disk, "save", fileName ?? "", (n) => {
      const commit = (): void => {
        openEditors.delete(editorKey(fileName));
        fileName = n;
        openEditors.set(editorKey(n), win);
        disk.write(n, ta.value);
        win.setTitle(TITLES.notepad(n));
        saveDialog(n);
      };
      // saving over a different existing file asks first, like it did
      if (editorKey(fileName) !== n.toLowerCase() && disk.exists(n))
        wm.dialog({
          ...GAMES_COPY.notepad.replace(n),
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
        ["New", () => {
          if (fileName === null && !ta.value) return;
          openEditor(wm, disk, null);
        }],
        ["Open...", () => {
          openFilePicker(wm, disk, "open", "", (n) => openEditor(wm, disk, n));
        }],
        ["Save", () => {
          if (fileName === null) saveAs();
          else {
            disk.write(fileName, ta.value);
            saveDialog(fileName);
          }
        }],
        ["Save As...", saveAs],
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
    id: `edit${editorSeq++}`,
    title: TITLES.notepad(fileName ?? "untitled"),
    icon: ICONS.moves,
    x: 214 + (editorSeq % 5) * 22,
    y: 138 + (editorSeq % 5) * 20,
    w: 340,
    body,
    buttons: ["min", "close"],
    resizable: true,
    minW: 220,
    minH: 160,
    onClose: () => {
      if (openEditors.get(editorKey(fileName)) === win) openEditors.delete(editorKey(fileName));
    },
  });
  openEditors.set(editorKey(fileName), win);
  ta.focus();
}

/**
 * The Open / Save As picker: the disk's contents in a listbox and a name to
 * type, in the period's own furniture. One at a time — a second request
 * replaces the first.
 */
function openFilePicker(
  wm: WM,
  disk: Disk,
  mode: "open" | "save",
  initial: string,
  cb: (name: string) => void,
): void {
  wm.get("filepick")?.close();
  const body = el(`<div style="padding:6px 8px 2px"></div>`);
  const list = el(`<div class="listbox" style="height:110px;margin-bottom:6px"></div>`);
  const input = el(`<input class="pickin" spellcheck="false" autocomplete="off">`) as HTMLInputElement;
  input.value = initial;
  const ok = (): void => {
    const n = input.value.trim();
    if (!n) {
      wm.dialog({ ...GAMES_COPY.notepad.noName, x: 360, y: 320, w: 320 });
      return;
    }
    win.close();
    cb(n);
  };
  for (const f of disk.list()) {
    const row = el(`<div class="lrow"></div>`);
    row.textContent = f.name;
    row.addEventListener("click", () => {
      for (const r of list.children) r.classList.remove("sel");
      row.classList.add("sel");
      input.value = f.name;
    });
    row.addEventListener("dblclick", ok);
    list.appendChild(row);
  }
  const nameRow = el(
    `<div style="display:flex;gap:6px;align-items:center;margin-bottom:6px"><span>File name:</span></div>`,
  );
  nameRow.appendChild(input);
  const buttons = el(`<div class="btnrow" style="justify-content:flex-end;padding-right:0"></div>`);
  const okBtn = el(`<div class="btn def">OK</div>`);
  const cancelBtn = el(`<div class="btn">Cancel</div>`);
  okBtn.addEventListener("click", ok);
  cancelBtn.addEventListener("click", () => win.close());
  buttons.append(okBtn, cancelBtn);
  body.append(list, nameRow, buttons);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") ok();
  });
  const win = wm.open({
    id: "filepick",
    title: mode === "save" ? TITLES.saveAs : TITLES.openFile,
    x: 400,
    y: 230,
    w: 300,
    body,
    buttons: ["close"],
    taskbar: false,
  });
  input.focus();
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
  const pad = el(`<div class="sunken notepad flexwell" style="max-height:420px;overflow:auto"></div>`);
  pad.textContent = text;
  body.appendChild(pad);
  wm.open({ id, title, icon: ICONS.moves, x, y, ax, w, body, buttons: ["close"], resizable: true, minW: 180, minH: 120 });
}
