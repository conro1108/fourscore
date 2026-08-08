/**
 * Dump the WordArt tiles themselves, magnified, against a running dev server.
 * Usage:  npm run dev  (in apps/fever), then  npm run wordart
 * Env:    BASE   dev server origin (default http://localhost:5173)
 *         CHROME path to a Chrome/Chromium binary
 *         OUT    where the sheet lands (default shots/wordart.png)
 *
 * `npm run shots` photographs a word inside the scene, which tells you the word
 * looks wrong and never tells you why — bloom, the board behind it and the
 * act's own pose all get a vote. This renders `wordArt` straight onto a canvas
 * at 12x with nothing else in the frame, so a preset is judged on the eight
 * texels of cap height it actually has.
 *
 * That distinction is not academic. The first pass drew the drop shadow with
 * the outline as well as the fill; in the scene it read as a word rendered
 * twice and could plausibly have been a UV bug, a double-render, or the ramp.
 * On the sheet it was one look.
 */
import { chromium } from "playwright-core";
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const BASE = process.env.BASE ?? "http://localhost:5173";
const CHROME =
  process.env.CHROME ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const shots = fileURLToPath(new URL("../shots", import.meta.url));
mkdirSync(shots, { recursive: true });
const out = process.env.OUT ?? `${shots}/wordart.png`;

const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const page = await browser.newPage({ viewport: { width: 1100, height: 700 } });
page.on("pageerror", (e) => console.log("[pageerror]", e.message));
await page.goto(`${BASE}/preview.html`);

const dataUrl = await page.evaluate(async () => {
  const { wordArt } = await import("/src/props/texture.ts");
  // Every word the game says, with the preset it says it in — keep this in
  // step with `props/registry.ts`. The gallery only works if you can see the
  // whole gallery at once.
  const words = [
    ["GAME OVER", "chrome"],
    ["STILL HERE", "chrome"],
    ["NICE.", "acid"],
    ["OOF.", "heat"],
    ["HUH.", "void"],
    ["HEATING UP", "heat"],
  ];
  const S = 12;
  const c = document.createElement("canvas");
  c.width = 64 * S;
  c.height = 16 * S * words.length;
  const g = c.getContext("2d");
  g.imageSmoothingEnabled = false;
  // Mid grey behind, so the transparent gutter and the ink outline both read.
  // On black the cutout is invisible and on white the outline is.
  g.fillStyle = "#5a5566";
  g.fillRect(0, 0, c.width, c.height);
  words.forEach(([text, style], i) => {
    g.drawImage(wordArt(text, style).image, 0, i * 16 * S, 64 * S, 16 * S);
  });
  return c.toDataURL();
});

writeFileSync(out, Buffer.from(dataUrl.split(",")[1], "base64"));
await browser.close();
console.log("wrote", out);
