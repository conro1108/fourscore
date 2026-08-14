/**
 * The desktop: icons, taskbar, Start menu, clock, rocket, idle watch.
 * Second law (DIRECTION.md): nothing is dead. Every icon launches, every
 * menu item does something, the clock genuinely keeps (its own) time.
 */

import { el, q } from "./dom.js";
import { ICONS, ROCKET, iconCanvas, px } from "./icons.js";
import { START_MENU } from "./copy.js";
import { anchorX, onDeskResize, stageScale } from "./wm.js";

export interface DesktopApps {
  openBoard(): void;
  openFlames(): void;
  openMoves(): void;
  openBin(): void;
  openHelp(): void;
  openPieces(): void;
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

export interface Shell {
  tasksEl: HTMLElement;
  /** Set added clock minutes (fever's grip loosening). Negative hides the time. */
  setClockDrift(drift: number): void;
  /** Nudge desktop icons off-grid; [0,0]x4 restores. */
  shiftIcons(shifts: readonly (readonly [number, number])[]): void;
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
  ];
  const iconEls: HTMLElement[] = [];
  for (const def of iconDefs) {
    const icon = el(`<div class="icon" style="left:20px;top:${def.top}px"></div>`);
    icon.appendChild(iconCanvas(def.rows, 32));
    const lbl = el(`<span class="lbl"></span>`);
    lbl.textContent = def.label;
    icon.appendChild(lbl);
    icon.addEventListener("click", (e) => {
      e.stopPropagation();
      iconEls.forEach((i) => i.classList.remove("sel"));
      icon.classList.add("sel");
    });
    icon.addEventListener("dblclick", () => def.launch());
    stage.appendChild(icon);
    iconEls.push(icon);
  }
  stage.addEventListener("click", (e) => {
    if (e.target === stage) iconEls.forEach((i) => i.classList.remove("sel"));
  });

  /* ---- the rocket: a pixel sprite that has escaped a window. Nobody
     comments, but it is real enough to drag around. ---- */
  const rocket = el(
    `<canvas class="pix" width="12" height="18" style="position:absolute;top:40px;width:60px;height:90px;transform:rotate(30deg);z-index:20"></canvas>`,
  ) as HTMLCanvasElement;
  px(rocket, ROCKET);
  // it escaped toward the right edge, so that is the edge it keeps to
  let rocketPlaced = false;
  const placeRocket = (): void => {
    if (!rocketPlaced) rocket.style.left = `${anchorX(1010, "right")}px`;
  };
  placeRocket();
  onDeskResize(placeRocket);
  rocket.addEventListener("mousedown", (e) => {
    e.preventDefault();
    rocketPlaced = true;
    const k = stageScale();
    const sx = e.clientX / k - rocket.offsetLeft;
    const sy = e.clientY / k - rocket.offsetTop;
    const move = (ev: MouseEvent): void => {
      rocket.style.left = `${Math.round(ev.clientX / k - sx)}px`;
      rocket.style.top = `${Math.round(ev.clientY / k - sy)}px`;
    };
    const up = (): void => {
      removeEventListener("mousemove", move);
      removeEventListener("mouseup", up);
    };
    addEventListener("mousemove", move);
    addEventListener("mouseup", up);
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
          closeStart();
          a();
        });
        s.appendChild(si);
      }
      it.appendChild(s);
    } else if (act) {
      it.addEventListener("click", () => {
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
    ]),
    item(START_MENU.documents, undefined, [
      ["moves.txt", () => apps().openMoves()],
      ["help.txt", () => apps().openHelp()],
    ]),
    item(START_MENU.settings, undefined, [["pieces.ctl", () => apps().openPieces()]]),
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
  for (const ev of ["mousemove", "mousedown", "keydown"] as const)
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
