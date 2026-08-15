/**
 * Pixel icons, drawn onto tiny canvases and upscaled with
 * image-rendering:pixelated — the period way. Ported from proposals/lib.js.
 */

export const PAL: Record<string, string> = {
  b: "#000080",
  c: "#c0c0c0",
  w: "#fff",
  r: "#e0332e",
  y: "#f0b400",
  k: "#000",
  o: "#ff7a00",
  d: "#808080",
  g: "#0e8078",
  s: "#d8d8d8",
  t: "#14b09e",
};

export function px(canvas: HTMLCanvasElement, rows: readonly string[], pal = PAL): void {
  const ctx = canvas.getContext("2d")!;
  rows.forEach((s, y) =>
    [...s].forEach((ch, x) => {
      if (ch !== ".") {
        ctx.fillStyle = pal[ch]!;
        ctx.fillRect(x, y, 1, 1);
      }
    }),
  );
}

/** A 16x16 icon canvas at a given CSS size, already painted. */
export function iconCanvas(rows: readonly string[], cssSize = 32): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = c.height = 16;
  c.className = "pix";
  c.style.width = c.style.height = `${cssSize}px`;
  px(c, rows);
  return c;
}

export const ICONS = {
  board: [
    "................","kkkkkkkkkkkkkkk.","kbbbbbbbbbbbbbk.","kbrbybrbybrbybk.",
    "kbbbbbbbbbbbbbk.","kbybrbybrbybrbk.","kbbbbbbbbbbbbbk.","kbrbybrbybrbybk.",
    "kbbbbbbbbbbbbbk.","kbybrbybrbybrbk.","kbbbbbbbbbbbbbk.","kkkkkkkkkkkkkkk.",
    ".kk..........kk.","................","................","................"],
  flame: [
    "................","......k.........",".....kok........","....koyok.......",
    "....koyok...k...","...koyyok..kok..","...koyyyok.kok..","..koyyyyokkoyk..",
    "..koyywyokoyok..",".koyywwyoyyyok..",".koyywwwyyyyok..",".koywwwwwyyok...",
    "..koywwwyyok....","...kooyyook.....","....kkkkkk......","................"],
  moves: [
    "..wwwwwwwwww....","..w........wk...","..w.kkkkkk.wwk..","..w........wwwk.",
    "..w.kkkkkkk...k.","..w...........k.","..w.kkkkk.kkk.k.","..w...........k.",
    "..w.kkkkkkkk..k.","..w...........k.","..w.kkk.......k.","..w...........k.",
    "..w.kkkkkkkkk.k.","..w...........k.","..wkkkkkkkkkkkk.","................"],
  bin: [
    "................","....kkkkkkkk....","...k........k...","..kkkkkkkkkkkk..",
    "..k..........k..","...k.k.k.k.k....","...k.k.k.k.k....","...k.k.k.k.k....",
    "...k.k.k.k.k....","...k.k.k.k.k....","...k.k.k.k.k....","...k.k.k.k.k....",
    "....k......k....","....kkkkkkkk....","................","................"],
  scr: [
    "................",".kkkkkkkkkkkkk..",".kwwwwwwwwwwwk..",".kwkkkkkkkkkwk..",
    ".kwkooyyyookwk..",".kwkoyywwyokwk..",".kwkoywwwyokwk..",".kwkkkkkkkkkwk..",
    ".kwwwwwwwwwwwk..",".kkkkkkkkkkkkk..","....kkkkkkk.....","......kkk.......",
    "....kkkkkkk.....","................","................","................"],
  folder: [
    "................","................","..kkkkk.........",".k.....k........",
    "k.......kkkkkkk.","k..............k","k.yyyyyyyyyyyy.k","k.yyyyyyyyyyyy.k",
    "k.yyyyyyyyyyyy.k","k.yyyyyyyyyyyy.k","k.yyyyyyyyyyyy.k","k.yyyyyyyyyyyy.k",
    "k..............k",".kkkkkkkkkkkkkk.","................","................"],
  start: [
    "................",".rrrr..ggggg....",".rrrr..ggggg....",".rrrr..ggggg....",
    ".rrrr..ggggg....","................",".bbbb..yyyyy....",".bbbb..yyyyy....",
    ".bbbb..yyyyy....",".bbbb..yyyyy....","................","................",
    "................","................","................","................"],
  // the tray speaker, and the same speaker with the waves crossed out
  speaker: [
    "................","................","...........k....",".......k..k.k...",
    "......kk..k.k...",".....kdk.k.k.k..","..kkkkdk.k.k.k..","..kwdddk.k.k.k..",
    "..kwdddk.k.k.k..","..kkkkdk.k.k.k..",".....kdk.k.k.k..","......kk..k.k...",
    ".......k..k.k...","...........k....","................","................"],
  speakerOff: [
    "................","................",".......k........","......kk........",
    ".....kdk.r...r..","..kkkkdk..r.r...","..kwdddk...r....","..kwdddk...r....",
    "..kkkkdk..r.r...",".....kdk.r...r..","......kk........",".......k........",
    "................","................","................","................"],
} as const;

export const ROCKET = [
  ".....rr.....","....rrrr....","....rrrr....","...swssss...","...swssss...",
  "..sswkksss..","..sswbbkss..","..sswbbkss..","..sswkksss..",".rsswssssr..",
  ".rrswsssrr..","rrrssssssrr.","rr.ssssss.rr","....oyyo....","...oyyyyo...",
  "...oyyyyo...","....oyyo....",".....oo....."] as const;
