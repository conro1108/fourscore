/**
 * Boot the desktop and wire everything together. Deep links (harness poses):
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

/* Service worker, production only: under the dev server it would cache Vite's
   transient module graph. */
if (import.meta.env.PROD && "serviceWorker" in navigator)
  navigator.serviceWorker.register("/sw.js").catch(() => {
    /* fine */
  });
installGeneratedChips();

const apps = (): DesktopApps => desktopApps;
const shell = buildShell(stage, apps);
const wm = makeWM(stage, shell.tasksEl);

const engine = engineClient();
const analysis = analysisClient();
const director = makeDirector();
const disk = makeDisk(localStorage);
loadMedia();
const movesPad = makeMovesPad(wm, disk);

/* Fever is pulled, not pushed, so the director never learns audio exists. */
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
        director.feedEval(r.advantage, r.ply, board.variant.cells, r.source);
      })
      .catch(() => {});
  },
  /* Synchronous half of the feed: threats are cheap, the eval is a worker round-trip. */
  onPly(mover, position) {
    director.feedPly({
      mover,
      threats: position.legalMoves().filter((c) => position.isWinningMove(c)).length,
    });
  },
  onEnd(end) {
    lastEnd = end; // REVIEW.EXE reads this
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

/* ---- the desk is C:\DESKTOP: disk owns what exists, deskpos where it was dropped ---- */
const deskPos = makeDeskPos(localStorage);
const deskIcons = new Map<string, DeskIcon>();

/** Programs by the token their files carry (the MZ line). */
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

/** Boot arrangement. Lowercased desk keys; ":drive" is the one non-file. Unlisted → nextSeat. */
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
/** Under 1280 wide the left column hides behind BOARD.EXE, so seats become a
    dock above the taskbar. Dragged icons stay put. */
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

/** A free seat for a never-placed item: columns right of the left rank, top to bottom. */
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

/** Directory under the pointer (anything wearing data-drop). "" is root; null is nothing. */
const dropTargetAt = (ev: PointerEvent): string | null => {
  const d = document.elementFromPoint(ev.clientX, ev.clientY)?.closest<HTMLElement>("[data-drop]")
    ?.dataset.drop;
  return d !== undefined && d.startsWith(DROP_PREFIX) ? d.slice(DROP_PREFIX.length) : null;
};

/** Program → its launcher, moves.txt → the pad, .spr → Paint, else Notepad. */
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

/** A .spr file's art, as icon rows. */
const sprFace = (name: string): readonly string[] | null => {
  if (!isSpriteFile(name)) return null;
  const cells = parseSprite(disk.read(name) ?? "");
  return cells ? cellsToRows(cells) : null;
};

/** Icon face + label for an item, shared by the desk and container windows. */
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

/** Re-read C:\DESKTOP: icons appear and leave. */
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
      if (disk.rename(path, normPath(`${target}\\${baseName(path)}`))) syncShell();
      return;
    }
    // onto the desk: move to DESKTOP, seat where it landed
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

/* ---- the drive fixture ---- */
deskIcons.set(":drive", shell.addIcon({
  rows: ICONS.drive,
  label: TITLES.drive,
  x: (deskPos.get(":drive") ?? defaultSeat(":drive")!)[0],
  y: (deskPos.get(":drive") ?? defaultSeat(":drive")!)[1],
  launch: () => openContainer(containerDeps, ""),
  onMove: (nx, ny) => deskPos.set(":drive", [nx, ny]),
}));
syncDesk();
/* Undragged icons follow the desk when it changes shape. */
onDeskResize(() => {
  for (const [key, ic] of deskIcons) {
    if (deskPos.get(key)) continue;
    const seat = defaultSeat(key);
    if (seat) ic.moveTo(...seat);
  }
});

/* Disk changes from the terminal/Notepad reach the desk here; a rename keeps its spot. */
disk.onChange((ev) => {
  if (ev.kind === "rename" && ev.to) deskPos.migrate(ev.name, ev.to);
  if (ev.kind === "remove") deskPos.drop(ev.name);
  // repainted .spr: drop the icon and let sync regrow it with the new art
  if (ev.kind === "write" && isSpriteFile(ev.name)) {
    const key = normPath(ev.name).toLowerCase();
    deskIcons.get(key)?.remove();
    deskIcons.delete(key);
  }
  syncShell();
});

/* ---- pinned pictures ---- */
const pins = installPins({
  stage,
  disk,
  edit: (name) => openPaint(wm, disk, name),
  menu: (e, entries) => contextMenu(e, entries),
});

/* ---- context menus ---- */
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
/** Desk item menu: open, pin (pictures), rename, delete. */
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
  // the bin can't delete itself
  if (key !== "desktop\\recycled")
    entries.push(["Delete", () => {
      if (disk.rename(path, normPath(`DESKTOP\\RECYCLED\\${baseName(path)}`))) syncShell();
    }]);
  contextMenu(e, entries);
}
/** Rename in place; a name the disk refuses just restores the old label. */
function renameItem(path: string): void {
  const ic = deskIcons.get(path.toLowerCase());
  const lbl = ic?.el.querySelector<HTMLElement>(".lbl");
  if (!ic || !lbl) return;
  const input = el<HTMLInputElement>(`<input class="ren" type="text" spellcheck="false" autocomplete="off" autocapitalize="off" autocorrect="off">`);
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
      // terminal-typable names: folder, folder2, …
      let name = "folder";
      for (let n = 2; disk.isDir(`DESKTOP\\${name}`) || disk.exists(`DESKTOP\\${name}`); n++)
        name = `folder${n}`;
      const [px, py] = stagePoint(e);
      deskPos.set(`desktop\\${name}`, clampDesk(px - 24, py - 20));
      disk.mkdir(`DESKTOP\\${name}`); // onChange grows the icon
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
      // harness only; a non-numeric `?ply` must be nothing, not NaN
      Number.isFinite(Number(param("ply"))) ? Number(param("ply")) : undefined,
    ),
  shutdown: () => openShutdown(wm, { stage, help: () => desktopApps.openHelp() }),
};

/* Ctrl+Alt+Del opens the Shut Down box, never reboots outright. Backspace too:
   a Mac's delete key reports as Backspace. */
addEventListener("keydown", (e) => {
  if (e.ctrlKey && e.altKey && (e.key === "Delete" || e.key === "Backspace")) {
    e.preventDefault();
    desktopApps.shutdown();
  }
});

/* ---- boot: a bare desk, unless posed by a query param (harnesses expect the furniture) ---- */
const posed = location.search !== "";
if (posed) {
  movesPad.open();
  effects.openFlames();
  board.win.focus();
} else {
  board.win.close(); // openBoard() rebuilds it
}

/* ---- the director's clock ---- */
setInterval(() => {
  if (frozenFever) return;
  const moved = director.step(0.5);
  if (moved) effects.apply(moved);
  // drained whether or not fever moved: a blunder in a level game still gets an answer
  for (const b of director.takeBeats()) effects.beat(b);
}, 500);
effects.apply(director.snapshot());

/* ---- idle → screensaver ---- */
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
  // walk up through the tiers so crossings fire on the way
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
  board.script([3, 2, 3, 3, 2, 4, 1]);
  movesPad.lines(["and then you", "hesitated"]);
} else if (state === "win") {
  frozenBeat = param("beat") !== null ? Number(param("beat")) : undefined;
  // verified legal: red completes the anti-diagonal
  board.script([3, 4, 4, 3, 5, 2, 3, 2, 2, 4, 2]);
  if (frozenBeat === undefined) frozenBeat = 11;
} else if (state === "loss") {
  frozenBeat = param("beat") !== null ? Number(param("beat")) : 10;
  // yellow wins a vertical line (exercises the ants capsule's rotation)
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
  // the win game, parade cleared so the window poses alone
  board.script([3, 4, 4, 3, 5, 2, 3, 2, 2, 4, 2]);
  endgame.clear();
  desktopApps.openReview();
} else if (state === "shutdown") {
  desktopApps.shutdown();
} else if (state === "reboot") {
  restart(stage, { hold: true });
}

/* ---- beat poses. Fired at 1500ms so `npm run shots` (1800ms) lands 300ms
   into the act — inside the shortest one — rather than after it restored. ---- */
const actParam = param("act");
if (actParam) {
  const pool = param("pool") ?? "move:fine";
  board.freeze();
  setTimeout(() => effects.beat(beatFromPool(pool), actParam as BeatAct), 1500);
}

/* ---- FEVER.CTL — dev chrome only ---- */
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
    // fixed z above the saver it drives; focusing must not hand it an ordinary z
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

/* `npm run audio` drives the real page through this. */
(window as unknown as { __exe: { audio: typeof audio } }).__exe = { audio };

console.log(`BOARD.EXE — tier ${tierOf(director.snapshot().fever)}. This computer is functioning normally.`);
