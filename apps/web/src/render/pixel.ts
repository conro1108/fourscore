/**
 * Char-grid pixel art, the same technique cozy_sprites and battle_clicker use:
 * art is authored as rows of single-character keys plus a tiny palette,
 * rendered once into an offscreen canvas and cached.
 *
 * Two consumers, two shapes:
 *  - the board scene blits `artCanvas` straight onto its low-res buffer, so the
 *    art stays on the buffer's pixel grid and never resamples;
 *  - the DOM uses `artUrl` in an `<img class="pxicon">`, upscaled by CSS with
 *    `image-rendering: pixelated`.
 *
 * Rows don't have to be the same length — the grid is padded to the longest —
 * which keeps hand-authored art editable without counting dots.
 */

export interface Art {
  rows: readonly string[];
  palette: Readonly<Record<string, string>>;
}

export interface Sprite {
  canvas: HTMLCanvasElement;
  w: number;
  h: number;
}

const spriteCache = new WeakMap<Art, Sprite>();
const urlCache = new WeakMap<Art, string>();

/** `.` (and any key missing from the palette) is transparent. */
function paint(art: Art, scale: number): Sprite {
  const rows = art.rows;
  const w = rows.reduce((m, r) => Math.max(m, r.length), 0);
  const h = rows.length;
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, w * scale);
  canvas.height = Math.max(1, h * scale);
  const ctx = canvas.getContext("2d")!;
  ctx.imageSmoothingEnabled = false;
  for (let y = 0; y < h; y++) {
    const row = rows[y] ?? "";
    for (let x = 0; x < row.length; x++) {
      const color = art.palette[row[x] ?? "."];
      if (!color) continue;
      ctx.fillStyle = color;
      ctx.fillRect(x * scale, y * scale, scale, scale);
    }
  }
  return { canvas, w, h };
}

/** 1:1 sprite for blitting onto the scene buffer. Cached per art object. */
export function artCanvas(art: Art): Sprite {
  let sprite = spriteCache.get(art);
  if (!sprite) {
    sprite = paint(art, 1);
    spriteCache.set(art, sprite);
  }
  return sprite;
}

/** Data URL for use in an `<img>`. Painted at 4x so it survives DOM scaling. */
export function artUrl(art: Art): string {
  let url = urlCache.get(art);
  if (!url) {
    url = paint(art, 4).canvas.toDataURL();
    urlCache.set(art, url);
  }
  return url;
}

/**
 * Recolour an art's palette. Bot bodies are authored once in neutral keys and
 * tinted per bot, so eight opponents don't need eight hand-drawn palettes.
 */
export function tint(art: Art, over: Record<string, string>): Art {
  return { rows: art.rows, palette: { ...art.palette, ...over } };
}

/** Stack one art on top of another. Used to put a mood face on a body. */
export function overlay(base: Art, top: Art): Art {
  const h = Math.max(base.rows.length, top.rows.length);
  const rows: string[] = [];
  // Palette keys must not collide; faces use `e` and bodies never do.
  const palette = { ...base.palette, ...top.palette };
  for (let y = 0; y < h; y++) {
    const b = base.rows[y] ?? "";
    const t = top.rows[y] ?? "";
    const w = Math.max(b.length, t.length);
    let row = "";
    for (let x = 0; x < w; x++) {
      const tc = t[x] ?? ".";
      row += tc !== "." && palette[tc] ? tc : (b[x] ?? ".");
    }
    rows.push(row);
  }
  return { rows, palette };
}
