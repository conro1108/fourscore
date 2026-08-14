/**
 * Screenshot the proposal mocks. No server needed — they're file:// pages.
 * Usage:  node shots.mjs [name ...]   (no args = everything)
 * Env:    CHROME  path to a Chrome binary
 * Output: apps/exe/proposals/shots/ (gitignored). Look at them; that's the point.
 */
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const CHROME =
  process.env.CHROME ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
mkdirSync(here("shots"), { recursive: true });

const STATES = [
  ["index", "index.html"],
  ["01-fever-000", "01-inferno.html?fever=0"],
  ["01-fever-035", "01-inferno.html?fever=0.35"],
  ["01-fever-060", "01-inferno.html?fever=0.6"],
  ["01-fever-085", "01-inferno.html?fever=0.85"],
  ["01-fever-100", "01-inferno.html?fever=1"],
  ["02-beat-00-idle", "02-win.html?beat=0"],
  ["02-beat-02-flash", "02-win.html?beat=2"],
  ["02-beat-06-cascade", "02-win.html?beat=6"],
  ["02-beat-11-youwin", "02-win.html?beat=11"],
  ["03-shelf", "03-shelf.html"],
  ["04-board", "04-board.html?demo=1"],
  ["04-chips-pixel", "04-board.html?demo=1&chips=pixel"],
  ["04-chips-plastic", "04-board.html?demo=1&chips=plastic"],
  ["04-chips-rings", "04-board.html?demo=1&chips=rings"],
];

const only = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.on("pageerror", (e) => console.log("[pageerror]", e.message));
page.on("console", (m) => m.type() === "error" && console.log("[console]", m.text()));

for (const [name, url] of STATES) {
  if (only.length && !only.some((o) => name.includes(o))) continue;
  await page.goto("file://" + here(url.split("?")[0]) + (url.includes("?") ? "?" + url.split("?")[1] : ""));
  await page.waitForTimeout(1500);
  await page.screenshot({ path: here(`shots/${name}.png`) });
  console.log("shot", name);
}
await browser.close();
