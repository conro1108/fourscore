/**
 * The phone harness: drive the desktop through a touchscreen the way an
 * iPhone would (touch events, coarse pointer, phone viewport) and screenshot
 * what a PWA user actually gets. Chromium's touch emulation isn't Safari,
 * but every pointer-event path and the small-desk fit are exercised for real.
 *
 * Usage:  npm run mobile        (in apps/exe)
 * Env:    BASE    reuse a running dev server instead of spawning one
 *         CHROME  path to a Chrome binary
 * Output: apps/exe/shots/mobile-*.png — look at them; that's the point.
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
    server.stdout.on("data", (d) => {
      if (String(d).includes("ready in") || String(d).includes("Local:")) {
        clearTimeout(t);
        resolve();
      }
    });
    server.on("exit", () => reject(new Error("vite exited early")));
  });
}

const browser = await chromium.launch({ executablePath: CHROME, headless: true });
let failed = false;
const fail = (msg) => {
  failed = true;
  console.log("FAIL", msg);
};

const center = async (page, sel) =>
  page.evaluate((s) => {
    const r = document.querySelector(s)?.getBoundingClientRect();
    return r ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : null;
  }, sel);

async function phone(viewport, tag) {
  const ctx = await browser.newContext({
    viewport,
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
  });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => fail(`[pageerror ${tag}] ${e.message}`));
  return { ctx, page };
}

/* ---- portrait: the desk shrinks to finger size, a game is playable ---- */
{
  const { ctx, page } = await phone({ width: 393, height: 852 }, "portrait");
  await page.goto(`${BASE}/`);
  await page.waitForTimeout(1500);

  // the machine boots to a desk; a phone user taps BOARD.EXE to play
  // (a tap launches an icon — no double-click on a touchscreen)
  const boardIcon = await page.evaluate(() => {
    const ic = [...document.querySelectorAll(".icon")].find(
      (i) => i.querySelector(".lbl")?.textContent === "BOARD.EXE",
    );
    const r = ic?.getBoundingClientRect();
    return r ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : null;
  });
  if (!boardIcon) fail("no BOARD.EXE icon on the phone desk");
  await page.touchscreen.tap(boardIcon.x, boardIcon.y);
  try {
    await page.waitForFunction(() => !!document.querySelector("#grid .cell"), null, {
      timeout: 10000,
    });
  } catch {
    fail("tapping BOARD.EXE never opened the board");
  }
  await page.waitForTimeout(500);

  // the small-desk fit engaged: a 64px cell must be finger-sized on screen
  const cellPx = await page.evaluate(() => {
    const c = document.querySelector(".cell");
    return c ? c.getBoundingClientRect().width : 0;
  });
  if (cellPx < 38) fail(`portrait cell is ${cellPx.toFixed(1)} device px — too small to tap`);

  // the board window is actually on the desk, not clamped off an edge
  const onDesk = await page.evaluate(() => {
    const w = [...document.querySelectorAll(".win")].find((el) =>
      el.querySelector(".titlebar .t")?.textContent.includes("BOARD"),
    );
    const r = w.getBoundingClientRect();
    return r.left >= -1 && r.right <= innerWidth + 1;
  });
  if (!onDesk) fail("portrait board window hangs off the desk");

  await page.screenshot({ path: here("../shots/mobile-desktop.png") });
  console.log("shot mobile-desktop");

  // a tap on a column drops a disc; the opponent answers
  const cell = await center(page, '#grid .cellrow:last-child .cell[data-col="2"]');
  await page.touchscreen.tap(cell.x, cell.y);
  try {
    await page.waitForFunction(() => document.querySelectorAll("#grid .disc").length >= 2, null, {
      timeout: 15000,
    });
    console.log("touch move played, opponent answered");
  } catch {
    fail("touch move never landed (or opponent never answered)");
  }
  await page.screenshot({ path: here("../shots/mobile-move.png") });
  console.log("shot mobile-move");

  // drag-aim: press column 0, slide to column 5, release — drops in 5
  const before = await page.evaluate(() => document.querySelectorAll("#grid .disc").length);
  const from = await center(page, '#grid .cellrow:last-child .cell[data-col="0"]');
  const to = await center(page, '#grid .cellrow:last-child .cell[data-col="5"]');
  await page.touchscreen.tap(from.x, from.y).catch(() => {});
  await page.waitForFunction(
    (n) => document.querySelectorAll("#grid .disc").length >= n + 2,
    before,
    { timeout: 15000 },
  );
  // now a real slide for the next move
  const drag = async () => {
    const cdp = await ctx.newCDPSession(page);
    const steps = 8;
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ x: from.x, y: from.y }],
    });
    for (let i = 1; i <= steps; i++)
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [{ x: from.x + ((to.x - from.x) * i) / steps, y: from.y }],
      });
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  };
  const count = await page.evaluate(() => document.querySelectorAll("#grid .disc").length);
  await drag();
  try {
    await page.waitForFunction(
      (n) => document.querySelectorAll("#grid .disc").length > n,
      count,
      { timeout: 8000 },
    );
    const droppedCol5 = await page.evaluate(
      () => !!document.querySelector('#grid .cellrow:last-child .cell[data-col="5"] .disc'),
    );
    if (droppedCol5) console.log("drag-aim drop landed in the aimed column");
    else fail("drag-aim dropped, but not in the aimed column");
  } catch {
    fail("drag-aim never dropped");
  }

  // a single tap launches a desk icon (no double-click on a touchscreen)
  const games = await page.evaluate(() => {
    const ic = [...document.querySelectorAll(".icon")].find(
      (i) => i.querySelector(".lbl")?.textContent === "games",
    );
    const r = ic.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  });
  await page.touchscreen.tap(games.x, games.y);
  await page.waitForTimeout(400);
  const folderOpen = await page.evaluate(() => !!document.querySelector(".folderpane"));
  if (!folderOpen) fail("tapping the games icon did not open the folder");
  else console.log("icon tap launches");

  // the Start menu opens on tap and sits above the thickened taskbar
  const start = await center(page, "#start");
  await page.touchscreen.tap(start.x, start.y);
  await page.waitForTimeout(300);
  await page.screenshot({ path: here("../shots/mobile-start.png") });
  console.log("shot mobile-start");

  await ctx.close();
}

/* ---- landscape: the wider desk takes the big variants ---- */
{
  const { ctx, page } = await phone({ width: 852, height: 393 }, "landscape");
  await page.goto(`${BASE}/?state=midgame&variant=connect5`);
  await page.waitForTimeout(1500);
  const cellPx = await page.evaluate(() => {
    const c = document.querySelector(".cell");
    return c ? c.getBoundingClientRect().width : 0;
  });
  if (cellPx < 30) fail(`landscape c5 cell is ${cellPx.toFixed(1)} device px`);
  await page.screenshot({ path: here("../shots/mobile-landscape-c5.png") });
  console.log("shot mobile-landscape-c5");
  await ctx.close();
}

await browser.close();
server?.kill();
console.log(failed ? "MOBILE HARNESS: FAILURES ABOVE" : "mobile harness: all good");
process.exit(failed ? 1 : 0);
