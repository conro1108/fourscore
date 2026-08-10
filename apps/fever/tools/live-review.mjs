/**
 * The review, in the real app, at the end of a real game.
 *
 * What no unit test and no preview state can see: whether the button on the
 * outcome window actually reaches the analysis worker, whether the worker comes
 * back in seconds rather than never, and whether selecting a move in the list
 * winds the board behind the window back to that position. The preview harness
 * renders a frozen review; this plays a game and asks for one.
 *
 * Usage:  npm run dev  (in apps/fever), then  npm run review
 * Env:    BASE, CHROME — same as tools/shots.mjs.
 */
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

const BASE = process.env.BASE ?? "http://localhost:5173";
const exe = process.env.CHROME ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const outDir = fileURLToPath(new URL("../shots", import.meta.url));
mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({ executablePath: exe, headless: true });
const page = await browser.newPage({ viewport: { width: 1100, height: 760 } });
page.on("pageerror", (e) => console.log("[pageerror]", e.message));
page.on("console", (m) => {
  if (m.type() === "error") console.log("[console.error]", m.text());
});

const fail = (msg) => {
  console.error("FAIL:", msg);
  process.exitCode = 1;
};

await page.goto(BASE);
await page.waitForFunction(() => window.__fever !== undefined);
await page.waitForSelector("canvas");

// Enter through the menu, as a player does.
await page.getByRole("button", { name: "Start", exact: true }).click();

const myTurn = () =>
  page.waitForFunction(
    () => {
      const s = window.__fever.matchStore.getState();
      return (
        s.match.status !== "playing" ||
        (s.match.turn === (s.humanFirst ? "red" : "yellow") &&
          s.landed === s.moves.length &&
          !s.thinking)
      );
    },
    undefined,
    { timeout: 40000 },
  );

// Play it out. Column choice doesn't matter — what matters is that the game
// ends and that the review has something to be wrong about.
for (let guard = 0; guard < 200; guard++) {
  await myTurn();
  const done = await page.evaluate(() => {
    const s = window.__fever.matchStore.getState();
    if (s.match.status !== "playing") return { over: true, plies: s.moves.length };
    const col = [...s.variant.moveOrder].find((c) => s.match.canPlay(c));
    s.playColumn(col);
    return { over: false };
  });
  if (done.over) {
    console.log(`game over after ${done.plies} plies`);
    break;
  }
}

// The outcome window, and the button that is this phase's whole entry point.
await page.waitForSelector('[aria-label="game over"]', { timeout: 10000 });
const t0 = Date.now();
await page.getByRole("button", { name: "READ IT BACK." }).click();
await page.waitForSelector('[aria-label="game review"]');
await page.screenshot({ path: `${outDir}/live-review-reading.png` });

await page.waitForFunction(
  () => window.__fever.reviewStore.getState().status === "ready",
  undefined,
  { timeout: 60000 },
);
console.log(`review came back in ${((Date.now() - t0) / 1000).toFixed(1)}s`);

const summary = await page.evaluate(() => {
  const r = window.__fever.reviewStore.getState();
  const m = window.__fever.matchStore.getState();
  return {
    generation: r.generation,
    matchGeneration: m.generation,
    plies: r.review.plies.length,
    proven: r.review.plies.filter((p) => p.source === "proven").length,
    skipped: r.review.skipped,
    curve: r.review.curve.length,
    turningPoint: r.review.turningPoint?.ply ?? null,
    selected: r.selected,
    moves: m.moves.length,
  };
});
console.log(summary);

if (summary.generation !== summary.matchGeneration) fail("the review is about a different game");
if (summary.plies === 0) fail("the review graded nothing");
if (summary.curve !== summary.moves + 1) fail("the curve does not cover the whole game");
// The one product truth a live run can check: a turning point is a proven
// claim, so it can only ever come from a proven ply.
const claimOk = await page.evaluate(() => {
  const r = window.__fever.reviewStore.getState().review;
  return r.plies.every((p) => !p.turningPoint || p.source === "proven");
});
if (!claimOk) fail("an estimated ply claimed a turning point");

await page.screenshot({ path: `${outDir}/live-review.png` });

// Selecting a move has to wind the board back to it. This is the seam between
// the window and the stage, and it is invisible to every other check.
const scrub = await page.evaluate(async () => {
  const r = window.__fever.reviewStore.getState();
  const target = r.review.plies[Math.floor(r.review.plies.length / 2)];
  r.select(target.ply);
  await new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res)));
  return { ply: target.ply, col: target.col, best: target.bestCols };
});
await page.waitForTimeout(400);
await page.screenshot({ path: `${outDir}/live-review-scrub.png` });
console.log("scrubbed to", scrub);

// Arrow keys walk the game. Through your own moves, clamped at both ends —
// the board is what is being scrubbed, so stepping off the end and wrapping to
// the opening would be twenty discs of surprise.
const plies = await page.evaluate(() =>
  window.__fever.reviewStore.getState().review.plies.map((p) => p.ply),
);
const selection = () => page.evaluate(() => window.__fever.reviewStore.getState().selected);
const at = plies.indexOf(scrub.ply);

await page.keyboard.press("ArrowRight");
if ((await selection()) !== plies[at + 1]) fail("right arrow did not step forward a move");
await page.keyboard.press("ArrowLeft");
await page.keyboard.press("ArrowLeft");
if ((await selection()) !== plies[at - 1]) fail("left arrow did not step back a move");

// The far end, and one past it.
for (let i = 0; i < plies.length + 2; i++) await page.keyboard.press("ArrowRight");
if ((await selection()) !== plies[plies.length - 1]) fail("right arrow ran off the end of the game");
for (let i = 0; i < plies.length + 2; i++) await page.keyboard.press("ArrowLeft");
if ((await selection()) !== plies[0]) fail("left arrow ran off the start of the game");
console.log("arrows step and clamp across", plies.length, "moves");

// The board follows the keys, not just the store.
const landed = await page.evaluate(() => window.__fever.matchStore.getState().moves.length);
await page.waitForTimeout(300);
await page.screenshot({ path: `${outDir}/live-review-first.png` });
if (landed === 0) fail("the move list emptied");

// And releasing it puts the finished game back.
await page.evaluate(() => window.__fever.reviewStore.getState().select(null));
await page.waitForTimeout(300);

// Starting another game throws the review away rather than leaving a verdict
// about a board nobody is looking at.
await page.getByRole("button", { name: "AGAIN." }).click();
await page.waitForTimeout(400);
const after = await page.evaluate(() => ({
  status: window.__fever.reviewStore.getState().status,
  dialog: window.__fever.shellStore.getState().dialog,
  moves: window.__fever.matchStore.getState().moves.length,
}));
if (after.status !== "idle" || after.dialog !== null) fail(`review survived a new game: ${JSON.stringify(after)}`);
console.log("after AGAIN:", after);

await browser.close();
console.log(process.exitCode ? "review check FAILED" : "review check passed");
