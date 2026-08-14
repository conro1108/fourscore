/**
 * Screenshot ONE state at a series of elapsed times — the eyes for anything
 * that happens over seconds rather than on load (the fever's rise, the
 * screensaver letting go, the cursor trail retracting). `shots.mjs` always
 * looks at 1800ms, so it is blind to every one of those.
 *
 * Usage:  npm run timeline -- "?state=win" 3 8 13 16 25 40
 * Env:    BASE, CHROME (same as shots.mjs)
 * Output: apps/exe/shots/t-<seconds>s.png
 */
import { chromium } from "playwright-core";
import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const CHROME =
  process.env.CHROME ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
mkdirSync(here("../shots"), { recursive: true });

const [query = "?state=win", ...rest] = process.argv.slice(2);
const marks = (rest.length ? rest.map(Number) : [3, 8, 13, 16, 25, 40]).sort((a, b) => a - b);

let BASE = process.env.BASE ?? null;
let server = null;
if (!BASE) {
  const PORT = 5201;
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

const browser = await chromium.launch({ executablePath: CHROME });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
// the desktop takes over on real idle too, so keep the pointer alive but still
await page.mouse.move(640, 400);
const t0 = Date.now();
await page.goto(`${BASE}/${query}`, { waitUntil: "domcontentloaded" });
for (const at of marks) {
  const wait = at * 1000 - (Date.now() - t0);
  if (wait > 0) await page.waitForTimeout(wait);
  await page.screenshot({ path: here(`../shots/t-${at}s.png`) });
  console.log(`shot t-${at}s`);
}
await browser.close();
server?.kill();
