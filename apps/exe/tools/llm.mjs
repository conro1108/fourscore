/**
 * Watch the machine think. Opens the real terminal in a real browser, types
 * the three commands a player would type, and photographs the result every
 * few seconds — because a token takes about two of them and a single
 * screenshot at a fixed moment cannot tell "slow" from "stuck".
 *
 * Usage:  npm run llm            (spawns its own dev server)
 * Env:    BASE, CHROME, SECONDS
 */
import { chromium } from "playwright-core";
import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const CHROME =
  process.env.CHROME ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const SECONDS = Number(process.env.SECONDS ?? 45);
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
let bad = 0;
const fail = (m) => {
  console.error("LLM FAIL:", m);
  bad++;
};
page.on("pageerror", (e) => fail(`pageerror: ${e.message}`));
page.on("requestfailed", (r) => fail(`request failed: ${r.url()}`));

await page.goto(`${BASE}/?state=terminal`);
await page.waitForTimeout(1500);

const input = page.locator(".termin");
const type = async (line) => {
  await input.click();
  await input.type(line, { delay: 12 });
  await input.press("Enter");
  await page.waitForTimeout(400);
};
// the finished lines are in the first .termout; the line the program is
// still writing is in the second, and for a long while that is all of it
const screen = async () =>
  (await page.locator(".termout").first().innerText()) +
  (await page.locator(".termout").nth(1).innerText());

await type("cd /src");
await type("cc llm.c");
const compiled = await screen();
console.log(compiled.split("\n").slice(-3).join("\n"));
if (!/\d+ words/.test(compiled)) fail("cc llm.c did not report a program size");

await type("run llm");
let last = "";
for (let s = 5; s <= SECONDS; s += 5) {
  await page.waitForTimeout(5000);
  await page.screenshot({ path: here(`../shots/llm-${String(s).padStart(2, "0")}s.png`) });
  const text = await screen();
  const story = text.split("EVERY WORD.")[1]?.trim() ?? "";
  console.log(`${String(s).padStart(3)}s  ${JSON.stringify(story.slice(-70))}`);
  if (s >= 15 && story === last) fail(`nothing new between ${s - 5}s and ${s}s`);
  last = story;
}

const text = await screen();
if (!/STORIES-260K/.test(text)) fail("the program never introduced itself");
if (/fault|stopped/i.test(text)) fail("the program faulted");
if ((text.split("EVERY WORD.")[1] ?? "").trim().length < 20) fail("it never said anything");

await browser.close();
server?.kill();
console.log(bad ? `\n${bad} problem(s)` : "\nok — shots in apps/exe/shots/llm-*.png");
process.exitCode = bad ? 1 : 0;
