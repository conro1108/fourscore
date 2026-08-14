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
 * A loss gets the same honest selection and no parade.
 */

import { el } from "./dom.js";
import { makeFire, type Fire } from "./fire.js";
import { cascadeFor, DIALOG, NOTES, STATUS, voiceOf } from "./copy.js";
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

  /* ---- the line catches ---- */
  function igniteSeam(end: EndResult): { setProgress(p: number): void } {
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
    seamFire = makeFire(cv, {
      transparent: true,
      cool: 4.2,
      interval: 70,
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
              heat[y * W + x] = Math.min(63, 42 + ((Math.random() * 14) | 0));
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

    type Step = { run(): void; dwell: number };
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
      d.el.id = "final";
      deps.board().setStatus(STATUS.youWin, STATUS.crowd);
    }, 3400);
    beat(11);

    if (frozen) {
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

  function runLoss(end: EndResult, frozenBeat?: number): void {
    const frozen = frozenBeat !== undefined;
    const v = voiceOf(end.botId);
    const botName = deps.board().botName();
    deps.onFeverEvent("loss");
    deps.notepad.lines([NOTES.theyWon(botName)]);
    deps.board().setStatus(`${botName} WINS.`, v.winStatus);
    showAnts(end.cells, frozen);
    later(() => {
      dialog({
        title: "BOARD.EXE",
        body: v.winBody,
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
    }, frozen ? 0 : 900);
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
