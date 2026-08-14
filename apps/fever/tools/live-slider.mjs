/**
 * The release slider, driven by a real pointer through the real app: play a
 * game out, close the outcome window, and put a hand on the handle.
 *
 * This is the one part of the toy that unit tests are blind to twice over —
 * the math is pure and passes either way, and a screenshot can't tell a bar
 * that answers the finger from one that doesn't. So the run asserts the whole
 * mechanism: the handle only moves when grabbed, a shove short of the detent
 * snaps back with the board still standing, past the detent it finishes
 * itself, the discs leave together, and the empty board is a new game.
 *
 * Usage:  npm run dev  (in apps/fever), then  npm run slider
 * Env:    BASE, CHROME — same as tools/shots.mjs.
 */
import { chromium } from "playwright-core";
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const BASE = process.env.BASE ?? "http://localhost:5173";
const exe =
  process.env.CHROME ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const outDir = fileURLToPath(new URL("../shots", import.meta.url));
mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({ executablePath: exe, headless: true });
const page = await browser.newPage({ viewport: { width: 1100, height: 760 } });
page.on("pageerror", (e) => console.log("[pageerror]", e.message));

await page.goto(BASE);
await page.waitForFunction(() => window.__fever !== undefined);
await page.waitForSelector("canvas");
await page.waitForTimeout(600);

const slider = () => page.evaluate(() => ({ ...window.__fever.stageFx.slider }));
const moves = () =>
  page.evaluate(() => window.__fever.matchStore.getState().moves.length);
/** When each disc lost its floor — the mechanism's whole claim, as numbers. */
const freed = () => page.evaluate(() => [...window.__fever.stageFx.freed]);

// A finished board, as fast as the bottom rung of the ladder can give one.
// In through the menu's own button: the slider arms on the match screen, so a
// game started behind the shell's back would never see a handle at all.
await page.evaluate(() =>
  window.__fever.matchStore
    .getState()
    .newGame({ botId: "pebble", humanFirst: true, live: false }),
);
await page.click('button:has-text("Start"), button:has-text("Resume")');
await page.waitForFunction(() => window.__fever.matchStore.getState().live === true);
for (let guard = 0; guard < 200; guard++) {
  await page.waitForFunction(
    () => {
      const s = window.__fever.matchStore.getState();
      return (
        s.match.status !== "playing" ||
        (s.match.turn === "red" && s.landed === s.moves.length && !s.thinking)
      );
    },
    undefined,
    { timeout: 30000 },
  );
  const done = await page.evaluate(() => {
    const s = window.__fever.matchStore.getState();
    if (s.match.status !== "playing") return s.moves.length;
    const col = [...s.variant.moveOrder].find((c) => s.match.canPlay(c));
    s.playColumn(col);
    return 0;
  });
  if (done) {
    console.log(`[game] over after ${done} plies`);
    break;
  }
}

// The outcome window is a DOM surface over the canvas; the handle is behind it.
await page.click('button[aria-label="Close"]');
// And the dev panel is a surface over the board, which is the thing these
// frames exist to show. It's mounted unconditionally on the dev server, so
// collapse it through its own control.
await page.click('.debug-head button[title="collapse"]');
await page.waitForTimeout(900);
await page.waitForFunction(() => window.__fever.stageFx.handleAt !== null);
const filled = await moves();
await page.screenshot({ path: `${outDir}/live-slider-armed.png` });

const at = await page.evaluate(() => window.__fever.stageFx.handleAt);
console.log(`[handle] armed at ${Math.round(at.x)},${Math.round(at.y)}`);

/** Walk the pointer right until the bar has moved this far, and report it. */
async function dragTo(target) {
  for (let px = 2; px <= 240; px += 2) {
    await page.mouse.move(at.x + px, at.y);
    const { pull } = await slider();
    if (pull >= target) return { pull, px };
  }
  throw new Error(`the bar never reached ${target}`);
}

async function grab() {
  await page.mouse.move(at.x, at.y);
  await page.mouse.down();
  if (!(await slider()).grabbed) throw new Error("the handle did not answer the pointer");
}

// A shove that stops short of the detent: the bar comes back and the board is
// exactly where it was. This is the half of the mechanism that has to *not*
// happen, and it's the half a screenshot can never show.
await grab();
const shy = await dragTo(0.45);
if ((await slider()).committed) throw new Error(`committed at ${shy.pull}`);
await page.mouse.up();
const after = await slider();
if (after.pull !== 0 || after.committed) {
  throw new Error(`a shy pull left the bar at ${after.pull}`);
}
if ((await freed()).length) throw new Error("discs let go on a shy pull");
console.log(`[shy] ${shy.px}px reached pull ${shy.pull.toFixed(2)} and snapped shut`);

// Past the detent, held there: committed, but the slots haven't come under the
// columns yet, so the board is still standing on the rungs.
await grab();
const held = await dragTo(0.75);
if (!(await slider()).committed) throw new Error(`no detent by pull ${held.pull}`);
if ((await freed()).length) throw new Error("discs let go before the slots aligned");
await page.screenshot({ path: `${outDir}/live-slider-held.png` });
console.log(
  `[detent] ${held.px}px reached pull ${held.pull.toFixed(2)}: committed, board still up`,
);

// Let go. The bar finishes on its own, and the whole board goes at once. The
// two frames bracket that: a capture fired the instant the hand comes off
// lands a beat into the fall, the next one a beat later.
await page.mouse.up();
// A whole board clears the frame in about a third of a second, and a
// Playwright screenshot lands somewhere in the next two hundred milliseconds —
// which is to say, always on an empty board. So the page catches these itself,
// off its own animation frames: waiting inside the browser for the pull to
// come home and reading the canvas back at fixed offsets after it. The rAF
// callback runs after the renderer's, so the buffer is the frame just drawn.
const frames = await page.evaluate(
  (offsets) =>
    new Promise((res) => {
      const canvas = document.querySelector("canvas");
      const shots = [];
      let fell = null;
      const tick = () => {
        if (fell === null && window.__fever.stageFx.slider.pull >= 0.97) {
          fell = performance.now();
        }
        if (fell !== null && performance.now() - fell >= offsets[shots.length]) {
          shots.push(canvas.toDataURL("image/png"));
          if (shots.length === offsets.length) return res(shots);
        }
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    }),
  [55, 150],
);
frames.forEach((data, i) => {
  writeFileSync(
    `${outDir}/live-slider-pour-${i + 1}.png`,
    Buffer.from(data.split(",")[1], "base64"),
  );
});

// The claim the whole rebuild rests on: one floor, one instant. A tray that
// opened column by column would pass every other check on this page.
const went = await freed();
if (went.length !== filled) {
  throw new Error(`${went.length} of ${filled} discs let go`);
}
const spread = Math.max(...went) - Math.min(...went);
if (spread > 40) throw new Error(`the board let go over ${Math.round(spread)}ms`);
console.log(
  `[pour] the bar finished itself; all ${filled} discs let go within ${Math.round(spread)}ms`,
);

await page.waitForFunction(
  () => window.__fever.matchStore.getState().moves.length === 0,
  undefined,
  { timeout: 6000 },
);
await page.waitForTimeout(400);
const reset = await slider();
if (reset.pull !== 0 || reset.committed) {
  throw new Error(`the bar stayed open into the new game: ${JSON.stringify(reset)}`);
}
await page.screenshot({ path: `${outDir}/live-slider-dealt.png` });
console.log("[reset] last disc out dealt a new game and locked the bar");

await browser.close();
console.log("slider run complete");
