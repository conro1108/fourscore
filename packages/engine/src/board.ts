/**
 * The board, as a bitboard.
 *
 * Layout is the standard Connect 4 packing: one column per `HEIGHT + 1` bits,
 * bottom row first, with the extra bit per column left permanently empty. That
 * sentinel row is what makes the win check work — shifting a bitmask up by one
 * can't leak from the top of column N into the bottom of column N+1, because
 * there's always a zero in between.
 *
 * A position is two masks:
 *   - `position` — the discs belonging to the player *about to move*
 *   - `mask`     — every disc on the board, either colour
 *
 * The opponent's discs are `position ^ mask`. Storing it from the mover's point
 * of view rather than as red/yellow is what lets the search be a plain negamax:
 * playing a move flips the perspective, and nothing downstream has to care
 * which colour it's reasoning about.
 *
 * 7x6 needs 49 bits, so these are `bigint`, not `number`. That costs us some
 * speed against a typed-array board, but it buys branch-free win detection —
 * `alignment()` decides a win in twelve operations regardless of board state,
 * with no loop over directions and no bounds checks. The search calls it
 * millions of times, and this file is the only place the packing is known.
 */

export const WIDTH = 7;
export const HEIGHT = 6;

/** Bits per column: the six playable rows plus the sentinel. */
const H1 = BigInt(HEIGHT + 1);
const HB = BigInt(HEIGHT);

const ONE = 1n;
const ZERO = 0n;

/** Lowest playable bit of each column, OR'd together. */
const BOTTOM_MASK_ALL = (() => {
  let m = ZERO;
  for (let col = 0; col < WIDTH; col++) m |= ONE << (BigInt(col) * H1);
  return m;
})();

/** Every playable cell (i.e. everything but the sentinel row). */
export const BOARD_MASK = BOTTOM_MASK_ALL * ((ONE << HB) - ONE);

/** Total playable cells — also the move count of a full board. */
export const CELLS = WIDTH * HEIGHT;

const bottomMaskCol = (col: number): bigint => ONE << (BigInt(col) * H1);
const topMaskCol = (col: number): bigint => ONE << (HB - ONE + BigInt(col) * H1);
const columnMask = (col: number): bigint => ((ONE << HB) - ONE) << (BigInt(col) * H1);

const BOTTOM_MASK_COL: readonly bigint[] = Array.from({ length: WIDTH }, (_, c) => bottomMaskCol(c));
const TOP_MASK_COL: readonly bigint[] = Array.from({ length: WIDTH }, (_, c) => topMaskCol(c));

/** Every playable cell of each column. The solver uses these to slice move masks. */
export const COLUMN_MASKS: readonly bigint[] = Array.from({ length: WIDTH }, (_, c) => columnMask(c));

const COLUMN_MASK = COLUMN_MASKS;

/**
 * Columns ordered centre-outward. Move ordering matters more than almost
 * anything else for alpha-beta, and in Connect 4 the centre column is part of
 * more winning lines than any other, so it's the best static guess available.
 */
export const MOVE_ORDER: readonly number[] = (() => {
  const order: number[] = [];
  const mid = (WIDTH - 1) / 2;
  for (let i = 0; i < WIDTH; i++) {
    // 3, 4, 2, 5, 1, 6, 0 for width 7
    const offset = Math.ceil(i / 2) * (i % 2 === 0 ? 1 : -1);
    order.push(Math.round(mid + offset));
  }
  return order;
})();

/** Red moves first. The two players are only distinguished at the UI edge. */
export type Player = "red" | "yellow";

export const PLAYERS: readonly Player[] = ["red", "yellow"];

/** A cell is owned by a player, or empty. */
export type Cell = Player | null;

/**
 * True if `pos` contains four in a row anywhere.
 *
 * Each block ANDs the mask with a copy of itself shifted by one step in some
 * direction, leaving a bit set wherever two discs are adjacent along it; doing
 * that twice (the second shift being double the first) leaves a bit set only
 * where four in a row start. The shift distances are the four directions in
 * this packing: 1 is vertical, H1 horizontal, HEIGHT and HEIGHT+2 the two
 * diagonals.
 */
export function alignment(pos: bigint): boolean {
  // Horizontal
  let m = pos & (pos >> H1);
  if (m & (m >> (2n * H1))) return true;

  // Diagonal "/"
  m = pos & (pos >> HB);
  if (m & (m >> (2n * HB))) return true;

  // Diagonal "\"
  const d = HB + 2n;
  m = pos & (pos >> d);
  if (m & (m >> (2n * d))) return true;

  // Vertical
  m = pos & (pos >> ONE);
  if (m & (m >> 2n)) return true;

  return false;
}

export class Position {
  /** Discs belonging to the player to move. */
  position: bigint;
  /** Every disc on the board. */
  mask: bigint;
  /** Plies played. Also tells you whose turn it is. */
  moves: number;

  constructor(position: bigint = ZERO, mask: bigint = ZERO, moves = 0) {
    this.position = position;
    this.mask = mask;
    this.moves = moves;
  }

  clone(): Position {
    return new Position(this.position, this.mask, this.moves);
  }

  /** The player to move. Red is on even plies because red opens. */
  get turn(): Player {
    return this.moves % 2 === 0 ? "red" : "yellow";
  }

  canPlay(col: number): boolean {
    if (col < 0 || col >= WIDTH) return false;
    return (this.mask & TOP_MASK_COL[col]!) === ZERO;
  }

  /** Legal columns, in centre-outward order. */
  legalMoves(): number[] {
    return MOVE_ORDER.filter((c) => this.canPlay(c));
  }

  /**
   * Drop a disc in `col`. Assumes the move is legal — callers that take
   * untrusted input (i.e. the UI) check `canPlay` first.
   *
   * The XOR is the perspective flip: after it, `position` describes the player
   * who is now to move rather than the one who just played.
   */
  play(col: number): void {
    this.position ^= this.mask;
    this.mask |= this.mask + BOTTOM_MASK_COL[col]!;
    this.moves++;
  }

  /** True if dropping in `col` wins immediately for the player to move. */
  isWinningMove(col: number): boolean {
    return (this.winningPositions() & this.possibleMoves() & COLUMN_MASK[col]!) !== ZERO;
  }

  /** True if the player to move has any immediate win. */
  canWinNext(): boolean {
    return (this.winningPositions() & this.possibleMoves()) !== ZERO;
  }

  isDraw(): boolean {
    return this.moves >= CELLS;
  }

  /** The set of cells that are playable right now, one per open column. */
  possibleMoves(): bigint {
    return (this.mask + BOTTOM_MASK_ALL) & BOARD_MASK;
  }

  /** Cells that would complete four for the player to move. */
  winningPositions(): bigint {
    return computeAlignmentSpots(this.position, this.mask);
  }

  /** Cells that would complete four for the opponent. */
  opponentWinningPositions(): bigint {
    return computeAlignmentSpots(this.position ^ this.mask, this.mask);
  }

  /**
   * Playable cells that don't hand the opponent an immediate win.
   *
   * Returns 0 in two distinct-looking but equivalent cases: the opponent has
   * two separate threats (unstoppable), or every legal move opens one up. The
   * caller treats both as "lost", which is correct — there's no move here that
   * survives the next ply either way.
   */
  nonLosingMoves(): bigint {
    let possible = this.possibleMoves();
    const opponentWin = this.opponentWinningPositions();
    const forced = possible & opponentWin;
    if (forced !== ZERO) {
      // The opponent has a threat we must answer. If there are two of them we
      // can only block one, so the position is already lost.
      if ((forced & (forced - ONE)) !== ZERO) return ZERO;
      possible = forced;
    }
    // Never play directly beneath an opponent winning cell — that's just
    // handing them the win on top of our own disc.
    return possible & ~(opponentWin >> ONE);
  }

  /**
   * A key that identifies this position uniquely for the transposition table.
   *
   * `position + mask` works because adding the full mask sets, for each column,
   * a bit one row above the stack — encoding the column heights — while leaving
   * the mover's discs distinguishable underneath. Two different positions can't
   * collide on it.
   */
  key(): bigint {
    return this.position + this.mask + BOTTOM_MASK_ALL;
  }

  /** Row-major grid, row 0 = top of the board, for rendering. */
  grid(): Cell[][] {
    const mover: Player = this.turn;
    const other: Player = mover === "red" ? "yellow" : "red";
    const rows: Cell[][] = [];
    for (let row = HEIGHT - 1; row >= 0; row--) {
      const line: Cell[] = [];
      for (let col = 0; col < WIDTH; col++) {
        const bit = ONE << (BigInt(col) * H1 + BigInt(row));
        if ((this.mask & bit) === ZERO) line.push(null);
        else line.push((this.position & bit) !== ZERO ? mover : other);
      }
      rows.push(line);
    }
    return rows;
  }

  /** The row a disc dropped in `col` would land in, as a grid row index. */
  landingRow(col: number): number {
    if (!this.canPlay(col)) return -1;
    let height = 0;
    for (let row = 0; row < HEIGHT; row++) {
      const bit = ONE << (BigInt(col) * H1 + BigInt(row));
      if ((this.mask & bit) === ZERO) break;
      height++;
    }
    return HEIGHT - 1 - height;
  }

  static fromMoves(cols: readonly number[]): Position {
    const p = new Position();
    for (const c of cols) {
      if (!p.canPlay(c)) throw new Error(`illegal move: column ${c}`);
      p.play(c);
    }
    return p;
  }
}

/**
 * Empty cells that would give `pos` four in a row if filled.
 *
 * This is the mirror image of `alignment`: instead of asking "are four already
 * here", it builds, for each direction, the cells that would complete a four —
 * three-in-a-row extended either way, plus the split patterns where the gap is
 * in the middle. Masked down to empty cells at the end.
 */
export function computeAlignmentSpots(pos: bigint, mask: bigint): bigint {
  // Vertical: only ever completes on top of three of your own.
  let r = (pos << ONE) & (pos << 2n) & (pos << 3n);

  const dirs = [H1, HB, HB + 2n];
  for (const d of dirs) {
    // Two of ours, adjacent, shifted one step along the direction.
    const p = (pos << d) & (pos << (2n * d));
    // ...extended outward on both sides, and the two split-gap cases.
    r |= p & (pos << (3n * d));
    r |= p & (pos >> d);
    const q = (pos >> d) & (pos >> (2n * d));
    r |= q & (pos << d);
    r |= q & (pos >> (3n * d));
  }

  return r & (BOARD_MASK ^ mask);
}

const COL_BITS = (ONE << HB) - ONE;

/**
 * The same position reflected left-to-right.
 *
 * Connect 4 is symmetric about the centre column, so a position and its mirror
 * always have identical scores with the columns swapped. Storing only one of
 * each pair halves the opening book.
 */
export function mirror(p: Position): Position {
  let position = ZERO;
  let mask = ZERO;
  for (let col = 0; col < WIDTH; col++) {
    const src = BigInt(col) * H1;
    const dst = BigInt(WIDTH - 1 - col) * H1;
    position |= ((p.position >> src) & COL_BITS) << dst;
    mask |= ((p.mask >> src) & COL_BITS) << dst;
  }
  return new Position(position, mask, p.moves);
}

/**
 * The canonical key for book storage: the smaller of this position's key and
 * its mirror's.
 *
 * `mirrored` tells the caller whether the stored entry is the reflection, so a
 * looked-up result can have its columns flipped back.
 */
export function canonical(p: Position): { key: bigint; mirrored: boolean } {
  const a = p.key();
  const b = mirror(p).key();
  return b < a ? { key: b, mirrored: true } : { key: a, mirrored: false };
}

/** Bit counts for every 16-bit value, so `popcount` costs four steps, not one per bit. */
const POP16 = (() => {
  const t = new Uint8Array(1 << 16);
  for (let i = 1; i < t.length; i++) t[i] = t[i >> 1]! + (i & 1);
  return t;
})();

const MASK16 = 0xffffn;

/**
 * Population count, used to weigh how many threats a position holds.
 *
 * Chews through the bigint 16 bits at a time. The obvious `x &= x - 1n` loop
 * allocates a fresh bigint per set bit, and this sits in the search's move
 * ordering, which is hot enough for that to show up.
 */
export function popcount(m: bigint): number {
  let n = 0;
  let x = m;
  while (x !== ZERO) {
    n += POP16[Number(x & MASK16)]!;
    x >>= 16n;
  }
  return n;
}
