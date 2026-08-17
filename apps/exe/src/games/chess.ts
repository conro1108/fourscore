/**
 * CHESS.EXE — the whole game, honestly: castling both ways, en passant,
 * promotion (you get asked; the machine does not need to be asked), check,
 * checkmate, stalemate, the fifty-move rule and threefold repetition. The
 * move generator is verified by perft against the published node counts,
 * because chess move generation passes every hand-written case and then
 * fails quietly on one pinned en-passant capture.
 *
 * The opponent is an iterative-deepening alpha-beta search with a capture
 * quiescence, time-boxed and yielding between depths so the desktop's fires
 * barely stutter while it considers all of it.
 */

import { el } from "../dom.js";
import { px } from "../icons.js";
import { GAMES_COPY, TITLES } from "../copy.js";
import { play } from "../audio/index.js";
import { centered, fieldScaler, type WM } from "../wm.js";
import { menubar } from "./ui.js";

/* ---- the pure part (perft lives on this) ---- */

export type PieceT = "p" | "n" | "b" | "r" | "q" | "k";
/** s: 0 = white (you, at the bottom), 1 = black (the machine). */
export interface ChPiece {
  t: PieceT;
  s: 0 | 1;
}
export type ChessBoard = (ChPiece | null)[][]; // [row][col], row 0 = rank 8

export interface ChessState {
  board: ChessBoard;
  turn: 0 | 1;
  /** [white kingside, white queenside, black kingside, black queenside] */
  castle: [boolean, boolean, boolean, boolean];
  /** En-passant target square, if the last move was a double push. */
  ep: [number, number] | null;
  /** Half-moves since a pawn moved or anything was captured. */
  half: number;
}

export interface ChessMove {
  from: [number, number];
  to: [number, number];
  promo?: PieceT;
}

const inb = (r: number, c: number): boolean => r >= 0 && r < 8 && c >= 0 && c < 8;
const at = (b: ChessBoard, r: number, c: number): ChPiece | null =>
  inb(r, c) ? b[r]![c]! : null;

const ORTH = [[-1, 0], [1, 0], [0, -1], [0, 1]] as const;
const DIAG = [[-1, -1], [-1, 1], [1, -1], [1, 1]] as const;
const KNIGHT = [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]] as const;

export function initialState(): ChessState {
  return parseFen("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1");
}

/** Enough FEN for the tests and the harness poses. */
export function parseFen(fen: string): ChessState {
  const [placement, turn, castle, ep, half] = fen.trim().split(/\s+/);
  const board: ChessBoard = placement!.split("/").map((row) => {
    const out: (ChPiece | null)[] = [];
    for (const ch of row) {
      if (/\d/.test(ch)) for (let i = 0; i < Number(ch); i++) out.push(null);
      else out.push({ t: ch.toLowerCase() as PieceT, s: ch === ch.toLowerCase() ? 1 : 0 });
    }
    return out;
  });
  return {
    board,
    turn: turn === "b" ? 1 : 0,
    castle: [castle!.includes("K"), castle!.includes("Q"), castle!.includes("k"), castle!.includes("q")],
    ep: !ep || ep === "-" ? null : [8 - Number(ep[1]), ep.charCodeAt(0) - 97],
    half: Number(half ?? 0),
  };
}

export function isAttacked(b: ChessBoard, r: number, c: number, by: 0 | 1): boolean {
  const pr = by === 0 ? r + 1 : r - 1; // white pawns attack upward
  for (const dc of [-1, 1]) {
    const p = at(b, pr, c + dc);
    if (p && p.s === by && p.t === "p") return true;
  }
  for (const [dr, dc] of KNIGHT) {
    const p = at(b, r + dr, c + dc);
    if (p && p.s === by && p.t === "n") return true;
  }
  for (const [dr, dc] of [...ORTH, ...DIAG]) {
    const p = at(b, r + dr, c + dc);
    if (p && p.s === by && p.t === "k") return true;
  }
  for (const dirs of [ORTH, DIAG] as const) {
    const slider = dirs === ORTH ? "r" : "b";
    for (const [dr, dc] of dirs) {
      let rr = r + dr;
      let cc = c + dc;
      while (inb(rr, cc)) {
        const p = b[rr]![cc];
        if (p) {
          if (p.s === by && (p.t === slider || p.t === "q")) return true;
          break;
        }
        rr += dr;
        cc += dc;
      }
    }
  }
  return false;
}

export function kingSquare(b: ChessBoard, side: 0 | 1): [number, number] {
  for (let r = 0; r < 8; r++)
    for (let c = 0; c < 8; c++) {
      const p = b[r]![c];
      if (p && p.t === "k" && p.s === side) return [r, c];
    }
  throw new Error("no king");
}

export function inCheck(s: ChessState, side: 0 | 1): boolean {
  const [kr, kc] = kingSquare(s.board, side);
  return isAttacked(s.board, kr, kc, side === 0 ? 1 : 0);
}

/** Pseudo-legal moves for the side to move (castling fully checked here). */
export function genMoves(s: ChessState): ChessMove[] {
  const out: ChessMove[] = [];
  const side = s.turn;
  const foe = side === 0 ? 1 : 0;
  const fwd = side === 0 ? -1 : 1;
  const startRow = side === 0 ? 6 : 1;
  const lastRow = side === 0 ? 0 : 7;
  const b = s.board;
  const push = (from: [number, number], to: [number, number]): void => {
    if (b[from[0]]![from[1]]!.t === "p" && to[0] === lastRow)
      for (const promo of ["q", "r", "b", "n"] as const) out.push({ from, to, promo });
    else out.push({ from, to });
  };

  for (let r = 0; r < 8; r++)
    for (let c = 0; c < 8; c++) {
      const p = b[r]![c];
      if (!p || p.s !== side) continue;
      if (p.t === "p") {
        if (!at(b, r + fwd, c) && inb(r + fwd, c)) {
          push([r, c], [r + fwd, c]);
          if (r === startRow && !at(b, r + fwd * 2, c)) out.push({ from: [r, c], to: [r + fwd * 2, c] });
        }
        for (const dc of [-1, 1]) {
          const q = at(b, r + fwd, c + dc);
          if (q && q.s === foe) push([r, c], [r + fwd, c + dc]);
          if (s.ep && s.ep[0] === r + fwd && s.ep[1] === c + dc && !q)
            out.push({ from: [r, c], to: [r + fwd, c + dc] });
        }
      } else if (p.t === "n" || p.t === "k") {
        for (const [dr, dc] of p.t === "n" ? KNIGHT : [...ORTH, ...DIAG]) {
          const rr = r + dr;
          const cc = c + dc;
          if (!inb(rr, cc)) continue;
          const q = b[rr]![cc];
          if (!q || q.s === foe) out.push({ from: [r, c], to: [rr, cc] });
        }
      } else {
        const dirs = p.t === "r" ? ORTH : p.t === "b" ? DIAG : [...ORTH, ...DIAG];
        for (const [dr, dc] of dirs) {
          let rr = r + dr;
          let cc = c + dc;
          while (inb(rr, cc)) {
            const q = b[rr]![cc];
            if (!q) out.push({ from: [r, c], to: [rr, cc] });
            else {
              if (q.s === foe) out.push({ from: [r, c], to: [rr, cc] });
              break;
            }
            rr += dr;
            cc += dc;
          }
        }
      }
    }

  // castling: rights + empty lane + the king never touches an attacked square
  const row = side === 0 ? 7 : 0;
  const [ks, qs] = side === 0 ? [s.castle[0], s.castle[1]] : [s.castle[2], s.castle[3]];
  const kingHome = b[row]![4];
  if (kingHome?.t === "k" && kingHome.s === side && !isAttacked(b, row, 4, foe)) {
    if (
      ks && !b[row]![5] && !b[row]![6] && b[row]![7]?.t === "r" && b[row]![7]!.s === side &&
      !isAttacked(b, row, 5, foe) && !isAttacked(b, row, 6, foe)
    )
      out.push({ from: [row, 4], to: [row, 6] });
    if (
      qs && !b[row]![3] && !b[row]![2] && !b[row]![1] && b[row]![0]?.t === "r" && b[row]![0]!.s === side &&
      !isAttacked(b, row, 3, foe) && !isAttacked(b, row, 2, foe)
    )
      out.push({ from: [row, 4], to: [row, 2] });
  }
  return out;
}

export function applyMove(s: ChessState, m: ChessMove): ChessState {
  const nb = s.board.map((row) => row.slice());
  const [fr, fc] = m.from;
  const [tr, tc] = m.to;
  const p = nb[fr]![fc]!;
  let half = s.half + 1;
  if (p.t === "p" || nb[tr]![tc]) half = 0;
  // en passant: a pawn landing diagonally on an empty square eats sideways
  if (p.t === "p" && fc !== tc && !nb[tr]![tc]) nb[fr]![tc] = null;
  nb[fr]![fc] = null;
  nb[tr]![tc] = m.promo ? { t: m.promo, s: p.s } : p;
  const ep: [number, number] | null =
    p.t === "p" && Math.abs(tr - fr) === 2 ? [(fr + tr) / 2, fc] : null;
  if (p.t === "k" && Math.abs(tc - fc) === 2) {
    if (tc === 6) {
      nb[fr]![5] = nb[fr]![7] ?? null;
      nb[fr]![7] = null;
    } else {
      nb[fr]![3] = nb[fr]![0] ?? null;
      nb[fr]![0] = null;
    }
  }
  const castle = [...s.castle] as ChessState["castle"];
  if (p.t === "k") {
    if (p.s === 0) castle[0] = castle[1] = false;
    else castle[2] = castle[3] = false;
  }
  for (const [r, c] of [[fr, fc], [tr, tc]] as const) {
    if (r === 7 && c === 7) castle[0] = false;
    if (r === 7 && c === 0) castle[1] = false;
    if (r === 0 && c === 7) castle[2] = false;
    if (r === 0 && c === 0) castle[3] = false;
  }
  return { board: nb, turn: s.turn === 0 ? 1 : 0, castle, ep, half };
}

export function legalMoves(s: ChessState): ChessMove[] {
  return genMoves(s).filter((m) => !inCheck(applyMove(s, m), s.turn));
}

/** Leaf count to a depth — the movegen's lie detector. */
export function perft(s: ChessState, depth: number): number {
  if (depth === 0) return 1;
  let n = 0;
  for (const m of genMoves(s)) {
    const ns = applyMove(s, m);
    if (inCheck(ns, s.turn)) continue;
    n += depth === 1 ? 1 : perft(ns, depth - 1);
  }
  return n;
}

/* ---- the opponent ---- */

const VAL: Record<PieceT, number> = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 0 };

/** Positive is good for white. Material, pawns that have gone somewhere,
    knights that live near the middle. */
export function evaluate(b: ChessBoard): number {
  let score = 0;
  for (let r = 0; r < 8; r++)
    for (let c = 0; c < 8; c++) {
      const p = b[r]![c];
      if (!p) continue;
      let v = VAL[p.t];
      if (p.t === "p") v += (p.s === 0 ? 6 - r : r - 1) * 5;
      if (p.t === "n" || p.t === "b") v += Math.round((3.5 - Math.abs(c - 3.5) + 3.5 - Math.abs(r - 3.5)) * 3);
      score += p.s === 0 ? v : -v;
    }
  return score;
}

const evalFor = (s: ChessState): number => (s.turn === 0 ? 1 : -1) * evaluate(s.board);

const moveScore = (s: ChessState, m: ChessMove): number => {
  const victim = s.board[m.to[0]]![m.to[1]];
  const attacker = s.board[m.from[0]]![m.from[1]]!;
  let sc = 0;
  if (victim) sc += VAL[victim.t] * 10 - VAL[attacker.t];
  if (m.promo) sc += VAL[m.promo];
  return sc;
};

function qsearch(s: ChessState, alpha: number, beta: number): number {
  const stand = evalFor(s);
  if (stand >= beta) return beta;
  if (stand > alpha) alpha = stand;
  const moves = genMoves(s)
    .filter((m) => {
      const p = s.board[m.from[0]]![m.from[1]]!;
      return s.board[m.to[0]]![m.to[1]] || m.promo === "q" || (p.t === "p" && m.from[1] !== m.to[1]);
    })
    .sort((a, b) => moveScore(s, b) - moveScore(s, a));
  for (const m of moves) {
    const ns = applyMove(s, m);
    if (inCheck(ns, s.turn)) continue;
    const v = -qsearch(ns, -beta, -alpha);
    if (v >= beta) return beta;
    if (v > alpha) alpha = v;
  }
  return alpha;
}

function alphabeta(s: ChessState, depth: number, alpha: number, beta: number): number {
  if (depth === 0) return qsearch(s, alpha, beta);
  const moves = genMoves(s).sort((a, b) => moveScore(s, b) - moveScore(s, a));
  let any = false;
  for (const m of moves) {
    const ns = applyMove(s, m);
    if (inCheck(ns, s.turn)) continue;
    any = true;
    const v = -alphabeta(ns, depth - 1, -beta, -alpha);
    if (v > alpha) {
      alpha = v;
      if (alpha >= beta) break;
    }
  }
  if (!any) return inCheck(s, s.turn) ? -100000 - depth : 0;
  return alpha;
}

/** One full-depth pass over shuffled root moves; first-found wins ties, and
    the shuffle is where the variety comes from. */
export function searchDepth(
  s: ChessState,
  depth: number,
  first: ChessMove | null,
  rand: () => number = Math.random,
): ChessMove | null {
  const legal = legalMoves(s);
  if (!legal.length) return null;
  for (let i = legal.length - 1; i > 0; i--) {
    const j = (rand() * (i + 1)) | 0;
    [legal[i], legal[j]] = [legal[j]!, legal[i]!];
  }
  if (first) {
    const idx = legal.findIndex(
      (m) =>
        m.from[0] === first.from[0] && m.from[1] === first.from[1] &&
        m.to[0] === first.to[0] && m.to[1] === first.to[1] && m.promo === first.promo,
    );
    if (idx > 0) {
      legal.splice(idx, 1);
      legal.unshift(first);
    }
  }
  let best = legal[0]!;
  let alpha = -Infinity;
  for (const m of legal) {
    const v = -alphabeta(applyMove(s, m), depth - 1, -Infinity, alpha === -Infinity ? Infinity : -alpha);
    if (v > alpha) {
      alpha = v;
      best = m;
    }
  }
  return best;
}

/** Iterative deepening on a time budget, yielding between depths so the
    desktop keeps burning while the machine considers all of it. */
export function bestMoveTimed(
  s: ChessState,
  budgetMs: number,
  done: (m: ChessMove | null) => void,
): void {
  const start = Date.now();
  let best: ChessMove | null = null;
  let depth = 1;
  let lastCost = 0;
  const step = (): void => {
    const t0 = Date.now();
    best = searchDepth(s, depth, best) ?? best;
    lastCost = Date.now() - t0;
    depth++;
    const elapsed = Date.now() - start;
    if (best === null || depth > 4 || elapsed + lastCost * 5 > budgetMs * 2) {
      done(best);
      return;
    }
    setTimeout(step, 0);
  };
  setTimeout(step, 0);
}

/* ---- what the window is allowed to say ----

   Two readings of the same position, and the difference between them is the
   confidence law. `outcomeOf` is the rules speaking: checkmate, stalemate and
   the two drawing counts are facts, so the window states them flat and leaves
   them on the board. `sharpness` is a heuristic — material standing loose, a
   king addressed, a mate available, the evaluation lurching — so everything it
   drives hedges and everything it drives is reversible. It may never end a
   game or claim one; all it does is make the window sit up. ---- */

export type ChessEnd = "youWin" | "machineWins" | "stalemate" | "fifty" | "threefold";

/** The result, if there is one. `repeats` is how many times this exact
    position has now stood, including this one. */
export function outcomeOf(s: ChessState, repeats: number): ChessEnd | null {
  if (repeats >= 3) return "threefold";
  if (s.half >= 100) return "fifty";
  if (legalMoves(s).length) return null;
  return inCheck(s, s.turn) ? (s.turn === 0 ? "machineWins" : "youWin") : "stalemate";
}

/** The squares the OS selects to say what happened. A mate or a stalemate is
    about one king — the one with nowhere to go. A draw by count is about both
    of them, so both get selected. */
export function endSquares(s: ChessState, kind: ChessEnd): [number, number][] {
  if (kind === "fifty" || kind === "threefold")
    return [kingSquare(s.board, 0), kingSquare(s.board, 1)];
  return [kingSquare(s.board, s.turn)];
}

/** Kings are priceless rather than free when the question is "who can take
    this" — a king is the most expensive attacker there is, not the cheapest. */
const ATT: Record<PieceT, number> = { ...VAL, k: 10000 };

/** The cheapest piece of `by` attacking (r,c), by value; Infinity for none.
    Same scan as `isAttacked`, kept honest by reporting what it found. */
export function attackerValue(b: ChessBoard, r: number, c: number, by: 0 | 1): number {
  let best = Infinity;
  const keep = (t: PieceT): void => {
    if (ATT[t] < best) best = ATT[t];
  };
  const pr = by === 0 ? r + 1 : r - 1;
  for (const dc of [-1, 1]) {
    const p = at(b, pr, c + dc);
    if (p && p.s === by && p.t === "p") keep("p");
  }
  for (const [dr, dc] of KNIGHT) {
    const p = at(b, r + dr, c + dc);
    if (p && p.s === by && p.t === "n") keep("n");
  }
  for (const [dr, dc] of [...ORTH, ...DIAG]) {
    const p = at(b, r + dr, c + dc);
    if (p && p.s === by && p.t === "k") keep("k");
  }
  for (const dirs of [ORTH, DIAG] as const) {
    const slider = dirs === ORTH ? "r" : "b";
    for (const [dr, dc] of dirs) {
      let rr = r + dr;
      let cc = c + dc;
      while (inb(rr, cc)) {
        const p = b[rr]![cc];
        if (p) {
          if (p.s === by && (p.t === slider || p.t === "q")) keep(p.t);
          break;
        }
        rr += dr;
        cc += dc;
      }
    }
  }
  return best;
}

/** The most material standing where it can be taken for less, either colour —
    undefended costs everything, defended costs the difference. A guess, and
    the copy it drives says so. */
export function hangingValue(b: ChessBoard): number {
  let worst = 0;
  for (let r = 0; r < 8; r++)
    for (let c = 0; c < 8; c++) {
      const p = b[r]![c];
      if (!p || p.t === "k") continue;
      const foe: 0 | 1 = p.s === 0 ? 1 : 0;
      const att = attackerValue(b, r, c, foe);
      if (att === Infinity) continue;
      const def = attackerValue(b, r, c, p.s);
      const loss = def === Infinity ? VAL[p.t] : Math.max(0, VAL[p.t] - att);
      if (loss > worst) worst = loss;
    }
  return worst;
}

/** Does the side to move have mate on the board right now. One ply deep, once
    per move — the search costs a hundred times this. */
export function mateInOne(s: ChessState): boolean {
  for (const m of legalMoves(s)) {
    const ns = applyMove(s, m);
    if (inCheck(ns, ns.turn) && !legalMoves(ns).length) return true;
  }
  return false;
}

export type PressureNote = "check" | "loose" | "swing" | "mate";

export interface Sharpness {
  /** 0..1, and only ever a guess. */
  level: number;
  /** 0 calm, 3 as far as this window goes — a fraction of the desktop's. */
  tier: 0 | 1 | 2 | 3;
  /** Which reading is loudest, for the hedged line the titlebar carries. */
  note: PressureNote | null;
}

/** How sharp the position looks, from four honest readings of it. `swing` is
    how far the evaluation moved on the last ply. */
export function sharpness(s: ChessState, swing = 0): Sharpness {
  const parts: [PressureNote, number][] = [
    ["check", inCheck(s, 0) || inCheck(s, 1) ? 0.34 : 0],
    ["loose", 0.42 * Math.min(1, hangingValue(s.board) / 900)],
    ["swing", 0.3 * Math.min(1, Math.abs(swing) / 400)],
    ["mate", mateInOne(s) ? 0.62 : 0],
  ];
  const level = Math.min(1, parts.reduce((a, [, v]) => a + v, 0));
  const top = parts.reduce((a, b) => (b[1] > a[1] ? b : a));
  const tier = level >= 0.8 ? 3 : level >= 0.55 ? 2 : level >= 0.28 ? 1 : 0;
  return { level, tier, note: tier === 0 ? null : top[0] };
}

/* ---- the window ---- */

/* The men are drawn, not typeset — 16x16 sprites through the same px() the
   desk's icons go through, because an antialiased font glyph is the one
   thing on this machine that could never have shipped in 1995. One shape
   per man; the sides are palettes (k outline, f fill, s shade). */
const PIECE_ART: Record<PieceT, readonly string[]> = {
  p: [
    "................",
    "................",
    "......kkkk......",
    ".....kffffk.....",
    ".....ksfffk.....",
    ".....kffffk.....",
    "......kffk......",
    ".....kffffk.....",
    "......kffk......",
    "......kffk......",
    ".....ksfffk.....",
    ".....kffffk.....",
    "....ksfffffk....",
    "...kffffffffk...",
    "...kkkkkkkkkk...",
    "................",
  ],
  r: [
    "................",
    "..kkk.kkkk.kkk..",
    "..kfk.kffk.kfk..",
    "..kfkkkffkkkfk..",
    "..kffffffffffk..",
    "...ksffffffsk...",
    "....ksffffk.....",
    "....kfffffk.....",
    "....ksffffk.....",
    "....kfffffk.....",
    "....ksffffk.....",
    "...ksffffffk....",
    "..ksffffffffk...",
    "..kffffffffffk..",
    "..kkkkkkkkkkkk..",
    "................",
  ],
  n: [
    "................",
    ".....kk..kk.....",
    "....kfkkkffk....",
    "...kffffffffk...",
    "..kffffffffffk..",
    ".kffkffffffffk..",
    ".kfffffffffffk..",
    ".kkffkkfffffk...",
    "..kk...kffffk...",
    "......ksffffk...",
    ".....ksfffffk...",
    "....ksffffffk...",
    "...ksffffffffk..",
    "...kfffffffffk..",
    "...kkkkkkkkkkk..",
    "................",
  ],
  b: [
    "................",
    ".......kk.......",
    "......kffk......",
    ".......kk.......",
    "......kkkk......",
    ".....kffffk.....",
    "....ksffkffk....",
    "....kffkfffk....",
    "....ksfffffk....",
    ".....kffffk.....",
    "......kffk......",
    "......kffk......",
    ".....kffffk.....",
    "...ksfffffffk...",
    "...kkkkkkkkkk...",
    "................",
  ],
  q: [
    "................",
    "...k...kk...k...",
    "..kfk.kffk.kfk..",
    "..kfk.kffk.kfk..",
    "..kfkkkffkkkfk..",
    "..kffffffffffk..",
    "...ksffffffsk...",
    "....kffffffk....",
    ".....kffffk.....",
    ".....ksfffk.....",
    ".....kffffk.....",
    "....ksfffffk....",
    "....kffffffk....",
    "...kffffffffk...",
    "...kkkkkkkkkk...",
    "................",
  ],
  k: [
    ".......kk.......",
    "......kkkk......",
    ".......kk.......",
    "......kkkk......",
    ".....kffffk.....",
    "....ksfffffk....",
    "....kffffffk....",
    ".....kffffk.....",
    ".....ksfffk.....",
    ".....kffffk.....",
    ".....kffffk.....",
    "....ksfffffk....",
    "....kffffffk....",
    "...kffffffffk...",
    "...kkkkkkkkkk...",
    "................",
  ],
};

const PIECE_PAL: readonly Record<string, string>[] = [
  { k: "#000", f: "#fff", s: "#a8a8a8" }, // white: paper and pencil
  { k: "#000", f: "#404040", s: "#6a6a6a" }, // black: coal with a sheen
];

const pieceCanvas = (t: PieceT, side: 0 | 1): HTMLCanvasElement => {
  const cv = el(`<canvas class="pix" width="16" height="16"></canvas>`) as HTMLCanvasElement;
  px(cv, PIECE_ART[t], PIECE_PAL[side]!);
  return cv;
};

const repKey = (s: ChessState): string =>
  s.board.map((row) => row.map((p) => (p ? (p.s ? p.t : p.t.toUpperCase()) : ".")).join("")).join("/") +
  `|${s.turn}|${s.castle.join("")}|${s.ep ?? "-"}`;

/**
 * CHESS.EXE's own chrome, which nothing else on the desktop shares. It ships
 * its own rules rather than adding to chrome.css for the reason the fever is
 * local in the first place: a game on the shelf may degrade itself and may not
 * reach the desktop, and a stylesheet is a way of reaching the desktop.
 *
 * Everything here is sized off `--sq`, the live square, so a dragged window
 * keeps its ants and its ants keep their proportions. Nothing eases: the
 * ants step, the tiers land instantly.
 */
let styleInstalled = false;
function installChessStyle(): void {
  if (styleInstalled) return;
  styleInstalled = true;
  document.head.appendChild(
    el(`<style>
/* the result, selected the way the OS selects anything: marching ants, two
   dashed borders half a dash apart, swapping colour on a step */
.chessfx .cksq.chdone{position:relative}
.chessfx .chants{position:absolute;--ant:max(2px,calc(var(--sq,40px)/20));
  inset:calc(var(--ant)*-1);pointer-events:none;z-index:3}
.chessfx .chants i{position:absolute;inset:0;border:var(--ant) dashed #fff;
  animation:chmarch .32s steps(1,end) infinite}
.chessfx .chants i+i{border-color:#000;transform:translate(var(--ant),var(--ant));animation-delay:.16s}
@keyframes chmarch{0%{border-color:#fff}50%{border-color:#000}}
.chessfx .statusbar div.chover{font-weight:bold}

/* the minor fever: this window's own board, its own gray, its own titlebar.
   Three steps, each one a state that stays until the position calms. */
.chessfx .cksq.d{background:var(--dk,#9c5a3c)}
.chessfx .cksq.l{background:var(--lt,#ecd8b0)}
.chessfx.chfev1{background:#bdbab4}
.chessfx.chfev2{background:#b8b2a8}
.chessfx.chfev3{background:#b0a598}
.chessfx.chfev3 .titlebar.active{background:linear-gradient(90deg,#4a4358,#7e7590)}
</style>`),
  );
}

/** The board's three warmer states, and the one it goes back to. */
const HEAT: readonly (readonly [string, string])[] = [
  ["#9c5a3c", "#ecd8b0"],
  ["#96513a", "#e7cfa2"],
  ["#8d4331", "#dfc290"],
  ["#7f3227", "#d3b078"],
];

/** `fen` is a harness pose (?state=chess&fen=...). Live play never passes it. */
export function openChess(wm: WM, fen?: string): void {
  const existing = wm.get("chess");
  if (existing?.isOpen()) {
    existing.focus();
    return;
  }
  installChessStyle();

  let s = fen ? parseFen(fen) : initialState();

  /* Skill: how much of it the computer considers. Novice and Standard are
     fixed shallow searches (still no hung pieces — the quiescence sees
     captures); Expert is the timed iterative deepening. */
  type Skill = "novice" | "standard" | "expert";
  const SKILLS: readonly (readonly [Skill, string])[] = [
    ["novice", "Novice"],
    ["standard", "Standard"],
    ["expert", "Expert"],
  ];
  let skill = (localStorage.getItem("exe.chessSkill") ?? "expert") as Skill;
  if (!SKILLS.some(([id]) => id === skill)) skill = "expert";

  function think(done: (m: ChessMove | null) => void): void {
    if (skill === "expert") {
      bestMoveTimed(s, 900, done);
      return;
    }
    const depth = skill === "novice" ? 1 : 2;
    setTimeout(() => done(searchDepth(s, depth, null)), 0);
  }

  const thinkingLine = (): string =>
    skill === "novice" ? GAMES_COPY.chess.thinkingSome :
    skill === "standard" ? GAMES_COPY.chess.thinkingMost :
    GAMES_COPY.chess.thinking;

  let over = false;
  let busy = false;
  let selected: [number, number] | null = null;
  let lastMove: ChessMove | null = null;
  let seen = new Map<string, number>();
  /** The finished position's selection. Set once, cleared only by a new game —
      this is the record, and the record is what was missing. */
  let ended: [number, number][] = [];
  /** The window's own temperature (0..3) and the evaluation it last read, for
      the swing. Neither leaves this window. */
  let heat = 0;
  let lastEval = evaluate(s.board);
  const timers: ReturnType<typeof setTimeout>[] = [];
  const later = (fn: () => void, ms: number): void => void timers.push(setTimeout(fn, ms));

  const body = el(`<div></div>`);
  const frame = el(`<div class="sunken" style="margin:6px 10px 4px;width:max-content;padding:3px"></div>`);
  const grid = el(`<div class="ckgrid"></div>`);
  frame.appendChild(grid);
  const status = el(`<div class="statusbar"><div></div></div>`);
  const statusEl = status.firstElementChild as HTMLElement;

  function render(targets: [number, number][] = []): void {
    grid.innerHTML = "";
    const checked = inCheck(s, s.turn) ? kingSquare(s.board, s.turn) : null;
    for (let r = 0; r < 8; r++)
      for (let c = 0; c < 8; c++) {
        const sq = el(`<div class="cksq ${(r + c) % 2 ? "d" : "l"}" data-r="${r}" data-c="${c}"></div>`);
        if (selected && selected[0] === r && selected[1] === c) sq.classList.add("sel");
        if (targets.some(([tr, tc]) => tr === r && tc === c)) sq.classList.add("tgt");
        if (checked && checked[0] === r && checked[1] === c) sq.classList.add("chk");
        if (
          lastMove &&
          ((lastMove.from[0] === r && lastMove.from[1] === c) || (lastMove.to[0] === r && lastMove.to[1] === c))
        )
          sq.classList.add("last");
        const p = s.board[r]![c];
        if (p) {
          const pc = el(`<div class="chpc"></div>`);
          pc.appendChild(pieceCanvas(p.t, p.s));
          sq.appendChild(pc);
        }
        // the result, redrawn with the board so it survives every re-render
        // and every resize — the ants are a fraction of the square, not of 40
        if (ended.some(([er, ec]) => er === r && ec === c)) {
          sq.classList.add("chdone");
          sq.appendChild(el(`<div class="chants"><i></i><i></i></div>`));
        }
        grid.appendChild(sq);
      }
  }

  /* ---- the window's own weather ----
     A fraction of what the desktop does, and it cannot reach the desktop: the
     board warms, the window's gray gets dirtier, the titlebar loses some blood
     and carries a hedged note. Three steps, all reversible, none of them over
     the board — the squares stay exactly as clickable as they were. */
  function setHeat(tier: number, note: PressureNote | null): void {
    const rose = tier > heat;
    heat = tier;
    for (const t of [1, 2, 3]) win.el.classList.toggle(`chfev${t}`, tier >= t);
    const [dk, lt] = HEAT[tier]!;
    frame.style.setProperty("--dk", dk);
    frame.style.setProperty("--lt", lt);
    win.setTitle(note ? TITLES.chessNote(GAMES_COPY.chess.pressure[note]) : TITLES.chess);
    // the room changing, filed as the system event it is — and quietly, because
    // BOARD.EXE is the machine's fever and this is a window's
    if (rose && tier >= 2) play("tier-cross", 0.3);
  }

  /** Read the position and let the window answer it. Once per ply. */
  function takeTemperature(): void {
    const now = evaluate(s.board);
    const sharp = sharpness(s, now - lastEval);
    lastEval = now;
    setHeat(sharp.tier, sharp.note);
  }

  /**
   * The result, and it stays. The mated king's square is selected the way the
   * OS selects anything and is still selected when the dialog has gone; the
   * statusbar keeps saying what happened; the titlebar carries the word for
   * good. One dialog, no cascade — the win in BOARD.EXE is the biggest thing
   * this machine announces and nothing on the shelf goes near it.
   */
  function end(kind: ChessEnd): void {
    over = true;
    busy = false;
    ended = endSquares(s, kind);
    // whatever the position was doing, it has stopped doing it
    setHeat(0, null);
    win.setTitle(TITLES.chessNote(GAMES_COPY.chess.overTitle[kind]));
    statusEl.textContent = GAMES_COPY.chess.over[kind];
    statusEl.classList.add("chover");
    render();
    later(() => {
      wm.dialog({
        ...GAMES_COPY.chess[kind],
        buttons: GAMES_COPY.chess.overButtons,
        // under the window, not over it: the finished position is the point,
        // and the machine has never covered a board to talk about one
        x: 440,
        y: 552,
        w: 360,
        onButton: (i) => {
          if (i === 1) newGame();
        },
      });
    }, 500);
  }

  /** After a move lands: the facts first, then how sharp it all looks. */
  function settle(next: () => void): void {
    const key = repKey(s);
    seen.set(key, (seen.get(key) ?? 0) + 1);
    const kind = outcomeOf(s, seen.get(key)!);
    if (kind) {
      end(kind);
      return;
    }
    takeTemperature();
    next();
  }

  function machineTurn(): void {
    busy = true;
    statusEl.textContent = thinkingLine();
    later(() => {
      if (!win.isOpen() || over) return;
      think((m) => {
        if (!win.isOpen() || over) return;
        if (!m) {
          settle(() => {});
          return;
        }
        s = applyMove(s, m);
        lastMove = m;
        play("disc-land", 0.45);
        render();
        settle(() => {
          busy = false;
          statusEl.textContent = inCheck(s, 0) ? GAMES_COPY.chess.check : GAMES_COPY.chess.yourMove;
        });
      });
    }, 450);
  }

  function playerMove(m: ChessMove): void {
    selected = null;
    s = applyMove(s, m);
    lastMove = m;
    // a piece set down — the same knock the discs land with, on wood
    play("disc-land", 0.45);
    render();
    settle(() => machineTurn());
  }

  grid.addEventListener("click", (e) => {
    if (over || busy) return;
    const sq = (e.target as HTMLElement).closest<HTMLElement>(".cksq");
    if (!sq) return;
    const r = Number(sq.dataset.r);
    const c = Number(sq.dataset.c);
    const moves = legalMoves(s);
    const p = s.board[r]![c];

    if (p?.s === 0) {
      selected = [r, c];
      const mine = moves.filter((m) => m.from[0] === r && m.from[1] === c);
      render(mine.map((m) => m.to));
      return;
    }
    if (!selected) return;
    const [sr, sc] = selected;
    const matches = moves.filter(
      (m) => m.from[0] === sr && m.from[1] === sc && m.to[0] === r && m.to[1] === c,
    );
    if (!matches.length) return;
    if (matches.length === 1) {
      playerMove(matches[0]!);
      return;
    }
    // four ways up the same square: the pawn must become something
    busy = true;
    let chosen = false;
    const dlg = wm.dialog({
      ...GAMES_COPY.chess.promote,
      buttons: ["Queen", "Rook", "Bishop", "Knight"],
      x: 440,
      y: 320,
      w: 400,
      onButton(i) {
        chosen = true;
        busy = false;
        const promo = (["q", "r", "b", "n"] as const)[i]!;
        playerMove(matches.find((m) => m.promo === promo)!);
      },
    });
    // closing the dialog without answering means the obvious thing
    const watch = setInterval(() => {
      if (chosen || !win.isOpen()) {
        clearInterval(watch);
        return;
      }
      if (!dlg.isOpen()) {
        clearInterval(watch);
        busy = false;
        playerMove(matches.find((m) => m.promo === "q")!);
      }
    }, 150);
  });

  function newGame(): void {
    for (const t of timers) clearTimeout(t);
    timers.length = 0;
    s = initialState();
    over = false;
    busy = false;
    selected = null;
    lastMove = null;
    seen = new Map();
    // the record comes down with the game it was a record of
    ended = [];
    lastEval = evaluate(s.board);
    setHeat(0, null);
    statusEl.classList.remove("chover");
    statusEl.textContent = GAMES_COPY.chess.yourMove;
    render();
    seen.set(repKey(s), 1);
  }

  const makeBar = (): HTMLElement =>
    menubar([
      { label: "Game", items: [["New", newGame], ["-", () => {}], ["Exit", () => win.close()]] },
      {
        label: "Skill",
        items: SKILLS.map(([id, label]) => [label, () => setSkill(id), skill === id] as const),
      },
      {
        label: "Help",
        items: [[
          "Contents",
          () => wm.dialog({ ...GAMES_COPY.chess.help, x: 440, y: 300, w: 340 }),
        ]],
      },
    ]);
  let bar = makeBar();

  function setSkill(id: Skill): void {
    if (id === skill) return;
    skill = id;
    localStorage.setItem("exe.chessSkill", id);
    // rebuild the bar so the checkmark moves; takes hold on the next move
    const next = makeBar();
    bar.replaceWith(next);
    bar = next;
  }

  body.append(bar, frame, status);

  /* Same board family as CHECKERS.EXE, so the same squares and the same
     ladder: drag the window and the pieces grow with their squares. */
  const naturalMargin = frame.style.margin;
  const relayout = fieldScaler({
    win: () => win.el,
    grid: () => ({ cols: 8, rows: 8 }),
    chrome: { w: 46, h: 86 },
    cell: { base: 40, step: 8, min: 24, max: 96 },
    apply(sq, wide) {
      frame.style.setProperty("--sq", `${sq}px`);
      frame.style.margin = wide ? centered(naturalMargin) : naturalMargin;
    },
  });

  const win = wm.open({
    id: "chess",
    title: TITLES.chess,
    icon: CHESS_ICON,
    // everything this window does to itself is scoped under this class
    cls: "chessfx",
    x: 430,
    y: 120,
    w: 8 * 40 + 26 + 20,
    body,
    buttons: ["min", "close"],
    resizable: true,
    minW: 8 * 24 + 46,
    minH: 8 * 24 + 86,
    onResize: relayout,
    onMaximize: relayout,

    onClose: () => {
      for (const t of timers) clearTimeout(t);
    },
  });

  statusEl.textContent = inCheck(s, 0) ? GAMES_COPY.chess.check : GAMES_COPY.chess.yourMove;
  render();
  relayout();
  // A pose (?state=chess&fen=...) can hand the window a position that is
  // already over, or already sharp, so the opening goes through the same
  // settle every move does rather than a shortcut that only reads the turn.
  settle(() => {
    if (s.turn === 1) machineTurn();
  });
}

export const CHESS_ICON = [
  "................",
  ".......kk.......",
  "......kkkk......",
  ".....kkkkkk.....",
  "....kkkwkkkk....",
  "...kkkkkkkkk....",
  "..kkkk..kkkk....",
  "..kkk...kkkk....",
  "........kkkk....",
  ".......kkkkk....",
  "......kkkkkk....",
  ".....kkkkkkk....",
  "....kkkkkkkkk...",
  "...kkkkkkkkkkk..",
  "...kkkkkkkkkkk..",
  "................",
] as const;
