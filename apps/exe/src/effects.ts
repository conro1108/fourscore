/**
 * The fever made visible: reads the director and degrades the desktop
 * (see DIRECTION.md § fever — reversible, never blocking play). Continuous:
 * heat scales with fever, palette lean capped at half. Discrete: tier
 * crossings open windows/dialogs; at tier 4 the saver takes the desktop.
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
import { BEAT_DIALOGS, BEAT_NOTES, BEAT_TITLES, DIALOG, TITLES } from "./copy.js";
import { BEAT_ACTS, pickAct, poolKey, type BeatAct } from "./beats.js";
import type { Beat, DirectorSnapshot } from "./director.js";
import type { Shell } from "./desktop.js";
import { anchorX, anchorY, deskHeight, deskWidth, stageScale, taskbarH, type AnchorX, type WM, type Win } from "./wm.js";
import { play } from "./audio/index.js";
import type { EndResult } from "./board.js";
import type { MovesPad } from "./notepad.js";

type Personality = "classic" | "coals" | "pillar" | "rain";

interface FireWindowGeom {
  x: number;
  y: number;
  /** Edge x is measured from. Defaults right (the desk's right margin). */
  ax?: AnchorX;
  cw: number;
  ch: number;
  rw: number;
  rh: number;
}

/** Main preview geometry per tier. */
const MAIN_GEOM: readonly FireWindowGeom[] = [
  { x: 912, y: 428, cw: 296, ch: 190, rw: 100, rh: 64 },
  { x: 872, y: 396, cw: 336, ch: 224, rw: 112, rh: 75 },
  { x: 760, y: 300, cw: 436, ch: 292, rw: 145, rh: 97 },
  { x: 700, y: 300, cw: 500, ch: 330, rw: 166, rh: 110 },
];

/** The win's fireplace. */
const WIN_GEOM: FireWindowGeom = { x: 772, y: 330, cw: 436, ch: 292, rw: 145, rh: 97 };

const ROAM_ANCHOR: readonly AnchorX[] = ["left", "center", "right"];

const ICON_SHIFT_T3 = [[3, -2], [-2, 3], [1, 2], [-3, -1], [2, -3], [-1, 2]] as const;
const ICON_SHIFT_T4 = [[6, -4], [-5, 6], [3, 5], [-7, -2], [5, 4], [-4, -5]] as const;
/** A flinch: bigger than either tier shift, and reverts. */
const ICON_TWITCH = [[-9, 5], [7, -6], [-4, -8], [9, 3], [-6, 7], [5, -9]] as const;
const CLOCK_DRIFT = [0, 1, 5, 22, -1] as const;

/** Rough beat-dialog height; only used to test for landing on the board. */
const DIALOG_H = 108;
const TASKBAR_H = 36; // chrome only; taskbarH() adds the phone's home-bar inset

/** The self-opening preview: left margin, clear of the board and MAIN_GEOM. */
const BLINK_GEOM: FireWindowGeom = { x: 34, y: 250, ax: "left", cw: 208, ch: 138, rw: 69, rh: 46 };

export interface Effects {
  apply(s: DirectorSnapshot): void;
  /** Answer one ply. `force` names an act for the harness; live play draws. */
  beat(b: Beat, force?: BeatAct): void;
  gameEvent(kind: EndResult["kind"]): void;
  /** Game over: crossings go mute (the endgame has the mic). */
  setGameOver(): void;
  /** Ending left: fire back to ordinary personality/geometry, litter tidies. */
  endingDismissed(): void;
  setOpponent(botId: string): void;
  newGame(): void;
  openFlames(): void;
  /** Screensaver takes the desktop — fever 1.0 and real idle both land here. */
  takeover(on: boolean): void;
}

export function makeEffects(deps: {
  wm: WM;
  shell: Shell;
  stage: HTMLElement;
  boardWin: () => Win | undefined;
  /** Variant-aware board title, for restoring after a title-slip. */
  boardTitle: () => string;
  notepad: MovesPad;
  /** Injected for deterministic beats in tests and shots. */
  rng?: () => number;
}): Effects {
  const { wm, shell, stage } = deps;
  const rng = deps.rng ?? Math.random;

  /* ---- the main flames.scr preview ---- */
  let mainWin: Win | null = null;
  let mainCanvas: HTMLCanvasElement | null = null;
  let mainFire: Fire | null = null;
  let personality: Personality = "classic";
  let opponentId = "moss";
  let tier = 0;
  let fever = 0;
  let wonGeom = false;
  /** Endgame owns the dialogs; crossings stay mute. */
  let gameOver = false;
  /** Ending left: still no beats/crossings, but the litter may tidy. */
  let dismissed = false;

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
        /* fires stopped by caller */
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

  /** Continuous heat, scaled by fever. */
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
  /* ---- tidy: litter goes one item per beat, newest first; anything the
     current tier still justifies stays until the fever cools. ---- */
  let litterTimer: ReturnType<typeof setTimeout> | null = null;
  const TIDY_BEAT = 1300;
  function stopTidy(): void {
    if (litterTimer) clearTimeout(litterTimer);
    litterTimer = null;
  }
  function tidyStep(): void {
    litterTimer = null;
    // nothing tidies under a running ending; leaving it resumes the loop
    if (gameOver && !dismissed) return;
    const again = (): void => {
      litterTimer = setTimeout(tidyStep, TIDY_BEAT);
    };
    // crossing dialogs go first
    if (dismissed) {
      const d = crossingDialogs.pop();
      if (d) {
        if (d.isOpen()) d.close();
        again();
        return;
      }
    }
    if (tier < 3) {
      const w = [...roamWins].reverse().find((rw) => rw.isOpen());
      if (w) {
        // the last porthole's onClose shuts roam down
        w.close();
        again();
        return;
      }
    }
    if (tier < 2) {
      const e = extras.pop();
      if (e) {
        e.fire.stop();
        if (e.win.isOpen()) e.win.close();
        again();
        return;
      }
      const host = smearsEl();
      if (host.children.length) {
        // smears go by the handful; forty one-per-beat would outlast the game
        const n = Math.max(4, Math.ceil(host.children.length / 3));
        for (let i = 0; i < n && host.lastElementChild; i++) host.lastElementChild.remove();
        if (!host.children.length) lastSmearAt.clear();
        again();
        return;
      }
    }
    // the rest is earned by this tier; check back later
    if (
      roamWins.some((rw) => rw.isOpen()) ||
      extras.length ||
      smearsEl().children.length ||
      crossingDialogs.length
    )
      again();
  }
  function tidyLitter(): void {
    stopTidy();
    litterTimer = setTimeout(tidyStep, TIDY_BEAT);
  }

  /* ---- roam.scr: one fire, three windows, focus follows it ---- */
  let roam: { start(): void; stop(): void } | null = null;
  let roamWins: Win[] = [];
  /** Desk px per fire px (css size / resolution). */
  const ROAM_SCALE = 296 / 100;
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
        onClose: () => {
          if (roam && roamWins.every((w) => !w.isOpen())) closeRoam();
        },
      });
    });
    // live positions: dragging moves a porthole, closing/minimizing removes it
    const views = (): { canvas: HTMLCanvasElement; x: number; index: number }[] => {
      const sr = stage.getBoundingClientRect();
      const k = stageScale();
      const out: { canvas: HTMLCanvasElement; x: number; index: number }[] = [];
      roamWins.forEach((w, i) => {
        if (!w.isOpen() || w.el.style.display === "none") return;
        const r = canvases[i]!.getBoundingClientRect();
        out.push({ canvas: canvases[i]!, x: Math.round((r.left - sr.left) / k / ROAM_SCALE), index: i });
      });
      return out;
    };
    roam = makeRoam(Math.ceil(deskWidth() / ROAM_SCALE), 50, views, (i) => {
      const w = roamWins[i];
      if (w?.isOpen()) w.focus();
    });
    roam.start();
  }
  function closeRoam(): void {
    roam?.stop();
    roam = null;
    const wins = roamWins;
    roamWins = [];
    for (const w of wins) if (w.isOpen()) w.close();
  }

  /* ---- smears: an un-repainted copy of a window ---- */
  const smearsEl = (): HTMLElement => stage.querySelector<HTMLElement>("#smears")!;

  /** A window's ghost. `#smears` is z 35, under every window (chrome.css),
      and pointer-events:none, so a ghost can't get between you and the grid. */
  function ghostOf(w: HTMLElement, dx = 0, dy = 0): HTMLElement {
    const ghost = w.cloneNode(true) as HTMLElement;
    ghost.style.pointerEvents = "none";
    ghost.style.zIndex = "0";
    ghost.style.transform = dx || dy ? `translate(${dx}px,${dy}px)` : "";
    // a cloned canvas is blank; carry the bitmap across
    const from = w.querySelectorAll<HTMLCanvasElement>("canvas");
    ghost.querySelectorAll<HTMLCanvasElement>("canvas").forEach((c, i) => {
      const src = from[i];
      if (!src || !src.width || !src.height) return;
      try {
        c.getContext("2d")?.drawImage(src, 0, 0);
      } catch {
        /* blank is still a ghost */
      }
    });
    return ghost;
  }

  /* ---- drag smears ---- */
  const lastSmearAt = new Map<string, [number, number]>();
  wm.onDrag((win, x, y) => {
    driftOff(win.el);
    if (tier < 2) return;
    const last = lastSmearAt.get(win.id);
    if (last && Math.hypot(x - last[0], y - last[1]) < 70) return;
    lastSmearAt.set(win.id, [x, y]);
    if (!last) return; // first sample is the anchor
    const host = smearsEl();
    host.appendChild(ghostOf(win.el));
    while (host.children.length > 40) host.firstElementChild!.remove();
  });

  /* ---- ambient drift: past mid tier 2 windows wander and leave smears.
     Rules: it is a `transform`, never left/top (wm owns those; clearing is
     exact). The board never drifts, nor any window whose rect grown by
     DRIFT_MAX could reach it (a drifted window over the grid eats clicks).
     The focused window holds still; pointerdown clears the offset before the
     wm's drag reads offsetLeft. Stepped at DRIFT_TICK, all numbers are
     functions of fever, none of it at fever 0. */
  const DRIFT_TICK = 90;
  /** Tier 2 starts at 0.5; drift opens just inside it. */
  const DRIFT_FLOOR = 0.45;
  /** Wander px at fever 1 (44 peak to peak). At 14 the ghost never cleared
      its window and read as a doubled edge, not a trail. */
  const DRIFT_MAX = 22;
  /** Gain per step to full drift, so releasing a window doesn't fling it. */
  const DRIFT_RAMP = 0.2;
  /** Px of wander between smears. */
  const SMEAR_STEP = 6;
  /** Ghost fades in four steps, ~2s: enough for 3-4 along the path (a trail),
      not so long that forty pile into mush. */
  const SMEAR_FADE = 500;
  const SMEAR_STEPS = [0.7, 0.45, 0.2, 0] as const;
  const AMBIENT_SMEARS = 16;

  interface Drifter {
    phase: number;
    gain: number;
    /** Offset of the last ghost. */
    sx: number;
    sy: number;
  }
  const drifters = new WeakMap<HTMLElement, Drifter>();
  let drifterSeq = 0;
  let driftClock = 0;
  let ambientSmears = 0;

  const drifterOf = (w: HTMLElement): Drifter => {
    let d = drifters.get(w);
    if (!d) {
      // a phase per window
      d = { phase: drifterSeq++ * 2.399, gain: 0, sx: 0, sy: 0 };
      drifters.set(w, d);
    }
    return d;
  };

  /** Clear a window's drift. */
  function driftOff(w: HTMLElement): void {
    const d = drifters.get(w);
    if (d) {
      d.gain = 0;
      d.sx = 0;
      d.sy = 0;
    }
    if (w.style.transform) w.style.transform = "";
  }

  /** 0 below the floor, 1 at fever 1; 0 flat while an ending is running. */
  function driftAmount(): number {
    if (gameOver && !dismissed) return 0;
    return Math.max(0, Math.min(1, (fever - DRIFT_FLOOR) / (1 - DRIFT_FLOOR)));
  }

  /** At full drift, does this window still miss the board? */
  function missesBoard(w: HTMLElement, b: HTMLElement | null): boolean {
    if (!b) return true;
    if (w === b) return false;
    const m = DRIFT_MAX + 2;
    return (
      w.offsetLeft + w.offsetWidth + m <= b.offsetLeft ||
      w.offsetLeft >= b.offsetLeft + b.offsetWidth + m ||
      w.offsetTop + w.offsetHeight + m <= b.offsetTop ||
      w.offsetTop >= b.offsetTop + b.offsetHeight + m
    );
  }

  function fadeGhost(ghost: HTMLElement): void {
    ambientSmears++;
    SMEAR_STEPS.forEach((o, i) =>
      setTimeout(
        () => {
          if (o > 0) {
            ghost.style.opacity = String(o);
            return;
          }
          // exactly one decrement per ghost, or the budget leaks and drift goes silent
          ghost.remove();
          ambientSmears--;
        },
        (i + 1) * SMEAR_FADE,
      ),
    );
  }

  // clear the offset before the wm's drag handler measures the element
  stage.addEventListener(
    "pointerdown",
    (e) => {
      const w = (e.target as HTMLElement | null)?.closest<HTMLElement>(".win");
      if (w?.parentElement === stage) driftOff(w);
    },
    true,
  );

  setInterval(() => {
    driftClock++;
    const amp = driftAmount() * DRIFT_MAX;
    const board = deps.boardWin();
    const boardEl = board?.isOpen() ? board.el : null;
    const focused = wm.focused()?.el;
    const host = smearsEl();
    // `:scope >` on purpose: #smears holds .win clones; don't drift ghosts
    for (const w of stage.querySelectorAll<HTMLElement>(":scope > .win")) {
      const d = drifterOf(w);
      const eligible =
        amp > 0 &&
        w !== boardEl &&
        w !== focused &&
        w.style.display !== "none" &&
        !w.classList.contains("max") &&
        missesBoard(w, boardEl);
      if (!eligible) {
        if (d.gain > 0 || w.style.transform) driftOff(w);
        continue;
      }
      d.gain = Math.min(1, d.gain + DRIFT_RAMP);
      const k = amp * d.gain;
      const dx = Math.round(k * Math.sin(driftClock * 0.055 + d.phase));
      const dy = Math.round(k * 0.55 * Math.sin(driftClock * 0.037 + d.phase * 1.7));
      w.style.transform = dx || dy ? `translate(${dx}px,${dy}px)` : "";
      if (Math.hypot(dx - d.sx, dy - d.sy) >= SMEAR_STEP) {
        // the ghost is left where the window was
        if (ambientSmears < AMBIENT_SMEARS) {
          const ghost = ghostOf(w, d.sx, d.sy);
          host.appendChild(ghost);
          fadeGhost(ghost);
        }
        d.sx = dx;
        d.sy = dy;
      }
    }
  }, DRIFT_TICK);

  /* ---- cursor trail ---- */
  const trailEl = (): HTMLElement => stage.querySelector<HTMLElement>("#trail")!;
  const cursorPast: [number, number][] = [];
  addEventListener("pointermove", (e) => {
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
    // stepped, ~12fps
    const pts = cursorPast.filter((_, i) => i % 3 === 0).slice(-count);
    host.innerHTML = pts
      .map(
        ([x, y], i) =>
          `<div class="cur" style="left:${x}px;top:${y}px;opacity:${(i + 1) / (pts.length + 1)}"></div>`,
      )
      .join("");
  }, 90);

  /* ---- screensaver takeover ---- */
  let saverEl: HTMLElement | null = null;
  let saverFire: Fire | null = null;
  let takenOver = false;
  let fadeTimers: ReturnType<typeof setTimeout>[] = [];
  const stopFade = (): void => {
    for (const t of fadeTimers) clearTimeout(t);
    fadeTimers = [];
  };
  /** Fever letting go: stepped fade. Mouse dismissal: a cut. Never eased. */
  function hideSaver(fade: boolean): void {
    if (!saverEl) return;
    const el2 = saverEl;
    // release the saver band with the picture, not before
    const gone = (): void => {
      el2.style.display = "none";
      el2.style.opacity = "1";
      saverFire?.stop();
      wm.setSaverActive(false);
    };
    if (!fade) {
      gone();
      return;
    }
    [0.75, 0.5, 0.25, 0].forEach((o, i) => {
      fadeTimers.push(
        setTimeout(() => {
          el2.style.opacity = String(o);
          if (o === 0) gone();
        }, (i + 1) * 110),
      );
    });
  }
  function takeover(on: boolean, fade = false): void {
    if (on === takenOver) return;
    takenOver = on;
    play("saver-thunk", on ? 0.9 : 0.5);
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
      // the board stays playable on top via a wm-owned band. Don't focus or
      // raise anything here: it would shuffle the board over the win finale.
      wm.setSaverActive(true);
    } else {
      hideSaver(fade);
      if (mainWin?.isOpen()) {
        mainFire?.start();
      }
    }
  }

  /* ---- tier-crossing dialogs ---- */
  let crossingDialogs: Win[] = [];
  const NOT_RESPONDING = {
    title: "FOURSCORE.EXE — not responding (it is)",
    body: "This program is running normally.<br>Do not be concerned by the flames.",
    buttons: ["OK", "OK"] as const,
  };
  function crossInto(t: number): void {
    play("tier-cross", 0.8);
    ensureMain();
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

  /* ---- beats: every act is reversible and puts itself back; only
     `applyTier` may leave the desktop altered. Instant or stepped, never eased. */
  let beatTimers: ReturnType<typeof setTimeout>[] = [];
  let lastAct: BeatAct | null = null;
  /** Rotation cursor per pool; deterministic on purpose. */
  const rotation = new Map<string, number>();
  let beatDialogs: Win[] = [];

  const beatLater = (fn: () => void, ms: number): void => {
    beatTimers.push(setTimeout(fn, ms));
  };
  function clearBeats(): void {
    for (const t of beatTimers) clearTimeout(t);
    beatTimers = [];
    for (const d of beatDialogs) if (d.isOpen()) d.close();
    beatDialogs = [];
    rotation.clear();
    lastAct = null;
    // return whatever an act borrowed
    shell.setClockDrift(CLOCK_DRIFT[Math.min(tier, 4)]!);
    shell.shiftIcons(tier >= 4 ? ICON_SHIFT_T4 : tier >= 3 ? ICON_SHIFT_T3 : []);
    restoreTitle();
    applyHeat();
  }

  /** Next entry of a rotating list, or undefined if empty. */
  function nextOf<T>(key: string, list: readonly T[] | undefined): T | undefined {
    if (!list || list.length === 0) return undefined;
    const i = rotation.get(key) ?? 0;
    rotation.set(key, i + 1);
    return list[i % list.length];
  }

  const restoreTitle = (): void => {
    const board = deps.boardWin();
    if (board?.isOpen()) board.setTitle(deps.boardTitle());
  };

  /**
   * Keep a beat dialog off the board: it has real pointer events and would eat
   * the drop. The authored spot is used when clear; otherwise moved (below,
   * then above, then the wider shoulder) — a Connect 7 window is 852px wide
   * where Connect 4's is 480, so authored margins often aren't. Deterministic.
   */
  function clearOfBoard(spec: { x: number; y: number; ax?: AnchorX; ay?: "top" | "bottom"; w: number }): {
    x: number;
    y: number;
    ax?: AnchorX;
    ay?: "top" | "bottom";
  } {
    const board = deps.boardWin();
    if (!board?.isOpen()) return spec;
    const b = {
      left: board.el.offsetLeft,
      top: board.el.offsetTop,
      right: board.el.offsetLeft + board.el.offsetWidth,
      bottom: board.el.offsetTop + board.el.offsetHeight,
    };
    const x = anchorX(spec.x, spec.ax);
    const y = anchorY(spec.y, spec.ay);
    const h = DIALOG_H;
    const clear = x + spec.w <= b.left || x >= b.right || y + h <= b.top || y >= b.bottom;
    if (clear) return spec;

    const deskBottom = deskHeight() - taskbarH();
    // below the board
    if (deskBottom - b.bottom >= h + 12)
      return { x: Math.min(x, deskWidth() - spec.w - 8), y: b.bottom + 8 };
    // above it
    if (b.top >= h + 12) return { x: Math.min(x, deskWidth() - spec.w - 8), y: Math.max(8, b.top - h - 8) };
    // else the wider shoulder
    const roomRight = deskWidth() - b.right;
    return roomRight >= b.left
      ? { x: Math.min(b.right + 8, deskWidth() - spec.w - 8), y }
      : { x: Math.max(8, b.left - spec.w - 8), y };
  }

  const ACTS: Record<BeatAct, (key: string) => void> = {
    dialog(key) {
      const spec = nextOf(key, BEAT_DIALOGS[key]);
      if (!spec) return;
      const at = clearOfBoard(spec);
      const win = wm.dialog({
        title: spec.title,
        body: spec.body,
        icon: spec.icon,
        buttons: spec.buttons ? [...spec.buttons] : undefined,
        x: at.x,
        y: at.y,
        ax: at.ax,
        ay: at.ay,
        w: spec.w,
      });
      beatDialogs.push(win);
      beatLater(() => {
        if (win.isOpen()) win.close();
        beatDialogs = beatDialogs.filter((d) => d !== win);
      }, spec.dwell);
    },

    "title-slip"(key) {
      const board = deps.boardWin();
      const title = nextOf(key, BEAT_TITLES[key]);
      if (!board?.isOpen() || !title) return;
      board.setTitle(title);
      beatLater(restoreTitle, 2600);
    },

    note(key) {
      const line = nextOf(key, BEAT_NOTES[key]);
      if (line) deps.notepad.lines([line]);
      if (line) play("click", 0.45);
    },

    flare() {
      if (!mainFire) return;
      play("flare", 0.8);
      mainFire.set({ baseHeat: Math.round(52 + fever * 10), cool: 2.2, interval: 48 });
      beatLater(applyHeat, 1400);
    },

    "clock-lurch"() {
      play("clock-tick", 0.85);
      const base = CLOCK_DRIFT[Math.min(tier, 4)]!;
      shell.setClockDrift(base + 9);
      beatLater(() => shell.setClockDrift(base + 2), 420);
      beatLater(() => shell.setClockDrift(base), 1700);
    },

    "taskbar-stutter"() {
      // each button 'down' in turn; 90ms stepped
      const buttons = [...shell.tasksEl.querySelectorAll<HTMLElement>(".task")];
      if (buttons.length === 0) return;
      const held = buttons.map((b) => b.classList.contains("down"));
      buttons.forEach((b, i) =>
        beatLater(() => {
          buttons.forEach((o) => o.classList.remove("down"));
          b.classList.add("down");
          play("click", 0.35);
        }, 90 * i),
      );
      beatLater(() => {
        buttons.forEach((b, i) => b.classList.toggle("down", held[i]!));
      }, 90 * buttons.length + 160);
    },

    "icon-twitch"() {
      play("twitch", 0.8);
      shell.shiftIcons(ICON_TWITCH);
      beatLater(() => {
        shell.shiftIcons(tier >= 4 ? ICON_SHIFT_T4 : tier >= 3 ? ICON_SHIFT_T3 : []);
      }, 720);
    },

    "preview-blink"() {
      const id = "flames-blink";
      if (wm.get(id)?.isOpen()) return;
      const made = fireWindow(id, TITLES.flamesN(4), BLINK_GEOM, heatParams({ dBase: -6, dInt: 10 }));
      beatLater(() => {
        made.fire.stop();
        if (made.win.isOpen()) made.win.close();
      }, 2200);
    },
  };

  function applyTier(t: number): void {
    const prev = tier;
    tier = t;
    shell.setClockDrift(CLOCK_DRIFT[t]!);
    shell.shiftIcons(t >= 4 ? ICON_SHIFT_T4 : t >= 3 ? ICON_SHIFT_T3 : []);
    if (t > prev) for (let c = prev + 1; c <= t; c++) crossInto(c);
    // coming down: tidy one per beat, but not under a running ending; only
    // the saver lets go on its own (it covers the board)
    if (t < prev && (!gameOver || dismissed)) tidyLitter();
    takeover(t >= 4, true);
    if (!wonGeom) applyGeometry();
  }

  return {
    apply(s) {
      fever = s.fever;
      if (s.tier !== tier) applyTier(s.tier);
      applyHeat();
    },

    beat(b, force) {
      if (gameOver) return;
      const key = poolKey(b);
      const act = force ?? pickAct(b, rng, { avoid: lastAct, fever });
      if (!act) return;
      lastAct = act;
      ACTS[act](key);
    },

    setGameOver() {
      gameOver = true;
      dismissed = false;
    },
    endingDismissed() {
      if (!gameOver || dismissed) return;
      dismissed = true;
      // the fire is a screensaver again, at what the tier justifies
      wonGeom = false;
      personality = opponentId === "oracle" ? "pillar" : "classic";
      if (mainWin?.isOpen()) {
        applyPersonality();
        applyGeometry();
      }
      tidyLitter();
    },
    gameEvent(kind) {
      gameOver = true;
      dismissed = false;
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
      dismissed = false;
      personality = opponentId === "oracle" ? "pillar" : "classic";
      clearBeats();
      // old-game dialogs close now; fires fade with the fever
      const blink = wm.get("flames-blink");
      if (blink?.isOpen()) blink.close();
      for (const d of crossingDialogs) if (d.isOpen()) d.close();
      crossingDialogs = [];
      tidyLitter();
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
