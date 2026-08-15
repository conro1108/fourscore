/**
 * Render the home-screen icons from BOARD.EXE's own pixel art — the period
 * way (no image editor was harmed; the icon is computed, like everything
 * else on this desktop). Writes public/icon-{180,192,512}.png.
 *
 * Usage: node tools/appicon.mjs
 */
import { deflateSync } from "node:zlib";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// ICONS.board + PAL, copied from src/icons.ts (a .mjs tool can't import TS)
const PAL = { b: "#000080", c: "#c0c0c0", w: "#fff", r: "#e0332e", y: "#f0b400", k: "#000" };
const ROWS = [
  "................","kkkkkkkkkkkkkkk.","kbbbbbbbbbbbbbk.","kbrbybrbybrbybk.",
  "kbbbbbbbbbbbbbk.","kbybrbybrbybrbk.","kbbbbbbbbbbbbbk.","kbrbybrbybrbybk.",
  "kbbbbbbbbbbbbbk.","kbybrbybrbybrbk.","kbbbbbbbbbbbbbk.","kkkkkkkkkkkkkkk.",
  ".kk..........kk.","................","................","................",
];
const BG = "#0e8078"; // the desk itself

const hex = (s) => {
  const h = s.slice(1);
  const full = h.length === 3 ? [...h].map((c) => c + c).join("") : h;
  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16));
};

/* ---- minimal PNG writer: RGBA8, filter 0, one IDAT ---- */
const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const t = Buffer.from(type, "ascii");
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([t, data])));
  return Buffer.concat([len, t, data, crc]);
};
function png(size, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/* ---- compose: teal field, the art's bounding box centered at ~70% ---- */
let x0 = 16, x1 = -1, y0 = 16, y1 = -1;
ROWS.forEach((row, y) =>
  [...row].forEach((ch, x) => {
    if (ch === ".") return;
    x0 = Math.min(x0, x); x1 = Math.max(x1, x);
    y0 = Math.min(y0, y); y1 = Math.max(y1, y);
  }),
);
const artW = x1 - x0 + 1;
const artH = y1 - y0 + 1;

function render(size) {
  const rgba = Buffer.alloc(size * size * 4);
  const [br, bg, bb] = hex(BG);
  const box = Math.round(size * 0.7);
  const cell = box / Math.max(artW, artH);
  const ox = Math.round((size - artW * cell) / 2);
  const oy = Math.round((size - artH * cell) / 2);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      let [r, g, b] = [br, bg, bb];
      const ax = Math.floor((x - ox) / cell) + x0;
      const ay = Math.floor((y - oy) / cell) + y0;
      if (ax >= x0 && ax <= x1 && ay >= y0 && ay <= y1) {
        const ch = ROWS[ay][ax];
        if (ch !== ".") [r, g, b] = hex(PAL[ch]);
      }
      const i = (y * size + x) * 4;
      rgba[i] = r; rgba[i + 1] = g; rgba[i + 2] = b; rgba[i + 3] = 255;
    }
  return png(size, rgba);
}

const here = (p) => fileURLToPath(new URL(p, import.meta.url));
for (const size of [180, 192, 512]) {
  writeFileSync(here(`../public/icon-${size}.png`), render(size));
  console.log(`icon-${size}.png`);
}
