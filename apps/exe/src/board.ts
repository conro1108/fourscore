/**
 * BOARD.EXE — one real window among windows, and the match loop inside it.
 *
 * The board feel (DIRECTION.md, settled): the hover disc IS your piece and
 * falls from where it hovers; no aiming arrow. The opponent deliberates
 * visibly — a mirrored hover disc wanders a few columns before committing,
 * then falls with the same physics. The engine is the real ladder, spoken to
 * over the worker protocol; the deliberation walk is theatre, the move is not.
 */

import { ROSTER, VARIANTS, byId, variantById, type Position, type Variant } from "@fourscore/engine";
import { Match } from "@fourscore/engine";
import { el, gravityFall, onPointerDrag, q } from "./dom.js";
import { ICONS } from "./icons.js";
import { STATUS, TITLES, voiceOf } from "./copy.js";
import { deskHeight, deskWidth, fitCell, stageScale, taskbarH, type WM, type Win } from "./wm.js";
import { play } from "./audio/index.js";
import type { MovesPad } from "./notepad.js";

/** The authored cell. A natural-sized BOARD.EXE is exactly this, always. */
export const CELL = 64;
/** A chip is three quarters of its cell, at every size. */
const DISC_RATIO = 3 / 4;
/* The ladder the cell steps through when the window is dragged. 8 keeps the
   disc whole (3/4 of a multiple of 8 is an integer) and keeps a slow drag on
   a handful of sizes instead of shivering a pixel at a time. */
const CELL_STEP = 8;
const CELL_MIN = 32;
const CELL_MAX = 128;

export interface EndResult {
  kind: "win" | "loss" | "draw" | "forfeit";
  /** Winning line in display coords, ordered outward from the landing disc. */
  cells: readonly { col: number; row: number }[];
  run: number;
  botId: string;
  variant: Variant;
  /** The finished game's moves — what REVIEW.EXE goes back over. */
  history: readonly number[];
}

export interface BoardDeps {
  wm: WM;
  notepad: MovesPad;
  decide(botId: string, variantId: string, history: readonly number[]): Promise<{ col: number }>;
  resetBrain(botId: string, variantId: string): void;
  onEval?(history: readonly number[]): void;
  onEnd(end: EndResult): void;
  onNewGame?(variant: Variant, botId: string): void;
  /** Fires the instant a ply commits, with the position it produced — the
      synchronous half of the director's feed, ahead of the worker's eval. */
  onPly?(mover: "you" | "bot", position: Position): void;
}

export interface BoardApp {
  win: Win;
  readonly variant: Variant;
  readonly botId: string;
  newGame(): void;
  setVariant(id: string): void;
  setBot(id: string): void;
  setChips(style: string, persist?: boolean): void;
  /** Play a move list instantly, no animation — the harness's opening. */
  script(moves: readonly number[]): void;
  /** Freeze play (the harness holds a deliberation pose). */
  freeze(): void;
  cellAt(col: number, row: number): HTMLElement;
  cellCenter(col: number, row: number): readonly [number, number];
  /** The live cell size in board px — `CELL` unless the window was dragged.
      Anything drawing on the grid at an authored size scales by
      `cellSize() / CELL`. */
  cellSize(): number;
  gridwrap(): HTMLElement;
  fx(): HTMLElement;
  setStatus(you?: string, bot?: string): void;
  botName(): string;
  /** Wire menu items whose targets live outside this window (Help, About). */
  onMenu(what: "help" | "about", cb: () => void): void;
}

type Phase = "your-turn" | "busy" | "bot-turn" | "over" | "frozen";

export function makeBoard(deps: BoardDeps): BoardApp {
  let variant = variantById("connect4");
  let botId = "moss";
  let chips = localStorage.getItem("exe.chips") ?? "flat";
  let match = new Match(variant);
  let phase: Phase = "over";
  let hoverCol = 3;
  /** Where the opponent's disc physically is. It never teleports. */
  let botCol = 3;
  let hesitated = false;
  let turnStartedAt = Date.now();
  let sameColStreak = 0;
  let lastHumanCol = -1;
  let notedSameCol = false;
  let wanderTimer: ReturnType<typeof setTimeout> | null = null;
  /** Ignore engine replies from an abandoned game. */
  let gameSeq = 0;
  /** Kills the previous build's document-level listeners on rebuild. */
  let buildAbort: AbortController | null = null;
  /** A touch that already committed mutes its own synthetic click. */
  let clickSuppressedUntil = 0;

  /* ---- the geometry, all of it derived from one live cell ----
     The grid sits at x=16 inside the window (frame margin 10 + padding 6) and
     the same 16 has to come back on the right, or the sunken well shows a dead
     column of gray. A tall variant that scrolls needs the scrollbar's 16 too.

     CHROME_H is measured, not guessed: a natural Connect 4 window is 529 tall
     and its frame is 396, its picker row 56, so 77 is the titlebar, the menu,
     the statusbar and every margin between them — none of which scale. Every
     other number here is a function of `cell`, because the window is
     resizable and the cell answers the drag. */
  const CHROME_W = 32;
  const CHROME_H = 77;
  const FRAME_PAD = 12; // the sunken well's 6px on each side
  const PICKER_PAD = 8; // 4px above and below the hover disc
  /** The live cell. `CELL` while the window is at its natural size. */
  let cell = CELL;
  const disc = (): number => cell * DISC_RATIO;
  const frameH = (c = cell): number => variant.height * c + FRAME_PAD;
  const pickerH = (c = cell): number => c * DISC_RATIO + PICKER_PAD;
  /** Frame height a window this tall can hand the board. */
  const frameSpace = (totalH: number): number => totalH - CHROME_H - pickerH();
  /** The tallest frame the authored 800-tall desk holds, un-maximised. */
  const maxFrame = (): number => frameSpace(800 - 36 - 8);
  const scrolls = (): boolean => frameH(CELL) > maxFrame();
  const windowWidth = (): number => variant.width * CELL + CHROME_W + (scrolls() ? 16 : 0);

  /* The biggest cell a window this size can hold — the tighter axis wins, and
     both round-trip: a natural window measures back to exactly CELL, so
     nothing moves until you actually drag. Height budget: the frame needs
     rows*c + FRAME_PAD and the picker row 0.75c + PICKER_PAD on top of the
     fixed chrome, so the cells across the height axis come to rows + 0.75. */
  const cellFor = (w: number, h: number): number =>
    Math.min(
      fitCell({ space: w - CHROME_W, count: variant.width, base: CELL, step: CELL_STEP, min: CELL_MIN, max: CELL_MAX }),
      fitCell({
        space: h - CHROME_H - PICKER_PAD - FRAME_PAD,
        count: variant.height + DISC_RATIO,
        base: CELL, step: CELL_STEP, min: CELL_MIN, max: CELL_MAX,
      }),
    );
  const minWindowW = (): number => variant.width * CELL_MIN + CHROME_W;
  const minWindowH = (): number => CHROME_H + pickerH(CELL_MIN) + frameH(CELL_MIN);

  const body = el(`<div></div>`);
  // kept as a named object: setVariant re-floors minW when the board changes size
  const winSpec = {
    id: "board",
    title: TITLES.boardVariant(variant.name),
    icon: ICONS.board,
    x: 296,
    y: 64,
    ax: "center" as const,
    w: windowWidth(),
    cls: `chips-${chips}`,
    body,
    onMaximize: (on: boolean) => layoutMax(on),
    resizable: true,
    // the floor is the smallest cell, not the natural board: a window you can
    // only grow is half a window
    minW: minWindowW(),
    minH: minWindowH(),
    onResize: () => relayout(),
    // the screensaver wins the desktop; the game goes on on top of it
    overSaver: true,
  };
  const win = deps.wm.open(winSpec);

  // outside build(): a variant change remakes the menu, not the binding
  const onKey = (e: KeyboardEvent): void => {
    if (!win.isOpen()) {
      removeEventListener("keydown", onKey);
      return;
    }
    if (
      (e.key === "F2" || ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "d")) &&
      deps.wm.focused()?.id === "board"
    ) {
      e.preventDefault();
      newGame();
    }
  };
  addEventListener("keydown", onKey);

  const name = (): string => byId(botId).name.toUpperCase();
  const voice = () => voiceOf(botId);

  /* ---- build the window contents (rebuilt on variant change) ---- */
  function build(): void {
    body.innerHTML = "";

    const menubar = el(`<div class="menu" id="menubar"></div>`);
    const gameBtn = el(`<span><u>G</u>ame</span>`);
    const oppBtn = el(`<span><u>O</u>pponent</span>`);
    const helpBtn = el(`<span><u>H</u>elp</span>`);
    const forfeitBtn = el(`<span class="gray"><u>F</u>orfeit</span>`);
    menubar.append(gameBtn, oppBtn, helpBtn, forfeitBtn);

    const gamePopup = el(`<div class="popup" style="left:4px;display:none"></div>`);
    const newItem = el(`<div class="has-accel">New game<span class="accel">Ctrl+D</span></div>`);
    newItem.addEventListener("click", () => newGame());
    gamePopup.appendChild(newItem);
    gamePopup.appendChild(el(`<hr>`));
    for (const v of VARIANTS) {
      const it = el(`<div></div>`);
      it.textContent = v.name;
      if (v.id === variant.id) it.appendChild(el(`<span class="check">·</span>`));
      it.addEventListener("click", () => setVariant(v.id));
      gamePopup.appendChild(it);
    }
    gamePopup.appendChild(el(`<hr>`));
    const exitItem = el(`<div>Exit</div>`);
    exitItem.addEventListener("click", () => win.close());
    gamePopup.appendChild(exitItem);

    const oppPopup = el(`<div class="popup" style="left:52px;display:none"></div>`);
    for (const bot of ROSTER) {
      const it = el(`<div></div>`);
      it.textContent = bot.name.toUpperCase();
      if (bot.id === botId) it.appendChild(el(`<span class="check">·</span>`));
      it.addEventListener("click", () => setBot(bot.id));
      oppPopup.appendChild(it);
    }

    const helpPopup = el(`<div class="popup" style="left:104px;display:none"></div>`);
    const helpItem = el(`<div>Contents</div>`);
    helpItem.addEventListener("click", () => dispatch("help"));
    const aboutItem = el(`<div>About BOARD.EXE</div>`);
    aboutItem.addEventListener("click", () => dispatch("about"));
    helpPopup.append(helpItem, aboutItem);

    menubar.append(gamePopup, oppPopup, helpPopup);

    let openPopup: HTMLElement | null = null;
    const closeMenus = (): void => {
      for (const p of [gamePopup, oppPopup, helpPopup]) p.style.display = "none";
      for (const s of [gameBtn, oppBtn, helpBtn]) s.classList.remove("open");
      openPopup = null;
    };
    const wire = (btn: HTMLElement, popup: HTMLElement): void => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const was = openPopup;
        closeMenus();
        if (was !== popup) {
          play("menu", 0.7);
          popup.style.display = "block";
          btn.classList.add("open");
          openPopup = popup;
        }
      });
    };
    wire(gameBtn, gamePopup);
    wire(oppBtn, oppPopup);
    wire(helpBtn, helpPopup);
    buildAbort?.abort();
    buildAbort = new AbortController();
    addEventListener("click", closeMenus, { signal: buildAbort.signal });
    const chose = (e: Event): void => {
      e.stopPropagation();
      play("click", 0.6);
      closeMenus();
    };
    gamePopup.addEventListener("click", chose);
    oppPopup.addEventListener("click", chose);
    helpPopup.addEventListener("click", chose);

    forfeitBtn.addEventListener("click", () => {
      if (forfeitBtn.classList.contains("gray")) return;
      play("click", 0.6);
      forfeit();
    });

    const pickerRow = el(`<div id="pickerRow" style="position:relative;height:${pickerH()}px;margin:4px 10px 0"></div>`);
    const picker = el(`<div class="disc r" id="picker" style="position:absolute;left:${pickerX(hoverCol)}px;top:4px"></div>`);
    const botDisc = el(`<div class="disc y" id="botDisc" style="position:absolute;left:${pickerX(botCol)}px;top:4px;display:none"></div>`);
    pickerRow.append(picker, botDisc);

    const frame = el(`<div class="sunken boardframe"></div>`);
    const wrap = el(`<div class="gridwrap"></div>`);
    const grid = el(`<div id="grid"></div>`);
    wrap.appendChild(grid);
    frame.appendChild(wrap);

    const statusbar = el(`<div class="statusbar">
        <div id="stYou"></div>
        <div style="flex:1.4" id="stBot"></div>
        <div style="flex:.5" id="stCount">0:0</div>
      </div>`);

    const fx = el(`<div id="fx"></div>`);
    body.append(menubar, pickerRow, frame, statusbar, fx);

    // Connect 6 on a 800-tall desktop doesn't fit at the authored cell; the
    // frame gets a real scrollbar, which is funny and free (DIRECTION.md).
    // Dragging the window is now the way out of it — the cell shrinks to fit.
    if (scrolls()) {
      frame.style.height = `${maxFrame() - FRAME_PAD}px`;
      if (!win.el.classList.contains("max")) win.el.style.top = "4px";
    }

    /* One committed move, whatever pointed at it. */
    const commit = (col: number): void => {
      if (phase !== "your-turn") return;
      if (!match.canPlay(col)) {
        // a full column used to be silence, which is indistinguishable from a
        // click the window didn't get
        play("chord", 0.4);
        return;
      }
      if (!hesitated && Date.now() - turnStartedAt > 5000) {
        hesitated = true;
        deps.notepad.lines(["and then you", "hesitated"]);
      }
      if (col === lastHumanCol) {
        sameColStreak++;
        if (sameColStreak >= 2 && !notedSameCol) {
          notedSameCol = true;
          deps.notepad.lines([`column ${col + 1} again.`]);
        }
      } else {
        sameColStreak = 0;
        notedSameCol = false;
      }
      lastHumanCol = col;
      picker.style.left = `${pickerX(col)}px`;
      humanMove(col);
    };

    grid.addEventListener("pointermove", (e) => {
      if (e.pointerType === "touch") return; // the finger has its own path below
      const cell = (e.target as HTMLElement).closest<HTMLElement>(".cell");
      if (!cell || phase === "over") return;
      const col = Number(cell.dataset.col);
      // only when it actually crosses — a move inside one column is not an
      // event, and the tick is the smallest sound in the scheme for a reason
      if (col !== hoverCol && phase === "your-turn") play("hover-tick", 0.55);
      hoverCol = col;
      if (phase === "your-turn") picker.style.left = `${pickerX(hoverCol)}px`;
    });
    grid.addEventListener("click", (e) => {
      // the tap already committed through the touch path; its synthetic click
      // arriving here would deal a second disc
      if (performance.now() < clickSuppressedUntil) return;
      const cell = (e.target as HTMLElement).closest<HTMLElement>(".cell");
      if (!cell || phase !== "your-turn") return;
      commit(Number(cell.dataset.col));
    });

    /* ---- the finger's path: the hover disc IS your piece here too. Touch
       the board and the disc snaps to that column; drag and it follows;
       let go over the board and it falls from where it hovers. Slide off
       the side to put it down without playing. ---- */
    const colFrom = (ev: PointerEvent): number => {
      const gr = q("#grid", body).getBoundingClientRect();
      const col = Math.floor((ev.clientX - gr.left) / stageScale() / cell);
      return Math.max(0, Math.min(variant.width - 1, col));
    };
    const touchAim = (e: PointerEvent): ((ev: PointerEvent) => void) | null => {
      if (e.pointerType !== "touch" || phase !== "your-turn") return null;
      const aim = (ev: PointerEvent): void => {
        const col = colFrom(ev);
        if (col !== hoverCol && phase === "your-turn") play("hover-tick", 0.55);
        hoverCol = col;
        if (phase === "your-turn") picker.style.left = `${pickerX(hoverCol)}px`;
      };
      aim(e);
      return aim;
    };
    const touchDrop = (e: PointerEvent, cancelled: boolean): void => {
      if (e.pointerType !== "touch") return;
      clickSuppressedUntil = performance.now() + 700;
      if (cancelled || phase !== "your-turn") return; // a scroll took the gesture
      const k = stageScale();
      const fr = frame.getBoundingClientRect();
      const pr = pickerRow.getBoundingClientRect();
      const off = 12 * k;
      if (e.clientY < pr.top - off || e.clientY > fr.bottom + off) return;
      if (e.clientX < fr.left - off || e.clientX > fr.right + off) return;
      commit(hoverCol);
    };
    onPointerDrag(grid, touchAim, touchDrop);
    onPointerDrag(pickerRow, touchAim, touchDrop);

    buildGrid();
    renderPosition();
    setCell(cell);
    if (win.el.classList.contains("max")) layoutMax(true);
    else if (win.el.classList.contains("sized")) relayout();
  }

  /** The hover disc's left edge over column `col`, in picker-row coords. */
  const pickerX = (col: number): number => 6 + (cell - disc()) / 2 + cell * col;

  /* ---- one live cell size, and everything the CSS can read off it ----
     The cells, holes and chips are all sized from `--cell`/`--disc` (chrome.css),
     so a new cell repaints the whole board without rebuilding a node. What CSS
     can't reach — the picker row's height, the two hover discs' columns, and
     anything the endgame has parked on the grid — is re-derived here. ---- */
  function setCell(next: number): void {
    const prev = cell;
    cell = next;
    body.style.setProperty("--cell", `${cell}px`);
    body.style.setProperty("--disc", `${disc()}px`);
    const row = body.querySelector<HTMLElement>("#pickerRow");
    if (!row) return; // called before the first build
    row.style.height = `${pickerH()}px`;
    q("#picker", body).style.left = `${pickerX(hoverCol)}px`;
    q("#botDisc", body).style.left = `${pickerX(botCol)}px`;
    rescaleDecor(cell / prev);
  }

  /* The win's ants and its seam fire are absolutely positioned in the grid's
     own coordinates (endgame.ts, off `cellCenter`), so a resize mid-cascade
     would strand them next to the line they are supposed to be on. They ride
     the same ratio the cells do. */
  function rescaleDecor(r: number): void {
    if (r === 1) return;
    for (const d of q(".gridwrap", body).querySelectorAll<HTMLElement>(".ants,.seam"))
      for (const p of ["left", "top", "width", "height"] as const) {
        const v = parseFloat(d.style[p]);
        if (!Number.isNaN(v)) d.style[p] = `${v * r}px`;
      }
  }

  /* ---- sized or maximized, the window frames the board instead of stranding
     it in the top-left of a desk-wide sheet of gray: the cell grows to fill
     what it was given, frame centered, picker row kept over the columns,
     statusbar at the bottom. All instant — this is layout, not animation. ---- */
  function frameTo(totalH: number): void {
    const frame = q<HTMLElement>(".boardframe", body);
    const pickerRow = q("#pickerRow", body);
    const availFrame = frameSpace(totalH);
    const natural = frameH();
    // even the smallest cell can outgrow a short window; then it still scrolls
    const stillScrolls = natural > availFrame;
    // frameH/frameSpace are outer boxes; the well is content-box, so the
    // padding comes back off before it lands as a width. Get this wrong and
    // the grid sits 12px off-centre in its own well, which is the dead column
    // of gray the CHROME_W comment is about.
    const outerW = variant.width * cell + FRAME_PAD + (stillScrolls ? 16 : 0);
    body.style.display = "flex";
    body.style.flexDirection = "column";
    body.style.minHeight = "0";
    frame.style.height = `${Math.min(natural, availFrame) - FRAME_PAD}px`;
    frame.style.width = `${outerW - FRAME_PAD}px`;
    frame.style.flex = "none";
    frame.style.margin = "0 auto auto";
    pickerRow.style.width = `${outerW}px`;
    pickerRow.style.margin = "auto auto 0";
  }

  /** The window changed size: pick the cell it can hold, then re-frame. */
  function relayout(w = win.el.offsetWidth, h = win.el.offsetHeight): void {
    setCell(cellFor(w, h));
    frameTo(h);
  }

  function layoutMax(on: boolean): void {
    if (on) {
      relayout(deskWidth(), deskHeight() - taskbarH());
      return;
    }
    // restoring out of maximize lands back in the hand size, if there was one
    if (win.el.classList.contains("sized")) {
      relayout();
      return;
    }
    setCell(CELL);
    const frame = q<HTMLElement>(".boardframe", body);
    const pickerRow = q("#pickerRow", body);
    body.style.display = "";
    body.style.flexDirection = "";
    body.style.minHeight = "";
    frame.style.width = "";
    frame.style.flex = "";
    frame.style.margin = "";
    frame.style.height = scrolls() ? `${maxFrame() - FRAME_PAD}px` : "";
    pickerRow.style.width = "";
    pickerRow.style.margin = "";
    // the restore size may predate a variant switch; re-assert the real one
    win.el.style.width = `${windowWidth()}px`;
  }

  function buildGrid(): void {
    const grid = q("#grid", body);
    grid.innerHTML = "";
    for (let row = 0; row < variant.height; row++) {
      const rEl = el(`<div class="cellrow"></div>`);
      for (let c = 0; c < variant.width; c++)
        rEl.appendChild(el(`<div class="cell" data-col="${c}"><div class="hole"></div></div>`));
      grid.appendChild(rEl);
    }
  }

  /** Paint the whole grid from the match — the scripted-opening path. */
  function renderPosition(): void {
    const g = match.grid();
    for (let row = 0; row < variant.height; row++)
      for (let col = 0; col < variant.width; col++) {
        const cell = cellAt(col, row);
        const v = g[row]![col]!;
        cell.innerHTML =
          v === "red" ? `<div class="disc r"></div>` :
          v === "yellow" ? `<div class="disc y"></div>` : `<div class="hole"></div>`;
      }
    updateCount();
  }

  const cellAt = (col: number, row: number): HTMLElement =>
    q("#grid", body).children[row]!.children[col] as HTMLElement;

  const cellCenter = (col: number, row: number): readonly [number, number] =>
    [col * cell + cell / 2, row * cell + cell / 2] as const;

  function updateCount(): void {
    const n = match.history.length;
    q("#stCount", body).textContent = `${Math.ceil(n / 2)}:${Math.floor(n / 2)}`;
  }

  function setStatus(you?: string, bot?: string): void {
    if (you !== undefined) q("#stYou", body).textContent = you;
    if (bot !== undefined) q("#stBot", body).textContent = bot;
  }

  function setForfeitable(on: boolean): void {
    const btn = [...body.querySelectorAll("#menubar > span")].find((s) =>
      s.textContent!.includes("orfeit"),
    );
    btn?.classList.toggle("gray", !on);
  }

  /* ---- the fall. The hover disc is the piece; it drops from where it
     hovers, with real gravity and one frame of overshoot. ---- */
  function fall(col: number, who: "r" | "y", source: HTMLElement, then: () => void): void {
    const row = landingRow(col);
    const fx = q("#fx", body);
    const k = stageScale();
    const seq = gameSeq;
    revealRow(row, k);
    const o = fx.getBoundingClientRect();
    const srcR = source.getBoundingClientRect();
    const cellR = cellAt(col, row).getBoundingClientRect();
    source.style.display = "none";
    maskToBoard(fx, o, k);
    const d = el(`<div class="disc ${who}" style="position:absolute;left:${(srcR.left - o.left) / k}px"></div>`);
    fx.appendChild(d);
    play("disc-drop", 0.7);
    gravityFall(d, (srcR.top - o.top) / k, (cellR.top - o.top) / k + (cell - disc()) / 2, () => {
      d.remove();
      clearMask(fx);
      // the knock lands with the disc, not with the click — a deep column
      // falls for a good deal longer than a full one
      play("disc-land");
      // a New Game landed mid-flight: the disc belonged to a board that no
      // longer exists, and painting it would deal it onto the fresh one
      if (seq !== gameSeq) return;
      cellAt(col, row).innerHTML = `<div class="disc ${who}"></div>`;
      then();
    });
  }

  /* ---- the disc goes *into* the cabinet, not across its face. Above the
     board it is its own object; from the board's top edge down it is only
     what the holes let you see, which is what a real one looks like and
     what the mock's arrow implies. One mask does both: an opaque band down
     to the frame, then the hole tile. Both offsets are read live, and so is
     the tile: maximize, a variant switch, a resize drag and a scrolled frame
     all move the grid, and three of them change the size of a hole. ---- */
  function maskToBoard(fx: HTMLElement, o: DOMRect, k: number): void {
    const frameR = q(".boardframe", body).getBoundingClientRect();
    const gridR = q("#grid", body).getBoundingClientRect();
    const band = Math.max(0, (frameR.top - o.top) / k);
    const gx = (gridR.left - o.left) / k;
    const gy = (gridR.top - o.top) / k;
    const r = disc() / 2;
    setMask(fx, {
      image: `linear-gradient(#000,#000),radial-gradient(circle at ${cell / 2}px ${cell / 2}px,#000 0 ${r}px,transparent ${r}px)`,
      position: `0 0,${gx}px ${gy}px`,
      size: `100% ${band}px,${cell}px ${cell}px`,
      repeat: `no-repeat,repeat`,
    });
  }

  const clearMask = (fx: HTMLElement): void =>
    setMask(fx, { image: "", position: "", size: "", repeat: "" });

  function setMask(fx: HTMLElement, m: Record<string, string>): void {
    const s = fx.style as unknown as Record<string, string>;
    for (const [k, v] of Object.entries(m)) {
      const prop = k[0]!.toUpperCase() + k.slice(1);
      s[`mask${prop}`] = v;
      s[`webkitMask${prop}`] = v;
    }
  }

  /* Connect 6 and 7 outgrow the desktop and the frame scrolls. Landing a
     disc in a row that's scrolled out of sight drops it, visibly, past the
     bottom of the board and over the statusbar — so bring the row into
     view first, then measure. */
  function revealRow(row: number, k: number): void {
    const frame = q<HTMLElement>(".boardframe", body);
    if (frame.scrollHeight <= frame.clientHeight) return;
    const fr = frame.getBoundingClientRect();
    const cr = cellAt(0, row).getBoundingClientRect();
    const below = (cr.bottom - fr.top) / k - frame.clientHeight;
    if (below > 0) frame.scrollTop += below;
    const above = (fr.top - cr.top) / k;
    if (above > 0) frame.scrollTop -= above;
  }

  /* ---- and the position leaves the way it arrived ----
     A new game used to blink the old board out of existence: a full cabinet
     one frame, an empty one the next. Now the floor gives out — left to right,
     over about a tenth of a second — and the whole position falls through it
     with the physics the discs arrived with. Same `gravityFall`, same per-60Hz
     integration, no easing curve anywhere.

     The discs are lifted out of their cells into one layer sized to the grid
     and wearing the same hole mask `maskToBoard` puts on `#fx`, so on the way
     down they are still only what the holes let you see — a disc between two
     rows is two crescents, which is what emptying a real cabinet looks like
     from the front. The layer's own clip is the bottom of the machine: a disc
     that reaches it is gone, and nothing lands.

     The win's ants and its seam fire ride down with it. They were parked on
     this position in its own coordinates, and a capsule left hanging over an
     empty board is the bug you only find by looking.

     Every number here is measured off the DOM rather than off `variant` or
     `cell`: this runs *before* a variant switch takes its new geometry, and
     the board falling out is the old one. */
  function exitPosition(then: () => void): void {
    const wrap = q(".gridwrap", body);
    const grid = q("#grid", body);
    const filled = [...grid.querySelectorAll<HTMLElement>(".cell")].filter(
      (c) => c.firstElementChild?.classList.contains("disc"),
    );
    // an empty board has nothing to take away — the boot and a new game off a
    // position nobody played into stay instant
    if (!filled.length) {
      then();
      return;
    }
    const seq = gameSeq;
    q("#picker", body).style.display = "none";
    q("#botDisc", body).style.display = "none";

    // every read before any write: one layout for the whole board, not one per
    // disc. A cell is positioned, so its offsets are already grid-relative.
    const gx = grid.offsetLeft;
    const gy = grid.offsetTop;
    const gw = grid.offsetWidth;
    const gh = grid.offsetHeight;
    const width = grid.firstElementChild?.childElementCount ?? 1;
    // the layer clips at its own bottom edge, so a disc whose top reaches the
    // grid's last pixel is already out of the machine. Nothing lands.
    const drop = gh;
    const falling: { d: HTMLElement; col: number; x: number; y: number }[] = filled.map((c) => {
      const d = c.firstElementChild as HTMLElement;
      return {
        d,
        col: Number(c.dataset.col),
        x: c.offsetLeft + d.offsetLeft - gx,
        y: c.offsetTop + d.offsetTop - gy,
      };
    });
    const decor = [...wrap.querySelectorAll<HTMLElement>(".ants,.seam")];

    const layer = el(`<div class="drain"></div>`);
    layer.style.cssText = `left:${gx}px;top:${gy}px;width:${gw}px;height:${gh}px`;
    const r = disc() / 2;
    setMask(layer, {
      image: `radial-gradient(circle at ${cell / 2}px ${cell / 2}px,#000 0 ${r}px,transparent ${r}px)`,
      position: `0 0`,
      size: `${cell}px ${cell}px`,
      repeat: `repeat`,
    });
    wrap.appendChild(layer);

    // the disc moves to the layer and the hole it was in comes back underneath
    // it — invisible while it hasn't moved, because the mask cuts it to exactly
    // that hole
    for (const f of falling) {
      const c = f.d.parentElement!;
      f.d.style.left = `${f.x}px`;
      f.d.style.top = `${f.y}px`;
      layer.appendChild(f.d);
      c.appendChild(el(`<div class="hole"></div>`));
    }

    let pending = falling.length + decor.length;
    const gone = (): void => {
      if (--pending > 0 || seq !== gameSeq) return;
      // the position hitting the bottom of the machine, somewhere below
      play("disc-land", 0.4);
      then();
    };

    play("disc-drop", 0.6);
    const k = stageScale();
    for (const d of decor) {
      // The decor is outside the layer and rides the gridwrap's own clip, six
      // px past the last row. The ants capsule is rotated onto its line, so
      // its rendered box is a good deal taller than the height it was given —
      // a target that ignores that leaves an arc of it hanging under an empty
      // board, which is exactly the thing this animation exists to stop.
      const box = d.getBoundingClientRect().height / k;
      gravityFall(d, parseFloat(d.style.top) || 0, gh + 10 + (box - d.offsetHeight) / 2, gone);
    }
    // the tear runs across the board in a fixed time, so a 13-wide Connect 7
    // gives out over the same beat a 7-wide Connect 4 does
    const lag = 90 / Math.max(1, width - 1);
    const byCol = new Map<number, typeof falling>();
    for (const f of falling) {
      const list = byCol.get(f.col);
      if (list) list.push(f);
      else byCol.set(f.col, [f]);
    }
    for (const [col, list] of byCol) {
      const release = (): void => {
        for (const f of list) gravityFall(f.d, f.y, drop, gone);
      };
      if (col === 0) release();
      else setTimeout(release, col * lag);
    }
  }

  const landingRow = (col: number): number => {
    const g = match.grid();
    for (let row = variant.height - 1; row >= 0; row--)
      if (g[row]![col] === null) return row;
    throw new Error(`column ${col} is full`);
  };

  function humanMove(col: number): void {
    phase = "busy";
    const seq = gameSeq;
    fall(col, "r", q("#picker", body), () => {
      if (seq !== gameSeq) return;
      match.play(col);
      afterPly("you", col);
    });
  }

  function afterPly(mover: "you" | "bot", col: number): void {
    updateCount();
    deps.notepad.move(col);
    deps.onPly?.(mover, match.position);
    deps.onEval?.(match.history);
    if (match.status !== "playing") {
      end();
      return;
    }
    if (mover === "you") botMove();
    else yourTurn();
  }

  function yourTurn(): void {
    phase = "your-turn";
    turnStartedAt = Date.now();
    const picker = q("#picker", body);
    picker.style.left = `${pickerX(hoverCol)}px`;
    picker.style.display = "block";
    setStatus(STATUS.yourMove, voice().waiting);
  }

  /* ---- the opponent deliberates where you can see it ----
     The disc never teleports: it hovers where it was left, and once the
     engine answers it walks column by column (stepped, no easing) to the
     move and drops. Occasionally it is torn — it walks to a nearby
     candidate first, pauses, then walks back to the real choice. */
  function botMove(): void {
    phase = "bot-turn";
    const seq = gameSeq;
    setStatus(STATUS.theirMove(name()), voice().thinking);
    const botDisc = q("#botDisc", body);
    botDisc.style.display = "block";
    botDisc.style.left = `${pickerX(botCol)}px`;

    let decision: number | null = null;
    const started = Date.now();

    deps.decide(botId, variant.id, match.history).then(
      (d) => { if (seq === gameSeq) decision = d.col; },
      (err: Error) => {
        if (seq !== gameSeq) return;
        phase = "over";
        deps.wm.dialog({
          title: "BOARD.EXE",
          icon: "!",
          body: `${name()} has stopped thinking entirely.<br>(${err.message})`,
          x: 460, y: 320, w: 380,
        });
      },
    );

    const walkTo = (target: number, then: () => void): void => {
      if (seq !== gameSeq || phase !== "bot-turn") return;
      if (botCol === target) {
        then();
        return;
      }
      botCol += Math.sign(target - botCol);
      botDisc.style.left = `${pickerX(botCol)}px`;
      play("bot-step", 0.5);
      wanderTimer = setTimeout(() => walkTo(target, then), 85);
    };

    const drop = (col: number): void => {
      wanderTimer = setTimeout(() => {
        if (seq !== gameSeq) return;
        fall(col, "y", botDisc, () => {
          if (seq !== gameSeq) return;
          match.play(col);
          afterPly("bot", col);
        });
      }, 320 + Math.random() * 160);
    };

    const settle = (): void => {
      if (seq !== gameSeq || phase !== "bot-turn") return;
      // hover for a touch even when the answer is instant
      if (decision === null || Date.now() - started < 550) {
        wanderTimer = setTimeout(settle, 120);
        return;
      }
      const col = decision;
      // sometimes torn between the move and a neighbourly second thought
      const near = [...Array(variant.width).keys()].filter(
        (c) => c !== col && match.canPlay(c) && Math.abs(c - col) <= 2,
      );
      if (near.length && Math.random() < 0.3) {
        const alt = near[(Math.random() * near.length) | 0]!;
        walkTo(alt, () => {
          wanderTimer = setTimeout(() => walkTo(col, () => drop(col)), 300 + Math.random() * 260);
        });
      } else {
        walkTo(col, () => drop(col));
      }
    };
    wanderTimer = setTimeout(settle, 200);
  }

  function end(): void {
    phase = "over";
    setForfeitable(false);
    q("#picker", body).style.display = "none";
    q("#botDisc", body).style.display = "none";
    deps.resetBrain(botId, variant.id);

    const kind: EndResult["kind"] =
      match.status === "draw" ? "draw" : match.winner === "red" ? "win" : "loss";
    // order the line outward from the disc that finished it
    const last = match.history[match.history.length - 1]!;
    const g = match.grid();
    let lastRow = 0;
    for (let row = 0; row < variant.height; row++)
      if (g[row]![last] !== null) { lastRow = row; break; }
    const cells = [...match.winningCells]
      .map((c) => ({ col: c.col, row: c.row }))
      .sort(
        (a, b) =>
          Math.hypot(a.col - last, a.row - lastRow) - Math.hypot(b.col - last, b.row - lastRow),
      );
    deps.onEnd({ kind, cells, run: variant.run, botId, variant, history: [...match.history] });
  }

  function forfeit(): void {
    if (phase === "over") return;
    gameSeq++;
    if (wanderTimer) clearTimeout(wanderTimer);
    phase = "over";
    setForfeitable(false);
    q("#picker", body).style.display = "none";
    q("#botDisc", body).style.display = "none";
    deps.resetBrain(botId, variant.id);
    deps.onEnd({ kind: "forfeit", cells: [], run: variant.run, botId, variant, history: [...match.history] });
  }

  /* ---- game lifecycle ----
     Two halves with the exit between them: the old position drains out of the
     cabinet, and only then does anything about the next game exist. `prepare`
     is what a variant or opponent switch changes, and it runs on the far side
     for the same reason — resizing the window under a board that is still
     falling out of it is the one way to make this ugly. With an empty board
     `exitPosition` calls straight through, so the boot and every scripted pose
     land exactly where they always did. */
  function newGame(prepare?: () => void): void {
    gameSeq++;
    if (wanderTimer) clearTimeout(wanderTimer);
    // the exit is not a window in which you can click a column into a
    // half-torn-down match
    phase = "over";
    exitPosition(() => {
      prepare?.();
      beginGame();
    });
  }

  function beginGame(): void {
    match = new Match(variant);
    hesitated = false;
    sameColStreak = 0;
    lastHumanCol = -1;
    notedSameCol = false;
    hoverCol = Math.min(hoverCol, variant.width - 1);
    botCol = Math.min(botCol, variant.width - 1);
    build();
    q("#botDisc", body).style.display = "none";
    setForfeitable(true);
    deps.notepad.reset();
    deps.onNewGame?.(variant, botId);
    yourTurn();
  }

  function setVariant(id: string): void {
    if (id === variant.id) return;
    newGame(() => {
      variant = variantById(id);
      win.setTitle(TITLES.boardVariant(variant.name));
      winSpec.minW = minWindowW();
      winSpec.minH = minWindowH();
      // maximized stays maximized; the new size lands on restore (layoutMax).
      // A hand size belonged to the old board and is let go — the new variant
      // takes its natural window, same as it always has.
      if (!win.el.classList.contains("max")) {
        win.el.classList.remove("sized");
        win.el.style.height = "";
        win.el.style.width = `${windowWidth()}px`;
        setCell(CELL);
      }
    });
  }

  function setBot(id: string): void {
    if (id === botId) return;
    // the old game is still on the board while it leaves, and it was played
    // against the old opponent — the statusbar keeps saying so until it's gone
    newGame(() => {
      botId = id;
    });
  }

  function setChips(style: string, persist = true): void {
    chips = style;
    // deep-linked styles are a harness pose, not a preference
    if (persist) localStorage.setItem("exe.chips", style);
    win.el.className = win.el.className.replace(/chips-[a-z0-9]+/, `chips-${style}`);
  }

  /* ---- external hooks (menus that live outside this window) ---- */
  const dispatchers: Record<string, () => void> = {};
  function dispatch(what: string): void {
    dispatchers[what]?.();
  }

  const app: BoardApp = {
    win,
    get variant() { return variant; },
    get botId() { return botId; },
    newGame,
    setVariant,
    setBot,
    setChips,
    script(moves) {
      for (const col of moves) {
        if (!match.play(col)) throw new Error(`script: illegal move ${col}`);
        deps.notepad.move(col);
      }
      renderPosition();
      if (match.status !== "playing") {
        end();
        return;
      }
      if (match.turn === "red") yourTurn();
      else {
        // freeze mid-deliberation: the pose the screenshots want
        phase = "frozen";
        q("#picker", body).style.display = "none";
        const botDisc = q("#botDisc", body);
        botDisc.style.display = "block";
        botCol = Math.min(4, variant.width - 1);
        botDisc.style.left = `${pickerX(botCol)}px`;
        setStatus(STATUS.theirMove(name()), voice().thinking);
      }
    },
    freeze() {
      gameSeq++;
      if (wanderTimer) clearTimeout(wanderTimer);
      phase = "frozen";
    },
    cellAt,
    cellCenter,
    cellSize: () => cell,
    gridwrap: () => q(".gridwrap", body),
    fx: () => q("#fx", body),
    setStatus,
    botName: name,
    onMenu(what, cb) {
      dispatchers[what] = cb;
    },
  };

  build();
  return app;
}
