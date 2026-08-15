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
 *   ?state=mines|sol|snake|checkers|notepad|games   the other software
 *   ?state=sol&rig=won    a double-click from the card bounce
 *   ?fever=0.85           walk the fever up to a value and pin it
 *   ?act=dialog&pool=move:blunder   fire one beat act, so it can be looked at
 *   ?chips=pixel          preselect a chip style
 *   ?bot=quill ?variant=connect5
 *   ?ctl=1                FEVER.CTL (dev only; does not ship in the fiction)
 */

import "./chrome.css";
import { el, param, q } from "./dom.js";
import { fitStage, makeWM } from "./wm.js";
import { buildShell, type DesktopApps } from "./desktop.js";
import { analysisClient, engineClient } from "./engine/client.js";
import { makeBoard, type BoardApp, type BoardDeps } from "./board.js";
import { makeMovesPad, openUntitled, textWindow } from "./notepad.js";
import { installGeneratedChips, openPieces } from "./chips.js";
import { makeDirector, tierOf } from "./director.js";
import { makeEffects } from "./effects.js";
import { beatFromPool, type BeatAct } from "./beats.js";
import { makeEndgame } from "./endgame.js";
import { BIN_TEXT, DIALOG, HELP_TEXT, TITLES } from "./copy.js";
import { openMines } from "./games/mines.js";
import { openSnake } from "./games/snake.js";
import { openSol } from "./games/sol.js";
import { openCheckers } from "./games/checkers.js";
import { openChess } from "./games/chess.js";
import { GAME_ITEMS, openGamesFolder, type GameId } from "./games/folder.js";
import { deskHeight, deskWidth } from "./wm.js";
import type { DeskIcon } from "./desktop.js";

const stage = q("#stage");
fitStage(stage);
installGeneratedChips();

const apps = (): DesktopApps => desktopApps;
const shell = buildShell(stage, apps);
const wm = makeWM(stage, shell.tasksEl);

const engine = engineClient();
const analysis = analysisClient();
const director = makeDirector();
const movesPad = makeMovesPad(wm);

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
});
const effects = makeEffects({
  wm,
  shell,
  stage,
  boardWin: () => wm.get("board"),
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

/* ---- games dragged out of the folder live on the desk, and remember it ---- */
const DESK_GAMES = "exe.deskgames";
const deskGameIcons = new Map<GameId, DeskIcon>();
const deskGamePos = new Map<GameId, [number, number]>();
const saveDeskGames = (): void => {
  localStorage.setItem(
    DESK_GAMES,
    JSON.stringify([...deskGamePos].map(([id, [x, y]]) => ({ id, x, y }))),
  );
};
function placeGameOnDesk(id: GameId, x: number, y: number, persist = true): void {
  const cx = Math.max(0, Math.min(deskWidth() - 80, Math.round(x)));
  const cy = Math.max(0, Math.min(deskHeight() - 36 - 90, Math.round(y)));
  deskGamePos.set(id, [cx, cy]);
  const already = deskGameIcons.get(id);
  if (already) already.moveTo(cx, cy);
  else {
    const item = GAME_ITEMS.find((g) => g.id === id);
    if (!item) return;
    deskGameIcons.set(
      id,
      shell.addIcon({
        rows: item.rows,
        label: item.label,
        x: cx,
        y: cy,
        launch: () => gameLaunchers[id](),
        onMove(nx, ny) {
          deskGamePos.set(id, [nx, ny]);
          saveDeskGames();
        },
      }),
    );
  }
  if (persist) saveDeskGames();
}
try {
  for (const g of JSON.parse(localStorage.getItem(DESK_GAMES) ?? "[]") as { id: GameId; x: number; y: number }[])
    placeGameOnDesk(g.id, g.x, g.y, false);
} catch {
  /* a corrupt list is an empty desk, not a crash */
}

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
  openBin: () => textWindow(wm, "bin", TITLES.bin, BIN_TEXT, 480, 180, 230, "center"),
  openHelp: () => textWindow(wm, "help", TITLES.help, HELP_TEXT, 180, 120, 230),
  openPieces: () =>
    openPieces(wm, () => localStorage.getItem("exe.chips") ?? "flat", (s) => board.setChips(s)),
  openGames: () => openGamesFolder(wm, gameLaunchers, placeGameOnDesk),
  openUntitled: () => openUntitled(wm),
  openGame: (id) => gameLaunchers[id](),
  shutdown() {
    wm.dialog({
      title: DIALOG.shutdown.title,
      body: DIALOG.shutdown.body,
      icon: "!",
      buttons: ["OK", "OK"],
      x: 450,
      y: 310,
      ax: "center",
      w: 360,
    });
  },
};

/* ---- boot order: the desktop as the approved frame has it ---- */
movesPad.open();
effects.openFlames();
board.win.focus();

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

if (!variantParam && !botParam) board.newGame();

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
  openUntitled(wm);
} else if (state === "sol") {
  openSol(wm, param("rig") ?? undefined);
} else if (state === "checkers") {
  openCheckers(wm);
} else if (state === "chess") {
  openChess(wm, param("fen") ?? undefined);
} else if (state === "games") {
  desktopApps.openGames();
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
  const ctl = wm.open({
    id: "feverCtl",
    title: TITLES.feverCtl,
    x: 20,
    y: 620,
    w: 250,
    body,
    buttons: ["close"],
    taskbar: false,
  });
  ctl.el.style.zIndex = "400";
  const setFever = (f: number): void => {
    const v = Math.max(0, Math.min(1, f));
    frozenFever = true;
    director.pin(v);
    effects.apply(director.snapshot());
    q("#fOut", body).textContent = v.toFixed(2);
    q("#thumb", body).style.left = `${v * (226 - 11)}px`;
  };
  const track = q("#track", body);
  let dragging = false;
  const fromEvent = (e: MouseEvent): void => {
    const r = track.getBoundingClientRect();
    setFever((e.clientX - r.left) / r.width);
  };
  track.addEventListener("mousedown", (e) => {
    dragging = true;
    fromEvent(e);
    e.stopPropagation();
  });
  addEventListener("mousemove", (e) => dragging && fromEvent(e));
  addEventListener("mouseup", () => (dragging = false));
  body.querySelectorAll<HTMLElement>("[data-f]").forEach((b) =>
    b.addEventListener("click", () => setFever(parseFloat(b.dataset.f!))),
  );
}

// the console gets one honest line
console.log(`BOARD.EXE — tier ${tierOf(director.snapshot().fever)}. This computer is functioning normally.`);
