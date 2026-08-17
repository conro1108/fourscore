/**
 * The Terminal — the one black window. It is a real shell over a real disk
 * (fs.ts) and a real processor (vm.ts): ls reads the volume, cat prints
 * it, run assembles the file to machine words and executes them. It speaks
 * unix — the owner's fingers outvoted the fiction — with the DOS spellings
 * kept as quiet aliases. The law holds hardest here — a prompt that faked
 * its output would be a poster of a computer, so nothing in this file knows
 * what a program is going to do.
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
import { baseName, resolvePath, type Disk } from "./fs.js";
import { assemble, makeVm, SCREEN_H, SCREEN_W, type AsmResult, type Vm } from "./vm.js";
import { compileC } from "./cc.js";

export interface TerminalDeps {
  wm: WM;
  disk: Disk;
  /** EDIT hands the file to Notepad. */
  edit(name: string): void;
  /** PAINT hands it to PAINT.EXE. */
  paint(name: string): void;
  /** A file whose text is a program (the MZ line) launches instead of
      assembling — typing MINES runs MINES.EXE. False if it wasn't one. */
  launch(text: string): boolean;
}

const MAX_LINES = 500;
const STEPS_PER_FRAME = 30_000;
/** How many assembler complaints fit on a period screen. */
const MAX_ERRORS = 8;

export function openTerminal({ wm, disk, edit, paint, launch }: TerminalDeps): void {
  const existing = wm.get("terminal");
  if (existing?.isOpen()) {
    existing.focus();
    return;
  }

  const body = el(`<div></div>`);
  const well = el(`<div class="sunken termwell flexwell"></div>`);
  const outEl = el(`<div class="termout"></div>`);
  /** The 40x24 screen (vm.ts's VCHR page). While a program has it lit, it
      is the terminal; the console comes back when the program ends. */
  const screenEl = el(`<div class="termscreen"></div>`);
  const tailEl = el(`<div class="termout"></div>`);
  const lineEl = el(`<div class="termline"></div>`);
  const promptEl = el(`<span class="termprompt"></span>`);
  const input = el(`<input class="termin" spellcheck="false" autocomplete="off">`) as HTMLInputElement;
  /** The working directory — the prompt wears it, every path resolves off it. */
  let cwd = "";
  const prompt = (): string => TERM.promptFor(cwd);
  const resolve = (arg: string): string => resolvePath(cwd, arg);
  /** A path the way the shell shows it: forward slashes, rooted. */
  const disp = (p: string): string => "/" + p.replace(/\\/g, "/");
  promptEl.textContent = prompt();
  lineEl.append(promptEl, input);
  well.append(outEl, screenEl, tailEl, lineEl);
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

  /** The cell grid as text — codes the period font has; the rest are space. */
  const renderScreen = (screen: Uint16Array): void => {
    const rows: string[] = [];
    for (let y = 0; y < SCREEN_H; y++) {
      let row = "";
      for (let x = 0; x < SCREEN_W; x++) {
        const v = screen[y * SCREEN_W + x]!;
        row += v >= 32 && v < 127 ? String.fromCharCode(v) : " ";
      }
      rows.push(row);
    }
    screenEl.textContent = rows.join("\n");
  };

  const endRun = (): void => {
    if (tail) {
      print(tail);
      tail = "";
    }
    flushTail();
    proc = null;
    cancelAnimationFrame(raf);
    // the monitor drops back to text mode; the console was there all along
    well.classList.remove("screening");
    screenEl.textContent = "";
    promptEl.textContent = prompt();
    scroll();
  };

  /** The display's own clock. rAF follows the monitor (or nothing at all,
      headless), so the machine meters itself: ~60 frames a second is what
      STEPS_PER_FRAME's ~1.8M instructions/sec has always assumed, and it is
      what a VSYNC-paced program's speed now hangs on. */
  let lastFrame = 0;
  const frame = (t: number): void => {
    if (!proc) return;
    if (t - lastFrame >= 14) {
      lastFrame = t;
      proc.run(STEPS_PER_FRAME);
      if (proc.screenOn) {
        well.classList.add("screening");
        renderScreen(proc.screen);
      }
      flushTail();
      scroll();
      if (proc.fault !== null) {
        const fault = proc.fault;
        endRun();
        print(TERM.faulted(fault));
        scroll();
        return;
      }
      if (proc.halted) {
        endRun();
        return;
      }
    }
    raf = requestAnimationFrame(frame);
  };

  /** Resolve NAME to a runnable file: against the cwd first, then — for a
      bare name — the places programs live (a small, honest PATH), trying the
      runnable extensions on each. */
  const findSource = (name: string): { name: string; text: string } | null => {
    const bases = [resolve(name)];
    if (!/[\\/]/.test(name.trim()))
      bases.push(name, `DESKTOP\\${name}`, `DESKTOP\\games\\${name}`);
    for (const base of bases)
      for (const ext of ["", ".exe", ".scr", ".com", ".asm", ".c"]) {
        const text = disk.read(base + ext);
        if (text !== null) return { name: base + ext, text };
      }
    return null;
  };

  const printAsmErrors = (errors: readonly { line: number; msg: string }[]): void => {
    for (const e of errors.slice(0, MAX_ERRORS)) print(TERM.asmErrLine(e.line, e.msg));
    print(TERM.asmErrCount(errors.length));
  };

  /** Machine words for a source file: .c compiles first, everything else is
      assembly. Either toolchain's complaints print the same way. */
  const toWords = (src: { name: string; text: string }): AsmResult => {
    if (!/\.c$/i.test(src.name)) return assemble(src.text);
    const cc = compileC(src.text);
    if (!cc.ok) return cc;
    const asm = assemble(cc.asm);
    if (!asm.ok) print(TERM.ccBadAsm);
    return asm;
  };

  const runProgram = (name: string | undefined): void => {
    if (!name) {
      print(TERM.usage("run file"));
      return;
    }
    const src = findSource(name);
    if (!src) {
      print(TERM.noSuchFile("run", name));
      return;
    }
    // a real program file boots its program; the processor gets the rest
    if (launch(src.text)) return;
    const res = toWords(src);
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
  /** rm on a directory: everything under it, deepest first, then the dir. */
  const rmTree = (path: string): void => {
    const listing = disk.listDir(path);
    if (!listing) return;
    for (const f of listing.files) disk.remove(f.name);
    for (const d of listing.dirs) rmTree(d);
    disk.rmdir(path);
  };

  const ls = (arg?: string): void => {
    const path = arg ? resolve(arg) : cwd;
    const listing = disk.listDir(path);
    if (!listing) {
      print(TERM.noSuchFile("ls", arg ?? disp(path)));
      return;
    }
    // names in columns, directories wearing a slash — an empty dir prints nothing
    const names = [
      ...listing.dirs.map((d) => baseName(d) + "/"),
      ...listing.files.map((f) => baseName(f.name)),
    ];
    if (names.length === 0) return;
    const colw = Math.max(...names.map((n) => n.length)) + 2;
    const perRow = Math.max(1, Math.floor(76 / colw));
    for (let i = 0; i < names.length; i += perRow)
      print(
        names
          .slice(i, i + perRow)
          .map((n) => n.padEnd(colw))
          .join("")
          .trimEnd(),
      );
  };

  const runCommand = (raw: string): void => {
    print(prompt() + raw);
    const parts = raw.trim().split(/\s+/);
    let first = parts[0] ?? "";
    if (!first) return;
    // the period's glued spellings: CD.. and CD\ arrive as one word
    const glued = /^(CD|CHDIR)([\\.].*)$/i.exec(first);
    if (glued) {
      parts.splice(0, 1, glued[1]!, glued[2]!);
      first = glued[1]!;
    }
    const cmd = first.toUpperCase();
    const arg1 = parts[1];
    const arg2 = parts[2];

    switch (cmd) {
      case "HELP":
        for (const line of TERM.help) print(line);
        break;
      case "UNAME":
      case "VER":
        print(TERM.uname);
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
      // the DOS names still answer — the machine remembers being something else
      case "LS":
      case "DIR":
        ls(arg1);
        break;
      case "CD":
      case "CHDIR": {
        // cd alone goes to the root — the nearest thing to a home here
        const t = arg1 ? resolve(arg1) : "";
        if (disk.isDir(t)) {
          cwd = t;
          promptEl.textContent = prompt();
        } else print(TERM.badDir(arg1 ?? "/"));
        break;
      }
      case "PWD":
        print(disp(cwd));
        break;
      case "CAT":
      case "TYPE": {
        if (!arg1) {
          print(TERM.usage("cat file"));
          break;
        }
        const text = disk.read(resolve(arg1));
        if (text === null) print(TERM.noSuchFile("cat", arg1));
        else for (const line of text.split("\n")) print(line);
        break;
      }
      case "RM":
      case "DEL": {
        // flags are muscle memory — rm -rf and rm read the same here
        const target = parts.slice(1).find((a) => !a.startsWith("-"));
        if (!target) {
          print(TERM.usage("rm file-or-dir"));
          break;
        }
        const t = resolve(target);
        if (disk.isDir(t)) {
          // a directory deletes whole (-r is assumed), but never the root
          // or the floor you stand on
          const underfoot = t === "" || cwd.toLowerCase() === t.toLowerCase() ||
            cwd.toLowerCase().startsWith(t.toLowerCase() + "\\");
          if (underfoot) print(TERM.rmRefused(target));
          else rmTree(t);
        } else if (!disk.remove(t)) print(TERM.noSuchFile("rm", target));
        // success is silence, the way rm always said it
        break;
      }
      case "MV":
      case "REN": {
        if (!arg1 || !arg2) {
          print(TERM.usage("mv source target"));
          break;
        }
        const src = resolve(arg1);
        let dst = resolve(arg2);
        // a directory target means "into it", the way mv always read it
        if (disk.isDir(dst) && !disk.isDir(src)) dst = `${dst}\\${baseName(src)}`;
        if (!disk.rename(src, dst)) print(TERM.duplicateOrMissing);
        break;
      }
      case "CP":
      case "COPY": {
        if (!arg1 || !arg2) {
          print(TERM.usage("cp source target"));
          break;
        }
        const text = disk.read(resolve(arg1));
        if (text === null) {
          print(TERM.noSuchFile("cp", arg1));
          break;
        }
        let dst = resolve(arg2);
        if (disk.isDir(dst)) dst = `${dst}\\${baseName(resolve(arg1))}`;
        if (!disk.write(dst, text)) print(TERM.duplicateOrMissing);
        break;
      }
      case "EDIT":
        if (!arg1) print(TERM.usage("edit file"));
        else edit(resolve(arg1));
        break;
      case "PAINT":
        if (!arg1) print(TERM.usage("paint file.spr"));
        else paint(resolve(arg1));
        break;
      case "MKDIR":
      case "MD":
        if (!arg1) print(TERM.usage("mkdir directory"));
        else if (!disk.mkdir(resolve(arg1))) print(TERM.dirExists(arg1));
        break;
      case "RMDIR":
      case "RD": {
        if (!arg1) {
          print(TERM.usage("rmdir directory"));
          break;
        }
        const t = resolve(arg1);
        // the floor you stand on is not removable, even empty
        const underfoot = t !== "" && (cwd.toLowerCase() === t.toLowerCase() ||
          cwd.toLowerCase().startsWith(t.toLowerCase() + "\\"));
        if (underfoot || !disk.rmdir(t)) print(TERM.rmdirRefused(arg1));
        break;
      }
      case "ASM": {
        if (!arg1) {
          print(TERM.usage("asm file.asm"));
          break;
        }
        const src = findSource(arg1);
        if (!src) {
          print(TERM.noSuchFile("asm", arg1));
          break;
        }
        const res = assemble(src.text);
        if (res.ok) print(TERM.asmOk(disp(src.name), res.words.length));
        else printAsmErrors(res.errors);
        break;
      }
      case "CC": {
        if (!arg1) {
          print(TERM.usage("cc file.c"));
          break;
        }
        // cc resolves the .c itself so cc fizz and cc fizz.c both compile
        const cPath = resolve(/\.c$/i.test(arg1) ? arg1 : `${arg1}.c`);
        const text = disk.read(cPath) ?? disk.read(resolve(arg1));
        if (text === null) {
          print(TERM.noSuchFile("cc", arg1));
          break;
        }
        const cc = compileC(text);
        if (!cc.ok) {
          printAsmErrors(cc.errors);
          break;
        }
        const asm = assemble(cc.asm);
        if (!asm.ok) {
          print(TERM.ccBadAsm);
          printAsmErrors(asm.errors);
          break;
        }
        // the .asm lands beside its source, wherever that was
        const outName = `${cPath.replace(/\.c$/i, "")}.asm`;
        disk.write(outName, cc.asm);
        print(TERM.ccOk(disp(cPath), disp(outName), asm.words.length));
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
        else print(TERM.badCommand(first));
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
