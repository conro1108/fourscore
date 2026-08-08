/**
 * Live check for phase 5: does the *real* app put you in the opponent's void
 * and play the opponent's clip?
 *
 * The preview harness pins both directly, so it proves the shader and the acts
 * and nothing about the wiring between them — `runtime.ts` reading the match
 * store, the Director carrying `bot` on the frame, the scope handing it to the
 * backdrop, and `pickGag` weighting the signature. All four of those are only
 * exercised by a running game, and all four typecheck fine when broken.
 *
 * Walks the roster through the app's own list box, fires each opponent's own
 * event down the real bus, and screenshots. Usage: npm run dev, then
 *   node tools/live-bots.mjs
 */
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

const BASE = process.env.BASE ?? "http://localhost:5173";
const CHROME =
  process.env.CHROME ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const outDir = fileURLToPath(new URL("../shots", import.meta.url));
mkdirSync(outDir, { recursive: true });

/** The event each opponent's signature answers, as the debug panel would fire it. */
const EVENTS = {
  acorn: { kind: "idle-beat" },
  pebble: { kind: "threat", player: "red" },
  moss: { kind: "idle-beat" },
  bramble: { kind: "threat", player: "red" },
  cinder: { kind: "move", player: "red", col: 3, quality: "dubious" },
  vane: { kind: "tension-shift", direction: "rising" },
  quill: { kind: "threat", player: "red" },
  oracle: { kind: "idle-beat" },
};

/** What each opponent's clip is called, so a draw can be checked for it. */
const SIGNATURES = {
  acorn: "bumpers-up",
  pebble: "slab-drop",
  moss: "mower-crawl",
  bramble: "pin-scatter",
  cinder: "shell-game",
  vane: "score-lie",
  quill: "lane-solve",
  oracle: "pinsetter",
};

const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const page = await browser.newPage({ viewport: { width: 1100, height: 760 } });
page.on("pageerror", (e) => console.log("[pageerror]", e.message));
await page.goto(BASE);
await page.waitForTimeout(1200);

// Into the roster through the app's own button, not through the store.
await page.getByRole("button", { name: "Opponent" }).click();
await page.waitForTimeout(400);

let failures = 0;
for (const [id, event] of Object.entries(EVENTS)) {
  await page.evaluate((botId) => {
    const item = [...document.querySelectorAll(".roster-item")].find(
      (el) => el.querySelector("b")?.textContent?.toLowerCase().replace("the ", "") === botId,
    );
    item?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  }, id);
  await page.waitForTimeout(400);

  // Into a real match. The menu runs two acts at once with no quiet gap, so a
  // fired event there usually finds every berth busy — and the match is the
  // case that has to work anyway.
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await page.waitForTimeout(700);
  // ...and then hold the game still. A live match fires its own move and
  // threat events every couple of seconds, those take the stage, and the fired
  // event gets dropped — the first version of this check read as a 2/8 failure
  // that was entirely the bot playing. `setLive(false)` stops the turn loop
  // without leaving the match screen, so the stage mode is still the real one.
  await page.evaluate(() => window.__fever.matchStore.getState().setLive(false));
  await page.waitForTimeout(300);

  // Did the opponent actually reach the Director's frame?
  const onFrame = await page.evaluate(
    () => window.__fever?.directorStore.getState().frame.bot ?? null,
  );

  // Fire their event down the real bus, several times, and see what the stage
  // chose. The signature is weighted, not exclusive — that is the design — so
  // one draw proves nothing and a handful proves the wiring.
  const drawn = new Set();
  for (let i = 0; i < 14; i++) {
    // Clear before firing, so what comes back is *this* draw and not the act
    // still on stage from the last opponent. (It read as two random failures
    // per run until this line existed, which is a good argument for the
    // signal being a reset-and-read rather than a running total.)
    await page.evaluate((e) => {
      window.__fever.stageFx.lastAct = "";
      window.__fever.directorStore.getState().fire(e);
    }, event);
    await page.waitForTimeout(300);
    const act = await page.evaluate(() => window.__fever.stageFx.lastAct);
    if (act) drawn.add(act);
    // Past the act and the stage's quiet gap, so the next fire isn't dropped.
    await page.waitForTimeout(2600);
  }
  await page.evaluate((e) => window.__fever.directorStore.getState().fire(e), event);
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${outDir}/live-bot-${id}.png` });

  const signature = SIGNATURES[id];
  const ok = onFrame === id && drawn.has(signature);
  if (!ok) failures++;
  console.log(
    `${ok ? "ok  " : "FAIL"} ${id.padEnd(8)} frame.bot=${onFrame}  drew: ${[...drawn].join(", ")}`,
  );

  // Back to the roster for the next one, through the stores rather than
  // through the quit dialog: leaving a game in progress is phase 6's flow and
  // the acceptance run already walks it.
  await page.evaluate(() => {
    window.__fever.matchStore.getState().newGame({ live: false });
    window.__fever.shellStore.getState().go("roster");
  });
  await page.waitForTimeout(500);
}

await browser.close();
if (failures) {
  console.error(`\n${failures} opponent(s) never reached the Director's frame`);
  process.exit(1);
}
console.log("\nevery opponent reached the frame; clips shot to shots/live-bot-*.png");
