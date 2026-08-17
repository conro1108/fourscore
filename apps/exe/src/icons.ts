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
  n: "#3cd43c",
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

/** An icon canvas at a given CSS size, already painted. The system icons are
    all 16x16, but a player's .spr can be any shape up to the cap — the art's
    own dimensions set the canvas, and the CSS box keeps the aspect. */
export function iconCanvas(rows: readonly string[], cssSize = 32): HTMLCanvasElement {
  const c = document.createElement("canvas");
  const w = Math.max(1, ...rows.map((r) => r.length));
  const h = Math.max(1, rows.length);
  c.width = w;
  c.height = h;
  c.className = "pix";
  const m = Math.max(w, h);
  c.style.width = `${Math.round((cssSize * w) / m)}px`;
  c.style.height = `${Math.round((cssSize * h) / m)}px`;
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
  // the drive itself — the box the whole tree lives in, light and all
  drive: [
    "................","................","................",".kkkkkkkkkkkkkk.",
    ".kcccccccccccck.",".kcwwwwwwwwwwck.",".kcccccccccccck.",".kcssssssssssck.",
    ".kcccccccccccck.",".kckkkkkkk.cnck.",".kcccccccccccck.",".kkkkkkkkkkkkkk.",
    "................","................","................","................"],
  start: [
    "................",".rrrr..ggggg....",".rrrr..ggggg....",".rrrr..ggggg....",
    ".rrrr..ggggg....","................",".bbbb..yyyyy....",".bbbb..yyyyy....",
    ".bbbb..yyyyy....",".bbbb..yyyyy....","................","................",
    "................","................","................","................"],
  // COMMAND.COM: a monitor showing a prompt and its cursor
  term: [
    "................",".kkkkkkkkkkkkk..",".kwwwwwwwwwwwk..",".kwkkkkkkkkkwk..",
    ".kwkskkkkkkkwk..",".kwkkskkkkkkwk..",".kwkskssskkkwk..",".kwkkkkkkkkkwk..",
    ".kwwwwwwwwwwwk..",".kkkkkkkkkkkkk..","....kkkkkkk.....","......kkk.......",
    "....kkkkkkk.....","................","................","................"],
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
  // a regular file on C:\ — a plain page, dog-eared. System things (moves.txt,
  // the games folder) keep their own icons; this one means "yours, on the disk"
  file: [
    "................","...kkkkkkkkk....","...kwwwwwwwkk...","...kwwwwwwwkwk..",
    "...kwwwwwwwkkkk.","...kwwwwwwwwwwk.","...kwdddddddwwk.","...kwwwwwwwwwwk.",
    "...kwdddddwwwwk.","...kwwwwwwwwwwk.","...kwddddddwwwk.","...kwwwwwwwwwwk.",
    "...kwddddwwwwwk.","...kwwwwwwwwwwk.","...kkkkkkkkkkkk.","................"],
  // the games folder is furniture, not a folder you made — it wears a disc
  gamesFolder: [
    "................","................","..kkkkk.........",".k.....k........",
    "k.......kkkkkkk.","k..............k","k.yyyyyyyyyyyy.k","k.yyykkkkyyyyy.k",
    "k.yykrrrrkyyyy.k","k.yykrrrrkyyyy.k","k.yyykkkkyyyyy.k","k.yyyyyyyyyyyy.k",
    "k..............k",".kkkkkkkkkkkkk..","................","................"],
  settings: [
    "................",".kkkkkkkkkkkkk..",".kccccccccccck..",".kcckcckcckcck..",
    ".kcrrrckcckcck..",".kcrrrckcckcck..",".kcckcyyyckcck..",".kcckcyyyckcck..",
    ".kcckcckcbbbck..",".kcckcckcbbbck..",".kcckcckcckcck..",".kccccccccccck..",
    ".kkkkkkkkkkkkk..","................","................","................"],
  // Help: the manual, closed, asking its one question
  helpbook: [
    "................","..kkkkkkkkkkkk..","..kkyyyyyyyyyk..","..kkyyywwwyyyk..",
    "..kkyyywyyywyk..","..kkyyyyyyywyk..","..kkyyyyyywyyk..","..kkyyyyywyyyk..",
    "..kkyyyyyyyyyk..","..kkyyyyywyyyk..","..kkyyyyyyyyyk..","..kkyyyyyyyyyk..",
    "..kkkkkkkkkkkk..","................","................","................"],
  // Shut Down: the same monitor as flames.scr, switched off
  off: [
    "................",".kkkkkkkkkkkkk..",".kwwwwwwwwwwwk..",".kwkkkkkkkkkwk..",
    ".kwkkkkkkkkkwk..",".kwkkkkwkkkkwk..",".kwkkkkkkkkkwk..",".kwkkkkkkkkkwk..",
    ".kwwwwwwwwwwwk..",".kkkkkkkkkkkkk..","....kkkkkkk.....","......kkk.......",
    "....kkkkkkk.....","................","................","................"],
  // PAINT.EXE: the color box, and a brush leaving through the corner
  paint: [
    "................",".kkkkkkkkkkkkk..",".kwwwwwwwwwwwk..",".kwrrwyywbbwwk..",
    ".kwrrwyywbbwwk..",".kwwwwwwwwwwwk..",".kwnnwttwddwwk..",".kwnnwttwddwwk..",
    ".kwwwwwwwwkkwk..",".kkkkkkkkkoykk..","..........koyk..","...........koyk",
    "............kk..","................","................","................"],
  // pieces.ctl: one red checker
  disc: [
    "................","................","....kkkkkkkk....","...krrwwrrrrk...",
    "..krwwrrrrrrrk..","..krwrrrrrrrrk..","..krrrrrrrrrrk..","..krrrrrrrrrrk..",
    "..krrrrrrrrrrk..","...krrrrrrrrk...","....kkkkkkkk....","................",
    "................","................","................","................"],
} as const;

// The rocket that used to live here as chrome is rocket.spr now — a seed
// file on the disk (copy.ts SEED_FILES), drawn in its own format.
