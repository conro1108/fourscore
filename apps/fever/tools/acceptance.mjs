/**
 * Acceptance run: play a full game vs Moss on both variants through the real
 * app. First human move goes through an actual canvas click (raycast path);
 * the rest drive the store's playColumn (same entry the click handler uses).
 * Samples rAF frame rate mid-game.
 *
 * Usage:  npm run dev  (in apps/fever), then  npm run acceptance
 * Env:    BASE, CHROME — same as tools/shots.mjs.
 */
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

const BASE = process.env.BASE ?? "http://localhost:5173";
const exe =
  process.env.CHROME ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const outDir = fileURLToPath(new URL("../shots", import.meta.url));
mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({ executablePath: exe, headless: true });
const page = await browser.newPage({ viewport: { width: 1100, height: 760 } });
page.on("pageerror", (e) => console.log("[pageerror]", e.message));
page.on("console", (m) => {
  if (m.type() === "error") console.log("[console.error]", m.text());
});

await page.goto(BASE);
await page.waitForFunction(() => window.__fever !== undefined);
await page.waitForSelector("canvas");
await page.waitForTimeout(600);

const state = () =>
  page.evaluate(() => {
    const s = window.__fever.matchStore.getState();
    return {
      moves: s.moves,
      landed: s.landed,
      status: s.match.status,
      turn: s.match.turn,
      winner: s.match.winner,
      thinking: s.thinking,
      variantId: s.variant.id,
      width: s.variant.width,
    };
  });

const myTurn = () =>
  page.waitForFunction(() => {
    const s = window.__fever.matchStore.getState();
    return (
      s.match.status !== "playing" ||
      (s.match.turn === (s.humanFirst ? "red" : "yellow") &&
        s.landed === s.moves.length &&
        !s.thinking)
    );
  }, undefined, { timeout: 30000 });

async function playGame(label, { clickFirst }) {
  let fps = null;
  let first = true;
  for (let guard = 0; guard < 200; guard++) {
    await myTurn();
    const s = await state();
    if (s.status !== "playing") {
      console.log(
        `[${label}] over after ${s.moves.length} plies: ${
          s.status === "draw" ? "draw" : `${s.winner} wins`
        } | moves: ${s.moves.join(",")}`,
      );
      return { s, fps };
    }
    if (first && clickFirst) {
      // Real canvas click at the horizontal center = middle column.
      await page.mouse.click(550, 400);
      const after = await page.evaluate(
        () => window.__fever.matchStore.getState().moves,
      );
      const mid = Math.floor(s.width / 2);
      if (after.length !== s.moves.length + 1 || after[after.length - 1] !== mid) {
        throw new Error(
          `canvas click failed: expected col ${mid} appended, got [${after.join(",")}]`,
        );
      }
      console.log(`[${label}] canvas click landed in column ${mid}`);
      first = false;
      continue;
    }
    // Prefer center-out; any legal column.
    await page.evaluate(() => {
      const s = window.__fever.matchStore.getState();
      const order = [...s.variant.moveOrder];
      const col = order.find((c) => s.match.canPlay(c));
      s.playColumn(col);
    });
    if (fps === null && s.moves.length >= 6) {
      fps = await page.evaluate(
        () =>
          new Promise((res) => {
            let n = 0;
            const t0 = performance.now();
            const loop = () =>
              performance.now() - t0 < 3000
                ? (n++, requestAnimationFrame(loop))
                : res(Math.round((n * 1000) / (performance.now() - t0)));
            requestAnimationFrame(loop);
          }),
      );
      console.log(`[${label}] sampled ${fps} fps mid-game (discs falling, bot thinking)`);
    }
  }
  throw new Error("game did not finish in 200 turns");
}

// Game 1: Connect 4.
const g1 = await playGame("connect4", { clickFirst: true });
if (g1.s.variantId !== "connect4") throw new Error("expected connect4");
await page.waitForTimeout(1400); await page.screenshot({ path: `${outDir}/game-c4-end.png` });

// Switch variant through the real chrome button.
await page.click('button:has-text("Connect 5")');
await page.waitForFunction(
  () => window.__fever.matchStore.getState().variant.id === "connect5",
);
// Let React re-render the scene for the new geometry before raycasting into it.
await page.waitForTimeout(600);
const g2 = await playGame("connect5", { clickFirst: true });
if (g2.s.variantId !== "connect5") throw new Error("expected connect5");
await page.waitForTimeout(1400); await page.screenshot({ path: `${outDir}/game-c5-end.png` });

// Rematch from the dialog.
await page.click('button:has-text("Rematch")');
await page.waitForFunction(
  () => window.__fever.matchStore.getState().moves.length === 0,
);
console.log("[dialog] rematch resets the game");

await browser.close();
console.log("acceptance run complete");
