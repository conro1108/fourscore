/**
 * Drive PAINT.EXE and the pinboard for real: draw on the grid, Save through
 * the File menu, check the disk actually holds the stroke, pin the picture
 * from its desk icon's menu, and reload to prove the pin survives. The unit
 * tests cover the format; this is the eyes and the hands.
 * Usage:  node tools/paint.mjs   (spawns its own dev server like shots.mjs)
 */
import { chromium } from "playwright-core";
import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const CHROME =
  process.env.CHROME ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
mkdirSync(here("../shots"), { recursive: true });

let BASE = process.env.BASE ?? null;
let server = null;
if (!BASE) {
  const PORT = 5199;
  server = spawn("npx", ["vite", "--port", String(PORT), "--strictPort"], {
    cwd: here(".."),
    stdio: ["ignore", "pipe", "inherit"],
  });
  BASE = `http://localhost:${PORT}`;
  await new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("vite never came up")), 15000);
    server.stdout.on("data", (d) => String(d).includes("Local:") && (clearTimeout(t), resolve()));
    server.on("exit", () => reject(new Error("vite exited early")));
  });
}

const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const fail = (msg) => {
  console.error("PAINT FAIL:", msg);
  process.exitCode = 1;
};
page.on("pageerror", (e) => fail(`pageerror: ${e.message}`));

await page.goto(`${BASE}/?state=paint`);
await page.waitForTimeout(1200);

/* ---- draw: pick red, drag a stroke across the empty top rows ---- */
// swatch order is [transparent, ...PAL]; red is PAL's fourth letter
await page.locator(".swatch").nth(4).click();
const grid = page.locator(".paintgrid");
const g = await grid.boundingBox();
const cell = g.width / 12; // rocket.spr is 12 wide
await page.mouse.move(g.x + cell * 0.5, g.y + cell * 0.5);
await page.mouse.down();
await page.mouse.move(g.x + cell * 3.5, g.y + cell * 0.5, { steps: 4 });
await page.mouse.up();
console.log("drew a red stroke");

/* ---- save through the File menu, answer the dialog ---- */
await page.locator("#stage .win", { hasText: "rocket.spr — Paint" }).locator(".menu span", { hasText: "File" }).click();
await page.locator(".popup div", { hasText: "Save" }).first().click();
await page.waitForTimeout(300);
const dlg = await page.locator("#stage .win", { hasText: "has been saved" }).count();
if (!dlg) fail("no saved dialog");
await page.locator(".btn", { hasText: "OK" }).first().click();

const savedRow = await page.evaluate(() => {
  // the volume is a tree now: {v: 2, dirs, files} with path names
  const files = JSON.parse(localStorage.getItem("exe.fs") ?? "{}").files ?? [];
  return files.find((f) => f.name.toLowerCase() === "desktop\\rocket.spr")?.text.split("\n")[0];
});
console.log("disk now holds:", JSON.stringify(savedRow));
if (!/^rrr/.test(savedRow ?? "")) fail(`the stroke never reached the disk: ${savedRow}`);

/* ---- pin it from the desk icon's own menu ---- */
await page.locator("#stage > .icon", { hasText: "rocket.spr" }).click({ button: "right" });
await page.locator(".popup.ctx div", { hasText: "Pin to desk" }).click();
await page.waitForTimeout(200);
if (!(await page.locator("canvas.pin").count())) fail("no pin appeared");

/* ---- drag the pin to open desk (a pin under a window stays under it, the
   way the rocket did), reload, and expect it to have stayed ---- */
const pin = await page.locator("canvas.pin").boundingBox();
await page.mouse.move(pin.x + pin.width / 2, pin.y + pin.height / 2);
await page.mouse.down();
await page.mouse.move(640, 660, { steps: 6 });
await page.mouse.up();
await page.reload();
await page.waitForTimeout(1200);
const after = await page.locator("canvas.pin").boundingBox();
if (!after) fail("the pin did not survive the reload");
else if (Math.abs(after.x - (640 - pin.width / 2)) > 8) fail(`pin drifted: ${after.x}`);
else console.log("pin survived the reload at", Math.round(after.x), Math.round(after.y));

await page.screenshot({ path: here("../shots/paint-live.png") });

/* ---- take it down again and confirm the wall is bare ---- */
await page.locator("canvas.pin").click({ button: "right" });
await page.locator(".popup.ctx div", { hasText: "Take down" }).click();
if (await page.locator("canvas.pin").count()) fail("the pin refused to come down");
console.log(process.exitCode ? "PAINT: FAIL" : "PAINT: OK — drew, saved, pinned, reloaded");

await browser.close();
server?.kill();
