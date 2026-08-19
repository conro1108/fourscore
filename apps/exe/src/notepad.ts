/**
 * moves.txt — Notepad. The OS keeps minutes on your game: move numbers in
 * lines of eight, and commentary when you earn it ("and then you hesitated").
 * It scrolls because it's a text box; that's the law.
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

/** The pad's minutes are a real file too — TYPE it and see. */
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
    // the OS keeps its minutes on the disk whether or not the window is up;
    // an edit someone makes in Notepad lasts until the pad's next entry
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

/**
 * Notepad — a text editor that actually edits actual files, because a text
 * editor that didn't would break the fiction harder than any flame. Open,
 * Save and Save As all work against the disk (fs.ts), so a program written
 * here is a program COMMAND.COM can run; Edit still does what period
 * Notepad's Edit did, including inserting the time and date, both of which
 * are wrong in the usual direction.
 *
 * One window per file, tracked here by canonical path — window ids are a
 * running counter so Save As can rename a window without reopening it.
 */
const openEditors = new Map<string, Win>();
let editorSeq = 0;

/** "\0" can't be typed into a name field, so a new file can't collide. */
const editorKey = (name: string | null): string =>
  name === null ? "\0new" : normPath(name).toLowerCase();

/* ---- typing help ----
   Every file the editor opens gets the courtesies a period programmer's
   editor had: Enter keeps the indent (and opens a brace properly), Tab types
   spaces instead of leaving the window, the closing half of a pair arrives
   with the opening half, and Backspace between an empty pair takes both.

   These used to be scoped to .c/.h/.asm, on the theory that a .txt shouldn't
   fight you over a quotation mark — which meant the desktop's own Notepad
   (untitled.txt) had none of them and nothing said why. The boundary rule is
   the part that was actually doing that work, so it now covers every pair: a
   bracket or a quote only closes itself against whitespace, a closer or the
   end of the line. Type `(` in front of a word in prose and you get one
   paren, which is what you asked for.

   The decision is `padTyping`, which is pure and tested; the listener below
   is the hand that carries it out. */

const INDENT = "    ";
const PAIRS: Record<string, string> = { "(": ")", "[": "]", "{": "}", '"': '"' };
const CLOSERS = new Set(Object.values(PAIRS));
/** What a pair refuses to close in front of: a word, a quote, an apostrophe. */
const WORDISH = /[\w"']/;

/** Where the text box is when a key arrives. */
export interface PadState {
  value: string;
  start: number;
  end: number;
}

/** What the editor should do about it. `null` means "let the browser type". */
export type PadAction =
  /** Replace the selection with `text`, then step the caret `back` from its end. */
  | { kind: "insert"; text: string; back: number }
  /** Delete `from`..`to` (Backspace taking a pair). */
  | { kind: "delete"; from: number; to: number }
  /** Type nothing; put the caret at `at` (stepping over a closer). */
  | { kind: "caret"; at: number };

export function padTyping(
  key: string,
  { value, start, end }: PadState,
  shift = false,
): PadAction | null {
  const next = value[end] ?? "";
  const collapsed = start === end;

  // Shift+Tab is how you leave a text box backwards; it isn't an indent
  if (key === "Tab") return shift ? null : { kind: "insert", text: INDENT, back: 0 };
  if (key === "Enter") {
    const lineStart = value.lastIndexOf("\n", start - 1) + 1;
    const indent = /^[ \t]*/.exec(value.slice(lineStart, start))![0]!;
    const prev = value.slice(lineStart, start).trimEnd().slice(-1);
    // the brace opens like a door: the caret lands on its own line inside
    if (prev === "{" && next === "}")
      return { kind: "insert", text: `\n${indent}${INDENT}\n${indent}`, back: indent.length + 1 };
    return { kind: "insert", text: `\n${indent}${prev === "{" ? INDENT : ""}`, back: 0 };
  }
  // the closer is already there; typing it steps over it
  if (collapsed && CLOSERS.has(key) && next === key) return { kind: "caret", at: end + 1 };
  if (collapsed && PAIRS[key]) {
    // a pair only closes itself against a boundary — mid-word a bracket is a
    // bracket and a quote is an inch mark
    if (WORDISH.test(next)) return null;
    // ...and a quote after a word is the closing one: 6" of pipe, not 6""
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
    /* Both edits go through execCommand, deprecated and the only thing that
       keeps Ctrl+Z honest: `setRangeText` writes the box without telling the
       undo stack, so undoing a line that had a bracket closed for it restores
       text that was never on screen. Notepad's Edit menu is period furniture;
       its undo has to be the real one. */
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
      // saving over a different existing file asks first, like it did
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

/**
 * The Open / Save As picker: one directory's contents in a listbox and a name
 * to type, in the period's own furniture. Folder rows walk in, [..] walks
 * out, and the label above the listbox says where you are — a typed path is
 * honored, a bare name lands in the directory shown. One at a time — a
 * second request replaces the first. PAINT.EXE borrows it too; there is one
 * disk, so there is one picker.
 */
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
  const input = el(`<input class="pickin" spellcheck="false" autocomplete="off">`) as HTMLInputElement;
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
      // naming a folder walks into it, like the period's picker did
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
