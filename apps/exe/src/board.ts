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
import { el, gravityFall, q } from "./dom.js";
import { ICONS } from "./icons.js";
import { STATUS, TITLES, voiceOf } from "./copy.js";
import { deskHeight, stageScale, type WM, type Win } from "./wm.js";
import { play } from "./audio/index.js";
import type { MovesPad } from "./notepad.js";

export const CELL = 64;

export interface EndResult {
  kind: "win" | "loss" | "draw" | "forfeit";
  /** Winning line in display coords, ordered outward from the landing disc. */
  cells: readonly { col: number; row: number }[];
  run: number;
  botId: string;
  variant: Variant;
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

  // The grid sits at x=16 inside the window (frame margin 10 + padding 6) and
  // the same 16 has to come back on the right, or the sunken well shows a dead
  // column of gray. A tall variant that scrolls needs the scrollbar's 16 too.
  const CHROME_W = 32;
  const chromeH = 22 + 6 + 20 + 60 + 26 + 6; // titlebar+margins+menu+picker+status
  const maxFrame = 800 - 36 - 8 - chromeH;
  const scrolls = (): boolean => variant.height * CELL + 12 > maxFrame;
  const windowWidth = (): number => variant.width * CELL + CHROME_W + (scrolls() ? 16 : 0);

  const body = el(`<div></div>`);
  const win = deps.wm.open({
    id: "board",
    title: TITLES.boardVariant(variant.name),
    icon: ICONS.board,
    x: 296,
    y: 64,
    ax: "center",
    w: windowWidth(),
    cls: `chips-${chips}`,
    body,
    onMaximize: (on) => layoutMax(on),
    // the screensaver wins the desktop; the game goes on on top of it
    overSaver: true,
  });

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
    const newItem = el(`<div>New game</div>`);
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

    const pickerRow = el(`<div id="pickerRow" style="position:relative;height:56px;margin:4px 10px 0"></div>`);
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

    // Connect 6 on a 800-tall desktop doesn't fit; the frame gets a real
    // scrollbar, which is funny and free (DIRECTION.md).
    if (scrolls()) {
      frame.style.height = `${maxFrame}px`;
      if (!win.el.classList.contains("max")) win.el.style.top = "4px";
    }

    grid.addEventListener("mousemove", (e) => {
      const cell = (e.target as HTMLElement).closest<HTMLElement>(".cell");
      if (!cell || phase === "over") return;
      const col = Number(cell.dataset.col);
      // only when it actually crosses — a mousemove inside one column is not
      // an event, and the tick is the smallest sound in the scheme for a reason
      if (col !== hoverCol && phase === "your-turn") play("hover-tick", 0.55);
      hoverCol = col;
      if (phase === "your-turn") picker.style.left = `${pickerX(hoverCol)}px`;
    });
    grid.addEventListener("click", (e) => {
      const cell = (e.target as HTMLElement).closest<HTMLElement>(".cell");
      if (!cell || phase !== "your-turn") return;
      const col = Number(cell.dataset.col);
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
    });

    buildGrid();
    renderPosition();
    if (win.el.classList.contains("max")) layoutMax(true);
  }

  const pickerX = (col: number): number => 14 + CELL * col;

  /* ---- maximized, the window frames the board instead of stranding it in
     the top-left of a desk-wide sheet of gray: frame centered, given all the
     height there is, picker row kept over the columns, statusbar at the
     bottom. All instant — this is layout, not animation. ---- */
  function layoutMax(on: boolean): void {
    const frame = q<HTMLElement>(".boardframe", body);
    const pickerRow = q("#pickerRow", body);
    if (on) {
      const availFrame = deskHeight() - 36 - 8 - chromeH;
      const naturalFrame = variant.height * CELL + 12;
      const stillScrolls = naturalFrame > availFrame;
      const frameW = variant.width * CELL + 12 + (stillScrolls ? 16 : 0);
      body.style.display = "flex";
      body.style.flexDirection = "column";
      body.style.minHeight = "0";
      frame.style.height = `${Math.min(naturalFrame, availFrame)}px`;
      frame.style.width = `${frameW}px`;
      frame.style.flex = "none";
      frame.style.margin = "0 auto auto";
      pickerRow.style.width = `${frameW}px`;
      pickerRow.style.margin = "auto auto 0";
    } else {
      body.style.display = "";
      body.style.flexDirection = "";
      body.style.minHeight = "";
      frame.style.width = "";
      frame.style.flex = "";
      frame.style.margin = "";
      frame.style.height = scrolls() ? `${maxFrame}px` : "";
      pickerRow.style.width = "";
      pickerRow.style.margin = "";
      // the restore size may predate a variant switch; re-assert the real one
      win.el.style.width = `${windowWidth()}px`;
    }
  }

  function buildGrid(): void {
    const grid = q("#grid", body);
    grid.innerHTML = "";
    for (let row = 0; row < variant.height; row++) {
      const rEl = el(`<div class="cellrow"></div>`);
      for (let c = 0; c < variant.width; c++) {
        const cell = el(`<div class="cell" data-col="${c}"><div class="hole"></div></div>`);
        rEl.appendChild(cell);
      }
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
    [col * CELL + 32, row * CELL + 32] as const;

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
    gravityFall(d, (srcR.top - o.top) / k, (cellR.top - o.top) / k + 8, () => {
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
     to the frame, then the hole tile. Both offsets are read live, because
     maximize, a variant switch and a scrolled frame all move the grid. ---- */
  const HOLE_R = 24;

  function maskToBoard(fx: HTMLElement, o: DOMRect, k: number): void {
    const frameR = q(".boardframe", body).getBoundingClientRect();
    const gridR = q("#grid", body).getBoundingClientRect();
    const band = Math.max(0, (frameR.top - o.top) / k);
    const gx = (gridR.left - o.left) / k;
    const gy = (gridR.top - o.top) / k;
    setMask(fx, {
      image: `linear-gradient(#000,#000),radial-gradient(circle at ${CELL / 2}px ${CELL / 2}px,#000 0 ${HOLE_R}px,transparent ${HOLE_R}px)`,
      position: `0 0,${gx}px ${gy}px`,
      size: `100% ${band}px,${CELL}px ${CELL}px`,
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
    deps.onEnd({ kind, cells, run: variant.run, botId, variant });
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
    deps.onEnd({ kind: "forfeit", cells: [], run: variant.run, botId, variant });
  }

  /* ---- game lifecycle ---- */
  function newGame(): void {
    gameSeq++;
    if (wanderTimer) clearTimeout(wanderTimer);
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
    variant = variantById(id);
    win.setTitle(TITLES.boardVariant(variant.name));
    // maximized stays maximized; the new size lands on restore (layoutMax)
    if (!win.el.classList.contains("max")) win.el.style.width = `${windowWidth()}px`;
    newGame();
  }

  function setBot(id: string): void {
    if (id === botId) return;
    botId = id;
    newGame();
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
