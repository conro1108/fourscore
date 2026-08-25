/**
 * End-of-game sequences: ants → seam fire → dialog cascade → finale. Beats
 * are hand-tuned, not random (wrongness repeats); the harness freezes on them.
 * A loss is deliberately quieter than a win (coals, no taskbar crush, fewer
 * dialogs). Leaving via OK/close retires the paperwork one dialog per
 * RETIRE_BEAT; `Again` is a stronger reset and doesn't come through here.
 */

import { el } from "./dom.js";
import { makeFire, PALETTES, type Fire } from "./fire.js";
import { cascadeFor, DIALOG, LOSS_CASCADE, NOTES, STATUS, voiceOf } from "./copy.js";
import { play } from "./audio/index.js";
import { CELL, type BoardApp, type EndResult } from "./board.js";
import type { MovesPad } from "./notepad.js";
import type { WM, Win } from "./wm.js";

export interface EndgameDeps {
  wm: WM;
  board: () => BoardApp;
  notepad: MovesPad;
  onFeverEvent(kind: EndResult["kind"]): void;
  /** Fires once per game; never for `Again` (new-game path resets more). */
  onDismiss(): void;
  /** Retire the ending and open REVIEW.EXE. */
  openReview(): void;
}

export interface Endgame {
  run(end: EndResult, frozenBeat?: number): void;
  /** New game: stop timers, remove ants/seam/dialogs. */
  clear(): void;
}

const SEAM_RES = 4;

/** Retire beat; matches effects.ts's tidy beat so both read as one desktop. */
const RETIRE_BEAT = 1300;

export function makeEndgame(deps: EndgameDeps): Endgame {
  const timers: ReturnType<typeof setTimeout>[] = [];
  const intervals: ReturnType<typeof setInterval>[] = [];
  let seamFire: Fire | null = null;
  let openDialogs: Win[] = [];
  let dismissed = false;

  const later = (fn: () => void, ms: number): void => {
    timers.push(setTimeout(fn, ms));
  };

  function clear(): void {
    for (const t of timers) clearTimeout(t);
    for (const i of intervals) clearInterval(i);
    timers.length = 0;
    intervals.length = 0;
    seamFire?.stop();
    seamFire = null;
    for (const d of openDialogs) if (d.isOpen()) d.close();
    openDialogs = [];
    dismissed = false;
  }

  const dialog = (spec: Parameters<WM["dialog"]>[0]): Win => {
    // travels with the board
    const d = deps.wm.dialog({ ax: "center", ...spec });
    openDialogs.push(d);
    return d;
  };

  /* ---- leaving the ending ---- */

  /** Close dialogs newest-first, one per beat; the ants/fire go last, the
      position stays. */
  function retire(): void {
    const step = (): void => {
      let d = openDialogs.pop();
      while (d && !d.isOpen()) d = openDialogs.pop();
      if (d) {
        d.close();
        later(step, RETIRE_BEAT);
        return;
      }
      seamFire?.stop();
      seamFire = null;
      for (const i of intervals) clearInterval(i);
      intervals.length = 0;
      for (const n of [...deps.board().gridwrap().querySelectorAll(".ants, .seam")]) n.remove();
    };
    later(step, RETIRE_BEAT);
  }

  function dismiss(): void {
    if (dismissed) return;
    dismissed = true;
    deps.onDismiss();
    retire();
  }

  /** `wm.dialog` has no hook for the titlebar close box, so listen on it. */
  function onLeaving(d: Win): Win {
    d.el.querySelector<HTMLElement>('.tbtn[data-b="close"]')?.addEventListener("click", dismiss);
    return d;
  }

  const leaveOrAgain = (i: number): void => {
    if (i === 1) {
      clear();
      deps.board().newGame();
    } else {
      dismiss();
      if (i === 2) deps.openReview();
    }
  };

  /* Grid decor was authored at the 64px cell; scale by the live cell size
     (same ratio as board.ts `rescaleDecor`) or a 96px board gets cut discs. */
  const decorScale = (): number => deps.board().cellSize() / CELL;

  /* ---- the selection ---- */
  function showAnts(cells: EndResult["cells"], frozen: boolean): void {
    const wrap = deps.board().gridwrap();
    const s = decorScale();
    // geometric endpoints, not landing order
    const ordered = [...cells].sort((a, b) => a.col - b.col || a.row - b.row);
    const [ax, ay] = deps.board().cellCenter(ordered[0]!.col, ordered[0]!.row);
    const [bx, by] = deps.board().cellCenter(ordered[ordered.length - 1]!.col, ordered[ordered.length - 1]!.row);
    const ants = el(`<div class="ants"><div class="a1"></div><div class="a2"></div></div>`);
    const len = Math.hypot(bx - ax, by - ay) + 68 * s;
    ants.style.display = "block";
    ants.style.width = `${len}px`;
    ants.style.height = `${62 * s}px`;
    ants.style.left = `${(ax + bx) / 2 - len / 2}px`;
    ants.style.top = `${(ay + by) / 2 - 31 * s}px`;
    ants.style.transform = `rotate(${Math.atan2(by - ay, bx - ax)}rad)`;
    wrap.appendChild(ants);
    if (!frozen) {
      let n = 0;
      const march = setInterval(() => {
        if (!ants.isConnected) {
          clearInterval(march);
          return;
        }
        const [a1, a2] = ants.children as unknown as [HTMLElement, HTMLElement];
        a1.style.borderColor = n % 2 ? "#000" : "#fff";
        a2.style.borderColor = n % 2 ? "#fff" : "#000";
        n++;
      }, 120);
      intervals.push(march);
    }
  }

  /* ---- step machinery: timed for play, frozen-to-a-beat for the harness ---- */
  interface Step {
    run(): void;
    dwell: number;
  }
  function runSteps(steps: Step[], beats: Record<number, number>, frozenBeat?: number): void {
    if (frozenBeat !== undefined) {
      const endIdx = beats[frozenBeat] ?? steps.length - 1;
      for (let i = 0; i <= endIdx; i++) steps[i]!.run();
      return;
    }
    let i = 0;
    const tick = (): void => {
      steps[i]!.run();
      const dwell = steps[i]!.dwell;
      i++;
      if (i < steps.length) later(tick, dwell);
    };
    later(tick, 500);
  }

  /* ---- the seam fire: win blazes, loss smolders (coals, never out) ---- */
  function igniteSeam(end: EndResult, smolder = false): { setProgress(p: number): void } {
    const wrap = deps.board().gridwrap();
    const ordered = [...end.cells].sort((a, b) => a.col - b.col || a.row - b.row);
    const pts = ordered.map((c) => deps.board().cellCenter(c.col, c.row));
    const [ax, ay] = pts[0]!;
    const [bx, by] = pts[pts.length - 1]!;
    // fire grows outward from the newest disc
    const landing = end.cells[0]!;
    const [lx, ly] = deps.board().cellCenter(landing.col, landing.row);
    const lineLen = Math.hypot(bx - ax, by - ay) || 1;
    const t0 = Math.hypot(lx - ax, ly - ay) / lineLen;

    const pad = 44 * decorScale();
    const sx = Math.min(ax, bx) - pad;
    const sy = Math.min(ay, by) - pad;
    const w = Math.ceil((Math.abs(bx - ax) + pad * 2) / SEAM_RES);
    const h = Math.ceil((Math.abs(by - ay) + pad * 2 + 10) / SEAM_RES);
    const cv = el(`<canvas class="seam" width="${w}" height="${h}"></canvas>`) as HTMLCanvasElement;
    cv.style.left = `${sx}px`;
    cv.style.top = `${sy}px`;
    cv.style.width = `${w * SEAM_RES}px`;
    cv.style.height = `${h * SEAM_RES}px`;
    wrap.appendChild(cv);

    let progress = 0;
    play(smolder ? "smolder" : "line-catch", smolder ? 0.75 : 1);
    const heatLo = smolder ? 30 : 42;
    const heatVar = smolder ? 10 : 14;
    seamFire = makeFire(cv, {
      transparent: true,
      cool: smolder ? 5 : 4.2,
      interval: smolder ? 115 : 70,
      palette: smolder ? PALETTES.coals : PALETTES.classic,
      stoke(heat, W, H) {
        const reach = progress * Math.max(t0, 1 - t0);
        for (let t = 0; t <= 1.0001; t += 0.02) {
          if (Math.abs(t - t0) > reach + 0.011) continue;
          const gx = Math.round((ax + (bx - ax) * t - sx) / SEAM_RES);
          const gy = Math.round((ay + (by - ay) * t - sy) / SEAM_RES);
          for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]] as const) {
            const x = gx + dx;
            const y = gy + dy;
            if (x >= 0 && x < W && y >= 0 && y < H)
              heat[y * W + x] = Math.min(63, heatLo + ((Math.random() * heatVar) | 0));
          }
        }
      },
    });
    seamFire.start();
    return {
      setProgress(p: number) {
        progress = p;
      },
    };
  }

  /* ---- the sequences ---- */
  function runWin(end: EndResult, frozenBeat?: number): void {
    const frozen = frozenBeat !== undefined;
    const botName = deps.board().botName();
    deps.notepad.lines([NOTES.youWon, NOTES.youWonTail]);

    const steps: Step[] = [];
    const beats: Record<number, number> = {};
    const step = (run: () => void, dwell: number): void => {
      steps.push({ run, dwell });
    };
    const beat = (n: number): void => {
      beats[n] = steps.length - 1;
    };

    // beat 2 (0/1 = idle and the drop, already happened)
    step(() => {
      deps.board().setStatus(STATUS.connected(end.run), STATUS.stoppedThinking(botName));
      showAnts(end.cells, frozen);
    }, 700);
    beat(2);

    let seam: { setProgress(p: number): void } | null = null;
    [0.3, 0.55, 0.8, 1].forEach((p, i) =>
      step(() => {
        if (!seam) seam = igniteSeam(end);
        seam.setProgress(p);
      }, i === 3 ? 700 : 190),
    );

    // fever starts only after the selection beats, which stay legible
    step(() => deps.onFeverEvent("win"), 0);

    // the cascade
    cascadeFor(end.run).forEach((spec, i) => {
      step(() => {
        dialog({
          title: spec.title,
          body: spec.body,
          icon: spec.icon,
          buttons: spec.buttons,
          x: spec.x,
          y: spec.y,
          w: spec.w,
          taskbar: true,
        });
      }, spec.dwell);
      beat(3 + i);
    });

    step(() => {
      const d = dialog({
        title: DIALOG.finale.title,
        body: DIALOG.finale.body,
        buttons: ["OK", "Again", "Review"],
        x: 470,
        y: 330,
        w: 368,
        taskbar: true,
        sound: "tada",
        onButton: leaveOrAgain,
      });
      onLeaving(d);
      d.el.classList.add("finale");
      deps.board().setStatus(STATUS.youWin, STATUS.crowd);
    }, 3400);
    beat(11);

    runSteps(steps, beats, frozenBeat);
  }

  /**
   * Beats (?state=loss&beat=N): 2 ants, 3 smolder starts, 4 reaches both ends,
   * 5 bot's say, 6-9 paperwork (8 is behind the board), 10 Condolences.
   */
  function runLoss(end: EndResult, frozenBeat?: number): void {
    const frozen = frozenBeat !== undefined;
    const v = voiceOf(end.botId);
    const botName = deps.board().botName();

    const steps: Step[] = [];
    const beats: Record<number, number> = {};
    const step = (run: () => void, dwell: number): void => {
      steps.push({ run, dwell });
    };
    const beat = (n: number): void => {
      beats[n] = steps.length - 1;
    };

    step(() => {
      deps.onFeverEvent("loss");
      deps.notepad.lines([NOTES.theyWon(botName), NOTES.theyWonTail]);
      deps.board().setStatus(`${botName} WINS.`, v.winStatus);
      showAnts(end.cells, frozen);
    }, 900);
    beat(2);

    let seam: { setProgress(p: number): void } | null = null;
    [0.35, 0.7, 1].forEach((p, i) => {
      step(() => {
        if (!seam) seam = igniteSeam(end, true);
        seam.setProgress(p);
      }, i === 2 ? 900 : 340);
      if (i === 0) beat(3);
    });
    beat(4);

    step(() => {
      dialog({ title: "BOARD.EXE", body: v.winBody(end.run), x: 380, y: 100, w: 336 });
    }, 700);
    beat(5);
    LOSS_CASCADE.forEach((spec, i) => {
      step(() => {
        const d = dialog({ title: spec.title, body: spec.body, icon: spec.icon, x: spec.x, y: spec.y, w: spec.w });
        // slid below the board in the stack, not by raising the board
        if (spec.behind) deps.wm.sendBelow(d, deps.board().win);
      }, spec.dwell);
      beat(6 + i);
    });

    step(() => {
      const spec = DIALOG.condolences(botName);
      const d = dialog({
        title: spec.title,
        body: spec.body,
        x: 470,
        y: 330,
        w: 368,
        buttons: ["OK", "Again", "Review"],
        taskbar: true,
        // quieter than the win's tada, on purpose
        sound: "shutdown-chime",
        onButton: leaveOrAgain,
      });
      onLeaving(d);
      d.el.classList.add("finale");
    }, 3000);
    beat(10);

    runSteps(steps, beats, frozenBeat);
  }

  function runDraw(): void {
    deps.onFeverEvent("draw");
    deps.notepad.lines([NOTES.draw]);
    deps.board().setStatus(STATUS.draw, STATUS.drawStatus);
    onLeaving(
      dialog({
        title: DIALOG.draw.title,
        body: DIALOG.draw.body,
        buttons: ["OK", "Again", "Review"],
        x: 470,
        y: 320,
        w: 360,
        onButton: leaveOrAgain,
      }),
    );
  }

  function runForfeit(end: EndResult): void {
    deps.onFeverEvent("forfeit");
    const spec = DIALOG.forfeit(deps.board().botName());
    deps.board().setStatus(STATUS.forfeited, voiceOf(end.botId).winStatus);
    onLeaving(
      dialog({
        title: spec.title,
        body: spec.body,
        buttons: ["OK", "Again"],
        x: 470,
        y: 320,
        w: 360,
        onButton: leaveOrAgain,
      }),
    );
  }

  return {
    run(end, frozenBeat) {
      clear();
      if (end.kind === "win") runWin(end, frozenBeat);
      else if (end.kind === "loss") runLoss(end, frozenBeat);
      else if (end.kind === "draw") runDraw();
      else runForfeit(end);
    },
    clear,
  };
}
