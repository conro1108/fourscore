/**
 * The fever, made visible: every subsystem here READS the director and
 * degrades the desktop accordingly (DIRECTION.md — legible, reversible,
 * never blocking play; comic-sinister, never crash-horror).
 *
 * Continuous: every fire burns hotter the whole way up, and the palette only
 * ever leans toward the white-hot ramp — at full lean it reads as butter, not
 * fire, so it never arrives (the lean caps at half).
 *
 * Discrete: tiers. Crossing one is an event — windows open on their own,
 * a dialog appears, the clock loses its grip, icons drift, and at 1.0 the
 * screensaver wins the desktop while the board stays playable on top.
 */

import { el } from "./dom.js";
import {
  COALS_OPTIONS,
  RAIN_OPTIONS,
  PALETTES,
  coalsStoke,
  makeFire,
  makeRoam,
  mixPalettes,
  pillarStoke,
  type Fire,
  type FireOptions,
} from "./fire.js";
import { DIALOG, TITLES } from "./copy.js";
import type { DirectorSnapshot } from "./director.js";
import type { Shell } from "./desktop.js";
import { stageScale, type AnchorX, type WM, type Win } from "./wm.js";
import type { EndResult } from "./board.js";

type Personality = "classic" | "coals" | "pillar" | "rain";

interface FireWindowGeom {
  x: number;
  y: number;
  /** Which edge of the desk x is measured from. Defaults right — the
      flames live in the desk's right margin, not at a fixed 1280 offset. */
  ax?: AnchorX;
  cw: number;
  ch: number;
  rw: number;
  rh: number;
}

/** Main preview geometry per tier — the mock's tuned numbers (01-inferno). */
const MAIN_GEOM: readonly FireWindowGeom[] = [
  { x: 912, y: 428, cw: 296, ch: 190, rw: 100, rh: 64 },
  { x: 872, y: 396, cw: 336, ch: 224, rw: 112, rh: 75 },
  { x: 760, y: 300, cw: 436, ch: 292, rw: 145, rh: 97 },
  { x: 700, y: 300, cw: 500, ch: 330, rw: 166, rh: 110 },
];

/** The win's fireplace (02-win's finale beat). */
const WIN_GEOM: FireWindowGeom = { x: 772, y: 330, cw: 436, ch: 292, rw: 145, rh: 97 };

const ROAM_ANCHOR: readonly AnchorX[] = ["left", "center", "right"];

const ICON_SHIFT_T3 = [[3, -2], [-2, 3], [1, 2], [-3, -1], [2, -3]] as const;
const ICON_SHIFT_T4 = [[6, -4], [-5, 6], [3, 5], [-7, -2], [5, 4]] as const;
const CLOCK_DRIFT = [0, 1, 5, 22, -1] as const;

export interface Effects {
  apply(s: DirectorSnapshot): void;
  gameEvent(kind: EndResult["kind"]): void;
  /** The moment a game ends, crossings stop talking (the endgame has the mic). */
  setGameOver(): void;
  setOpponent(botId: string): void;
  newGame(): void;
  openFlames(): void;
  /** The screensaver wins the desktop — fever 1.0 and real idle both land here. */
  takeover(on: boolean): void;
}

export function makeEffects(deps: { wm: WM; shell: Shell; stage: HTMLElement; boardWin: () => Win | undefined }): Effects {
  const { wm, shell, stage } = deps;

  /* ---- the main flames.scr preview ---- */
  let mainWin: Win | null = null;
  let mainCanvas: HTMLCanvasElement | null = null;
  let mainFire: Fire | null = null;
  let personality: Personality = "classic";
  let opponentId = "moss";
  let tier = 0;
  let fever = 0;
  let wonGeom = false;
  /** After a game ends the endgame owns the dialogs; crossings stay mute. */
  let gameOver = false;

  function fireWindow(
    id: string,
    title: string,
    geom: FireWindowGeom,
    opts: FireOptions,
  ): { win: Win; canvas: HTMLCanvasElement; fire: Fire } {
    const body = el(`<div></div>`);
    const frame = el(`<div class="sunken" style="margin:3px;background:#000"></div>`);
    const canvas = el(
      `<canvas class="pix" width="${geom.rw}" height="${geom.rh}" style="width:${geom.cw}px;height:${geom.ch}px"></canvas>`,
    ) as HTMLCanvasElement;
    frame.appendChild(canvas);
    body.appendChild(frame);
    const win = wm.open({
      id,
      title,
      x: geom.x,
      y: geom.y,
      ax: geom.ax ?? "right",
      w: geom.cw + 12,
      body,
      buttons: ["close"],
      onClose: () => {
        /* fires stopped by caller via close hooks below */
      },
    });
    const fire = makeFire(canvas, opts);
    fire.start();
    return { win, canvas, fire };
  }

  function ensureMain(): void {
    if (mainWin?.isOpen()) return;
    const made = fireWindow("flames", TITLES.flames, MAIN_GEOM[0]!, {});
    mainWin = made.win;
    mainCanvas = made.canvas;
    mainFire = made.fire;
    applyPersonality();
    applyGeometry();
    applyHeat();
  }

  /** Continuous heat, scaled by fever — the mock's params(). */
  const heatParams = (extra: { dBase?: number; dInt?: number; dCool?: number } = {}): FireOptions => ({
    baseHeat: Math.round(36 + fever * 12 + (extra.dBase ?? 0)),
    cool: 3 - fever * 0.5 + (extra.dCool ?? 0),
    interval: Math.round(90 - fever * 35 + (extra.dInt ?? 0)),
    palette:
      fever < 0.5 ? PALETTES.classic : mixPalettes(PALETTES.classic, PALETTES.inferno, fever - 0.5),
  });

  function applyHeat(): void {
    if (!mainFire) return;
    if (personality === "classic") mainFire.set(heatParams());
    extras.forEach((e) => e.fire.set(heatParams(e.d)));
    if (saverFire) saverFire.set({ ...heatParams(), baseHeat: 56, cool: 2.2, interval: 55 });
  }

  function applyPersonality(): void {
    if (!mainFire) return;
    switch (personality) {
      case "classic":
        mainFire.set({ stoke: null, flip: false, ...heatParams() });
        break;
      case "coals":
        mainFire.set({ ...COALS_OPTIONS, stoke: coalsStoke(), flip: false });
        break;
      case "pillar":
        mainFire.set({ palette: PALETTES.classic, cool: 2.1, interval: 80, stoke: pillarStoke(), flip: false });
        break;
      case "rain":
        mainFire.set({ ...RAIN_OPTIONS, stoke: null });
        break;
    }
    mainFire.start();
  }

  function applyGeometry(): void {
    if (!mainWin?.isOpen() || !mainCanvas || !mainFire) return;
    const g = wonGeom ? WIN_GEOM : MAIN_GEOM[Math.min(tier, 3)]!;
    mainWin.moveTo(g.x, g.y);
    mainWin.el.style.width = `${g.cw + 12}px`;
    mainCanvas.style.width = `${g.cw}px`;
    mainCanvas.style.height = `${g.ch}px`;
    mainFire.resize(g.rw, g.rh);
    for (let i = 0; i < 20; i++) mainFire.step();
    mainFire.start();
  }

  /* ---- the previews nobody opened ---- */
  const extras: { win: Win; fire: Fire; d: { dBase: number; dInt: number; dCool: number } }[] = [];
  function openExtra(n: number, geom: FireWindowGeom, opts: FireOptions, d: { dBase: number; dInt: number; dCool: number }): void {
    const id = `flames-${n}`;
    if (wm.get(id)?.isOpen()) return;
    const made = fireWindow(id, TITLES.flamesN(n), geom, { ...opts, ...heatParams(d) });
    extras.push({ win: made.win, fire: made.fire, d });
  }
  function closeExtras(): void {
    for (const e of extras) {
      e.fire.stop();
      if (e.win.isOpen()) e.win.close();
    }
    extras.length = 0;
  }

  /* ---- roam.scr: one fire, three windows, focus follows it ---- */
  let roam: { start(): void; stop(): void } | null = null;
  let roamWins: Win[] = [];
  function openRoam(): void {
    if (roam) return;
    const canvases: HTMLCanvasElement[] = [];
    roamWins = [0, 1, 2].map((i) => {
      const body = el(`<div></div>`);
      const frame = el(`<div class="sunken" style="margin:3px;background:#000"></div>`);
      const canvas = el(
        `<canvas class="pix" width="100" height="50" style="width:296px;height:148px"></canvas>`,
      ) as HTMLCanvasElement;
      frame.appendChild(canvas);
      body.appendChild(frame);
      canvases.push(canvas);
      return wm.open({
        id: `roam-${i}`,
        title: TITLES.roamN(i + 1),
        x: 116 + i * 324,
        y: 566,
        ax: ROAM_ANCHOR[i]!,
        ay: "bottom",
        body,
        w: 308,
        buttons: ["close"],
      });
    });
    roam = makeRoam(canvases, (i) => {
      const w = roamWins[i];
      if (w?.isOpen()) w.focus();
    });
    roam.start();
  }
  function closeRoam(): void {
    roam?.stop();
    roam = null;
    for (const w of roamWins) if (w.isOpen()) w.close();
    roamWins = [];
  }

  /* ---- smears: a dragged window leaves un-repainted copies of itself ---- */
  const smearsEl = (): HTMLElement => stage.querySelector<HTMLElement>("#smears")!;
  const lastSmearAt = new Map<string, [number, number]>();
  wm.onDrag((win, x, y) => {
    if (tier < 2) return;
    const last = lastSmearAt.get(win.id);
    if (last && Math.hypot(x - last[0], y - last[1]) < 70) return;
    lastSmearAt.set(win.id, [x, y]);
    if (!last) return; // the first sample sets the anchor, not a smear
    const ghost = win.el.cloneNode(true) as HTMLElement;
    ghost.style.pointerEvents = "none";
    ghost.style.zIndex = "0";
    const host = smearsEl();
    host.appendChild(ghost);
    while (host.children.length > 40) host.firstElementChild!.remove();
  });

  /* ---- the cursor's past selves ---- */
  const trailEl = (): HTMLElement => stage.querySelector<HTMLElement>("#trail")!;
  const cursorPast: [number, number][] = [];
  addEventListener("mousemove", (e) => {
    const r = stage.getBoundingClientRect();
    const k = stageScale();
    cursorPast.push([(e.clientX - r.left) / k, (e.clientY - r.top) / k]);
    if (cursorPast.length > 24) cursorPast.shift();
  });
  setInterval(() => {
    const count = tier >= 3 ? 6 : tier >= 2 ? 4 : tier >= 1 ? 2 : 0;
    const host = trailEl();
    if (!count) {
      if (host.childElementCount) host.innerHTML = "";
      return;
    }
    // stepped, not smooth: ghosts of where the cursor was, repainted at 12fps
    const pts = cursorPast.filter((_, i) => i % 3 === 0).slice(-count);
    host.innerHTML = pts
      .map(
        ([x, y], i) =>
          `<div class="cur" style="left:${x}px;top:${y}px;opacity:${(i + 1) / (pts.length + 1)}"></div>`,
      )
      .join("");
  }, 90);

  /* ---- the screensaver wins the desktop ---- */
  let saverEl: HTMLElement | null = null;
  let saverFire: Fire | null = null;
  let takenOver = false;
  let fadeTimers: ReturnType<typeof setTimeout>[] = [];
  const stopFade = (): void => {
    for (const t of fadeTimers) clearTimeout(t);
    fadeTimers = [];
  };
  /** The fever letting go is a retreat, in steps; your mouse dismissing it is
      a cut. Neither eases — the timing law holds even here. */
  function hideSaver(fade: boolean): void {
    if (!saverEl) return;
    const el2 = saverEl;
    if (!fade) {
      el2.style.display = "none";
      el2.style.opacity = "1";
      saverFire?.stop();
      return;
    }
    [0.75, 0.5, 0.25, 0].forEach((o, i) => {
      fadeTimers.push(
        setTimeout(() => {
          el2.style.opacity = String(o);
          if (o === 0) {
            el2.style.display = "none";
            el2.style.opacity = "1";
            saverFire?.stop();
          }
        }, (i + 1) * 110),
      );
    });
  }
  function takeover(on: boolean, fade = false): void {
    if (on === takenOver) return;
    takenOver = on;
    stopFade();
    if (on) {
      if (!saverEl) {
        saverEl = el(`<div id="saver"><canvas class="pix" width="320" height="200"></canvas></div>`);
        stage.appendChild(saverEl);
      }
      saverEl.style.display = "block";
      saverEl.style.opacity = "1";
      if (!saverFire) saverFire = makeFire(saverEl.querySelector("canvas")!);
      saverFire.set({
        baseHeat: 56,
        cool: 2.2,
        interval: 55,
        palette: mixPalettes(PALETTES.classic, PALETTES.inferno, 0.5),
      });
      saverFire.start();
      mainFire?.stop();
      // the board stays playable on top of it
      const board = deps.boardWin();
      if (board?.isOpen()) {
        board.el.style.zIndex = "250";
        board.focus();
        board.el.style.zIndex = "250";
      }
    } else {
      hideSaver(fade);
      const board = deps.boardWin();
      if (board?.isOpen()) {
        board.el.style.zIndex = "";
        board.focus();
      }
      if (mainWin?.isOpen()) {
        mainFire?.start();
      }
    }
  }

  /* ---- tier-crossing dialogs: trouble arrives all over the desktop ---- */
  let crossingDialogs: Win[] = [];
  const NOT_RESPONDING = {
    title: "FOURSCORE.EXE — not responding (it is)",
    body: "This program is running normally.<br>Do not be concerned by the flames.",
    buttons: ["OK", "OK"] as const,
  };
  function crossInto(t: number): void {
    ensureMain(); // windows open on their own
    if (t === 1 && !gameOver)
      crossingDialogs.push(wm.dialog({ ...NOT_RESPONDING, x: 750, y: 140, ax: "center", w: 372 }));
    if (t === 2) {
      if (!gameOver)
        crossingDialogs.push(
          wm.dialog({ title: "Display", body: "Something is warm behind this window.", x: 806, y: 210, ax: "center" }),
        );
      openExtra(2, { x: 986, y: 48, cw: 240, ch: 150, rw: 80, rh: 50 }, { wind: (t2) => Math.sin(t2 * 0.06) * 1.4 }, { dBase: -4, dInt: 0, dCool: 0.4 });
    }
    if (t === 3) {
      if (!gameOver)
        crossingDialogs.push(
          wm.dialog({ title: "System", icon: "!", body: DIALOG.screensaverEarly.body, buttons: ["OK", "OK"], x: 780, y: 330, ax: "center" }),
        );
      openExtra(3, { x: 26, y: 436, ax: "left", cw: 200, ch: 132, rw: 67, rh: 44 }, {}, { dBase: -8, dInt: 15, dCool: 0.7 });
      openRoam();
    }
  }

  function applyTier(t: number): void {
    const prev = tier;
    tier = t;
    shell.setClockDrift(CLOCK_DRIFT[t]!);
    shell.shiftIcons(t >= 4 ? ICON_SHIFT_T4 : t >= 3 ? ICON_SHIFT_T3 : [[0, 0], [0, 0], [0, 0], [0, 0], [0, 0]]);
    if (t > prev) for (let c = prev + 1; c <= t; c++) crossInto(c);
    // Coming down after a game the desktop keeps its litter — the windows the
    // fever opened stay open, and the next game is what clears them. Only the
    // screensaver lets go on its own, because it's the one thing covering the
    // board.
    if (!gameOver) {
      if (t < 3) closeRoam();
      if (t < 2 && prev >= 2) {
        closeExtras();
        smearsEl().innerHTML = "";
      }
    }
    takeover(t >= 4, true);
    if (!wonGeom) applyGeometry();
  }

  return {
    apply(s) {
      fever = s.fever;
      if (s.tier !== tier) applyTier(s.tier);
      applyHeat();
    },
    setGameOver() {
      gameOver = true;
    },
    gameEvent(kind) {
      gameOver = true;
      if (kind === "win") {
        wonGeom = true;
        personality = "classic";
        ensureMain();
        applyPersonality();
        applyGeometry();
        if (mainFire) mainFire.set({ baseHeat: 50, cool: 2.6, interval: 65 });
      } else if (kind === "loss") {
        personality = "coals";
        ensureMain();
        applyPersonality();
      } else if (kind === "draw") {
        personality = "rain";
        ensureMain();
        applyPersonality();
      }
    },
    setOpponent(botId) {
      opponentId = botId;
      if (personality === "classic" || personality === "pillar") {
        personality = botId === "oracle" ? "pillar" : "classic";
        if (mainFire) applyPersonality();
      }
    },
    newGame() {
      wonGeom = false;
      gameOver = false;
      personality = opponentId === "oracle" ? "pillar" : "classic";
      for (const d of crossingDialogs) if (d.isOpen()) d.close();
      crossingDialogs = [];
      closeRoam();
      closeExtras();
      smearsEl().innerHTML = "";
      lastSmearAt.clear();
      if (mainWin?.isOpen()) {
        applyPersonality();
        applyGeometry();
      }
    },
    openFlames() {
      if (mainWin?.isOpen()) mainWin.focus();
      else {
        mainWin = null;
        ensureMain();
      }
    },
    takeover: (on) => takeover(on),
  };
}
