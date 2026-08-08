/**
 * The fire, in pixels.
 *
 * This is the home-screen icon's art (`tools/icon-art.js`) brought into the
 * app and made to move: the same six-stop palette, the same nested-tongue
 * construction, the same rule that nothing is ever drawn off the pixel grid.
 * The icon is the style reference for all of the chrome, so if one of these two
 * files changes its fire, the other one has to follow.
 *
 * It obeys the props' budget, not the void's: art pixels, integer upscale,
 * nearest neighbour, and a stepped 12fps flicker while the gradient behind it
 * runs at sixty. A smoothly-interpolated flame would read as a bug.
 */

/** Crimson at the edges, through fever's gold, to a white core. */
export const FLAME = ["#6d0f34", "#a3164e", "#ed5705", "#f0a81e", "#ffd45e", "#ffeeda"];

/**
 * How many screen pixels one art pixel of the fire is worth.
 *
 * Four, because the icon reads the way it does at 8x — the chunk of the pixel
 * is half the style. At 3x the same licks came out as a fine orange fringe
 * along the bottom of the box instead of as fire.
 */
export const FLAME_SCALE = 4;

/** Fill an integer-aligned rect. No fractional anything, ever. */
function px(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, fill: string) {
  c.fillStyle = fill;
  c.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
}

/**
 * One flame lick: a teardrop that narrows to a point and curls sideways as it
 * rises. Drawn a row at a time so every edge lands on the pixel grid.
 */
function tongue(
  c: CanvasRenderingContext2D,
  baseX: number,
  baseY: number,
  h: number,
  w: number,
  curl: number,
  fill: string,
) {
  for (let i = 0; i < h; i++) {
    const t = i / h;
    const half = Math.max(0.5, (w / 2) * (1 - Math.pow(t, 1.5)));
    const x = baseX + curl * t * t;
    px(c, Math.round(x - half), baseY - i - 1, Math.max(1, Math.round(half * 2)), 1, fill);
  }
}

/** Nested licks: each colour is a shorter, thinner copy sitting inside the last. */
function lick(
  c: CanvasRenderingContext2D,
  x: number,
  y: number,
  h: number,
  w: number,
  curl: number,
) {
  for (let layer = 0; layer < FLAME.length; layer++) {
    const k = 1 - layer * 0.145;
    tongue(c, x, y, Math.round(h * k), Math.max(1, w * k * 0.9), curl * k, FLAME[layer]!);
  }
}

/**
 * The flicker, as a fixed table rather than a random number.
 *
 * The taste law: randomness picks which gag fires, never how a gag looks. A
 * flame that flickers off `Math.random()` shimmers like noise; one that walks a
 * short table repeats, which is what fire actually does and what makes the
 * wrongness read as a choice.
 */
const FLICKER = [1, 0.9, 1.08, 0.84, 0.98, 1.12, 0.92, 1.04, 0.88, 1.06];

/**
 * A row of licks along the bottom of an art-pixel canvas.
 *
 * `frame` is the 12fps counter and `heat` (0..1) scales how far up the fire
 * reaches — that's the hook the fever pulls on. Every other property of a lick
 * comes from its index, so lick 4 is always the tall one that leans left.
 */
export function drawFlames(
  c: CanvasRenderingContext2D,
  w: number,
  h: number,
  frame: number,
  heat: number,
): void {
  c.clearRect(0, 0, w, h);
  if (heat <= 0) return;

  const base = h;
  // Wide spacing and fat tongues: the icon's fire is six big licks, and a row
  // of thin ones at close pitch reads as a comb rather than as a fire.
  const spacing = 16;
  const count = Math.ceil(w / spacing) + 1;

  for (let i = 0; i < count; i++) {
    const x = i * spacing + ((i * 7) % 6) - 3;
    const flicker = FLICKER[(frame + i * 3) % FLICKER.length]!;
    // Four lick sizes, cycling, so the row has a rhythm instead of a fringe.
    const size = [1, 0.52, 0.82, 0.4][i % 4]!;
    // Almost all of the height comes from the heat, so the difference between
    // a warm game and a hot one is legible rather than academic. Clamped short
    // of the top edge: a lick cut off flat by the box is the one way this art
    // can look accidentally broken rather than deliberately cheap.
    const tall = Math.min(h * 0.92, h * (0.08 + 0.95 * heat) * size * flicker);
    const curl = (i % 2 === 0 ? 1 : -1) * (4 + (i % 3)) * size;
    lick(c, x, base, Math.max(2, Math.round(tall)), 12 + ((i * 3) % 5), curl);
  }

  // Bed of coals along the floor, banking up with the heat and dithered at the
  // top so it never reads as a flat bar.
  px(c, 0, base - 2, w, 2, FLAME[1]!);
  if (heat > 0.3) px(c, 0, base - 1, w, 1, FLAME[2]!);
  if (heat > 0.6) {
    px(c, 0, base - 3, w, 3, FLAME[2]!);
    px(c, 0, base - 1, w, 1, FLAME[3]!);
    for (let x = (frame % 2) - 2; x < w; x += 2) px(c, x, base - 2, 1, 1, FLAME[3]!);
  }
}
