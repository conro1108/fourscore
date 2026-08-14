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
 *   ?fever=0.85           walk the fever up to a value and pin it
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
import { makeMovesPad, textWindow } from "./notepad.js";
import { installGeneratedChips, openPieces } from "./chips.js";
import { makeDirector, tierOf } from "./director.js";
import { makeEffects } from "./effects.js";
import { makeEndgame } from "./endgame.js";
import { BIN_TEXT, DIALOG, HELP_TEXT, TITLES } from "./copy.js";
import { openMines } from "./games/mines.js";
import { openSnake } from "./games/snake.js";

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
        director.feedEval(r.advantage, r.ply, board.variant.cells);
      })
      .catch(() => {});
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
const effects = makeEffects({ wm, shell, stage, boardWin: () => wm.get("board") });

board.onMenu("help", () => desktopApps.openHelp());
board.onMenu("about", () =>
  wm.dialog({ title: DIALOG.about.title, body: DIALOG.about.body, x: 470, y: 300, ax: "center", w: 340 }),
);

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
