/**
 * Screenshot the possessed desktop in its named states.
 * Usage:  npm run shots [-- name ...]   (no args = everything)
 * Env:    BASE    reuse a running dev server instead of spawning one
 *         CHROME  path to a Chrome binary
 * Output: apps/exe/shots/ (gitignored). Look at them; that's the point —
 * this repo has repeatedly caught bugs this way that typechecked fine.
 */
import { chromium } from "playwright-core";
import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const CHROME =
  process.env.CHROME ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
mkdirSync(here("../shots"), { recursive: true });

const STATES = [
  ["desktop", "?"],
  ["midgame", "?state=midgame"],
  ["midgame-c5", "?state=midgame&variant=connect5"],
  ["fever-035", "?state=midgame&fever=0.35"],
  ["fever-060", "?state=midgame&fever=0.6"],
  ["fever-085", "?state=midgame&fever=0.85"],
  ["fever-100", "?state=midgame&fever=1"],
  ["win-ants", "?state=win&beat=2"],
  ["win-cascade", "?state=win&beat=6"],
  ["win-final", "?state=win&beat=11"],
  ["loss-ants", "?state=loss&beat=2"],
  ["loss-smolder", "?state=loss&beat=4"],
  ["loss-final", "?state=loss"],
  ["pieces", "?state=pieces"],
  ["chips-pixel", "?state=midgame&chips=pixel"],
  ["chips-faces", "?state=midgame&chips=faces"],
  ["ctl", "?state=midgame&ctl=1"],
  ["saver", "?state=saver"],
  ["midgame-c6", "?state=midgame&variant=connect6"],
  ["oracle", "?state=midgame&bot=oracle"],
  ["mines", "?state=mines"],
  ["snake", "?state=snake"],
  ["sol", "?state=sol"],
  ["checkers", "?state=checkers"],
  ["chess", "?state=chess"],
  ["notepad", "?state=notepad"],
  ["games", "?state=games"],
];

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
    server.stdout.on("data", (d) => {
      if (String(d).includes("ready in") || String(d).includes("Local:")) {
        clearTimeout(t);
        resolve();
      }
    });
    server.on("exit", () => reject(new Error("vite exited early")));
  });
}

const only = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.on("pageerror", (e) => console.log("[pageerror]", e.message));
page.on("console", (m) => m.type() === "error" && console.log("[console]", m.text()));

for (const [name, qs] of STATES) {
  if (only.length && !only.some((o) => name.includes(o))) continue;
  await page.goto(`${BASE}/${qs}`);
  await page.waitForTimeout(1800);
  await page.screenshot({ path: here(`../shots/${name}.png`) });
  console.log("shot", name);
}
await browser.close();
server?.kill();
process.exit(0);
