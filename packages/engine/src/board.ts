/**
 * The board, as a bitboard.
 *
 * Layout is the standard Connect 4 packing: one column per `height + 1` bits,
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
 * These are `bigint`, not `number` — 7x6 already needs 49 bits and the wider
 * boards need more. That costs us some speed against a typed-array board, but
 * it buys branch-free win detection with no loop over directions and no bounds
 * checks. The search calls it millions of times, and this file is the only
 * place the packing is known.
 *
 * ## Geometry is a value, not a constant
 *
 * Width, height and run length live in a `Variant` object rather than as module
 * constants, because Connect 5 needs a different board and Connect N needs an
 * arbitrary one. Everything derived from the geometry — masks, move order,
 * shift distances — is computed once per variant in `makeVariant` and read from
 * there, so no hot-path code does arithmetic on the packing.
 *
 * ## Why one sentinel row is enough for any run length
 *
 * The win check ANDs `pos` with copies of itself shifted 1, 2, ... N-1 steps
 * along a direction. A line that wrapped off an edge would be a false positive,
 * and the reason it can't happen is that every direction moves by exactly one
 * row per step, so a wrapping line has to *pass through* the sentinel row on
 * some intermediate step — and that step is itself one of the ANDed terms, so
 * the whole chain zeroes. That argument doesn't depend on N, which is why the
 * packing didn't have to change to support longer runs.
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

  // Move ordering matters more than almost anything else for alpha-beta, and
  // the centre column is part of more winning lines than any other, so it's the
  // best static guess available. 3, 4, 2, 5, 1, 6, 0 for width 7.
  const moveOrder = (() => {
    const order: number[] = [];
    const mid = (width - 1) / 2;
    for (let i = 0; i < width; i++) {
      const offset = Math.ceil(i / 2) * (i % 2 === 0 ? 1 : -1);
      order.push(Math.round(mid + offset));
    }
    return order;
  })();

  // Vertical, horizontal, and the two diagonals. Each moves by exactly one row
  // per step, which is what the sentinel-row argument above depends on.
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
 * Connect 5, on a board sized to feel like Connect 4 rather than to be the
 * smallest one that fits five in a row.
 *
 * 9x8 is not arbitrary. Line density is what makes a gravity game feel alive —
 * 7x6 Connect 4 has 69 winning lines over 42 cells, 1.64 per cell. Five in a
 * row on the same 7x6 board has 27 lines over 42 cells and plays like a draw
 * generator. 9x8 gives 116 lines over 72 cells, 1.61 per cell, which is as
 * close to Connect 4's texture as an integer board gets.
 *
 * Even height also matters more than it looks: the parity heuristic in
 * `evaluate.ts` — first player wants odd rows, second player even — is a real
 * theorem about alternating play on a board with an even number of rows. An odd
 * height would quietly make Vane's whole personality wrong.
 */
export const CONNECT5 = makeVariant({
  id: "connect5",
  name: "Connect 5",
  width: 9,
  height: 8,
  run: 5,
});

/**
 * Connect 6 and Connect 7, sized by the same law as Connect 5: keep the line
 * density near Connect 4's 1.64 lines per cell, keep the width odd so there is
 * a true centre column, and keep the height even for the parity theorem.
 *
 * 11x10 run 6 gives 175 lines over 110 cells (1.59/cell); 13x12 run 7 gives
 * 246 over 156 (1.58/cell). The sequence 1.64 → 1.61 → 1.59 → 1.58 is the
 * texture staying put while the board grows.
 *
 * These are also why the transposition table stores keys in five lanes: a
 * `key()` needs `width * (height + 1)` bits, which is 121 here and 169 for
 * Connect 7 — see the note on `TranspositionTable`.
 */
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

/**
 * Connect 4's geometry under its old names.
 *
 * Plenty of callers only ever deal with the default board, and making every one
 * of them thread a variant through would be churn for its own sake.
 */
export const WIDTH = CONNECT4.width;
export const HEIGHT = CONNECT4.height;
export const CELLS = CONNECT4.cells;
export const BOARD_MASK = CONNECT4.boardMask;
export const COLUMN_MASKS = CONNECT4.columnMasks;
export const MOVE_ORDER = CONNECT4.moveOrder;

/**
 * True if `pos` contains a full run anywhere.
 *
 * ANDs the mask with copies of itself shifted 1..N-1 steps along each
 * direction; a bit survives only where a whole run starts. The early exit is
 * why the linear form is fine here rather than the logarithmic doubling trick —
 * most directions die on the first AND.
 */
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
 * Empty cells that would give `pos` a full run if filled.
 *
 * The mirror image of `alignment`: instead of asking "is a run already here",
 * it builds, for each direction, the cells that would complete one.
 *
 * The naive form tests each of the N gap positions separately, which is N(N-1)
 * operations per direction and gets expensive fast as N grows. Instead this
 * builds two chains — `below[k]`, the cells with k of ours consecutively before
 * them along the direction, and `above[k]`, k of ours after — and then reads
 * off gap position g as `below[g] & above[N-1-g]`. That shares every
 * subexpression, so the cost is linear in N rather than quadratic, and at N=4
 * it lands within a couple of operations of the hand-tuned Connect 4 version it
 * replaced.
 *
 * This is the hottest function in the program: the solver calls it once per
 * candidate move per node for move ordering.
 */
export function computeAlignmentSpots(pos: bigint, mask: bigint, v: Variant = CONNECT4): bigint {
  const last = v.run - 1;
  let r = ZERO;

  // Vertical is a special case worth taking: gravity means the only gap that
  // can ever be filled is the one on top of the stack. The other N-1 gap
  // positions would describe a cell with a disc already floating above it.
  {
    const shifts = v.gapShifts[0]!;
    let below = pos << shifts[1]!;
    for (let k = 2; k <= last && below !== ZERO; k++) below &= pos << shifts[k]!;
    r |= below;
  }

  for (let di = 1; di < 4; di++) {
    const shifts = v.gapShifts[di]!;

    // above[k] = k of ours immediately after this cell along the direction.
    // Built into a shared scratch array — this function is called once per
    // candidate move per node, and allocating here showed up in the profile.
    let above = pos >> shifts[1]!;
    ABOVE[1] = above;
    for (let k = 2; k <= last; k++) {
      above &= pos >> shifts[k]!;
      ABOVE[k] = above;
    }

    // Gap at the start of the run needs no `below` chain at all.
    r |= above;

    // Then walk the gap rightwards, growing `below` one disc at a time.
    let below = pos << shifts[1]!;
    for (let g = 1; g < last; g++) {
      r |= below & ABOVE[last - g]!;
      below &= pos << shifts[g + 1]!;
    }
    // Gap at the end of the run: `below` is now the full chain.
    r |= below;
  }

  return r & (v.boardMask ^ mask);
}

/**
 * Scratch for the `above` chain. Safe to share because `computeAlignmentSpots`
 * doesn't recurse and doesn't yield.
 */
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

  /**
   * Drop a disc in `col`. Assumes the move is legal — callers that take
   * untrusted input (i.e. the UI) check `canPlay` first.
   *
   * The XOR is the perspective flip: after it, `position` describes the player
   * who is now to move rather than the one who just played.
   */
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

/**
 * The same position reflected left-to-right.
 *
 * A gravity game is symmetric about the centre column, so a position and its
 * mirror always have identical scores with the columns swapped. Storing only
 * one of each pair halves an opening book.
 */
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
