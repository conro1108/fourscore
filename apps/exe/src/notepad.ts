/**
 * moves.txt (the game's minutes, written to the disk as it goes), the Notepad
 * editor, and the shared Open/Save As picker that PAINT.EXE also uses.
 */

import { el } from "./dom.js";
import { ICONS } from "./icons.js";
import { GAMES_COPY, TITLES } from "./copy.js";
import { menubar } from "./games/ui.js";
import { baseName, normPath, parentOf, type Disk } from "./fs.js";
import type { AnchorX, WM, Win } from "./wm.js";

export interface MovesPad {
  open(): void;
  move(col: number): void;
  lines(text: readonly string[]): void;
  reset(): void;
}

export const MOVES_PATH = "DESKTOP\\moves.txt";

export function makeMovesPad(wm: WM, disk?: Disk): MovesPad {
  let notesLines: string[] = [];
  let lineBuf: (number | string)[] = [];
  let win: Win | null = null;
  let bodyEl: HTMLElement | null = null;

  const text = (): string => {
    const all = [...notesLines];
    if (lineBuf.length) all.push(lineBuf.join(" "));
    return all.join("\n");
  };

  let written: string | null = null;
  function render(): void {
    // written to disk whether or not the window is up; a Notepad edit lasts until the next entry
    if (text() !== written) {
      written = text();
      disk?.write(MOVES_PATH, written);
    }
    if (!bodyEl) return;
    bodyEl.textContent = text() || " ";
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

/** One editor window per file, keyed by canonical path; window ids are a
    counter so Save As can re-key without reopening. */
const openEditors = new Map<string, Win>();
let editorSeq = 0;

/** "\0" can't be typed, so a new file can't collide. */
const editorKey = (name: string | null): string =>
  name === null ? "\0new" : normPath(name).toLowerCase();

/* Typing help applies to every file type; the boundary rule (a pair only
   closes itself against whitespace, a closer or end of line) is what keeps
   it out of prose's way. `padTyping` is the pure, tested decision. */

const INDENT = "    ";
const PAIRS: Record<string, string> = { "(": ")", "[": "]", "{": "}", '"': '"' };
const CLOSERS = new Set(Object.values(PAIRS));
const WORDISH = /[\w"']/;

export interface PadState {
  value: string;
  start: number;
  end: number;
}

/** `null` means let the browser type. */
export type PadAction =
  /** Replace selection with `text`, then step caret `back` from its end. */
  | { kind: "insert"; text: string; back: number }
  | { kind: "delete"; from: number; to: number }
  | { kind: "caret"; at: number };

export function padTyping(
  key: string,
  { value, start, end }: PadState,
  shift = false,
): PadAction | null {
  const next = value[end] ?? "";
  const collapsed = start === end;

  // Shift+Tab leaves the box; not an indent
  if (key === "Tab") return shift ? null : { kind: "insert", text: INDENT, back: 0 };
  if (key === "Enter") {
    const lineStart = value.lastIndexOf("\n", start - 1) + 1;
    const indent = /^[ \t]*/.exec(value.slice(lineStart, start))![0]!;
    const prev = value.slice(lineStart, start).trimEnd().slice(-1);
    if (prev === "{" && next === "}")
      return { kind: "insert", text: `\n${indent}${INDENT}\n${indent}`, back: indent.length + 1 };
    return { kind: "insert", text: `\n${indent}${prev === "{" ? INDENT : ""}`, back: 0 };
  }
  if (collapsed && CLOSERS.has(key) && next === key) return { kind: "caret", at: end + 1 };
  if (collapsed && PAIRS[key]) {
    if (WORDISH.test(next)) return null;
    // a quote after a word is a closing one: 6" of pipe, not 6""
    if (key === '"' && WORDISH.test(value[start - 1] ?? "")) return null;
    return { kind: "insert", text: key + PAIRS[key]!, back: 1 };
  }
  if (key === "Backspace" && collapsed && PAIRS[value[start - 1] ?? ""] === next)
    return { kind: "delete", from: start - 1, to: start + 1 };
  return null;
}

function installTypingHelp(ta: HTMLTextAreaElement): void {
  ta.addEventListener("keydown", (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const act = padTyping(
      e.key,
      { value: ta.value, start: ta.selectionStart, end: ta.selectionEnd },
      e.shiftKey,
    );
    if (!act) return;
    e.preventDefault();
    if (act.kind === "caret") {
      ta.selectionStart = ta.selectionEnd = act.at;
      return;
    }
    /* execCommand is deprecated but the only edit path the undo stack sees;
       setRangeText would make Ctrl+Z restore text never shown. */
    if (act.kind === "delete") {
      ta.selectionStart = act.from;
      ta.selectionEnd = act.to;
      document.execCommand("delete");
      return;
    }
    document.execCommand("insertText", false, act.text);
    if (act.back) ta.selectionStart = ta.selectionEnd = ta.selectionEnd - act.back;
  });
}

export function openEditor(wm: WM, disk: Disk, name: string | null): void {
  if (name !== null) name = normPath(name);
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
  installTypingHelp(ta);
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
        win.setTitle(TITLES.notepad(baseName(n)));
        saveDialog(n);
      };
      if (editorKey(fileName) !== editorKey(n) && disk.exists(n))
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
    title: TITLES.notepad(fileName === null ? "untitled" : baseName(fileName)),
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

/** Open / Save As picker. A typed path is honored; a bare name lands in the
    directory shown. One at a time — a second request replaces the first. */
export function openFilePicker(
  wm: WM,
  disk: Disk,
  mode: "open" | "save",
  initial: string,
  cb: (name: string) => void,
): void {
  wm.get("filepick")?.close();
  const start = normPath(initial);
  const body = el(`<div style="padding:6px 8px 2px"></div>`);
  const where = el(`<div style="margin-bottom:4px;overflow:hidden;white-space:nowrap"></div>`);
  const list = el(`<div class="listbox" style="height:110px;margin-bottom:6px"></div>`);
  const input = el(`<input class="pickin" spellcheck="false" autocomplete="off" autocapitalize="off" autocorrect="off">`) as HTMLInputElement;
  input.value = baseName(start);
  let cwd = start === "" ? "DESKTOP" : parentOf(start);
  if (!disk.isDir(cwd)) cwd = "";
  const ok = (): void => {
    const n = input.value.trim();
    if (!n) {
      wm.dialog({ ...GAMES_COPY.notepad.noName, x: 360, y: 320, w: 320 });
      return;
    }
    const full = /^[\\/]|^[cC]:/.test(n) ? normPath(n) : normPath(`${cwd}\\${n}`);
    if (disk.isDir(full)) {
      show(full);
      input.value = "";
      return;
    }
    win.close();
    cb(full);
  };
  const addRow = (label: string, click: () => void, dbl?: () => void): void => {
    const row = el(`<div class="lrow"></div>`);
    row.textContent = label;
    row.addEventListener("click", () => {
      for (const r of list.children) r.classList.remove("sel");
      row.classList.add("sel");
      click();
    });
    if (dbl) row.addEventListener("dblclick", dbl);
    list.appendChild(row);
  };
  const show = (dir: string): void => {
    cwd = dir;
    where.textContent = cwd ? `C:\\${cwd}` : "C:\\";
    list.textContent = "";
    if (cwd !== "") addRow("[..]", () => show(parentOf(cwd)));
    const here = disk.listDir(cwd) ?? { dirs: [], files: [] };
    for (const d of here.dirs) addRow(`[${baseName(d)}]`, () => show(d));
    for (const f of here.files)
      addRow(baseName(f.name), () => void (input.value = baseName(f.name)), ok);
  };
  show(cwd);
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
  body.append(where, list, nameRow, buttons);
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
