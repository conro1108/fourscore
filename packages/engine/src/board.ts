/**
 * The board as a bitboard. The only file that knows the packing: one column per
 * `height + 1` bits, bottom row first, top bit of each column a permanent zero
 * sentinel. `position` = discs of the player to move, `mask` = all discs;
 * opponent = `position ^ mask`. Playing a move flips perspective (plain negamax).
 * bigint, not number: 7x6 already needs 49 bits. See CLAUDE.md § bitboard packing.
 */

const ONE = 1n;
const ZERO = 0n;

/** Red moves first. The two players are only distinguished at the UI edge. */
export type Player = "red" | "yellow";

export const PLAYERS: readonly Player[] = ["red", "yellow"];

/** A cell is owned by a player, or empty. */
export type Cell = Player | null;

export interface VariantSpec {
  id: string;
  /** What to call it on screen. */
  name: string;
  width: number;
  height: number;
  /** How many in a row wins. */
  run: number;
}

/**
 * A board geometry plus everything derived from it.
 *
 * Built once and shared. Nothing here is cheap enough to recompute per node,
 * and several of the fields (`moveOrder`, `dirs`, the shift schedules) are read
 * inside the search's innermost loop.
 */
export interface Variant extends VariantSpec {
  /** Bits per column: the playable rows plus the sentinel. */
  readonly h1: bigint;
  /** Total playable cells — also the move count of a full board. */
  readonly cells: number;
  /** Every playable cell (i.e. everything but the sentinel row). */
  readonly boardMask: bigint;
  /** Lowest playable bit of each column, OR'd together. */
  readonly bottomAll: bigint;
  readonly bottomMaskCol: readonly bigint[];
  readonly topMaskCol: readonly bigint[];
  /** Every playable cell of each column. The solver uses these to slice move masks. */
  readonly columnMasks: readonly bigint[];
  /** Columns ordered centre-outward. */
  readonly moveOrder: readonly number[];
  /** The four line directions, as shift distances in this packing. */
  readonly dirs: readonly bigint[];
  /** Bits needed for a `key()`, which bounds how the table can store one. */
  readonly keyBits: number;
  /** Shift schedules for `alignment`, one list per direction. */
  readonly runShifts: readonly (readonly bigint[])[];
  /** Shift schedules for `computeAlignmentSpots`, one list per direction. */
  readonly gapShifts: readonly (readonly bigint[])[];
}

export function makeVariant(spec: VariantSpec): Variant {
  const { width, height, run } = spec;
  if (run < 3) throw new Error(`run must be at least 3: ${run}`);
  if (run > width && run > height) {
    throw new Error(`run ${run} doesn't fit on a ${width}x${height} board`);
  }

  const h1 = BigInt(height + 1);
  const hb = BigInt(height);
  const cells = width * height;

  const bottomAll = (() => {
    let m = ZERO;
    for (let col = 0; col < width; col++) m |= ONE << (BigInt(col) * h1);
    return m;
  })();

  const boardMask = bottomAll * ((ONE << hb) - ONE);

  const bottomMaskCol = Array.from({ length: width }, (_, c) => ONE << (BigInt(c) * h1));
  const topMaskCol = Array.from({ length: width }, (_, c) => ONE << (hb - ONE + BigInt(c) * h1));
  const columnMasks = Array.from(
    { length: width },
    (_, c) => ((ONE << hb) - ONE) << (BigInt(c) * h1),
  );

  // Centre-out: 3, 4, 2, 5, 1, 6, 0 for width 7.
  const moveOrder = (() => {
    const order: number[] = [];
    const mid = (width - 1) / 2;
    for (let i = 0; i < width; i++) {
      const offset = Math.ceil(i / 2) * (i % 2 === 0 ? 1 : -1);
      order.push(Math.round(mid + offset));
    }
    return order;
  })();

  // Vertical, horizontal, two diagonals. Each moves exactly one row per step —
  // the sentinel-row argument depends on that.
  const dirs = [ONE, h1, h1 - ONE, h1 + ONE] as const;

  const runShifts = dirs.map((d) =>
    Array.from({ length: run - 1 }, (_, k) => BigInt(k + 1) * d),
  );
  const gapShifts = dirs.map((d) => Array.from({ length: run }, (_, k) => BigInt(k) * d));

  return {
    ...spec,
    h1,
    cells,
    boardMask,
    bottomAll,
    bottomMaskCol,
    topMaskCol,
    columnMasks,
    moveOrder,
    dirs,
    keyBits: width * (height + 1),
    runShifts,
    gapShifts,
  };
}

export const CONNECT4 = makeVariant({
  id: "connect4",
  name: "Connect 4",
  width: 7,
  height: 6,
  run: 4,
});

/**
 * Line density per cell: C4 1.64, C5 1.61, C6 1.59, C7 1.58 — boards are sized
 * to hold that. Width must stay odd (true centre column) and height even: the
 * parity heuristic in `evaluate.ts` is a theorem only for even heights.
 */
export const CONNECT5 = makeVariant({
  id: "connect5",
  name: "Connect 5",
  width: 9,
  height: 8,
  run: 5,
});

export const CONNECT6 = makeVariant({
  id: "connect6",
  name: "Connect 6",
  width: 11,
  height: 10,
  run: 6,
});

export const CONNECT7 = makeVariant({
  id: "connect7",
  name: "Connect 7",
  width: 13,
  height: 12,
  run: 7,
});

export const VARIANTS: readonly Variant[] = [CONNECT4, CONNECT5, CONNECT6, CONNECT7];

export const variantById = (id: string): Variant => {
  const v = VARIANTS.find((x) => x.id === id);
  if (!v) throw new Error(`no such variant: ${id}`);
  return v;
};

/** Connect 4 aliases for default-board callers only; not a licence to hardcode geometry. */
export const WIDTH = CONNECT4.width;
export const HEIGHT = CONNECT4.height;
export const CELLS = CONNECT4.cells;
export const BOARD_MASK = CONNECT4.boardMask;
export const COLUMN_MASKS = CONNECT4.columnMasks;
export const MOVE_ORDER = CONNECT4.moveOrder;

/** True if `pos` holds a full run. Linear ANDs with early exit beat the doubling trick here. */
export function alignment(pos: bigint, v: Variant = CONNECT4): boolean {
  for (const shifts of v.runShifts) {
    let m = pos;
    for (const s of shifts) {
      m &= pos >> s;
      if (m === ZERO) break;
    }
    if (m !== ZERO) return true;
  }
  return false;
}

/**
 * Empty cells that would complete a run for `pos`. Hottest function in the
 * program. Builds prefix/suffix chains (`below[k]`, `above[k]`) and reads gap g
 * as `below[g] & above[N-1-g]` — linear in N. Don't rewrite as the obvious
 * per-gap loop (quadratic).
 */
export function computeAlignmentSpots(pos: bigint, mask: bigint, v: Variant = CONNECT4): bigint {
  const last = v.run - 1;
  let r = ZERO;

  // Vertical: gravity means only the gap on top of the stack is fillable.
  {
    const shifts = v.gapShifts[0]!;
    let below = pos << shifts[1]!;
    for (let k = 2; k <= last && below !== ZERO; k++) below &= pos << shifts[k]!;
    r |= below;
  }

  for (let di = 1; di < 4; di++) {
    const shifts = v.gapShifts[di]!;

    // above[k] = k of ours after this cell. Shared scratch: allocating here showed in the profile.
    let above = pos >> shifts[1]!;
    ABOVE[1] = above;
    for (let k = 2; k <= last; k++) {
      above &= pos >> shifts[k]!;
      ABOVE[k] = above;
    }

    r |= above;

    let below = pos << shifts[1]!;
    for (let g = 1; g < last; g++) {
      r |= below & ABOVE[last - g]!;
      below &= pos << shifts[g + 1]!;
    }
    r |= below;
  }

  return r & (v.boardMask ^ mask);
}

/** Shared scratch; safe because `computeAlignmentSpots` neither recurses nor yields. */
const ABOVE: bigint[] = [];

export class Position {
  /** Discs belonging to the player to move. */
  position: bigint;
  /** Every disc on the board. */
  mask: bigint;
  /** Plies played. Also tells you whose turn it is. */
  moves: number;
  readonly variant: Variant;

  constructor(position: bigint = ZERO, mask: bigint = ZERO, moves = 0, variant: Variant = CONNECT4) {
    this.position = position;
    this.mask = mask;
    this.moves = moves;
    this.variant = variant;
  }

  clone(): Position {
    return new Position(this.position, this.mask, this.moves, this.variant);
  }

  /** The player to move. Red is on even plies because red opens. */
  get turn(): Player {
    return this.moves % 2 === 0 ? "red" : "yellow";
  }

  canPlay(col: number): boolean {
    if (col < 0 || col >= this.variant.width) return false;
    return (this.mask & this.variant.topMaskCol[col]!) === ZERO;
  }

  /** Legal columns, in centre-outward order. */
  legalMoves(): number[] {
    return this.variant.moveOrder.filter((c) => this.canPlay(c));
  }

  /** Drop a disc in `col`. Assumes legal; the XOR flips perspective to the new mover. */
  play(col: number): void {
    this.position ^= this.mask;
    this.mask |= this.mask + this.variant.bottomMaskCol[col]!;
    this.moves++;
  }

  /** True if dropping in `col` wins immediately for the player to move. */
  isWinningMove(col: number): boolean {
    return (
      (this.winningPositions() & this.possibleMoves() & this.variant.columnMasks[col]!) !== ZERO
    );
  }

  /** True if the player to move has any immediate win. */
  canWinNext(): boolean {
    return (this.winningPositions() & this.possibleMoves()) !== ZERO;
  }

  isDraw(): boolean {
    return this.moves >= this.variant.cells;
  }

  /** The set of cells that are playable right now, one per open column. */
  possibleMoves(): bigint {
    return (this.mask + this.variant.bottomAll) & this.variant.boardMask;
  }

  /** Cells that would complete a run for the player to move. */
  winningPositions(): bigint {
    return computeAlignmentSpots(this.position, this.mask, this.variant);
  }

  /** Cells that would complete a run for the opponent. */
  opponentWinningPositions(): bigint {
    return computeAlignmentSpots(this.position ^ this.mask, this.mask, this.variant);
  }

  /**
   * Playable cells that don't hand the opponent an immediate win. Returns 0 both
   * when the opponent has two threats and when every move opens one; both are lost.
   */
  nonLosingMoves(): bigint {
    let possible = this.possibleMoves();
    const opponentWin = this.opponentWinningPositions();
    const forced = possible & opponentWin;
    if (forced !== ZERO) {
      if ((forced & (forced - ONE)) !== ZERO) return ZERO;
      possible = forced;
    }
    // Never play directly beneath an opponent winning cell.
    return possible & ~(opponentWin >> ONE);
  }

  /** Unique TT key: `position + mask + bottom` encodes column heights above the mover's discs. */
  key(): bigint {
    return this.position + this.mask + this.variant.bottomAll;
  }

  /** Row-major grid, row 0 = top of the board, for rendering. */
  grid(): Cell[][] {
    const { width, height, h1 } = this.variant;
    const mover: Player = this.turn;
    const other: Player = mover === "red" ? "yellow" : "red";
    const rows: Cell[][] = [];
    for (let row = height - 1; row >= 0; row--) {
      const line: Cell[] = [];
      for (let col = 0; col < width; col++) {
        const bit = ONE << (BigInt(col) * h1 + BigInt(row));
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
    const { height, h1 } = this.variant;
    let stacked = 0;
    for (let row = 0; row < height; row++) {
      const bit = ONE << (BigInt(col) * h1 + BigInt(row));
      if ((this.mask & bit) === ZERO) break;
      stacked++;
    }
    return height - 1 - stacked;
  }

  static fromMoves(cols: readonly number[], variant: Variant = CONNECT4): Position {
    const p = new Position(ZERO, ZERO, 0, variant);
    for (const c of cols) {
      if (!p.canPlay(c)) throw new Error(`illegal move: column ${c}`);
      p.play(c);
    }
    return p;
  }
}

/** The position reflected left-to-right (same score, columns swapped). */
export function mirror(p: Position): Position {
  const { width, h1, height } = p.variant;
  const colBits = (ONE << BigInt(height)) - ONE;
  let position = ZERO;
  let mask = ZERO;
  for (let col = 0; col < width; col++) {
    const src = BigInt(col) * h1;
    const dst = BigInt(width - 1 - col) * h1;
    position |= ((p.position >> src) & colBits) << dst;
    mask |= ((p.mask >> src) & colBits) << dst;
  }
  return new Position(position, mask, p.moves, p.variant);
}

/** Smaller of key and mirror key; `mirrored` says whether to flip columns back. */
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

/** Popcount 16 bits at a time; the `x &= x - 1n` loop allocates per bit and is hot in move ordering. */
export function popcount(m: bigint): number {
  let n = 0;
  let x = m;
  while (x !== ZERO) {
    n += POP16[Number(x & MASK16)]!;
    x >>= 16n;
  }
  return n;
}
