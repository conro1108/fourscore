/**
 * The end of a game, in the OS's own furniture (approved in 02-win.html).
 *
 * A win: the OS selects your line the way it selects anything — marching
 * ants, but one rotated capsule hugging the whole line, because the win is
 * continuous. Then the line itself catches: ONE fire, stoked along the line,
 * growing from the new disc toward the old. Then the cascade — sincere
 * dialogs scattered across the desktop at hand-tuned positions on irregular
 * beats (tuned, not random — wrongness repeats), the taskbar crushing to
 * slivers, and finally the biggest thing the machine has ever announced:
 * Congratulations — YOU WIN.
 *
 * A loss gets the same honest selection — and then the machine quietly sides
 * with the winner. The line doesn't blaze, it smolders (coals: the loss
 * fire), the OS files a short stack of sincere paperwork about it — one
 * notice tucked behind the board where you find it later — and the finale is
 * a Condolences dialog set in the same big type as the win's. Quieter than
 * the win on purpose: no taskbar crush, half the dialogs. The win stays the
 * biggest thing the machine has ever announced.
 */

import { el } from "./dom.js";
import { makeFire, PALETTES, type Fire } from "./fire.js";
import { cascadeFor, DIALOG, LOSS_CASCADE, NOTES, STATUS, voiceOf } from "./copy.js";
import type { BoardApp, EndResult } from "./board.js";
import type { MovesPad } from "./notepad.js";
import type { WM, Win } from "./wm.js";

export interface EndgameDeps {
  wm: WM;
  board: () => BoardApp;
  notepad: MovesPad;
  onFeverEvent(kind: EndResult["kind"]): void;
}

export interface Endgame {
  run(end: EndResult, frozenBeat?: number): void;
  /** New game: stop timers, remove ants/seam/dialogs. */
  clear(): void;
}

const SEAM_RES = 4;

export function makeEndgame(deps: EndgameDeps): Endgame {
  const timers: ReturnType<typeof setTimeout>[] = [];
  const intervals: ReturnType<typeof setInterval>[] = [];
  let seamFire: Fire | null = null;
  let openDialogs: Win[] = [];

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
  }

  const dialog = (spec: Parameters<WM["dialog"]>[0]): Win => {
    // the endgame talks over the board, so it travels with it
    const d = deps.wm.dialog({ ax: "center", ...spec });
    openDialogs.push(d);
    return d;
  };

  /* ---- the selection ---- */
  function showAnts(cells: EndResult["cells"], frozen: boolean): void {
    const wrap = deps.board().gridwrap();
    // geometric endpoints (not the outward-from-landing order)
    const ordered = [...cells].sort((a, b) => a.col - b.col || a.row - b.row);
    const [ax, ay] = deps.board().cellCenter(ordered[0]!.col, ordered[0]!.row);
    const [bx, by] = deps.board().cellCenter(ordered[ordered.length - 1]!.col, ordered[ordered.length - 1]!.row);
    const ants = el(`<div class="ants"><div class="a1"></div><div class="a2"></div></div>`);
    const len = Math.hypot(bx - ax, by - ay) + 68;
    ants.style.display = "block";
    ants.style.width = `${len}px`;
    ants.style.height = "62px";
    ants.style.left = `${(ax + bx) / 2 - len / 2}px`;
    ants.style.top = `${(ay + by) / 2 - 31}px`;
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

  /* ---- the step machinery both sequences run on: hand-tuned beats,
     frozen-to-a-beat for the harness, timed for real play ---- */
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

  /* ---- the line catches ----
     Two registers: the win blazes; the loss smolders — same fire, the coals
     ramp, slower and lower, and it does not go out. ---- */
  function igniteSeam(end: EndResult, smolder = false): { setProgress(p: number): void } {
    const wrap = deps.board().gridwrap();
    const ordered = [...end.cells].sort((a, b) => a.col - b.col || a.row - b.row);
    const pts = ordered.map((c) => deps.board().cellCenter(c.col, c.row));
    const [ax, ay] = pts[0]!;
    const [bx, by] = pts[pts.length - 1]!;
    // where along the line the newest disc sits — the fire grows outward from it
    const landing = end.cells[0]!;
    const [lx, ly] = deps.board().cellCenter(landing.col, landing.row);
    const lineLen = Math.hypot(bx - ax, by - ay) || 1;
    const t0 = Math.hypot(lx - ax, ly - ay) / lineLen;

    const pad = 44;
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

    // 2 · the selection (beats 0/1 — idle and the drop — already happened for real)
    step(() => {
      deps.board().setStatus(STATUS.connected(end.run), STATUS.stoppedThinking(botName));
      showAnts(end.cells, frozen);
    }, 700);
    beat(2);

    // the line catches, growing from the new disc toward the old
    let seam: { setProgress(p: number): void } | null = null;
    [0.3, 0.55, 0.8, 1].forEach((p, i) =>
      step(() => {
        if (!seam) seam = igniteSeam(end);
        seam.setProgress(p);
      }, i === 3 ? 700 : 190),
    );

    // the desktop only loses its composure once the announcements start —
    // the selection beats stay legible
    step(() => deps.onFeverEvent("win"), 0);

    // the cascade; the taskbar pays for each
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

    // the finale
    step(() => {
      const d = dialog({
        title: DIALOG.finale.title,
        body: DIALOG.finale.body,
        buttons: ["OK", "Again"],
        x: 470,
        y: 330,
        w: 368,
        taskbar: true,
        onButton(i) {
          if (i === 1) {
            clear();
            deps.board().newGame();
          }
        },
      });
      d.el.classList.add("finale");
      deps.board().setStatus(STATUS.youWin, STATUS.crowd);
    }, 3400);
    beat(11);

    runSteps(steps, beats, frozenBeat);
  }

  /**
   * The coals parade. Beats (the harness freezes on them, ?state=loss&beat=N):
   *   2  the selection — ants around the opponent's line
   *   3  the line starts to smolder
   *   4  the smolder reaches both ends
   *   5  the bot gets its say
   *   6-9  the paperwork, one dialog per beat (8 is the one behind the board)
   *   10 Condolences — {NAME} WINS.
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

    // the selection — same honest ants as the win; the flames go coals now
    step(() => {
      deps.onFeverEvent("loss");
      deps.notepad.lines([NOTES.theyWon(botName), NOTES.theyWonTail]);
      deps.board().setStatus(`${botName} WINS.`, v.winStatus);
      showAnts(end.cells, frozen);
    }, 900);
    beat(2);

    // the line smolders, from the finishing disc outward — and doesn't go out
    let seam: { setProgress(p: number): void } | null = null;
    [0.35, 0.7, 1].forEach((p, i) => {
      step(() => {
        if (!seam) seam = igniteSeam(end, true);
        seam.setProgress(p);
      }, i === 2 ? 900 : 340);
      if (i === 0) beat(3);
    });
    beat(4);

    // the paperwork: the bot gets its say, then the OS files the loss
    step(() => {
      dialog({ title: "BOARD.EXE", body: v.winBody(end.run), x: 380, y: 100, w: 336 });
    }, 700);
    beat(5);
    LOSS_CASCADE.forEach((spec, i) => {
      step(() => {
        const d = dialog({ title: spec.title, body: spec.body, icon: spec.icon, x: spec.x, y: spec.y, w: spec.w });
        // one notice is filed underneath the board, where you find it later —
        // slid below the board's z, not by raising the board over the others
        if (spec.behind) {
          const boardZ = Number(deps.board().win.el.style.zIndex || 40);
          d.el.style.zIndex = String(boardZ - 1);
        }
      }, spec.dwell);
      beat(6 + i);
    });

    // the finale: the win's big type, the other name in it
    step(() => {
      const spec = DIALOG.condolences(botName);
      const d = dialog({
        title: spec.title,
        body: spec.body,
        x: 470,
        y: 330,
        w: 368,
        buttons: ["OK", "Again"],
        taskbar: true,
        onButton(i) {
          if (i === 1) {
            clear();
            deps.board().newGame();
          }
        },
      });
      d.el.classList.add("finale");
    }, 3000);
    beat(10);

    runSteps(steps, beats, frozenBeat);
  }

  function runDraw(): void {
    deps.onFeverEvent("draw");
    deps.notepad.lines([NOTES.draw]);
    deps.board().setStatus(STATUS.draw, STATUS.drawStatus);
    dialog({
      title: DIALOG.draw.title,
      body: DIALOG.draw.body,
      buttons: ["OK", "Again"],
      x: 470,
      y: 320,
      w: 360,
      onButton(i) {
        if (i === 1) {
          clear();
          deps.board().newGame();
        }
      },
    });
  }

  function runForfeit(end: EndResult): void {
    deps.onFeverEvent("forfeit");
    const spec = DIALOG.forfeit(deps.board().botName());
    deps.board().setStatus(STATUS.forfeited, voiceOf(end.botId).winStatus);
    dialog({
      title: spec.title,
      body: spec.body,
      buttons: ["OK", "Again"],
      x: 470,
      y: 320,
      w: 360,
      onButton(i) {
        if (i === 1) {
          clear();
          deps.board().newGame();
        }
      },
    });
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
