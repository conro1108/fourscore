/**
 * Every piece of pixel art in the game, as char grids.
 *
 * Bodies are authored once in neutral keys — `b` body, `s` shade, `k` outline —
 * and tinted per bot from its profile colours, so eight opponents don't need
 * eight hand-painted palettes. Faces are separate 16x16 grids overlaid on top,
 * which is what lets any mood sit on any body: the tells are a cross product of
 * seven expressions and eight creatures, and drawing all fifty-six by hand
 * would guarantee they drifted apart.
 *
 * The one hard rule is the shared outline ink (`K`). It's the single constant
 * that makes an acorn, a weathervane and a game piece look like they came out
 * of the same box of crayons — and it's the same ink cozy_sprites and
 * battle_clicker use, so this reads as a sibling of both.
 */

import type { Art } from "./pixel.js";

export const K = "#402e3a"; // shared outline ink
const EYE = "#3a2b3f";

// ---------------------------------------------------------------------------
// Mood faces — 16x16, overlaid on a body
//
// Eyes sit at columns 5-6 and 10-11, which mirror each other about the centre
// line. Every body below keeps columns 4-11 of rows 7-10 clear of outline so a
// face always lands on flat colour.
// ---------------------------------------------------------------------------

const face = (rows: string[]): Art => ({ rows, palette: { e: EYE } });

const FACES = {
  idle: face([
    "................",
    "................",
    "................",
    "................",
    "................",
    "................",
    "................",
    ".....ee...ee....",
    ".....ee...ee....",
    "................",
    ".......ee.......",
    "................",
    "................",
    "................",
    "................",
    "................",
  ]),

  thinking: face([
    "................",
    "................",
    "................",
    "................",
    "................",
    "................",
    "................",
    "......ee...ee...",
    "......ee...ee...",
    "................",
    "......ee........",
    "................",
    "................",
    "................",
    "................",
    "................",
  ]),

  pleased: face([
    "................",
    "................",
    "................",
    "................",
    "................",
    "................",
    "................",
    ".....ee...ee....",
    ".....ee...ee....",
    "................",
    ".....e......e...",
    "......eeeeee....",
    "................",
    "................",
    "................",
    "................",
  ]),

  // Half-lidded, with the smirk pushed to one side. Reads as "I already know
  // how this ends" rather than plain happiness.
  smug: face([
    "................",
    "................",
    "................",
    "................",
    "................",
    "................",
    "................",
    "....eeee..eeee..",
    "................",
    "................",
    "........eeee....",
    ".........ee.....",
    "................",
    "................",
    "................",
    "................",
  ]),

  worried: face([
    "................",
    "................",
    "................",
    "................",
    "................",
    "....e........e..",
    ".....e......e...",
    ".....ee...ee....",
    ".....ee...ee....",
    "................",
    "......eeeeee....",
    ".....e......e...",
    "................",
    "................",
    "................",
    "................",
  ]),

  // Wide ring eyes and an open mouth — the one that should read across the
  // room, because it fires the moment you set up a double threat.
  alarmed: face([
    "................",
    "................",
    "................",
    "................",
    "................",
    "....eee...eee...",
    "....e.e...e.e...",
    "....eee...eee...",
    "................",
    "................",
    "......eeee......",
    "......e..e......",
    "......eeee......",
    "................",
    "................",
    "................",
  ]),

  resigned: face([
    "................",
    "................",
    "................",
    "................",
    "................",
    "................",
    "................",
    "................",
    "....eeee..eeee..",
    "................",
    "................",
    "......eeeeee....",
    "................",
    "................",
    "................",
    "................",
  ]),
} as const;

export type FaceName = keyof typeof FACES;
export const faceArt = (name: FaceName): Art => FACES[name];

// ---------------------------------------------------------------------------
// Bot bodies — 16x16
// ---------------------------------------------------------------------------

const body = (rows: string[]): Art => ({
  rows,
  // Placeholder colours; `tint` replaces b/s per bot.
  palette: { k: K, b: "#999999", s: "#666666", c: "#7a5237" },
});

const BODIES: Record<string, Art> = {
  acorn: body([
    "................",
    "................",
    ".....kkkkkk.....",
    "...kkcccccckk...",
    "..kcccccccccck..",
    "..kkkkkkkkkkkk..",
    "...kbbbbbbbbk...",
    "..kbbbbbbbbbbk..",
    "..kbbbbbbbbbbk..",
    "..kbbbbbbbbbsk..",
    "..kbbbbbbbbbsk..",
    "...kbbbbbbbssk..",
    "....kbbbbbssk...",
    ".....kkkkkkk....",
    "................",
    "................",
  ]),

  pebble: body([
    "................",
    "................",
    "................",
    ".....kkkkkk.....",
    "...kkbbbbbbkk...",
    "..kbbbbbbbbbbk..",
    ".kbbbbbbbbbbbbk.",
    ".kbbbbbbbbbbbbk.",
    ".kbbbbbbbbbbbbk.",
    ".kbbbbbbbbbbbsk.",
    ".kbbbbbbbbbbssk.",
    "..kbbbbbbbbssk..",
    "...kkbbbbsssk...",
    ".....kkkkkk.....",
    "................",
    "................",
  ]),

  moss: body([
    "................",
    "................",
    "...k.....k......",
    "...kbk..kbk.....",
    "....kbkkbk..k...",
    ".....kbbbk.kbk..",
    "...kkkbbbbkkbk..",
    "..kbbbbbbbbbbk..",
    ".kbbbbbbbbbbbbk.",
    ".kbbbbbbbbbbbbk.",
    ".kbbbbbbbbbbbsk.",
    ".kbbbbbbbbbbssk.",
    "..kkbbbbbbsssk..",
    "....kkkkkkkk....",
    "................",
    "................",
  ]),

  bramble: body([
    "................",
    "................",
    "....k..k..k.....",
    "...kbkkbkkbk....",
    "..kbbbbbbbbbk...",
    ".kbbbbbbbbbbbk..",
    "kbbbbbbbbbbbbbk.",
    "kbbbbbbbbbbbbbk.",
    "kbbbbbbbbbbbbbk.",
    "kbbbbbbbbbbbbsk.",
    ".kbbbbbbbbbbssk.",
    "..kbbbbbbbbssk..",
    "...kbkkbkkbsk...",
    "....k..k..k.....",
    "................",
    "................",
  ]),

  cinder: body([
    "................",
    "........k.......",
    ".......kbk......",
    "....k.kbbk......",
    "...kbkbbbbk.....",
    "..kbbbbbbbbk....",
    "..kbbbbbbbbbk...",
    ".kbbbbbbbbbbk...",
    ".kbbbbbbbbbbbk..",
    ".kbbbbbbbbbbbk..",
    ".kbbbbbbbbbbsk..",
    "..kbbbbbbbbssk..",
    "...kbbbbbbssk...",
    "....kkkkkkkk....",
    "................",
    "................",
  ]),

  vane: body([
    ".......k........",
    "......kbk.......",
    "......kbk.......",
    ".....kbbbk......",
    "....kbbbbbk.....",
    "...kbbbbbbbk....",
    "..kbbbbbbbbbk...",
    "..kbbbbbbbbbk...",
    "..kbbbbbbbbbk...",
    "..kbbbbbbbbsk...",
    "..kbbbbbbbbsk...",
    "...kbbbbbbsk....",
    "....kbbbbsk.....",
    ".....kkkkk......",
    "................",
    "................",
  ]),

  quill: body([
    "................",
    "............k...",
    "..........kbk...",
    ".........kbbk...",
    "....kkk.kbbk....",
    "..kkbbbkkbbk....",
    ".kbbbbbbbbbk....",
    ".kbbbbbbbbbbk...",
    ".kbbbbbbbbbbk...",
    ".kbbbbbbbbbbk...",
    ".kbbbbbbbbbsk...",
    "..kbbbbbbbssk...",
    "...kbbbbbssk....",
    "....kkkkkkk.....",
    "................",
    "................",
  ]),

  oracle: body([
    "................",
    ".....kkkkkk.....",
    "...kkbbbbbbkk...",
    "..kbbbbbbbbbbk..",
    ".kbbbbbbbbbbbbk.",
    ".kbbbbbbbbbbbbk.",
    "kbbbbbbbbbbbbbbk",
    "kbbbbbbbbbbbbbbk",
    "kbbbbbbbbbbbbbbk",
    "kbbbbbbbbbbbbbsk",
    ".kbbbbbbbbbbbsk.",
    ".kbbbbbbbbbbssk.",
    "..kbbbbbbbbssk..",
    "...kkbbbbbbkk...",
    ".....kkkkkk.....",
    "................",
  ]),
};

export const bodyArt = (id: string): Art => BODIES[id] ?? BODIES.pebble!;

// ---------------------------------------------------------------------------
// Game pieces — 12x12, sitting inside a 16px cell
// ---------------------------------------------------------------------------

const DISC_ROWS = [
  "....kkkk....",
  "..kkllllkk..",
  ".kllllbbbbk.",
  "kllllbbbbbbk",
  "kllbbbbbbbbk",
  "klbbbbbbbbsk",
  "klbbbbbbbbsk",
  "kbbbbbbbbssk",
  "kbbbbbbbsssk",
  ".kbbbbbsssk.",
  "..kksssskk..",
  "....kkkk....",
];

export const DISC_RED: Art = {
  rows: DISC_ROWS,
  palette: { k: K, l: "#f0917a", b: "#d4523c", s: "#93301f" },
};

export const DISC_YELLOW: Art = {
  rows: DISC_ROWS,
  palette: { k: K, l: "#ffe08a", b: "#e8b33a", s: "#a07414" },
};

/** Dimmed discs, used to ghost the board behind the review overlay. */
export const DISC_MUTED: Art = {
  rows: DISC_ROWS,
  palette: { k: "#3a3040", l: "#5c5266", b: "#4a4154", s: "#382f42" },
};

/** An empty slot: the same circle, in board-shadow colours. */
export const HOLE: Art = {
  rows: DISC_ROWS,
  palette: { k: "#1d1622", l: "#2c2333", b: "#251d2c", s: "#1f1827" },
};

export const DISC_SIZE = 12;

/** The board itself. Not a sprite — it's drawn as rectangles at scene scale. */
export const BOARD_COLORS = {
  face: "#4c4a7a",
  edge: "#35335c",
  highlight: "#615e96",
  ink: K,
};
