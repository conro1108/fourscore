/** Pixel icons: tiny canvases upscaled with image-rendering:pixelated. */

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

/** Painted icon canvas. System icons are 16x16; a player's .spr can be any
    shape up to the cap — the art sets the canvas, the CSS box keeps aspect. */
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
  // the drive
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
  // COMMAND.COM
  term: [
    "................",".kkkkkkkkkkkkk..",".kwwwwwwwwwwwk..",".kwkkkkkkkkkwk..",
    ".kwkskkkkkkkwk..",".kwkkskkkkkkwk..",".kwkskssskkkwk..",".kwkkkkkkkkkwk..",
    ".kwwwwwwwwwwwk..",".kkkkkkkkkkkkk..","....kkkkkkk.....","......kkk.......",
    "....kkkkkkk.....","................","................","................"],
  // tray speaker, and muted
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
  // a user file on C:\ (system things keep their own icons)
  file: [
    "................","...kkkkkkkkk....","...kwwwwwwwkk...","...kwwwwwwwkwk..",
    "...kwwwwwwwkkkk.","...kwwwwwwwwwwk.","...kwdddddddwwk.","...kwwwwwwwwwwk.",
    "...kwdddddwwwwk.","...kwwwwwwwwwwk.","...kwddddddwwwk.","...kwwwwwwwwwwk.",
    "...kwddddwwwwwk.","...kwwwwwwwwwwk.","...kkkkkkkkkkkk.","................"],
  // games folder
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
  // Help
  helpbook: [
    "................","..kkkkkkkkkkkk..","..kkyyyyyyyyyk..","..kkyyywwwyyyk..",
    "..kkyyywyyywyk..","..kkyyyyyyywyk..","..kkyyyyyywyyk..","..kkyyyyywyyyk..",
    "..kkyyyyyyyyyk..","..kkyyyyywyyyk..","..kkyyyyyyyyyk..","..kkyyyyyyyyyk..",
    "..kkkkkkkkkkkk..","................","................","................"],
  // Shut Down
  off: [
    "................",".kkkkkkkkkkkkk..",".kwwwwwwwwwwwk..",".kwkkkkkkkkkwk..",
    ".kwkkkkkkkkkwk..",".kwkkkkwkkkkwk..",".kwkkkkkkkkkwk..",".kwkkkkkkkkkwk..",
    ".kwwwwwwwwwwwk..",".kkkkkkkkkkkkk..","....kkkkkkk.....","......kkk.......",
    "....kkkkkkk.....","................","................","................"],
  // PAINT.EXE
  paint: [
    "................",".kkkkkkkkkkkkk..",".kwwwwwwwwwwwk..",".kwrrwyywbbwwk..",
    ".kwrrwyywbbwwk..",".kwwwwwwwwwwwk..",".kwnnwttwddwwk..",".kwnnwttwddwwk..",
    ".kwwwwwwwwkkwk..",".kkkkkkkkkoykk..","..........koyk..","...........koyk",
    "............kk..","................","................","................"],
  // pieces.ctl
  disc: [
    "................","................","....kkkkkkkk....","...krrwwrrrrk...",
    "..krwwrrrrrrrk..","..krwrrrrrrrrk..","..krrrrrrrrrrk..","..krrrrrrrrrrk..",
    "..krrrrrrrrrrk..","...krrrrrrrrk...","....kkkkkkkk....","................",
    "................","................","................","................"],
} as const;

// The rocket is rocket.spr now (copy.ts SEED_FILES), not chrome.
