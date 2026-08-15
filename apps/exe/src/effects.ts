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
import { BEAT_DIALOGS, BEAT_NOTES, BEAT_TITLES, DIALOG, TITLES } from "./copy.js";
import { BEAT_ACTS, pickAct, poolKey, type BeatAct } from "./beats.js";
import type { Beat, DirectorSnapshot } from "./director.js";
import type { Shell } from "./desktop.js";
import { anchorX, anchorY, deskHeight, deskWidth, stageScale, type AnchorX, type WM, type Win } from "./wm.js";
import { play } from "./audio/index.js";
import type { EndResult } from "./board.js";
import type { MovesPad } from "./notepad.js";

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

const ICON_SHIFT_T3 = [[3, -2], [-2, 3], [1, 2], [-3, -1], [2, -3], [-1, 2]] as const;
const ICON_SHIFT_T4 = [[6, -4], [-5, 6], [3, 5], [-7, -2], [5, 4], [-4, -5]] as const;
/** A flinch, not a state — bigger than either tier shift, and it goes back. */
const ICON_TWITCH = [[-9, 5], [7, -6], [-4, -8], [9, 3], [-6, 7], [5, -9]] as const;
const CLOCK_DRIFT = [0, 1, 5, 22, -1] as const;

/** Roughly how tall a beat dialog comes out — two lines of body plus the
    button row and the titlebar. Only used to test whether one would land on
    the board, so a few pixels either way costs nothing. */
const DIALOG_H = 108;
const TASKBAR_H = 36;

/** The preview that opens itself for two seconds. Left margin, out of the way
    of the board and of every geometry `MAIN_GEOM` uses. */
const BLINK_GEOM: FireWindowGeom = { x: 34, y: 250, ax: "left", cw: 208, ch: 138, rw: 69, rh: 46 };

export interface Effects {
  apply(s: DirectorSnapshot): void;
  /** Answer one ply. The desktop's whole life between tier crossings.
      `force` is the harness naming an act so it can be looked at; live play
      never passes it and always draws. */
  beat(b: Beat, force?: BeatAct): void;
  gameEvent(kind: EndResult["kind"]): void;
  /** The moment a game ends, crossings stop talking (the endgame has the mic). */
  setGameOver(): void;
  setOpponent(botId: string): void;
  newGame(): void;
  openFlames(): void;
  /** The screensaver wins the desktop — fever 1.0 and real idle both land here. */
  takeover(on: boolean): void;
}

export function makeEffects(deps: {
  wm: WM;
  shell: Shell;
  stage: HTMLElement;
  boardWin: () => Win | undefined;
  notepad: MovesPad;
  /** Injected so the beat picker is deterministic under test and in the shots. */
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
  /** Desk px per fire px — the canvas's css size over its resolution. */
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
        // when you close the last porthole there is nothing left to burn in
        onClose: () => {
          if (roam && roamWins.every((w) => !w.isOpen())) closeRoam();
        },
      });
    });
    // each window reports where it is *now*, so dragging one moves its
    // porthole and closing or minimizing one removes it from the fire's world
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
    // the raised band goes back with the picture, not before it — dropping it
    // first would slip the board under a saver that is still on screen
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
    // the picture changing hands, both ways — a period monitor degausses when
    // it does, and this is the one that gets to arrive out of a silent room
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
      // The board stays playable on top of it — a band the wm owns, so that
      // clicking the board (which re-focuses it) can't drop it back under.
      // Nothing is focused or raised on the way in: the fire arriving must not
      // reorder the desktop, or it shuffles the board over the win's own
      // finale, which is the one window that has earned the top of the stack.
      wm.setSaverActive(true);
    } else {
      hideSaver(fade);
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
    // the machine changing gear, under whatever the crossing opens on top of it
    play("tier-cross", 0.8);
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

  /* ---- beats: what the desktop does between tier crossings ----
     Every act here is small, reversible, and puts itself back. A tier is a
     state the OS is *in*; a beat is something it does and then stops doing,
     so nothing below is allowed to leave the desktop permanently altered —
     that is what `applyTier` is for. Timing law holds: instant or stepped,
     never eased. */
  let beatTimers: ReturnType<typeof setTimeout>[] = [];
  let lastAct: BeatAct | null = null;
  /** Rotation cursor per pool, so a repeated beat doesn't repeat its line.
      Deterministic on purpose — the draw picks the act, never how it looks. */
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
    // whatever an act was borrowing, the tier gets back
    shell.setClockDrift(CLOCK_DRIFT[Math.min(tier, 4)]!);
    shell.shiftIcons(tier >= 4 ? ICON_SHIFT_T4 : tier >= 3 ? ICON_SHIFT_T3 : []);
    restoreTitle();
    applyHeat();
  }

  /** Next entry of a rotating list, or undefined if the pool has no copy. */
  function nextOf<T>(key: string, list: readonly T[] | undefined): T | undefined {
    if (!list || list.length === 0) return undefined;
    const i = rotation.get(key) ?? 0;
    rotation.set(key, i + 1);
    return list[i % list.length];
  }

  const restoreTitle = (): void => {
    const board = deps.boardWin();
    if (board?.isOpen()) board.setTitle(TITLES.board);
  };

  /**
   * Keep a beat dialog off the board — "never blocking play" (DIRECTION.md) is
   * a rule about clicks, not about taste. A beat dialog is a real window with
   * real pointer events, so one parked over the grid eats the drop you were
   * aiming at, and unlike the win cascade it arrives while the game is still
   * going.
   *
   * The authored position is the intent and is used whenever it fits. It stops
   * fitting more often than it looks: BOARD.EXE is center-anchored and sizes
   * itself from the variant, so a Connect 7 window is 852px of the desk where
   * Connect 4's is 480, and a spot that was clear margin on one board is the
   * middle of the next one. So the authored spot is *moved*, never redrawn —
   * pushed to the band below the board, then above it, then to whichever side
   * has more room. Deterministic all the way down: the draw picks which dialog
   * you get, the layout decides where it will fit, and neither is random.
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

    const deskBottom = deskHeight() - TASKBAR_H;
    // below the board, where a short variant leaves a full-width band
    if (deskBottom - b.bottom >= h + 12)
      return { x: Math.min(x, deskWidth() - spec.w - 8), y: b.bottom + 8 };
    // above it, in the strip over the titlebar
    if (b.top >= h + 12) return { x: Math.min(x, deskWidth() - spec.w - 8), y: Math.max(8, b.top - h - 8) };
    // otherwise the wider shoulder, which on a maximised board is neither
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
      // The OS takes it back, but you can close it first — it is a real dialog.
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
      // moves.txt is a text box, and something typed into it
      if (line) play("click", 0.45);
    },

    flare() {
      if (!mainFire) return;
      play("flare", 0.8);
      // the continuous system, shoved — and then handed straight back to fever
      mainFire.set({ baseHeat: Math.round(52 + fever * 10), cool: 2.2, interval: 48 });
      beatLater(applyHeat, 1400);
    },

    "clock-lurch"() {
      // the clock finds several minutes it did not have, and loses them again
      play("clock-tick", 0.85);
      const base = CLOCK_DRIFT[Math.min(tier, 4)]!;
      shell.setClockDrift(base + 9);
      beatLater(() => shell.setClockDrift(base + 2), 420);
      beatLater(() => shell.setClockDrift(base), 1700);
    },

    "taskbar-stutter"() {
      // every button believes it is the focused one, in turn. 12fps, stepped.
      const buttons = [...shell.tasksEl.querySelectorAll<HTMLElement>(".task")];
      if (buttons.length === 0) return;
      const held = buttons.map((b) => b.classList.contains("down"));
      buttons.forEach((b, i) =>
        beatLater(() => {
          buttons.forEach((o) => o.classList.remove("down"));
          b.classList.add("down");
          // each button believing it was clicked, at the 90ms the act steps on
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
      // a preview nobody opened, which is briefly a real window and then isn't
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

    beat(b, force) {
      // Once a game ends the endgame owns the mic, same as tier crossings.
      if (gameOver) return;
      const key = poolKey(b);
      const act = force ?? pickAct(b, rng, { avoid: lastAct, fever });
      if (!act) return;
      lastAct = act;
      ACTS[act](key);
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
      clearBeats();
      const blink = wm.get("flames-blink");
      if (blink?.isOpen()) blink.close();
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
