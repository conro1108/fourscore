/**
 * BOARD.EXE — the board window and the match loop. The hover disc IS the
 * piece and falls from where it hovers (DIRECTION.md); the bot's disc never
 * teleports. The deliberation walk is theatre; the move comes from the worker.
 */

import { ROSTER, VARIANTS, byId, variantById, type Position, type Variant } from "@fourscore/engine";
import { Match } from "@fourscore/engine";
import { el, gravityFall, onPointerDrag, q } from "./dom.js";
import { ICONS } from "./icons.js";
import { STATUS, TITLES, voiceOf } from "./copy.js";
import { deskHeight, deskWidth, onDeskResize, stageScale, taskbarH, type WM, type Win } from "./wm.js";
import * as fit from "./boardfit.js";
import { CELL, CELL_MIN, CHROME_H, CHROME_W, DISC_RATIO, FRAME_PAD } from "./boardfit.js";
import { play } from "./audio/index.js";
import type { MovesPad } from "./notepad.js";

export { CELL } from "./boardfit.js";

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
  /** Fires synchronously as a ply commits, ahead of the worker's eval. */
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
  /** Play a move list instantly, no animation (harness). */
  script(moves: readonly number[]): void;
  /** Freeze play (harness pose). */
  freeze(): void;
  cellAt(col: number, row: number): HTMLElement;
  cellCenter(col: number, row: number): readonly [number, number];
  /** Live cell px; anything authored against `CELL` scales by `cellSize() / CELL`. */
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
  /** Where the bot's disc physically is; it never teleports. */
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

  /* ---- geometry, all derived from one live cell (arithmetic in boardfit.ts).
     Grid sits at x=16 (frame margin 10 + padding 6) and the same 16 must come
     back on the right or the well shows a dead gray column. The natural window
     never scrolls: Connect 6/7 take the biggest cell the desk holds; 4/5 fit
     at 64 untouched. */
  let cell = CELL;
  const disc = (): number => cell * DISC_RATIO;
  const frameH = (c = cell): number => fit.frameH(variant, c);
  const pickerH = (c = cell): number => fit.pickerH(c);
  /** Frame height available in a window this tall. */
  const frameSpace = (totalH: number): number => totalH - CHROME_H - pickerH();
  /** Desk height less taskbar and seat. */
  const deskRoomH = (): number => deskHeight() - taskbarH() - 8;
  const naturalCell = (): number => fit.naturalCell(variant, deskWidth(), deskRoomH());
  const windowWidth = (c = naturalCell()): number => fit.windowW(variant, c);
  const cellFor = (w: number, h: number): number => fit.cellFor(variant, w, h);
  const minWindowW = (): number => fit.windowW(variant, CELL_MIN);
  const minWindowH = (): number => fit.windowH(variant, CELL_MIN);

  const body = el(`<div></div>`);
  // named: setVariant re-floors minW/minH
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
    // floor is the smallest cell, not the natural board
    minW: minWindowW(),
    minH: minWindowH(),
    onResize: () => relayout(),
    overSaver: true,
  };
  const win = deps.wm.open(winSpec);

  /* Desk resize (phone dock): the WM re-seated the window first; only the
     cell/height are left. Hand-sized or maximized boards are left alone. */
  onDeskResize(() => {
    if (!win.isOpen() || win.el.classList.contains("max") || win.el.classList.contains("sized"))
      return;
    fitNatural();
  });

  // outside build(): a variant change must not rebind
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

    const commit = (col: number): void => {
      if (phase !== "your-turn") return;
      if (!match.canPlay(col)) {
        // a full column must not be silent (reads as a missed click)
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
      if (e.pointerType === "touch") return; // touch has its own path
      const cell = (e.target as HTMLElement).closest<HTMLElement>(".cell");
      if (!cell || phase === "over") return;
      const col = Number(cell.dataset.col);
      // only on a column crossing
      if (col !== hoverCol && phase === "your-turn") play("hover-tick", 0.55);
      hoverCol = col;
      if (phase === "your-turn") picker.style.left = `${pickerX(hoverCol)}px`;
    });
    grid.addEventListener("click", (e) => {
      // the touch path already committed; its synthetic click would deal twice
      if (performance.now() < clickSuppressedUntil) return;
      const cell = (e.target as HTMLElement).closest<HTMLElement>(".cell");
      if (!cell || phase !== "your-turn") return;
      commit(Number(cell.dataset.col));
    });

    /* ---- touch: disc snaps to the column, follows a drag, falls on release
       over the board; slide off the side to put it down without playing. */
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
      if (cancelled || phase !== "your-turn") return; // scroll took the gesture
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
    if (win.el.classList.contains("max")) layoutMax(true);
    else if (win.el.classList.contains("sized")) relayout();
    else fitNatural();
  }

  /** The hover disc's left edge over column `col`, in picker-row coords. */
  const pickerX = (col: number): number => 6 + (cell - disc()) / 2 + cell * col;

  /* Cells/holes/chips size from `--cell`/`--disc` (chrome.css); what CSS can't
     reach — picker row height, hover disc columns, endgame decor — is redone here. */
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

  /* Ants and seam fire are positioned in grid px (endgame.ts); a mid-cascade
     resize must scale them by the same ratio. */
  function rescaleDecor(r: number): void {
    if (r === 1) return;
    for (const d of q(".gridwrap", body).querySelectorAll<HTMLElement>(".ants,.seam"))
      for (const p of ["left", "top", "width", "height"] as const) {
        const v = parseFloat(d.style[p]);
        if (!Number.isNaN(v)) d.style[p] = `${v * r}px`;
      }
  }

  /* Sized or maximized: cell grows to fill, frame centered, picker over the
     columns, statusbar at bottom. Instant — layout, not animation. */
  function frameTo(totalH: number): void {
    const frame = q<HTMLElement>(".boardframe", body);
    const pickerRow = q("#pickerRow", body);
    const availFrame = frameSpace(totalH);
    const natural = frameH();
    // the smallest cell can still outgrow a short window
    const stillScrolls = natural > availFrame;
    // frameH/frameSpace are outer boxes; the well is content-box, so subtract
    // the padding or the grid sits 12px off-centre in its well
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

  /** Pick the cell the window holds, then re-frame. */
  function relayout(w = win.el.offsetWidth, h = win.el.offsetHeight): void {
    setCell(cellFor(w, h));
    frameTo(h);
  }

  /* Natural (undragged) size: authored cell if the desk holds it, else the
     biggest that fits; slides up if it would hang off the bottom. No inline
     height — content sizes it — and nothing scrolls. */
  function fitNatural(): void {
    const c = naturalCell();
    setCell(c);
    win.el.style.width = `${windowWidth(c)}px`;
    win.el.style.height = "";
    const room = deskHeight() - taskbarH();
    const h = win.el.offsetHeight;
    if (win.el.offsetTop + h > room - 4) win.el.style.top = `${Math.max(4, room - h - 4)}px`;
  }

  function layoutMax(on: boolean): void {
    if (on) {
      relayout(deskWidth(), deskHeight() - taskbarH());
      return;
    }
    // restore lands back in the hand size, if any
    if (win.el.classList.contains("sized")) {
      relayout();
      return;
    }
    const frame = q<HTMLElement>(".boardframe", body);
    const pickerRow = q("#pickerRow", body);
    body.style.display = "";
    body.style.flexDirection = "";
    body.style.minHeight = "";
    frame.style.width = "";
    frame.style.flex = "";
    frame.style.margin = "";
    frame.style.height = "";
    pickerRow.style.width = "";
    pickerRow.style.margin = "";
    // the restore size may predate a variant switch
    fitNatural();
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

  /** Paint the grid from the match (scripted openings). */
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

  /* ---- the fall: from where the disc hovers, real gravity, one frame overshoot */
  function fall(col: number, who: "r" | "y", source: HTMLElement, then: () => void): void {
    const row = landingRow(col);
    const fx = q("#fx", body);
    const k = stageScale();
    const seq = gameSeq;
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
      // the knock lands with the disc, not the click
      play("disc-land");
      // New Game mid-flight: don't deal onto the fresh board
      if (seq !== gameSeq) return;
      cellAt(col, row).innerHTML = `<div class="disc ${who}"></div>`;
      then();
    });
  }

  /* Mask: opaque band above the frame, then the hole tile, so the disc goes
     *into* the cabinet. Offsets and tile are read live — maximize, variant
     switch and resize all move the grid and change the hole size. */
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

  /* ---- the position drains out: floor gives out left to right over ~0.1s,
     discs fall with the same `gravityFall`, no easing. Discs move into one
     layer wearing the hole mask, clipped at the machine's bottom; ants and
     seam fire ride down too. Every number is measured off the DOM, not
     `variant`/`cell`: this runs *before* a variant switch takes effect. */
  function exitPosition(then: () => void): void {
    const wrap = q(".gridwrap", body);
    const grid = q("#grid", body);
    const filled = [...grid.querySelectorAll<HTMLElement>(".cell")].filter(
      (c) => c.firstElementChild?.classList.contains("disc"),
    );
    // empty board: instant (boot, scripted poses)
    if (!filled.length) {
      then();
      return;
    }
    const seq = gameSeq;
    q("#picker", body).style.display = "none";
    q("#botDisc", body).style.display = "none";

    // all reads before any write: one layout, not one per disc
    const gx = grid.offsetLeft;
    const gy = grid.offsetTop;
    const gw = grid.offsetWidth;
    const gh = grid.offsetHeight;
    const width = grid.firstElementChild?.childElementCount ?? 1;
    // a disc whose top reaches the layer's bottom is clipped away; nothing lands
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

    // move the disc to the layer; the hole returns underneath, invisible until it moves
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
      play("disc-land", 0.4);
      then();
    };

    play("disc-drop", 0.6);
    const k = stageScale();
    for (const d of decor) {
      // decor rides the gridwrap clip (6px past the last row); the rotated ants
      // capsule renders taller than its set height, so target its rendered box
      const box = d.getBoundingClientRect().height / k;
      gravityFall(d, parseFloat(d.style.top) || 0, gh + 10 + (box - d.offsetHeight) / 2, gone);
    }
    // fixed total tear time regardless of width
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

  /* ---- the bot deliberates visibly: walks column by column (stepped, no
     easing) to the move; sometimes via a nearby candidate first. */
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
      // hover a beat even when the answer is instant
      if (decision === null || Date.now() - started < 550) {
        wanderTimer = setTimeout(settle, 120);
        return;
      }
      const col = decision;
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
    // line ordered outward from the finishing disc
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

  /* ---- lifecycle: the old position drains first; `prepare` (variant/bot
     switch) runs after, so the window isn't resized under a falling board. */
  function newGame(prepare?: () => void): void {
    gameSeq++;
    if (wanderTimer) clearTimeout(wanderTimer);
    // no clicks during the exit
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
      /* Drop the hand size: build() ends in fitNatural(). Must drop `sized`
         now even when maximized — the WM restores the pre-maximize geometry
         (the old variant's hand size) and `layoutMax(false)` would take the
         `sized` branch, leaving a 256-wide window around a 432-wide grid. */
      win.el.classList.remove("sized");
    });
  }

  function setBot(id: string): void {
    if (id === botId) return;
    // the old opponent's name stays up until the old game has left
    newGame(() => {
      botId = id;
    });
  }

  function setChips(style: string, persist = true): void {
    chips = style;
    // deep-linked styles don't persist
    if (persist) localStorage.setItem("exe.chips", style);
    win.el.className = win.el.className.replace(/chips-[a-z0-9]+/, `chips-${style}`);
  }

  /* ---- external hooks (menus outside this window) ---- */
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
        // freeze mid-deliberation (screenshot pose)
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
