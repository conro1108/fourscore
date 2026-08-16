/**
 * COMMAND.COM — the one black window. It is a real shell over a real disk
 * (fs.ts) and a real processor (vm.ts): DIR reads the volume, TYPE prints
 * it, RUN assembles the file to machine words and executes them. The law
 * holds hardest here — a prompt that faked its output would be a poster of
 * a computer, so nothing in this file knows what a program is going to do.
 *
 * A running program gets a slice of steps per animation frame rather than a
 * loop, so an infinite loop animates instead of hanging the desktop, and
 * ESC is always heard. Keys go to the KEY port's queue while a program
 * runs; the prompt comes back when it halts, faults, or is stopped.
 */

import { el } from "./dom.js";
import { ICONS } from "./icons.js";
import { TERM, TITLES } from "./copy.js";
import type { WM } from "./wm.js";
import type { Disk } from "./fs.js";
import { assemble, makeVm, type Vm } from "./vm.js";

export interface TerminalDeps {
  wm: WM;
  disk: Disk;
  /** EDIT hands the file to Notepad. */
  edit(name: string): void;
}

/** What the volume claims to hold — localStorage's usual 5MB, honestly. */
const DISK_BYTES = 5 * 1024 * 1024;
const MAX_LINES = 500;
const STEPS_PER_FRAME = 30_000;
/** How many assembler complaints fit on a period screen. */
const MAX_ERRORS = 8;

export function openTerminal({ wm, disk, edit }: TerminalDeps): void {
  const existing = wm.get("terminal");
  if (existing?.isOpen()) {
    existing.focus();
    return;
  }

  const body = el(`<div></div>`);
  const well = el(`<div class="sunken termwell flexwell"></div>`);
  const outEl = el(`<div class="termout"></div>`);
  const tailEl = el(`<div class="termout"></div>`);
  const lineEl = el(`<div class="termline"></div>`);
  const promptEl = el(`<span class="termprompt"></span>`);
  const input = el(`<input class="termin" spellcheck="false" autocomplete="off">`) as HTMLInputElement;
  promptEl.textContent = TERM.prompt;
  lineEl.append(promptEl, input);
  well.append(outEl, tailEl, lineEl);
  body.appendChild(well);

  /* ---- output ---- */
  let tail = ""; // the unfinished line a program is still printing
  const scroll = (): void => {
    well.scrollTop = well.scrollHeight;
  };
  const print = (s = ""): void => {
    const d = el(`<div></div>`);
    d.textContent = s === "" ? " " : s;
    outEl.appendChild(d);
    while (outEl.childElementCount > MAX_LINES) outEl.firstElementChild!.remove();
  };
  const flushTail = (): void => {
    tailEl.textContent = tail;
  };

  /* ---- the processor's side of the ports ---- */
  let proc: Vm | null = null;
  let raf = 0;
  const keyQueue: number[] = [];
  const io = {
    putChar(c: number): void {
      if (c === 10) {
        print(tail);
        tail = "";
      } else if (c === 8) {
        tail = tail.slice(0, -1);
      } else if (c >= 32 || c === 9) {
        tail += String.fromCharCode(c);
      } // other control codes are quietly not characters
    },
    putNum(n: number): void {
      tail += String(n);
    },
    key: (): number => keyQueue.shift() ?? 0,
    rand: (): number => Math.floor(Math.random() * 0x10000),
  };

  const endRun = (): void => {
    if (tail) {
      print(tail);
      tail = "";
    }
    flushTail();
    proc = null;
    cancelAnimationFrame(raf);
    promptEl.textContent = TERM.prompt;
    scroll();
  };

  const frame = (): void => {
    if (!proc) return;
    proc.run(STEPS_PER_FRAME);
    flushTail();
    scroll();
    if (proc.fault !== null) {
      const fault = proc.fault;
      endRun();
      print(TERM.faulted(fault));
      scroll();
    } else if (proc.halted) {
      endRun();
    } else {
      raf = requestAnimationFrame(frame);
    }
  };

  /** Resolve NAME to a file, trying NAME.asm too, RUN-style. */
  const findSource = (name: string): { name: string; text: string } | null => {
    for (const n of [name, `${name}.asm`]) {
      const text = disk.read(n);
      if (text !== null) return { name: n, text };
    }
    return null;
  };

  const printAsmErrors = (errors: readonly { line: number; msg: string }[]): void => {
    for (const e of errors.slice(0, MAX_ERRORS)) print(TERM.asmErrLine(e.line, e.msg));
    print(TERM.asmErrCount(errors.length));
  };

  const runProgram = (name: string | undefined): void => {
    if (!name) {
      print(TERM.needsFile("RUN"));
      return;
    }
    const src = findSource(name);
    if (!src) {
      print(TERM.fileNotFound);
      return;
    }
    const res = assemble(src.text);
    if (!res.ok) {
      printAsmErrors(res.errors);
      return;
    }
    keyQueue.length = 0;
    proc = makeVm(res.words, io);
    promptEl.textContent = ""; // the prompt steps aside while a program has the screen
    raf = requestAnimationFrame(frame);
  };

  /* ---- the commands ---- */
  const dir = (): void => {
    for (const line of TERM.dirHeader) print(line);
    const files = disk.list();
    let total = 0;
    for (const f of files) {
      total += f.text.length;
      const dot = f.name.lastIndexOf(".");
      const base = (dot > 0 ? f.name.slice(0, dot) : f.name).toUpperCase();
      const ext = (dot > 0 ? f.name.slice(dot + 1) : "").toUpperCase();
      print(
        `${base.padEnd(8).slice(0, 12)} ${ext.padEnd(3)} ${f.text.length.toLocaleString("en-US").padStart(10)}  08-14-96   6:66p`,
      );
    }
    const free = Math.max(0, DISK_BYTES - total);
    for (const line of TERM.dirFooter(
      files.length,
      total.toLocaleString("en-US"),
      free.toLocaleString("en-US"),
    ))
      print(line);
  };

  const runCommand = (raw: string): void => {
    print(TERM.prompt + raw);
    const parts = raw.trim().split(/\s+/);
    const first = parts[0] ?? "";
    if (!first) return;
    const cmd = first.toUpperCase();
    const arg1 = parts[1];
    const arg2 = parts[2];

    switch (cmd) {
      case "HELP":
        for (const line of TERM.help) print(line);
        break;
      case "VER":
        print(TERM.ver);
        break;
      case "TIME":
        print(TERM.time);
        break;
      case "DATE":
        print(TERM.date);
        break;
      case "CLS":
      case "CLEAR":
        outEl.textContent = "";
        break;
      case "ECHO": {
        const text = raw.trim().slice(4).trim();
        print(text || "ECHO is on.");
        break;
      }
      // the unix names work too — the owner's fingers predate the fiction
      case "DIR":
      case "LS":
        dir();
        break;
      case "TYPE":
      case "CAT": {
        if (!arg1) {
          print(TERM.needsFile(cmd));
          break;
        }
        const text = disk.read(arg1);
        if (text === null) print(TERM.fileNotFound);
        else for (const line of text.split("\n")) print(line);
        break;
      }
      case "DEL":
      case "RM":
        if (!arg1) print(TERM.needsFile(cmd));
        else if (!disk.remove(arg1)) print(TERM.fileNotFound);
        else print(TERM.deleted(arg1));
        break;
      case "REN":
      case "MV":
        if (!arg1 || !arg2) print(TERM.needsFile(cmd));
        else if (!disk.rename(arg1, arg2)) print(TERM.duplicateOrMissing);
        break;
      case "COPY":
      case "CP": {
        if (!arg1 || !arg2) {
          print(TERM.needsFile(cmd));
          break;
        }
        const text = disk.read(arg1);
        if (text === null) print(TERM.fileNotFound);
        else {
          disk.write(arg2, text);
          print(TERM.copied);
        }
        break;
      }
      case "EDIT":
        if (!arg1) print(TERM.needsFile("EDIT"));
        else edit(arg1);
        break;
      case "ASM": {
        if (!arg1) {
          print(TERM.needsFile("ASM"));
          break;
        }
        const src = findSource(arg1);
        if (!src) {
          print(TERM.fileNotFound);
          break;
        }
        const res = assemble(src.text);
        if (res.ok) print(TERM.asmOk(src.name, res.words.length));
        else printAsmErrors(res.errors);
        break;
      }
      case "RUN":
        runProgram(arg1);
        break;
      case "EXIT":
        win.close();
        break;
      default:
        // a program's name is a command, like it always was
        if (findSource(first)) runProgram(first);
        else print(TERM.badCommand);
    }
  };

  /* ---- input: one line, a history, and the KEY port while running ---- */
  const history: string[] = [];
  let hIdx = 0;
  input.addEventListener("keydown", (e) => {
    if (proc) {
      // the program has the keyboard; ESC takes it back
      e.preventDefault();
      if (e.key === "Escape" || (e.ctrlKey && e.key.toLowerCase() === "c")) {
        endRun();
        print(TERM.broke);
        scroll();
      } else if (e.key === "Enter") keyQueue.push(13);
      else if (e.key === "Backspace") keyQueue.push(8);
      else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) keyQueue.push(e.key.charCodeAt(0));
      return;
    }
    if (e.key === "Enter") {
      const v = input.value;
      input.value = "";
      if (v.trim()) history.push(v);
      hIdx = history.length;
      runCommand(v);
      scroll();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (hIdx > 0) input.value = history[--hIdx] ?? "";
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      input.value = hIdx < history.length - 1 ? (history[++hIdx] ?? "") : ((hIdx = history.length), "");
    }
  });
  // a click focuses the prompt, unless the click was selecting output
  well.addEventListener("click", () => {
    if (getSelection()?.isCollapsed) input.focus();
  });

  const win = wm.open({
    id: "terminal",
    title: TITLES.terminal,
    icon: ICONS.term,
    x: 250,
    y: 170,
    w: 520,
    body,
    resizable: true,
    minW: 360,
    minH: 220,
    onClose: () => {
      proc = null;
      cancelAnimationFrame(raf);
    },
  });
  for (const line of TERM.banner) print(line);
  input.focus();
}
