/**
 * The desktop: icons, taskbar, Start menu, clock, rocket, idle watch.
 * Second law (DIRECTION.md): nothing is dead. Every icon launches, every
 * menu item does something, the clock genuinely keeps (its own) time.
 */

import { el, onPointerDrag, q } from "./dom.js";
import { ICONS, ROCKET, iconCanvas, px } from "./icons.js";
import { START_MENU } from "./copy.js";
import { play } from "./audio/index.js";
import { installTray } from "./sounds.js";
import { anchorX, deskHeight, deskWidth, onDeskResize, stageScale, taskbarH } from "./wm.js";

export interface DesktopApps {
  openBoard(): void;
  openFlames(): void;
  openMoves(): void;
  openBin(): void;
  openHelp(): void;
  openPieces(): void;
  openGames(): void;
  openUntitled(): void;
  openReadme(): void;
  openTerminal(): void;
  openGame(id: "mines" | "sol" | "snake" | "checkers" | "chess"): void;
  openSounds(): void;
  shutdown(): void;
}

/**
 * The clock string. Starts at 6:66 PM and keeps honest minutes from there;
 * fever adds `drift` minutes on top. Minutes past 59 are not a bug the clock
 * is aware of. Past tier 3 the caller shows "—:——" instead.
 */
export function clockText(elapsedMin: number, drift: number): string {
  const m = Math.min(99, 66 + elapsedMin + drift);
  return `6:${m} PM`;
}

export interface DeskIconSpec {
  rows: readonly string[];
  label: string;
  x: number;
  y: number;
  launch(): void;
  /** Fires when the user drops the icon somewhere new. */
  onMove?(x: number, y: number): void;
  /** Offered the drop first; return true to consume it (the icon left the desk). */
  onDrop?(ev: PointerEvent): boolean;
}

export interface DeskIcon {
  moveTo(x: number, y: number): void;
  remove(): void;
}

export interface Shell {
  tasksEl: HTMLElement;
  /** Set added clock minutes (fever's grip loosening). Negative hides the time. */
  setClockDrift(drift: number): void;
  /** Nudge desktop icons off-grid; an empty list restores them all. */
  shiftIcons(shifts: readonly (readonly [number, number])[]): void;
  /** Grow a new icon on the desk (things dragged out of folders land here). */
  addIcon(spec: DeskIconSpec): DeskIcon;
  onIdle(seconds: number, cb: () => void): void;
  onWake(cb: () => void): void;
  /** Any user input counts as activity — the idle watch reads this. */
  noteActivity(): void;
}

export function buildShell(stage: HTMLElement, apps: () => DesktopApps): Shell {
  /* ---- layers ---- */
  stage.appendChild(el(`<div id="smears"></div>`));
  stage.appendChild(el(`<div id="trail"></div>`));

  /* ---- icons ---- */
  const iconDefs = [
    { rows: ICONS.board, label: "BOARD.EXE", top: 22, launch: () => apps().openBoard() },
    { rows: ICONS.flame, label: "flames.scr", top: 122, launch: () => apps().openFlames() },
    { rows: ICONS.moves, label: "moves.txt", top: 222, launch: () => apps().openMoves() },
    { rows: ICONS.bin, label: "the rest", top: 322, launch: () => apps().openBin() },
    { rows: ICONS.folder, label: "games", top: 422, launch: () => apps().openGames() },
    { rows: ICONS.moves, label: "untitled.txt", top: 522, launch: () => apps().openUntitled() },
    { rows: ICONS.term, label: "COMMAND.COM", top: 622, launch: () => apps().openTerminal() },
  ];
  const iconEls: HTMLElement[] = [];
  function makeIcon(spec: DeskIconSpec): DeskIcon {
    const icon = el(`<div class="icon" style="left:${spec.x}px;top:${spec.y}px"></div>`);
    icon.appendChild(iconCanvas(spec.rows, 32));
    const lbl = el(`<span class="lbl"></span>`);
    lbl.textContent = spec.label;
    icon.appendChild(lbl);
    icon.addEventListener("click", (e) => e.stopPropagation());
    icon.addEventListener("dblclick", () => spec.launch());
    // icons drag like anything else on a real desktop; a finger-tap launches
    // outright, because a double-click asked of a touchscreen is a dead icon
    let moved = false;
    onPointerDrag(
      icon,
      (e) => {
        e.preventDefault();
        moved = false;
        iconEls.forEach((i) => i.classList.remove("sel"));
        icon.classList.add("sel");
        const k = stageScale();
        const sx = e.clientX / k - icon.offsetLeft;
        const sy = e.clientY / k - icon.offsetTop;
        return (ev: PointerEvent): void => {
          if (Math.hypot(ev.clientX / k - sx - icon.offsetLeft, ev.clientY / k - sy - icon.offsetTop) > 4)
            moved = true;
          if (!moved) return;
          icon.style.left = `${Math.round(ev.clientX / k - sx)}px`;
          icon.style.top = `${Math.round(ev.clientY / k - sy)}px`;
        };
      },
      (e, cancelled) => {
        if (moved) {
          if (!cancelled && spec.onDrop?.(e)) return;
          icon.dataset.dragged = "1"; // you put it there; a re-stage lets it be
          spec.onMove?.(icon.offsetLeft, icon.offsetTop);
        } else if (!cancelled && e.pointerType === "touch") spec.launch();
      },
    );
    stage.appendChild(icon);
    iconEls.push(icon);
    return {
      moveTo(x, y) {
        icon.style.left = `${x}px`;
        icon.style.top = `${y}px`;
      },
      remove() {
        icon.remove();
        const i = iconEls.indexOf(icon);
        if (i >= 0) iconEls.splice(i, 1);
      },
    };
  }
  for (const def of iconDefs)
    makeIcon({ rows: def.rows, label: def.label, x: 20, y: def.top, launch: def.launch });
  /* On a desk narrower than the authored 1280 (a phone), the left column
     disappears behind BOARD.EXE. The icons keep to the open ground instead —
     a row above the taskbar, where a thumb lives. Dragged icons stay put. */
  const layoutIcons = (): void => {
    iconEls.slice(0, iconDefs.length).forEach((icon, i) => {
      if (icon.dataset.dragged) return;
      if (deskWidth() < 1280) {
        icon.style.left = `${8 + (i % 6) * Math.max(80, Math.floor((deskWidth() - 16) / 6))}px`;
        icon.style.top = `${deskHeight() - taskbarH() - 100 - Math.floor(i / 6) * 96}px`;
      } else {
        icon.style.left = "20px";
        icon.style.top = `${iconDefs[i]!.top}px`;
      }
    });
  };
  layoutIcons();
  onDeskResize(layoutIcons);
  stage.addEventListener("click", (e) => {
    if (e.target === stage) iconEls.forEach((i) => i.classList.remove("sel"));
  });

  /* ---- the rocket: a pixel sprite that has escaped a window. Nobody
     comments, but it is real enough to drag around. ---- */
  const rocket = el(
    `<canvas class="pix rocket" width="12" height="18" style="position:absolute;top:40px;width:60px;height:90px;transform:rotate(30deg);z-index:20"></canvas>`,
  ) as HTMLCanvasElement;
  px(rocket, ROCKET);
  // it escaped toward the right edge, so that is the edge it keeps to
  let rocketPlaced = false;
  const placeRocket = (): void => {
    if (!rocketPlaced) rocket.style.left = `${anchorX(1010, "right")}px`;
  };
  placeRocket();
  onDeskResize(placeRocket);
  onPointerDrag(rocket, (e) => {
    e.preventDefault();
    rocketPlaced = true;
    const k = stageScale();
    const sx = e.clientX / k - rocket.offsetLeft;
    const sy = e.clientY / k - rocket.offsetTop;
    return (ev: PointerEvent): void => {
      rocket.style.left = `${Math.round(ev.clientX / k - sx)}px`;
      rocket.style.top = `${Math.round(ev.clientY / k - sy)}px`;
    };
  });
  stage.appendChild(rocket);

  /* ---- taskbar ---- */
  const taskbar = el(`<div id="taskbar"></div>`);
  const start = el(`<div id="start" class="btn"></div>`);
  start.appendChild(iconCanvas(ICONS.start, 16));
  start.appendChild(document.createTextNode("Start"));
  const tasksEl = el(`<div id="tasks"></div>`);
  const clock = el(`<div id="clock">6:66 PM</div>`);
  taskbar.append(start, tasksEl, clock);
  stage.appendChild(taskbar);
  installTray(taskbar, clock, () => apps().openSounds());

  /* ---- start menu ---- */
  const menu = el(`<div id="startmenu" class="bevel">
      <div class="banner">BOARD 95</div>
      <div class="inner"></div>
    </div>`);
  const inner = q(".inner", menu);
  const item = (label: string, act?: () => void, sub?: [string, () => void][]): HTMLElement => {
    const it = el(`<div></div>`);
    it.textContent = label;
    if (sub) {
      it.appendChild(el(`<span class="sub">▸</span>`));
      const s = el(`<div class="popup submenu"></div>`);
      for (const [l, a] of sub) {
        const si = el(`<div></div>`);
        si.textContent = l;
        si.addEventListener("click", (e) => {
          e.stopPropagation();
          play("click", 0.6);
          closeStart();
          a();
        });
        s.appendChild(si);
      }
      it.appendChild(s);
    } else if (act) {
      it.addEventListener("click", () => {
        play("click", 0.6);
        closeStart();
        act();
      });
    }
    return it;
  };
  inner.append(
    item(START_MENU.programs, undefined, [
      ["BOARD.EXE", () => apps().openBoard()],
      ["flames.scr", () => apps().openFlames()],
      ["MINES.EXE", () => apps().openGame("mines")],
      ["SOL.EXE", () => apps().openGame("sol")],
      ["SNAKE.EXE", () => apps().openGame("snake")],
      ["CHECKERS.EXE", () => apps().openGame("checkers")],
      ["CHESS.EXE", () => apps().openGame("chess")],
      ["COMMAND.COM", () => apps().openTerminal()],
    ]),
    item(START_MENU.documents, undefined, [
      ["moves.txt", () => apps().openMoves()],
      ["untitled.txt", () => apps().openUntitled()],
      ["readme.txt", () => apps().openReadme()],
      ["help.txt", () => apps().openHelp()],
    ]),
    item(START_MENU.settings, undefined, [
      ["pieces.ctl", () => apps().openPieces()],
      ["sounds.ctl", () => apps().openSounds()],
    ]),
    el(`<hr>`),
    item(START_MENU.help, () => apps().openHelp()),
    item(START_MENU.shutdown, () => apps().shutdown()),
  );
  stage.appendChild(menu);

  const closeStart = (): void => {
    menu.style.display = "none";
    start.classList.remove("down");
  };
  start.addEventListener("click", (e) => {
    e.stopPropagation();
    const opening = menu.style.display !== "block";
    play("menu", 0.7);
    menu.style.display = opening ? "block" : "none";
    start.classList.toggle("down", opening);
  });
  addEventListener("click", closeStart);

  /* ---- the clock keeps its own time ---- */
  const startedAt = Date.now();
  let drift = 0;
  const renderClock = (): void => {
    const elapsed = Math.floor((Date.now() - startedAt) / 60_000);
    clock.textContent = drift < 0 ? "—:——" : clockText(elapsed, drift);
  };
  setInterval(renderClock, 5_000);
  renderClock();

  /* ---- idle watch: the screensaver takes over on REAL idle ---- */
  let lastActivity = Date.now();
  let idle = false;
  const idleCbs: { seconds: number; cb: () => void }[] = [];
  const wakeCbs: (() => void)[] = [];
  const noteActivity = (): void => {
    lastActivity = Date.now();
    if (idle) {
      idle = false;
      wakeCbs.forEach((cb) => cb());
    }
  };
  // pointer events, not mouse events: a finger playing the whole game must
  // not read as an idle machine, or the screensaver takes the desktop mid-move
  for (const ev of ["pointermove", "pointerdown", "keydown"] as const)
    addEventListener(ev, noteActivity);
  setInterval(() => {
    if (idle) return;
    const quiet = (Date.now() - lastActivity) / 1000;
    for (const { seconds, cb } of idleCbs)
      if (quiet >= seconds) {
        idle = true;
        cb();
        break;
      }
  }, 1_000);

  return {
    tasksEl,
    addIcon: makeIcon,
    setClockDrift(d: number) {
      drift = d;
      renderClock();
    },
    shiftIcons(shifts) {
      iconEls.forEach((icon, i) => {
        const [dx, dy] = shifts[i] ?? [0, 0];
        icon.style.transform = `translate(${dx}px,${dy}px)`;
      });
    },
    onIdle: (seconds, cb) => idleCbs.push({ seconds, cb }),
    onWake: (cb) => wakeCbs.push(cb),
    noteActivity,
  };
}
