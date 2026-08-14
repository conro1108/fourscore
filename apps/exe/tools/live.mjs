/**
 * Drive the live app: click real columns, wait for the real engine to answer,
 * open the menus, and screenshot the proof. The unit tests can't see any of
 * this — this is the eyes.
 * Usage:  node tools/live.mjs   (spawns its own dev server like shots.mjs)
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
  const PORT = 5198;
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
  console.error("LIVE FAIL:", msg);
  process.exitCode = 1;
};
page.on("pageerror", (e) => fail(`pageerror: ${e.message}`));

await page.goto(`${BASE}/`);
await page.waitForTimeout(1200);

const discs = async () => page.locator("#grid .disc").count();

// play three moves against the real MOSS
for (let i = 0; i < 3; i++) {
  const before = await discs();
  await page.locator(`#grid .cell[data-col="${3 - i}"]`).first().click();
  // your disc lands, then MOSS deliberates and answers
  await page.waitForFunction(
    (n) => document.querySelectorAll("#grid .disc").length >= n + 2,
    before,
    { timeout: 20000 },
  );
  console.log(`ply ${i + 1}: board now has ${await discs()} discs`);
}
const status = await page.locator(".statusbar div").first().textContent();
console.log("status:", status);
if (!/YOUR MOVE/.test(status ?? "")) fail(`expected YOUR MOVE, got "${status}"`);
await page.screenshot({ path: here("../shots/live-game.png") });

// the second law spot-check: menus open and do things
await page.getByText("Opponent", { exact: false }).first().click();
await page.waitForTimeout(200);
await page.screenshot({ path: here("../shots/live-menu.png") });
const quill = page.locator(".popup div", { hasText: "QUILL" });
if ((await quill.count()) === 0) fail("opponent menu did not list QUILL");
await quill.first().click();
await page.waitForTimeout(400);
const stBot = await page.locator(".statusbar div").nth(1).textContent();
console.log("after switching to QUILL:", stBot);
if (!/QUILL/.test(stBot ?? "")) fail(`expected QUILL statusbar, got "${stBot}"`);

// start menu opens, shutdown answers
await page.locator("#start").click();
await page.waitForTimeout(150);
await page.getByText("Shut Down...").click();
await page.waitForTimeout(250);
const dlg = await page.getByText("not ready to shut down").count();
if (!dlg) fail("shutdown dialog missing");
await page.screenshot({ path: here("../shots/live-shutdown.png") });

// at high fever, dragging a dialog must leave un-repainted copies of itself
await page.goto(`${BASE}/?state=midgame&fever=0.85`);
await page.waitForTimeout(1000);
const bar = page.locator(".win", { hasText: "Something is warm" }).locator(".titlebar");
const box = await bar.first().boundingBox();
if (!box) fail("no Display dialog to drag at fever 0.85");
else {
  await page.mouse.move(box.x + 60, box.y + 10);
  await page.mouse.down();
  for (let i = 1; i <= 10; i++) {
    await page.mouse.move(box.x + 60 - i * 25, box.y + 10 + i * 18);
    await page.waitForTimeout(30);
  }
  await page.mouse.up();
  const smears = await page.locator("#smears > *").count();
  console.log("smears after drag:", smears);
  if (smears < 2) fail(`expected smears from the drag, got ${smears}`);
  await page.screenshot({ path: here("../shots/live-smear.png") });
}

console.log(process.exitCode ? "live run FAILED" : "live run ok");
await browser.close();
server?.kill();
process.exit(process.exitCode ?? 0);
