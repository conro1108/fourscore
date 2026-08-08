/**
 * Screenshot every preview-harness state against a running dev server.
 * Usage:  npm run dev  (in apps/fever), then  npm run shots
 * Env:    BASE   dev server origin (default http://localhost:5173)
 *         CHROME path to a Chrome/Chromium binary
 *
 * Uses playwright-core driving the system Chrome, so nothing downloads a
 * browser. Screenshots land in apps/fever/shots/ (gitignored) — look at them;
 * that's the point. This harness caught a color-space bug on its first run
 * that typechecked fine.
 */
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

const BASE = process.env.BASE ?? "http://localhost:5173";
const CHROME =
  process.env.CHROME ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const outDir = fileURLToPath(new URL("../shots", import.meta.url));
mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const page = await browser.newPage({ viewport: { width: 1100, height: 760 } });
page.on("pageerror", (e) => console.log("[pageerror]", e.message));

await page.goto(`${BASE}/preview.html`);
// With no arguments, every state. With arguments, just those — iterating on
// one gag shouldn't cost a full harness pass.
const only = process.argv.slice(2);
const ids = only.length
  ? only
  : await page.evaluate(async () => {
      const mod = await import("/src/preview/states.ts");
      return mod.PREVIEW_STATES.map((s) => s.id);
    });

for (const id of ids) {
  await page.goto(`${BASE}/preview.html?state=${id}`);
  await page.waitForTimeout(1600);
  await page.screenshot({ path: `${outDir}/${id}.png` });
  console.log("shot", id);
}

// The grid, a screenful at a time. Not `fullPage`: the grid mounts its scenes
// on visibility because a browser only gives out ~16 WebGL contexts, and a
// full-page capture asks for every one of them at once.
if (only.length) {
  await browser.close();
  process.exit(0);
}
await page.goto(`${BASE}/preview.html`);
await page.waitForTimeout(2600);
const pages = await page.evaluate(() => Math.ceil(document.body.scrollHeight / innerHeight));
for (let i = 0; i < pages; i++) {
  await page.evaluate((n) => scrollTo(0, n * innerHeight), i);
  await page.waitForTimeout(2600);
  await page.screenshot({ path: `${outDir}/grid-${i + 1}.png` });
  console.log("shot grid", i + 1);
}

await browser.close();
