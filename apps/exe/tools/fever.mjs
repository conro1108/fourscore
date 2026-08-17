/**
 * Play a real game in a real browser and report what the desktop actually did.
 *
 * `trace.ts` proves the director's arithmetic and `shots.mjs` proves an act
 * renders; neither can tell you whether a beat ever reaches the screen in a
 * game a person plays. This clicks real columns against the real ladder over
 * the worker protocol and samples the desktop twice a second, so what it prints
 * is the escalation as experienced: when a tier crossed, when a dialog arrived,
 * when the clock slipped, when the titlebar changed its mind.
 *
 * Usage:  node tools/fever.mjs [column-plan]
 * Env:    BASE, CHROME (same as shots.mjs)
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
  const PORT = 5202;
  server = spawn("npx", ["vite", "--port", String(PORT), "--strictPort"], {
    cwd: here(".."),
    stdio: ["ignore", "pipe", "inherit"],
  });
  BASE = `http://localhost:${PORT}`;
  await new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("vite never came up")), 20000);
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
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.on("pageerror", (e) => console.error("PAGEERROR:", e.message));

await page.goto(`${BASE}/`);
await page.waitForTimeout(1200);

// the machine boots to a desk; the game the fever answers starts by hand
await page.locator("#stage > .icon", { hasText: "BOARD.EXE" }).dblclick();
await page.locator("#grid .cell").first().waitFor({ timeout: 10000 });
await page.waitForTimeout(400);

/** One sample of everything a beat or a tier can visibly change. */
const sample = () =>
  page.evaluate(() => ({
    windows: [...document.querySelectorAll("#stage > .win")].map(
      (w) => w.querySelector(".titlebar .t")?.textContent ?? "?",
    ),
    clock: document.querySelector("#clock")?.textContent ?? "",
    boardTitle:
      [...document.querySelectorAll("#stage > .win")]
        .map((w) => w.querySelector(".titlebar .t")?.textContent ?? "")
        .find((t) => t.startsWith("BOARD.EXE")) ?? "",
    icons: [...document.querySelectorAll(".icon")].map((i) => i.style.transform || "none").join("|"),
    notes: document.querySelector(".notepad")?.textContent?.split("\n").length ?? 0,
    trail: document.querySelectorAll("#trail .cur").length,
    saver: document.querySelector("#saver")?.style.display === "block",
  }));

const events = [];
let prev = await sample();
const started = Date.now();
const at = () => ((Date.now() - started) / 1000).toFixed(1).padStart(5);

const watch = setInterval(async () => {
  let now;
  try {
    now = await sample();
  } catch {
    return;
  }
  const opened = now.windows.filter((w) => !prev.windows.includes(w));
  const closed = prev.windows.filter((w) => !now.windows.includes(w));
  if (opened.length) events.push(`${at()}s  + ${opened.join(", ")}`);
  if (closed.length) events.push(`${at()}s  - ${closed.join(", ")}`);
  if (now.clock !== prev.clock) events.push(`${at()}s  clock ${prev.clock} -> ${now.clock}`);
  if (now.boardTitle !== prev.boardTitle) events.push(`${at()}s  title "${now.boardTitle}"`);
  if (now.icons !== prev.icons && now.icons.split("|").some((v) => v !== "none"))
    events.push(`${at()}s  icons off-grid`);
  if (now.notes !== prev.notes) events.push(`${at()}s  moves.txt now ${now.notes} lines`);
  if (now.trail !== prev.trail) events.push(`${at()}s  cursor ghosts ${prev.trail} -> ${now.trail}`);
  if (now.saver !== prev.saver) events.push(`${at()}s  screensaver ${now.saver ? "WINS" : "lets go"}`);
  prev = now;
}, 500);

const discs = () => page.locator("#grid .disc").count();
const over = async () =>
  (await page.locator(".statusbar div").first().textContent())?.match(/WIN|DRAW|CONNECTED/i);

// A person plays: mostly the middle, some drift, a real pause now and then.
const plan = (process.argv[2] ?? "3,3,2,4,2,4,1,5,1,5,0,6,0,6,3,2,4,1,5,0,6")
  .split(",")
  .map(Number);

for (const col of plan) {
  if (await over()) break;
  const before = await discs();
  const cell = page.locator(`#grid .cell[data-col="${col}"]`).first();
  if ((await cell.count()) === 0) break;
  await cell.click({ force: true }).catch(() => {});
  // your disc lands, then the opponent deliberates and answers
  await page
    .waitForFunction((n) => document.querySelectorAll("#grid .disc").length >= n + 2, before, {
      timeout: 15000,
    })
    .catch(() => {});
  await page.waitForTimeout(1500); // a person thinking
}

await page.waitForTimeout(6000); // let the ending play
clearInterval(watch);
await page.screenshot({ path: here("../shots/fever-live-end.png") });

console.log(`\n---- what the desktop did over ${at()}s of one real game ----`);
for (const e of events) console.log(e);
console.log(`\ndiscs on the board: ${await discs()}`);
console.log(`status: ${await page.locator(".statusbar div").first().textContent()}`);

await browser.close();
server?.kill();
process.exit(0);
