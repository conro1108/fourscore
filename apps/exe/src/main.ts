/**
 * Boot the possessed desktop and wire everything together.
 *
 * Deep links (the harness pattern from the proposals — screenshot before you
 * claim):
 *   ?state=midgame        a scripted opening, frozen mid-deliberation
 *   ?state=win&beat=N     the win sequence held at a beat (2..11)
 *   ?state=loss&beat=N    the coals parade held at a beat (2..10)
 *   ?state=pieces         pieces.ctl open
 *   ?state=saver          the screensaver has won the desktop
 *   ?state=mines|sol|snake|checkers|notepad|games|terminal   the other software
 *   ?state=paint          PAINT.EXE with rocket.spr on the easel
 *   ?state=sounds         sounds.ctl open
 *   ?state=review&ply=N   REVIEW.EXE over a finished game, walked to ply N
 *   ?state=shutdown       the Shut Down box
 *   ?state=reboot         the restart beat, held (the real one navigates)
 *   ?state=sol&rig=won    a double-click from the card bounce
 *   ?state=sol&rig=review a fixed deal, a dozen draws, and its review open
 *   ?state=chess&fen=...  chess parked on a position — a mate, or a sharp one
 *   ?fever=0.85           walk the fever up to a value and pin it
 *   ?act=dialog&pool=move:blunder   fire one beat act, so it can be looked at
 *   ?chips=pixel          preselect a chip style
 *   ?bot=quill ?variant=connect5
 *   ?ctl=1                FEVER.CTL (dev only; does not ship in the fiction)
 */

import "./chrome.css";
import { el, onPointerDrag, param, q } from "./dom.js";
import { fitStage, makeWM } from "./wm.js";
import { buildShell, type DesktopApps } from "./desktop.js";
import { analysisClient, engineClient } from "./engine/client.js";
import { makeBoard, type BoardApp, type BoardDeps, type EndResult } from "./board.js";
import { openReview } from "./review.js";
import { makeMovesPad, openEditor, textWindow } from "./notepad.js";
import { openPaint } from "./paint.js";
import { installPins } from "./pins.js";
import { cellsToRows, isSpriteFile, parseSprite } from "./sprite.js";
import { makeDisk } from "./fs.js";
import { openTerminal } from "./terminal.js";
import { loadMedia } from "./drive.js";
import { installGeneratedChips, openPieces } from "./chips.js";
import { makeDirector, tierOf } from "./director.js";
import { makeEffects } from "./effects.js";
import { beatFromPool, type BeatAct } from "./beats.js";
import { makeEndgame } from "./endgame.js";
import { openSounds } from "./sounds.js";
import { openShutdown, restart } from "./reboot.js";
import * as audio from "./audio/index.js";
import { DIALOG, HELP_TEXT, TITLES } from "./copy.js";
import { openMines } from "./games/mines.js";
import { openSnake } from "./games/snake.js";
import { openSol } from "./games/sol.js";
import { openCheckers } from "./games/checkers.js";
import { openChess } from "./games/chess.js";
import { GAME_ITEMS } from "./games/folder.js";
import { DROP_PREFIX, openContainer, syncContainers, type ContainerDeps } from "./containers.js";
import { makeDeskPos } from "./deskpos.js";
import { baseName, normPath } from "./fs.js";
import { ICONS } from "./icons.js";
import { programTokenOf } from "./copy.js";
import { MOVES_PATH } from "./notepad.js";
import { deskHeight, deskWidth, onDeskResize, stageScale, taskbarH } from "./wm.js";
import type { DeskIcon } from "./desktop.js";

const stage = q("#stage");
fitStage(stage);

/* ---- installed to a home screen, the machine works with the cable out ----
   Production only: a service worker under the dev server would cache Vite's
   transient module graph and serve yesterday's desktop. */
if (import.meta.env.PROD && "serviceWorker" in navigator)
  navigator.serviceWorker.register("/sw.js").catch(() => {
    /* an uninstallable desktop still runs */
  });
installGeneratedChips();

const apps = (): DesktopApps => desktopApps;
const shell = buildShell(stage, apps);
const wm = makeWM(stage, shell.tasksEl);

const engine = engineClient();
const analysis = analysisClient();
const director = makeDirector();
const disk = makeDisk(localStorage);
// the drive spins up in the background; nothing waits for it
loadMedia();
const movesPad = makeMovesPad(wm, disk);

/* The scheme. Nothing is built until the first gesture (the autoplay law), and
   fever is pulled rather than pushed so the director never learns audio exists. */
audio.installAudio({ fever: () => director.snapshot().fever });

/** The harness freezes the endgame at a beat; live play never sets this. */
let frozenBeat: number | undefined;
let frozenFever = false;

const boardDeps: BoardDeps = {
  wm,
  notepad: movesPad,
  decide: (botId, variantId, history) => engine.decide(botId, variantId, history),
  resetBrain: (botId, variantId) => void engine.reset(botId, variantId).catch(() => {}),
  onEval(history) {
    analysis
      .evaluate(board.variant.id, history)
      .then((r) => {
        // a stale reply from an abandoned game can't hurt a target, but don't bother
        director.feedEval(r.advantage, r.ply, board.variant.cells, r.source);
      })
      .catch(() => {});
  },
  /* The synchronous half of the feed. The eval is a worker round-trip and a
     threat is a bitboard test, so the board hands the cheap fact over the
     instant the disc lands and the expensive one whenever it arrives. */
  onPly(mover, position) {
    director.feedPly({
      mover,
      threats: position.legalMoves().filter((c) => position.isWinningMove(c)).length,
    });
  },
  onEnd(end) {
    lastEnd = end; // REVIEW.EXE reads this — the game most recently finished
    effects.setGameOver();
    endgame.run(end, frozenBeat);
  },
  onNewGame(variant, botId) {
    endgame.clear();
    director.event("newGame");
    effects.setOpponent(botId);
    effects.newGame();
  },
};

let lastEnd: EndResult | null = null;
let board: BoardApp = makeBoard(boardDeps);
const endgame = makeEndgame({
  wm,
  board: () => board,
  notepad: movesPad,
  onFeverEvent(kind) {
    if (kind === "win" || kind === "loss" || kind === "draw" || kind === "forfeit")
      director.event(kind);
    effects.gameEvent(kind);
  },
  /* You left the ending — the desktop comes down without waiting for a new
     game. Both halves hear it: the fever starts cooling, the litter starts
     going out. */
  onDismiss() {
    director.event("dismissed");
    effects.endingDismissed();
  },
  openReview: () => desktopApps.openReview(),
});
const effects = makeEffects({
  wm,
  shell,
  stage,
  boardWin: () => wm.get("board"),
  boardTitle: () => TITLES.boardVariant(board.variant.name),
  notepad: movesPad,
});

board.onMenu("help", () => desktopApps.openHelp());
board.onMenu("about", () =>
  wm.dialog({ title: DIALOG.about.title, body: DIALOG.about.body, x: 470, y: 300, ax: "center", w: 340 }),
);

const gameLaunchers = {
  mines: () => openMines(wm),
  sol: () => openSol(wm),
  snake: () => openSnake(wm),
  checkers: () => openCheckers(wm),
  chess: () => openChess(wm),
};

/* ---- the desk is C:\DESKTOP ----
   The disk owns what exists; deskpos remembers where an icon was dropped;
   everything else about the boot arrangement is authored right here. */
const deskPos = makeDeskPos(localStorage);
const deskIcons = new Map<string, DeskIcon>();

/** The programs, by the token their files carry (the MZ line). The rows are
    the faces their desk icons wear. */
const PROGRAMS: Record<string, { rows: readonly string[]; launch(): void }> = {
  board: { rows: ICONS.board, launch: () => desktopApps.openBoard() },
  flames: { rows: ICONS.flame, launch: () => desktopApps.openFlames() },
  terminal: { rows: ICONS.term, launch: () => desktopApps.openTerminal() },
  paint: { rows: ICONS.paint, launch: () => desktopApps.openPaint() },
  review: { rows: ICONS.moves, launch: () => desktopApps.openReview() },
  ...Object.fromEntries(
    GAME_ITEMS.map((g) => [g.id, { rows: g.rows, launch: () => gameLaunchers[g.id]() }]),
  ),
};

/** The boot arrangement: the machine's own things down the left, the papers
    in a second column. Lowercased desk keys; ":drive" is the one fixture
    that isn't a file. Anything not listed takes nextSeat. */
const DESK_ORDER: readonly string[] = [
  "desktop\\board.exe",
  "desktop\\flames.scr",
  "desktop\\moves.txt",
  "desktop\\recycled",
  "desktop\\games",
  "desktop\\command.com",
  "desktop\\readme.txt",
  "desktop\\rocket.spr",
  ":drive",
];
/** On a desk narrower than the authored 1280 (a phone), the left column
    disappears behind BOARD.EXE — authored seats become a dock above the
    taskbar instead, where a thumb lives. Dragged icons stay put. */
const defaultSeat = (key: string): [number, number] | undefined => {
  const i = DESK_ORDER.indexOf(key.toLowerCase());
  if (i < 0) return undefined;
  if (deskWidth() < 1280)
    return [
      8 + (i % 6) * Math.max(80, Math.floor((deskWidth() - 16) / 6)),
      deskHeight() - taskbarH() - 100 - Math.floor(i / 6) * 96,
    ];
  return i < 6 ? [20, 22 + i * 100] : [112, 22 + (i - 6) * 100];
};

/** A free desk spot for something that has never been placed — files the
    terminal just made, folders MKDIR made. Columns to the right of the
    left rank, filled top to bottom. */
function nextSeat(): [number, number] {
  const taken: [number, number][] = [];
  for (const ic of deskIcons.values()) taken.push([ic.el.offsetLeft, ic.el.offsetTop]);
  for (let col = 0; col < 8; col++)
    for (let row = 0; row < 7; row++) {
      const x = 112 + col * 92;
      const y = 22 + row * 100;
      if (y > deskHeight() - taskbarH() - 100) break;
      if (!taken.some(([tx, ty]) => Math.abs(tx - x) < 46 && Math.abs(ty - y) < 50))
        return [x, y];
    }
  return clampDesk(deskWidth() / 2, deskHeight() / 2);
}

const clampDesk = (x: number, y: number): [number, number] => [
  Math.max(0, Math.min(deskWidth() - 80, Math.round(x))),
  Math.max(0, Math.min(deskHeight() - taskbarH() - 90, Math.round(y))),
];
const stagePoint = (ev: { clientX: number; clientY: number }): [number, number] => {
  const k = stageScale();
  const r = stage.getBoundingClientRect();
  return [(ev.clientX - r.left) / k, (ev.clientY - r.top) / k];
};

/** What directory is under the pointer — an open container window, a folder
    icon, anything wearing a data-drop. "" is the root; null is nothing. */
const dropTargetAt = (ev: PointerEvent): string | null => {
  const d = document.elementFromPoint(ev.clientX, ev.clientY)?.closest<HTMLElement>("[data-drop]")
    ?.dataset.drop;
  return d !== undefined && d.startsWith(DROP_PREFIX) ? d.slice(DROP_PREFIX.length) : null;
};

/** Opening a file: a program file boots its program, moves.txt is the pad's
    door, a picture opens in Paint, words open in Notepad. */
const openFile = (name: string): void => {
  const path = normPath(name);
  if (path.toLowerCase() === MOVES_PATH.toLowerCase()) {
    movesPad.open();
    return;
  }
  const token = programTokenOf(disk.read(path) ?? "");
  if (token && PROGRAMS[token]) {
    PROGRAMS[token].launch();
    return;
  }
  if (isSpriteFile(path)) openPaint(wm, disk, path);
  else openEditor(wm, disk, path);
};

/** A .spr file's own art, for icons that wear their drawing. */
const sprFace = (name: string): readonly string[] | null => {
  if (!isSpriteFile(name)) return null;
  const cells = parseSprite(disk.read(name) ?? "");
  return cells ? cellsToRows(cells) : null;
};

/** What an item looks like, wherever it appears — the desk and every
    container window ask here. A picture's icon is the picture; a program's
    is its own face; a reserved folder keeps its dress. */
const itemFaceOf = (path: string, isDir: boolean): { rows: readonly string[]; label: string } => {
  const lower = path.toLowerCase();
  if (isDir) {
    if (lower === "desktop\\recycled") return { rows: ICONS.bin, label: TITLES.bin };
    if (lower === "desktop\\games") return { rows: ICONS.gamesFolder, label: TITLES.games };
    if (path === "") return { rows: ICONS.drive, label: TITLES.drive };
    return { rows: ICONS.folder, label: baseName(path) };
  }
  if (lower === MOVES_PATH.toLowerCase()) return { rows: ICONS.moves, label: baseName(path) };
  const token = programTokenOf(disk.read(path) ?? "");
  if (token && PROGRAMS[token]) return { rows: PROGRAMS[token].rows, label: baseName(path) };
  return { rows: sprFace(path) ?? ICONS.file, label: baseName(path) };
};

function makeDeskIcon(path: string, isDir: boolean): DeskIcon {
  const key = path.toLowerCase();
  const face = itemFaceOf(path, isDir);
  const [x, y] = deskPos.get(key) ?? defaultSeat(key) ?? nextSeat();
  return shell.addIcon({
    rows: face.rows,
    label: face.label,
    x,
    y,
    drop: isDir ? DROP_PREFIX + path : undefined,
    launch: () => (isDir ? openContainer(containerDeps, path) : openFile(path)),
    onMove: (nx, ny) => deskPos.set(key, [nx, ny]),
    onDrop(ev) {
      const target = dropTargetAt(ev);
      if (target === null || target.toLowerCase() === key) return false;
      if (!disk.rename(path, normPath(`${target}\\${baseName(path)}`))) return false;
      syncShell();
      return true;
    },
    onContext: (e) => itemMenu(e, path, isDir),
  });
}

/** The desk re-reads C:\DESKTOP: icons appear, leave, and that is all. */
function syncDesk(): void {
  const listing = disk.listDir("DESKTOP") ?? { dirs: [], files: [] };
  const items = [
    ...listing.dirs.map((d) => ({ path: d, isDir: true })),
    ...listing.files.map((f) => ({ path: f.name, isDir: false })),
  ];
  const present = new Set(items.map((it) => it.path.toLowerCase()));
  for (const [key, ic] of deskIcons)
    if (!key.startsWith(":") && !present.has(key)) {
      ic.remove();
      deskIcons.delete(key);
    }
  for (const it of items) {
    const key = it.path.toLowerCase();
    if (!deskIcons.has(key)) deskIcons.set(key, makeDeskIcon(it.path, it.isDir));
  }
}
const syncShell = (): void => {
  syncDesk();
  syncContainers();
};

const containerDeps: ContainerDeps = {
  wm,
  disk,
  face: itemFaceOf,
  openFile,
  drop(path, isDir, ev, from) {
    const target = dropTargetAt(ev);
    if (target !== null && target.toLowerCase() !== from.toLowerCase() &&
        target.toLowerCase() !== path.toLowerCase()) {
      // a refused move just goes back
      if (disk.rename(path, normPath(`${target}\\${baseName(path)}`))) syncShell();
      return;
    }
    // onto the open desk: the file moves to DESKTOP and sits where it landed
    const dest = normPath(`DESKTOP\\${baseName(path)}`);
    const [px, py] = stagePoint(ev);
    const seat = clampDesk(px - 24, py - 20);
    if (dest.toLowerCase() === path.toLowerCase() || disk.rename(path, dest)) {
      deskPos.set(dest, seat);
      deskIcons.get(dest.toLowerCase())?.moveTo(...seat);
      syncShell();
    }
    void isDir;
  },
};

/* ---- the desk's own furniture: the drive ---- */
deskIcons.set(":drive", shell.addIcon({
  rows: ICONS.drive,
  label: TITLES.drive,
  x: (deskPos.get(":drive") ?? defaultSeat(":drive")!)[0],
  y: (deskPos.get(":drive") ?? defaultSeat(":drive")!)[1],
  launch: () => openContainer(containerDeps, ""),
  onMove: (nx, ny) => deskPos.set(":drive", [nx, ny]),
}));
syncDesk();
/* Undragged icons follow the desk when it changes shape (the phone dock). */
onDeskResize(() => {
  for (const [key, ic] of deskIcons) {
    if (deskPos.get(key)) continue;
    const seat = defaultSeat(key);
    if (seat) ic.moveTo(...seat);
  }
});

/* The other door into the same disk: a file the terminal or Notepad just
   made grows an icon; one they deleted stops existing everywhere; a rename
   keeps its spot. */
disk.onChange((ev) => {
  if (ev.kind === "rename" && ev.to) deskPos.migrate(ev.name, ev.to);
  if (ev.kind === "remove") deskPos.drop(ev.name);
  // a repainted picture gets its desk icon repainted: drop it and let the
  // sync grow it back wearing the new art (its spot is deskpos's memory)
  if (ev.kind === "write" && isSpriteFile(ev.name)) {
    const key = normPath(ev.name).toLowerCase();
    deskIcons.get(key)?.remove();
    deskIcons.delete(key);
  }
  syncShell();
});

/* ---- pinned pictures: the desk art the rocket used to be ---- */
const pins = installPins({
  stage,
  disk,
  edit: (name) => openPaint(wm, disk, name),
  menu: (e, entries) => contextMenu(e, entries),
});

/* ---- context menus: the desk makes folders, folders have their say ---- */
let ctxMenu: HTMLElement | null = null;
const closeCtx = (): void => {
  ctxMenu?.remove();
  ctxMenu = null;
};
addEventListener("pointerdown", (e) => {
  if (ctxMenu && !ctxMenu.contains(e.target as Node)) closeCtx();
});
function contextMenu(e: MouseEvent, entries: [string, () => void][]): void {
  closeCtx();
  const m = el(`<div class="popup ctx"></div>`);
  for (const [label, act] of entries) {
    const row = el(`<div></div>`);
    row.textContent = label;
    row.addEventListener("click", () => {
      closeCtx();
      act();
    });
    m.appendChild(row);
  }
  const [px, py] = stagePoint(e);
  m.style.left = `${Math.min(px, deskWidth() - 130)}px`;
  m.style.top = `${Math.min(py, deskHeight() - 90)}px`;
  stage.appendChild(m);
  ctxMenu = m;
}
/** Every desk item's menu: open it, name it, lose it — and a picture's own
    entries, because a drawing can also go up on the wall. */
function itemMenu(e: MouseEvent, path: string, isDir: boolean): void {
  const key = path.toLowerCase();
  const entries: [string, () => void][] = [
    ["Open", () => (isDir ? openContainer(containerDeps, path) : openFile(path))],
  ];
  if (!isDir && isSpriteFile(path))
    entries.push(
      pins.isPinned(path)
        ? ["Take down", () => pins.unpin(path)]
        : ["Pin to desk", () => {
            const [px, py] = stagePoint(e);
            pins.pin(path, ...clampDesk(px - 30, py - 30));
          }],
    );
  entries.push(["Rename", () => renameItem(path)]);
  // the rest can hold anything except itself
  if (key !== "desktop\\recycled")
    entries.push(["Delete", () => {
      if (disk.rename(path, normPath(`DESKTOP\\RECYCLED\\${baseName(path)}`))) syncShell();
    }]);
  contextMenu(e, entries);
}
/** Rename in place, desk-style: the label becomes a text box. The disk has
    the final word — a taken name just puts the old label back. */
function renameItem(path: string): void {
  const ic = deskIcons.get(path.toLowerCase());
  const lbl = ic?.el.querySelector<HTMLElement>(".lbl");
  if (!ic || !lbl) return;
  const input = el<HTMLInputElement>(`<input class="ren" type="text">`);
  input.value = baseName(path);
  lbl.textContent = "";
  lbl.appendChild(input);
  const commit = (keep: boolean): void => {
    const clean = input.value.trim().slice(0, 32);
    lbl.textContent = baseName(path);
    if (keep && clean && clean.toLowerCase() !== baseName(path).toLowerCase())
      if (disk.rename(path, normPath(`DESKTOP\\${clean}`))) syncShell();
  };
  input.addEventListener("keydown", (e) => {
    e.stopPropagation();
    if (e.key === "Enter") input.blur();
    if (e.key === "Escape") {
      input.value = baseName(path);
      input.blur();
    }
  });
  input.addEventListener("blur", () => commit(true));
  input.addEventListener("pointerdown", (e) => e.stopPropagation());
  input.focus();
  input.select();
}
stage.addEventListener("contextmenu", (e) => {
  if (e.target !== stage) return;
  e.preventDefault();
  contextMenu(e, [
    ["New Folder", () => {
      // terminal-typable names, the untitled.txt precedent: folder, folder2, …
      let name = "folder";
      for (let n = 2; disk.isDir(`DESKTOP\\${name}`) || disk.exists(`DESKTOP\\${name}`); n++)
        name = `folder${n}`;
      const [px, py] = stagePoint(e);
      deskPos.set(`desktop\\${name}`, clampDesk(px - 24, py - 20));
      disk.mkdir(`DESKTOP\\${name}`); // onChange grows the icon at that seat
    }],
    ["New Text Document", () => {
      let name = "untitled.txt";
      for (let n = 2; disk.exists(`DESKTOP\\${name}`); n++) name = `untitled${n}.txt`;
      const [px, py] = stagePoint(e);
      deskPos.set(`desktop\\${name}`, clampDesk(px - 24, py - 20));
      disk.write(`DESKTOP\\${name}`, ""); // onChange grows the icon at that seat
      openEditor(wm, disk, `DESKTOP\\${name}`);
    }],
  ]);
});

const desktopApps: DesktopApps = {
  openBoard() {
    if (board.win.isOpen()) {
      board.win.focus();
      return;
    }
    board = makeBoard(boardDeps);
    board.onMenu("help", () => desktopApps.openHelp());
    board.onMenu("about", () =>
      wm.dialog({ title: DIALOG.about.title, body: DIALOG.about.body, x: 470, y: 300, ax: "center", w: 340 }),
    );
    board.newGame();
  },
  openFlames: () => effects.openFlames(),
  openMoves: () => movesPad.open(),
  openBin: () => openContainer(containerDeps, "DESKTOP\\RECYCLED"),
  openDrive: () => openContainer(containerDeps, ""),
  openHelp: () =>
    textWindow(wm, "help", TITLES.help, disk.read("DOCS\\help.txt") ?? HELP_TEXT, 180, 120, 230),
  openPieces: () =>
    openPieces(wm, () => localStorage.getItem("exe.chips") ?? "flat", (s) => board.setChips(s)),
  openGames: () => openContainer(containerDeps, "DESKTOP\\games"),
  openUntitled: () => openEditor(wm, disk, "DESKTOP\\untitled.txt"),
  openReadme: () => openEditor(wm, disk, "DESKTOP\\readme.txt"),
  openPaint: () => openPaint(wm, disk, null),
  openTerminal: () =>
    openTerminal({
      wm,
      disk,
      edit: (name) => openEditor(wm, disk, name),
      paint: (name) => openPaint(wm, disk, name),
      launch(text) {
        const token = programTokenOf(text);
        if (!token || !PROGRAMS[token]) return false;
        PROGRAMS[token].launch();
        return true;
      },
    }),
  openGame: (id) => gameLaunchers[id](),
  openSounds: () => openSounds(wm),
  openReview: () =>
    openReview(
      {
        wm,
        last: () => lastEnd,
        review: (variantId, history) => analysis.review(variantId, history, "red"),
      },
      // a harness pose only: the review opens on the finished game otherwise
      param("ply") === null ? undefined : Number(param("ply")),
    ),
  shutdown: () => openShutdown(wm, { stage, help: () => desktopApps.openHelp() }),
};

/* ---- the other door ----
   "Reset the whole screen" had a keystroke in 1995 and this is it. It opens
   the same box the Start menu does rather than rebooting outright, which is
   both what the real one did and the reason it is safe to leave on a hotkey.
   Backspace as well as Delete: on this keyboard the key that says delete
   reports as Backspace, and the reflex is the same reflex. */
addEventListener("keydown", (e) => {
  if (e.ctrlKey && e.altKey && (e.key === "Delete" || e.key === "Backspace")) {
    e.preventDefault();
    desktopApps.shutdown();
  }
});

/* ---- boot order ----
   The approved frame used to boot with BOARD.EXE, moves.txt and flames.scr
   already open; the desk's owner asked for a machine that boots to a desk.
   Any query param is a pose or a harness, and those still get the furniture
   they were authored against. */
const posed = location.search !== "";
if (posed) {
  movesPad.open();
  effects.openFlames();
  board.win.focus();
} else {
  board.win.close(); // openBoard() rebuilds it the day it's double-clicked
}

/* ---- the director's clock ---- */
setInterval(() => {
  if (frozenFever) return;
  const moved = director.step(0.5);
  if (moved) effects.apply(moved);
  // Beats are drained whether or not fever moved: a blunder in a level game
  // still deserves an answer, and that is exactly the game that used to get
  // nothing at all.
  for (const b of director.takeBeats()) effects.beat(b);
}, 500);
effects.apply(director.snapshot());

/* ---- real idle: the screensaver actually takes over ---- */
shell.onIdle(90, () => effects.takeover(true));
shell.onWake(() => {
  if (director.snapshot().tier < 4) effects.takeover(false);
});

/* ---- deep links ---- */
const chips = param("chips");
if (chips) board.setChips(chips, false);
const variantParam = param("variant");
if (variantParam) board.setVariant(variantParam);
const botParam = param("bot");
if (botParam) board.setBot(botParam);

if (posed && !variantParam && !botParam) board.newGame();

const feverParam = param("fever");
if (feverParam !== null) {
  // walk up through the tiers so the desktop got here rather than spawning
  // here — crossings fire, windows open, the trail exists
  const target = Math.max(0, Math.min(1, parseFloat(feverParam)));
  for (const f of [0, 0.25, 0.5, 0.75, 1]) {
    if (f > target) break;
    director.pin(f);
    effects.apply(director.snapshot());
  }
  director.pin(target);
  effects.apply(director.snapshot());
  frozenFever = true;
}

const state = param("state");
if (state === "midgame") {
  // the mock's demo opening: red just moved, the bot deliberates, you hesitated
  board.script([3, 2, 3, 3, 2, 4, 1]);
  movesPad.lines(["and then you", "hesitated"]);
} else if (state === "win") {
  frozenBeat = param("beat") !== null ? Number(param("beat")) : undefined;
  // a verified legal game (02-win's): red completes the anti-diagonal
  board.script([3, 4, 4, 3, 5, 2, 3, 2, 2, 4, 2]);
  if (frozenBeat === undefined) frozenBeat = 11;
} else if (state === "loss") {
  frozenBeat = param("beat") !== null ? Number(param("beat")) : 10;
  // yellow stacks the far column while red builds a useless block — a
  // vertical line, which also exercises the ants capsule's rotation
  board.script([0, 6, 1, 6, 0, 6, 1, 6]);
} else if (state === "pieces") {
  desktopApps.openPieces();
} else if (state === "saver") {
  effects.takeover(true);
} else if (state === "mines") {
  openMines(wm);
} else if (state === "snake") {
  openSnake(wm);
} else if (state === "notepad") {
  desktopApps.openUntitled();
} else if (state === "terminal") {
  desktopApps.openTerminal();
} else if (state === "paint") {
  // the rocket, on the easel — the seed picture every disk arrives with
  openPaint(wm, disk, "DESKTOP\\rocket.spr");
} else if (state === "sol") {
  openSol(wm, param("rig") ?? undefined);
} else if (state === "checkers") {
  openCheckers(wm);
} else if (state === "chess") {
  openChess(wm, param("fen") ?? undefined);
} else if (state === "games") {
  desktopApps.openGames();
} else if (state === "sounds") {
  desktopApps.openSounds();
} else if (state === "review") {
  // the win game, already over — the parade is cleared so the window poses alone
  board.script([3, 4, 4, 3, 5, 2, 3, 2, 2, 4, 2]);
  endgame.clear();
  desktopApps.openReview();
} else if (state === "shutdown") {
  desktopApps.shutdown();
} else if (state === "reboot") {
  // the beat, held: the real one navigates out from under the shutter
  restart(stage, { hold: true });
}

/* ---- beat poses: the eyes for the acts ----
   Every act puts itself back after a second or two, and `npm run shots` always
   looks at 1800ms — so a pose that fired on load would be caught after the
   icons had settled and the clock had found its minutes again, which is a
   screenshot of the act not happening. Firing at 1500ms puts the shutter 300ms
   into every act instead, inside the shortest of them. `npm run timeline` is
   still the tool for watching one restore. */
const actParam = param("act");
if (actParam) {
  const pool = param("pool") ?? "move:fine";
  board.freeze();
  setTimeout(() => effects.beat(beatFromPool(pool), actParam as BeatAct), 1500);
}

/* ---- FEVER.CTL — dev chrome; does not ship in the fiction ---- */
if (param("ctl")) {
  const body = el(`<div>
      <div class="trackbar" id="track"><div class="rail"></div><div class="thumb" id="thumb"></div></div>
      <div class="ticks"><span>0</span><span>·</span><span>·</span><span>·</span><span>1</span></div>
      <div class="presets" style="display:flex;gap:4px;margin:6px 12px 10px">
        ${[0, 0.35, 0.6, 0.85, 1].map((f) => `<div class="btn" data-f="${f}" style="min-width:0;flex:1;font-family:'Courier New',monospace">${f === 0 || f === 1 ? f : String(f).slice(1)}</div>`).join("")}
      </div>
      <div style="padding:0 12px 10px;color:#404040">fever = <span id="fOut">0.00</span>. This control does not ship.</div>
    </div>`);
  wm.open({
    id: "feverCtl",
    title: TITLES.feverCtl,
    x: 20,
    y: 620,
    w: 250,
    body,
    buttons: ["close"],
    taskbar: false,
    // dev chrome, above everything including the screensaver it drives — and
    // fixed, because focusing it used to hand it back an ordinary z
    z: 400,
  });
  const setFever = (f: number): void => {
    const v = Math.max(0, Math.min(1, f));
    frozenFever = true;
    director.pin(v);
    effects.apply(director.snapshot());
    q("#fOut", body).textContent = v.toFixed(2);
    q("#thumb", body).style.left = `${v * (226 - 11)}px`;
  };
  const track = q("#track", body);
  const fromEvent = (e: PointerEvent): void => {
    const r = track.getBoundingClientRect();
    setFever((e.clientX - r.left) / r.width);
  };
  onPointerDrag(track, (e) => {
    e.stopPropagation();
    fromEvent(e);
    return fromEvent;
  });
  body.querySelectorAll<HTMLElement>("[data-f]").forEach((b) =>
    b.addEventListener("click", () => setFever(parseFloat(b.dataset.f!))),
  );
}

/* ---- the harness's ears ----
   Sound can't be screenshotted, so `npm run audio` drives the real page
   through this: it renders every recipe, checks the autoplay law from the
   outside, and works the mute the way a player does. */
(window as unknown as { __exe: { audio: typeof audio } }).__exe = { audio };

// the console gets one honest line
console.log(`BOARD.EXE — tier ${tierOf(director.snapshot().fever)}. This computer is functioning normally.`);
