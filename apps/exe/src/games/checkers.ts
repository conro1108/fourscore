/**
 * CHECKERS.EXE — English draughts against the machine itself, played with
 * the only counters this computer owns: the board's red and yellow chips.
 * Captures are compulsory, multi-jumps run to completion, kinging ends the
 * move. The opponent is a real alpha-beta search, not a script — it moves
 * its men in visible steps because the timing law would demand it anyway.
 */

import { el } from "../dom.js";
import { GAMES_COPY, TITLES } from "../copy.js";
import { play } from "../audio/index.js";
import type { WM } from "../wm.js";
import { menubar } from "./ui.js";

/* ---- the pure part (the tests live on this) ---- */

/** side 0 = you (red, at the bottom, moving up); 1 = the machine (yellow). */
export interface Piece {
  side: 0 | 1;
  king: boolean;
}
export type CBoard = (Piece | null)[][]; // [row][col], row 0 at the top

export interface CMove {
  /** Squares visited, first is the mover's square. */
  path: [number, number][];
  /** Squares of the men removed, one per jump. */
  captures: [number, number][];
}

const dark = (r: number, c: number): boolean => (r + c) % 2 === 1;

export function initialBoard(): CBoard {
  const b: CBoard = Array.from({ length: 8 }, () => Array<Piece | null>(8).fill(null));
  for (let r = 0; r < 3; r++)
    for (let c = 0; c < 8; c++) if (dark(r, c)) b[r]![c] = { side: 1, king: false };
  for (let r = 5; r < 8; r++)
    for (let c = 0; c < 8; c++) if (dark(r, c)) b[r]![c] = { side: 0, king: false };
  return b;
}

const copyBoard = (b: CBoard): CBoard => b.map((row) => row.slice());

/** Forward is -1 for you, +1 for the machine; kings go both ways. */
const rowDirs = (p: Piece): number[] => (p.king ? [-1, 1] : [p.side === 0 ? -1 : 1]);

const inside = (r: number, c: number): boolean => r >= 0 && r < 8 && c >= 0 && c < 8;

const kingsRow = (side: 0 | 1): number => (side === 0 ? 0 : 7);

function jumpsFrom(b: CBoard, r: number, c: number, p: Piece): CMove[] {
  const out: CMove[] = [];
  for (const dr of rowDirs(p))
    for (const dc of [-1, 1]) {
      const mr = r + dr;
      const mc = c + dc;
      const lr = r + dr * 2;
      const lc = c + dc * 2;
      if (!inside(lr, lc)) continue;
      const mid = b[mr]![mc];
      if (!mid || mid.side === p.side || b[lr]![lc]) continue;
      const nb = copyBoard(b);
      nb[r]![c] = null;
      nb[mr]![mc] = null;
      const lands: Piece = { ...p };
      const crowned = !p.king && lr === kingsRow(p.side);
      if (crowned) lands.king = true;
      nb[lr]![lc] = lands;
      // kinging ends the move; otherwise the jump must run on if it can
      const more = crowned ? [] : jumpsFrom(nb, lr, lc, lands);
      if (more.length) {
        for (const m of more)
          out.push({ path: [[r, c], ...m.path], captures: [[mr, mc], ...m.captures] });
      } else {
        out.push({ path: [[r, c], [lr, lc]], captures: [[mr, mc]] });
      }
    }
  return out;
}

export function legalMoves(b: CBoard, side: 0 | 1): CMove[] {
  const jumps: CMove[] = [];
  const steps: CMove[] = [];
  for (let r = 0; r < 8; r++)
    for (let c = 0; c < 8; c++) {
      const p = b[r]![c];
      if (!p || p.side !== side) continue;
      jumps.push(...jumpsFrom(b, r, c, p));
      if (jumps.length) continue; // once a capture exists, steps stop mattering
      for (const dr of rowDirs(p))
        for (const dc of [-1, 1]) {
          const nr = r + dr;
          const nc = c + dc;
          if (inside(nr, nc) && !b[nr]![nc])
            steps.push({ path: [[r, c], [nr, nc]], captures: [] });
        }
    }
  return jumps.length ? jumps : steps;
}

export function applyMove(b: CBoard, m: CMove): CBoard {
  const nb = copyBoard(b);
  const [fr, fc] = m.path[0]!;
  const [tr, tc] = m.path[m.path.length - 1]!;
  const p = { ...nb[fr]![fc]! };
  nb[fr]![fc] = null;
  for (const [cr, cc] of m.captures) nb[cr]![cc] = null;
  if (!p.king && tr === kingsRow(p.side)) p.king = true;
  nb[tr]![tc] = p;
  return nb;
}

/** Positive is good for you (side 0). Men count, kings count more, men
    that have gotten somewhere count a little extra. */
export function evaluate(b: CBoard): number {
  let score = 0;
  for (let r = 0; r < 8; r++)
    for (let c = 0; c < 8; c++) {
      const p = b[r]![c];
      if (!p) continue;
      const base = p.king ? 160 : 100;
      const advance = p.king ? 0 : p.side === 0 ? (7 - r) * 2 : r * 2;
      score += (p.side === 0 ? 1 : -1) * (base + advance);
    }
  return score;
}

function search(b: CBoard, side: 0 | 1, depth: number, alpha: number, beta: number): number {
  const moves = legalMoves(b, side);
  if (!moves.length) return side === 0 ? -9999 - depth : 9999 + depth;
  if (depth === 0) return evaluate(b);
  if (side === 0) {
    let best = -Infinity;
    for (const m of moves) {
      best = Math.max(best, search(applyMove(b, m), 1, depth - 1, alpha, beta));
      alpha = Math.max(alpha, best);
      if (beta <= alpha) break;
    }
    return best;
  }
  let best = Infinity;
  for (const m of moves) {
    best = Math.min(best, search(applyMove(b, m), 0, depth - 1, alpha, beta));
    beta = Math.min(beta, best);
    if (beta <= alpha) break;
  }
  return best;
}

export function bestMove(
  b: CBoard,
  side: 0 | 1,
  depth = 7,
  rand: () => number = Math.random,
): CMove | null {
  const moves = legalMoves(b, side);
  if (!moves.length) return null;
  let best: CMove[] = [];
  let bestScore = side === 0 ? -Infinity : Infinity;
  for (const m of moves) {
    const s = search(applyMove(b, m), side === 0 ? 1 : 0, depth - 1, -Infinity, Infinity);
    if (s === bestScore) best.push(m);
    else if (side === 0 ? s > bestScore : s < bestScore) {
      bestScore = s;
      best = [m];
    }
  }
  return best[(rand() * best.length) | 0]!;
}

/* ---- the window ---- */

const SQ = 40;

export function openCheckers(wm: WM): void {
  const existing = wm.get("checkers");
  if (existing?.isOpen()) {
    existing.focus();
    return;
  }

  let b = initialBoard();
  let over = false;
  let busy = false; // the machine's turn, or hops mid-flight
  let selected: [number, number] | null = null;
  let quietPlies = 0;
  const timers: ReturnType<typeof setTimeout>[] = [];
  const later = (fn: () => void, ms: number): void => void timers.push(setTimeout(fn, ms));

  const body = el(`<div></div>`);
  const frame = el(`<div class="sunken" style="margin:6px 10px 4px;width:max-content;padding:3px"></div>`);
  const grid = el(`<div class="ckgrid"></div>`);
  frame.appendChild(grid);
  const status = el(`<div class="statusbar"><div></div></div>`);
  const statusEl = status.firstElementChild as HTMLElement;

  function render(highlightTargets: [number, number][] = []): void {
    grid.innerHTML = "";
    for (let r = 0; r < 8; r++)
      for (let c = 0; c < 8; c++) {
        const sq = el(`<div class="cksq ${dark(r, c) ? "d" : "l"}" data-r="${r}" data-c="${c}"></div>`);
        if (selected && selected[0] === r && selected[1] === c) sq.classList.add("sel");
        if (highlightTargets.some(([tr, tc]) => tr === r && tc === c)) sq.classList.add("tgt");
        const p = b[r]![c];
        if (p) {
          const pc = el(`<div class="ckpc ${p.side === 0 ? "r" : "y"}${p.king ? " king" : ""}"></div>`);
          sq.appendChild(pc);
        }
        grid.appendChild(sq);
      }
  }

  function end(kind: "youWin" | "machineWins" | "stale"): void {
    over = true;
    statusEl.textContent = "";
    later(() => {
      wm.dialog({ ...GAMES_COPY.checkers[kind], x: 430, y: 330, w: 350 });
    }, 500);
  }

  /** Walk a move hop by hop — steps, never a glide — then hand the turn on. */
  function animate(m: CMove, then: () => void): void {
    busy = true;
    let i = 1;
    const hop = (): void => {
      if (!win.isOpen()) return;
      const partial: CMove = { path: m.path.slice(0, i + 1), captures: m.captures.slice(0, i) };
      const shown = applyMove(b, partial);
      const keep = b;
      b = shown;
      render();
      b = keep;
      i++;
      // every hop lands; a jump is several, which is what a jump sounds like
      play("disc-land", 0.45);
      if (i < m.path.length) later(hop, 150);
      else
        later(() => {
          quietPlies = m.captures.length ? 0 : quietPlies + 1;
          b = applyMove(b, m);
          render();
          then();
        }, 150);
    };
    hop();
  }

  function machineTurn(): void {
    busy = true;
    statusEl.textContent = GAMES_COPY.checkers.thinking;
    later(() => {
      if (!win.isOpen() || over) return;
      const m = bestMove(b, 1);
      if (!m) {
        end("youWin");
        return;
      }
      animate(m, () => {
        if (quietPlies >= 80) {
          end("stale");
          return;
        }
        busy = false;
        if (!legalMoves(b, 0).length) {
          end("machineWins");
          return;
        }
        const captures = legalMoves(b, 0).some((mv) => mv.captures.length);
        statusEl.textContent = captures ? GAMES_COPY.checkers.mustCapture : GAMES_COPY.checkers.yourMove;
      });
    }, 550);
  }

  grid.addEventListener("click", (e) => {
    if (over || busy) return;
    const sq = (e.target as HTMLElement).closest<HTMLElement>(".cksq");
    if (!sq) return;
    const r = Number(sq.dataset.r);
    const c = Number(sq.dataset.c);
    const moves = legalMoves(b, 0);
    const p = b[r]![c];

    if (p?.side === 0) {
      selected = [r, c];
      const mine = moves.filter((m) => m.path[0]![0] === r && m.path[0]![1] === c);
      if (!mine.length && moves.some((m) => m.captures.length))
        statusEl.textContent = GAMES_COPY.checkers.mustCapture;
      render(mine.map((m) => m.path[m.path.length - 1]!));
      return;
    }
    if (!selected) return;
    const [sr, sc] = selected;
    const chosen = moves.find(
      (m) =>
        m.path[0]![0] === sr &&
        m.path[0]![1] === sc &&
        m.path[m.path.length - 1]![0] === r &&
        m.path[m.path.length - 1]![1] === c,
    );
    if (!chosen) return;
    selected = null;
    animate(chosen, () => {
      if (quietPlies >= 80) {
        end("stale");
        return;
      }
      if (!legalMoves(b, 1).length) {
        end("youWin");
        return;
      }
      machineTurn();
    });
  });

  function newGame(): void {
    for (const t of timers) clearTimeout(t);
    timers.length = 0;
    b = initialBoard();
    over = false;
    busy = false;
    selected = null;
    quietPlies = 0;
    statusEl.textContent = GAMES_COPY.checkers.yourMove;
    render();
  }

  const bar = menubar([
    { label: "Game", items: [["New", newGame], ["-", () => {}], ["Exit", () => win.close()]] },
    {
      label: "Help",
      items: [[
        "Contents",
        () => wm.dialog({ ...GAMES_COPY.checkers.help, x: 420, y: 300, w: 360 }),
      ]],
    },
  ]);

  body.append(bar, frame, status);
  const win = wm.open({
    id: "checkers",
    title: TITLES.checkers,
    icon: CHECKERS_ICON,
    x: 380,
    y: 96,
    w: 8 * SQ + 26 + 20,
    body,
    buttons: ["min", "close"],
    onClose: () => {
      for (const t of timers) clearTimeout(t);
    },
  });
  newGame();
}

export const CHECKERS_ICON = [
  "................", ".kkkkkkkkkkkkkk.", ".kwwkkwwkkwwkkk.", ".kwwkkwwkkwwkkk.",
  ".kkkwwkkwwkkwwk.", ".kkrwwkkwwkkywk.", ".kwwkkwwkkwwkkk.", ".kwrkkwwkkwykkk.",
  ".kkkwwkkwwkkwwk.", ".kkkwwkkrwkkwwk.", ".kwwkkwwkkwwkkk.", ".kwwkkwwkkwwkkk.",
  ".kkkwwkkwwkkwwk.", ".kkkkkkkkkkkkkk.", "................", "................",
] as const;
