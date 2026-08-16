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
  // CHESS.EXE's endings, which stay on the board, and its own minor fever
  ["chess-mate", "?state=chess&fen=R5k1/5ppp/8/8/8/8/8/6K1 b - - 1 1"],
  ["chess-mated", "?state=chess&fen=rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3"],
  ["chess-stalemate", "?state=chess&fen=7k/5Q2/6K1/8/8/8/8/8 b - - 0 1"],
  // the three steps of the window's own weather: a queen standing loose, the
  // same with the king addressed, and a mate actually on the board
  ["chess-loose", "?state=chess&fen=r3k2r/ppp2ppp/8/3q4/4P3/2N5/PPP2PPP/R3K2R w KQkq - 0 1"],
  ["chess-check", "?state=chess&fen=r3k3/ppp2ppp/8/3q4/4P3/2N5/PPP2PPP/R3K2r w Qq - 0 1"],
  ["chess-sharp", "?state=chess&fen=6k1/2p2ppp/8/8/8/5N2/7q/R4K2 w - - 0 1"],
  ["notepad", "?state=notepad"],
  ["paint", "?state=paint"],
  ["terminal", "?state=terminal"],
  // the review solves a real game first; the third field is a longer wait
  ["review", "?state=review", 15000],
  ["games", "?state=games"],
  ["sounds", "?state=sounds"],
  ["shutdown", "?state=shutdown"],
  // the restart beat, held at the POST — the real one has navigated by now
  ["reboot", "?state=reboot"],
  // the beat acts — what the desktop does between tier crossings. Each puts
  // itself back after a second or two, so they are posed rather than caught.
  ["beat-dialog-blunder", "?state=midgame&act=dialog&pool=move:blunder"],
  ["beat-dialog-threat", "?state=midgame&act=dialog&pool=threat:bot"],
  ["beat-dialog-nevermind", "?state=midgame&act=dialog&pool=swing:collapsing"],
  ["beat-title-slip", "?state=midgame&act=title-slip&pool=move:dubious"],
  ["beat-note", "?state=midgame&act=note&pool=move:brilliant"],
  ["beat-clock-lurch", "?state=midgame&act=clock-lurch&pool=threat:bot"],
  ["beat-taskbar", "?state=midgame&act=taskbar-stutter&pool=move:brilliant"],
  ["beat-icon-twitch", "?state=midgame&act=icon-twitch&pool=move:blunder"],
  ["beat-preview-blink", "?state=midgame&act=preview-blink&pool=swing:rising"],
  ["beat-flare", "?state=midgame&act=flare&pool=threat:you"],
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

for (const [name, qs, delay] of STATES) {
  if (only.length && !only.some((o) => name.includes(o))) continue;
  await page.goto(`${BASE}/${qs}`);
  await page.waitForTimeout(delay ?? 1800);
  await page.screenshot({ path: here(`../shots/${name}.png`) });
  console.log("shot", name);
}
await browser.close();
server?.kill();
process.exit(0);
