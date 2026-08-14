/**
 * pieces.ctl — the chip lab. Flat 16 is the chosen default (2026-08-13);
 * the other ten styles stay because the picker should exist in the real app
 * (DIRECTION.md, the second law). Pixel and Faces chips are generated at
 * runtime, not drawn — a Bayer-dithered sphere and a deadpan face.
 */

import { el } from "./dom.js";
import { PIECES_NOTE, TITLES } from "./copy.js";
import type { WM } from "./wm.js";

const STYLES: readonly (readonly [string, string])[] = [
  ["glossy", "Glossy"],
  ["plastic", "Plastic"],
  ["half", "Half"],
  ["toon", "Toon"],
  ["pixel", "Pixel"],
  ["faces", "Faces"],
  ["bevel", "Bevel"],
  ["gem", "Gem"],
  ["scan", "Scanline"],
  ["flat", "Flat 16"],
  ["rings", "Rings"],
];

/** The pixel chips are generated, not drawn: a Bayer-dithered sphere. */
function pixelDisc(light: string, base: string, dark: string, outline: string): string {
  const cv = document.createElement("canvas");
  cv.width = cv.height = 16;
  const ctx = cv.getContext("2d")!;
  const B = [
    [0, 8, 2, 10],
    [12, 4, 14, 6],
    [3, 11, 1, 9],
    [15, 7, 13, 5],
  ];
  for (let y = 0; y < 16; y++)
    for (let x = 0; x < 16; x++) {
      const dx = x - 7.5;
      const dy = y - 7.5;
      const r = Math.hypot(dx, dy);
      if (r > 7.7) continue;
      let c: string;
      if (r > 6.8) c = outline;
      else {
        const t =
          ((dx + dy) / 2 + 7.5) / 15 + (r / 7) * 0.18 + (B[y % 4]![x % 4]! / 16 - 0.5) * 0.22;
        c = t < 0.38 ? light : t > 0.74 ? dark : base;
      }
      ctx.fillStyle = c;
      ctx.fillRect(x, y, 1, 1);
    }
  return cv.toDataURL();
}

/** The faces are drawn, deadpan, and not explained. */
function faceDisc(bodyC: string, shade: string, outline: string): string {
  const rows = [
    "....kkkkkkkk....", "..kkbbbbbbbbkk..", ".kbbbbbbbbbbbbk.", ".kbbbbbbbbbbbbk.",
    "kbbbbbbbbbbbbbbk", "kbbbkkbbbbkkbbbk", "kbbbkkbbbbkkbbbk", "kbbbbbbbbbbbbbbk",
    "kbbbbbbbbbbbbbbk", "kbbbbbbbbbbbbbbk", "kbbbkkkkkkkkbbbk", ".kbbbbbbbbbbbbk.",
    ".kbsbbbbbbbbsbk.", "..kkbssbbssbkk..", "....kkkkkkkk....", "................"];
  const cv = document.createElement("canvas");
  cv.width = cv.height = 16;
  const ctx = cv.getContext("2d")!;
  const pal: Record<string, string> = { b: bodyC, s: shade, k: outline };
  rows.forEach((s, y) =>
    [...s].forEach((ch, x) => {
      if (ch !== ".") {
        ctx.fillStyle = pal[ch]!;
        ctx.fillRect(x, y, 1, 1);
      }
    }),
  );
  return cv.toDataURL();
}

/** Inject the generated chip textures once. */
export function installGeneratedChips(): void {
  const style = document.createElement("style");
  style.textContent = `
    .chips-pixel .disc.r{background:url(${pixelDisc("#ff9d8a", "#e0332e", "#7a0f14", "#40100c")}) 0 0/48px 48px}
    .chips-pixel .disc.y{background:url(${pixelDisc("#fff2b0", "#f0b400", "#8a5c00", "#403000")}) 0 0/48px 48px}
    .chips-faces .disc.r{background:url(${faceDisc("#e0332e", "#a51b17", "#402e3a")}) 0 0/48px 48px}
    .chips-faces .disc.y{background:url(${faceDisc("#f0b400", "#c08900", "#402e3a")}) 0 0/48px 48px}`;
  document.head.appendChild(style);
}

export function openPieces(wm: WM, current: () => string, apply: (style: string) => void): void {
  const existing = wm.get("pieces");
  if (existing?.isOpen()) {
    existing.focus();
    return;
  }
  const body = el(`<div></div>`);
  const list = el(`<div style="padding:6px 4px 2px;columns:2;column-gap:0"></div>`);
  const opts: HTMLElement[] = [];
  for (const [key, label] of STYLES) {
    const o = el(`<div class="opt" style="padding:3px 10px;font-size:11px" data-s="${key}"></div>`);
    o.textContent = `${key === current() ? "◉" : "○"} ${label}`;
    o.addEventListener("mouseenter", () => { o.style.background = "#000080"; o.style.color = "#fff"; });
    o.addEventListener("mouseleave", () => { o.style.background = ""; o.style.color = ""; });
    o.addEventListener("click", () => {
      apply(key);
      for (const other of opts) other.textContent = `○ ${other.textContent!.slice(2)}`;
      o.textContent = `◉ ${label}`;
    });
    list.appendChild(o);
    opts.push(o);
  }
  body.appendChild(list);
  const note = el(`<div style="padding:4px 10px 8px;color:#404040"></div>`);
  note.textContent = PIECES_NOTE;
  body.appendChild(note);
  wm.open({ id: "pieces", title: TITLES.pieces, x: 920, y: 430, w: 240, body, buttons: ["close"] });
}
