// The home-screen icon: a Win95 dialog with hot-rod flames pouring out of it and
// a chrome 4 slapped over the top like a sticker.
//
// Drawn as 64x64 pixel art and upscaled by integer factors only, same rule as
// the scene buffer in apps/web. Colours are fever's: the discs' crimson and gold
// (#a3164e / #c8991f) become the fire, and the dialog is the real Windows face
// grey that app.css already uses for its panels.
//
// Legibility at 60px is the whole design problem. The numeral stays cool and the
// fire stays warm so the two never merge into one mush at home-screen size —
// check tools/icon.html, which shows it at 384, 180 and 60 side by side.
const S = 64;

const INK = '#17111c';
const FACE = '#d4d0c8';
const LIT = '#ffffff';
const SHADE = '#8a8680';
const DARK = '#4a4458';
const TITLE = '#7a2bd0';
const TITLE_LO = '#4a1a90';

// Crimson at the edges through fever's gold to a white core.
const FLAME = ['#6d0f34', '#a3164e', '#ed5705', '#f0a81e', '#ffd45e', '#ffeeda'];

// Cool chrome, top to bottom: sky, steel, a horizon flash, then ground.
const CHROME = [
  [0.1, '#ffffff'],
  [0.3, '#e5dcf2'],
  [0.42, '#a99bc4'],
  [0.48, '#ffffff'],
  [0.54, '#3a2b55'],
  [0.78, '#8f7fb0'],
  [0.92, '#a99bc4'],
  [1.01, '#e8e4f0'],
];

/** Fill an integer-aligned rect. No fractional anything, ever. */
function px(c, x, y, w, h, fill) {
  c.fillStyle = fill;
  c.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
}

/**
 * One flame lick: a teardrop that narrows to a point and curls sideways as it
 * rises. Drawn a row at a time so every edge lands on the pixel grid.
 */
function tongue(c, baseX, baseY, h, w, curl, fill) {
  for (let i = 0; i < h; i++) {
    const t = i / h;
    const half = Math.max(0.5, (w / 2) * (1 - Math.pow(t, 1.5)));
    const x = baseX + curl * t * t;
    px(c, Math.round(x - half), baseY - i - 1, Math.max(1, Math.round(half * 2)), 1, fill);
  }
}

/** Nested licks: each colour is a shorter, thinner copy sitting inside the last. */
function lick(c, x, y, h, w, curl) {
  for (let layer = 0; layer < FLAME.length; layer++) {
    const k = 1 - layer * 0.145;
    tongue(c, x, y, Math.round(h * k), Math.max(1, w * k * 0.9), curl * k, FLAME[layer]);
  }
}

/** Blocky "4" as a boolean mask, so the outline can be a clean pixel dilation. */
function four(w, h) {
  const m = [];
  for (let y = 0; y < h; y++) m.push(new Array(w).fill(false));
  const stemL = w - 9, stemR = w - 4;
  const barTop = Math.round(h * 0.6);
  const barH = Math.max(3, Math.round(h * 0.16));
  for (let y = 0; y < h; y++) {
    for (let x = stemL; x <= stemR; x++) m[y][x] = true;
    // Diagonal: leaves the top of the stem and runs down-left into the bar.
    if (y <= barTop) {
      const dl = Math.round(stemL - ((stemL - 1) * y) / barTop);
      for (let x = dl; x < dl + 6 && x < w; x++) m[y][x] = true;
    }
    if (y >= barTop && y < barTop + barH) for (let x = 1; x < w - 1; x++) m[y][x] = true;
  }
  return m;
}

function drawIcon(c) {
  c.imageSmoothingEnabled = false;
  c.clearRect(0, 0, S, S);

  // Backdrop: night, warming toward the fire at the bottom.
  px(c, 0, 0, S, S, '#150d22');
  px(c, 0, 34, S, 30, '#1d1329');
  px(c, 0, 48, S, 16, '#2a1338');

  // --- Win95 dialog, raised bevel ---
  const bx = 2, by = 8, bw = 60, bh = 48;
  px(c, bx, by, bw, bh, FACE);
  px(c, bx, by, bw, 1, LIT);
  px(c, bx, by, 1, bh, LIT);
  px(c, bx, by + bh - 1, bw, 1, DARK);
  px(c, bx + bw - 1, by, 1, bh, DARK);
  px(c, bx + 1, by + bh - 2, bw - 2, 1, SHADE);
  px(c, bx + bw - 2, by + 1, 1, bh - 2, SHADE);

  // Title bar with a close box.
  px(c, bx + 2, by + 2, bw - 4, 8, TITLE);
  px(c, bx + 2, by + 8, bw - 4, 2, TITLE_LO);
  for (let i = 0; i < 3; i++) px(c, bx + 5, by + 4 + i * 2, 20, 1, '#e0d0ff');
  const cbx = bx + bw - 12;
  px(c, cbx, by + 3, 8, 6, FACE);
  px(c, cbx, by + 3, 8, 1, LIT);
  px(c, cbx, by + 8, 8, 1, DARK);
  for (let i = 0; i < 4; i++) {
    px(c, cbx + 2 + i, by + 4 + i, 1, 1, INK);
    px(c, cbx + 5 - i, by + 4 + i, 1, 1, INK);
  }

  // Sunken client area, punched through to the night behind it.
  const ix = bx + 2, iy = by + 13, iw = bw - 4, ih = bh - 17;
  px(c, ix - 1, iy - 1, iw + 2, ih + 2, DARK);
  px(c, ix, iy, iw, ih, '#0d0714');
  px(c, ix + iw, iy, 1, ih + 1, LIT);
  px(c, ix, iy + ih, iw, 1, LIT);

  // --- Flames. Lit in the client area, licking out over the frame. ---
  const base = iy + ih - 1;
  lick(c, 9, base, 34, 14, 5);
  lick(c, 21, base, 46, 16, 6);
  lick(c, 36, base, 43, 15, -6);
  lick(c, 50, base, 36, 14, -6);
  lick(c, 15, base, 22, 9, 3);
  lick(c, 44, base, 24, 10, -3);
  // Bed of coals along the floor, dithered so it isn't a flat bar.
  px(c, ix, base - 2, iw, 3, FLAME[1]);
  px(c, ix, base - 1, iw, 2, FLAME[2]);
  px(c, ix, base, iw, 1, FLAME[3]);
  for (let x = ix; x < ix + iw; x += 2) px(c, x, base - 1, 1, 1, FLAME[3]);

  // --- Chrome 4, overlapping the title bar like a sticker ---
  const gw = 24, gh = 34, gx = 20, gy = 17;
  const m = four(gw, gh);
  const at = (x, y) => x >= 0 && y >= 0 && x < gw && y < gh && m[y][x];
  // 2px outline: every empty pixel within manhattan distance 2 of the glyph.
  for (let y = -2; y <= gh + 1; y++) {
    for (let x = -2; x <= gw + 1; x++) {
      if (at(x, y)) continue;
      let near = false;
      for (let dy = -2; dy <= 2 && !near; dy++)
        for (let dx = Math.abs(dy) - 2; dx <= 2 - Math.abs(dy); dx++)
          if (at(x + dx, y + dy)) { near = true; break; }
      if (near) px(c, gx + x, gy + y, 1, 1, INK);
    }
  }
  for (let y = 0; y < gh; y++) {
    for (let x = 0; x < gw; x++) {
      if (!m[y][x]) continue;
      const t = y / gh;
      px(c, gx + x, gy + y, 1, 1, CHROME.find(([stop]) => t < stop)[1]);
      if (!at(x, y - 1) && t > 0.05 && t < 0.5) px(c, gx + x, gy + y, 1, 1, '#ffffff');
    }
  }
}

export { drawIcon, S };
