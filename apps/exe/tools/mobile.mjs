/**
 * Phone harness: touch events, coarse pointer, phone viewport (Chromium
 * emulation, not Safari). Screenshots to apps/exe/shots/mobile-*.png.
 * Usage:  npm run mobile     Env: BASE, CHROME
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
  const PORT = 5198;
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

const browser = await chromium.launch({ executablePath: CHROME, headless: true });
let failed = false;
const fail = (msg) => {
  failed = true;
  console.log("FAIL", msg);
};

const innerW = (page) => page.viewportSize().width;

const center = async (page, sel) =>
  page.evaluate((s) => {
    const r = document.querySelector(s)?.getBoundingClientRect();
    return r ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : null;
  }, sel);

async function phone(viewport, tag) {
  const ctx = await browser.newContext({
    viewport,
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
  });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => fail(`[pageerror ${tag}] ${e.message}`));
  return { ctx, page };
}

/* ---- portrait ---- */
{
  const { ctx, page } = await phone({ width: 393, height: 852 }, "portrait");
  await page.goto(`${BASE}/`);
  await page.waitForTimeout(1500);

  // a single tap launches an icon on a touchscreen
  const boardIcon = await page.evaluate(() => {
    const ic = [...document.querySelectorAll(".icon")].find(
      (i) => i.querySelector(".lbl")?.textContent === "BOARD.EXE",
    );
    const r = ic?.getBoundingClientRect();
    return r ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : null;
  });
  if (!boardIcon) fail("no BOARD.EXE icon on the phone desk");
  await page.touchscreen.tap(boardIcon.x, boardIcon.y);
  try {
    await page.waitForFunction(() => !!document.querySelector("#grid .cell"), null, {
      timeout: 10000,
    });
  } catch {
    fail("tapping BOARD.EXE never opened the board");
  }
  await page.waitForTimeout(500);

  // small-desk fit: a 64px cell must be finger-sized on screen
  const cellPx = await page.evaluate(() => {
    const c = document.querySelector(".cell");
    return c ? c.getBoundingClientRect().width : 0;
  });
  if (cellPx < 38) fail(`portrait cell is ${cellPx.toFixed(1)} device px — too small to tap`);

  // window on the desk, not clamped off an edge
  const onDesk = await page.evaluate(() => {
    const w = [...document.querySelectorAll(".win")].find((el) =>
      el.querySelector(".titlebar .t")?.textContent.includes("BOARD"),
    );
    const r = w.getBoundingClientRect();
    return r.left >= -1 && r.right <= innerWidth + 1;
  });
  if (!onDesk) fail("portrait board window hangs off the desk");

  await page.screenshot({ path: here("../shots/mobile-desktop.png") });
  console.log("shot mobile-desktop");

  const cell = await center(page, '#grid .cellrow:last-child .cell[data-col="2"]');
  await page.touchscreen.tap(cell.x, cell.y);
  try {
    await page.waitForFunction(() => document.querySelectorAll("#grid .disc").length >= 2, null, {
      timeout: 15000,
    });
    console.log("touch move played, opponent answered");
  } catch {
    fail("touch move never landed (or opponent never answered)");
  }
  await page.screenshot({ path: here("../shots/mobile-move.png") });
  console.log("shot mobile-move");

  // drag-aim: press column 0, slide to column 5, release — drops in 5
  const before = await page.evaluate(() => document.querySelectorAll("#grid .disc").length);
  const from = await center(page, '#grid .cellrow:last-child .cell[data-col="0"]');
  const to = await center(page, '#grid .cellrow:last-child .cell[data-col="5"]');
  await page.touchscreen.tap(from.x, from.y).catch(() => {});
  await page.waitForFunction(
    (n) => document.querySelectorAll("#grid .disc").length >= n + 2,
    before,
    { timeout: 15000 },
  );
  // the bot's disc lands before the turn comes back; a drag before then is ignored
  await page.waitForFunction(
    () => document.querySelector("#stYou")?.textContent.startsWith("YOUR MOVE"),
    null,
    { timeout: 15000 },
  );
  const drag = async () => {
    const cdp = await ctx.newCDPSession(page);
    const steps = 8;
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ x: from.x, y: from.y }],
    });
    for (let i = 1; i <= steps; i++)
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [{ x: from.x + ((to.x - from.x) * i) / steps, y: from.y }],
      });
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  };
  const count = await page.evaluate(() => document.querySelectorAll("#grid .disc").length);
  // a beat dialog may have taken focus meanwhile; a touch on an unfocused
  // board only focuses it, so tap its titlebar first the way a thumb would
  const boardBar = await page.evaluate(() => {
    const w = [...document.querySelectorAll(".win")].find((el) =>
      el.querySelector(".titlebar .t")?.textContent.includes("BOARD"),
    );
    const bar = w.querySelector(".titlebar");
    if (bar.classList.contains("active")) return null;
    const r = bar.querySelector(".t").getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  });
  if (boardBar) {
    await page.touchscreen.tap(boardBar.x, boardBar.y);
    await page.waitForTimeout(200);
  }
  await drag();
  try {
    await page.waitForFunction(
      (n) => document.querySelectorAll("#grid .disc").length > n,
      count,
      { timeout: 8000 },
    );
    const droppedCol5 = await page.evaluate(
      () => !!document.querySelector('#grid .cellrow:last-child .cell[data-col="5"] .disc'),
    );
    if (droppedCol5) console.log("drag-aim drop landed in the aimed column");
    else fail("drag-aim dropped, but not in the aimed column");
  } catch {
    fail("drag-aim never dropped");
  }

  const games = await page.evaluate(() => {
    const ic = [...document.querySelectorAll(".icon")].find(
      (i) => i.querySelector(".lbl")?.textContent === "games",
    );
    const r = ic.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  });
  await page.touchscreen.tap(games.x, games.y);
  await page.waitForTimeout(400);
  const folderOpen = await page.evaluate(() => !!document.querySelector(".folderpane"));
  if (!folderOpen) fail("tapping the games icon did not open the folder");
  else console.log("icon tap launches");

  // Start menu sits above the thickened taskbar
  const start = await center(page, "#start");
  await page.touchscreen.tap(start.x, start.y);
  await page.waitForTimeout(300);
  await page.screenshot({ path: here("../shots/mobile-start.png") });
  console.log("shot mobile-start");

  await ctx.close();
}

/* ---- solitaire, portrait: the window fits the desk, a finger can pick a
   card, tap-tap and a drag both move one, the stock deals ---- */
{
  const { ctx, page } = await phone({ width: 393, height: 852 }, "sol");
  await page.goto(`${BASE}/?state=sol&rig=deal`);
  await page.waitForTimeout(1500);

  const fitsDesk = async (tag) => {
    const r = await page.evaluate(() => {
      const w = [...document.querySelectorAll(".win")].find((el) =>
        el.querySelector(".titlebar .t")?.textContent.startsWith("SOL"),
      );
      const b = w.getBoundingClientRect();
      const t = document.querySelector("#taskbar").getBoundingClientRect().top;
      return { left: b.left, right: b.right, top: b.top, bottom: b.bottom, taskbar: t };
    });
    if (r.left < -1 || r.right > innerW(page) + 1 || r.top < -1 || r.bottom > r.taskbar + 1)
      fail(`${tag} SOL.EXE hangs off the desk: ${JSON.stringify(r)}`);
    else console.log(`${tag} SOL.EXE fits the desk`);
  };
  await fitsDesk("portrait");

  const cardPx = await page.evaluate(() => {
    const c = document.querySelector(".tabcol .card");
    const r = c?.getBoundingClientRect();
    return r ? { w: r.width, strip: parseFloat(getComputedStyle(document.querySelector("#stage")).getPropertyValue("--cw")) } : null;
  });
  if (!cardPx || cardPx.w < 40) fail(`portrait card is ${cardPx?.w.toFixed(1)} device px wide — too small to pick`);
  else console.log(`portrait card is ${cardPx.w.toFixed(0)} device px wide`);

  /** A legal single-card tableau move [fromTag, toCol] read off the DOM, or null. */
  const legalMove = () =>
    page.evaluate(() => {
      const cols = [...document.querySelectorAll(".tabcol")];
      const parse = (s) => ({ rank: parseInt(s), red: /[hd]$/.test(s) });
      const tops = cols.map((col) => {
        const cards = [...col.querySelectorAll("[data-card]")];
        return cards.length ? cards[cards.length - 1] : null;
      });
      for (let i = 0; i < 7; i++) {
        const c = tops[i];
        if (!c) continue;
        const cv = parse(c.dataset.card);
        for (let j = 0; j < 7; j++) {
          if (j === i) continue;
          const t = tops[j];
          if (!t) {
            if (cv.rank === 13 && cols[j].classList.contains("empty") && cols[i].querySelectorAll(".card").length > 1)
              return { card: c.dataset.card, from: c.dataset.drag, to: j, viaCard: null };
            continue;
          }
          const tv = parse(t.dataset.card);
          if (tv.rank === cv.rank + 1 && tv.red !== cv.red)
            return { card: c.dataset.card, from: c.dataset.drag, to: j, viaCard: t.dataset.card };
        }
      }
      return null;
    });
  const cardCenter = (card) => center(page, `.tabcol [data-card="${card}"]`);
  const colCenter = async (j, viaCard) =>
    viaCard ? cardCenter(viaCard) : center(page, `.tabcol[data-pile="t${j}"]`);
  const landed = (card, j) =>
    page.evaluate(
      ([c, j]) => !!document.querySelector(`.tabcol[data-pile="t${j}"] [data-card="${c}"]`),
      [card, j],
    );

  // tap-tap: the run wears the dither, then goes where the second tap says
  let mv = await legalMove();
  if (!mv) fail("the fixed deal offers no tableau move to tap (rig changed?)");
  else {
    const a = await cardCenter(mv.card);
    await page.touchscreen.tap(a.x, a.y);
    await page.waitForTimeout(150);
    const sel = await page.evaluate(() => document.querySelectorAll(".card.sel").length);
    if (!sel) fail("tapping a face-up card did not select it");
    const b = await colCenter(mv.to, mv.viaCard);
    await page.touchscreen.tap(b.x, b.y);
    await page.waitForTimeout(200);
    if (await landed(mv.card, mv.to)) console.log(`tap-tap moved ${mv.card} to column ${mv.to}`);
    else fail(`tap-tap: ${mv.card} did not land on column ${mv.to}`);
  }

  // Game > Undo by finger puts it back (the menu is the only undo a phone has)
  const menuTap = async (label, item) => {
    const m = await page.evaluate((l) => {
      // BOARD.EXE has a Game menu too; only SOL.EXE's counts
      const win = [...document.querySelectorAll(".win")].find((el) =>
        el.querySelector(".titlebar .t")?.textContent.startsWith("SOL"),
      );
      const span = [...win.querySelectorAll(".menu span")].find((s) => s.textContent === l);
      const r = span?.getBoundingClientRect();
      return r ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : null;
    }, label);
    await page.touchscreen.tap(m.x, m.y);
    await page.waitForTimeout(150);
    const it = await page.evaluate((l) => {
      const d = [...document.querySelectorAll(".popup div")].find(
        (d) => d.firstChild?.textContent === l && d.offsetParent,
      );
      const r = d?.getBoundingClientRect();
      return r ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : null;
    }, item);
    if (!it) return false;
    await page.touchscreen.tap(it.x, it.y);
    await page.waitForTimeout(150);
    return true;
  };
  const undone = mv && (await menuTap("Game", "Undo"));
  if (mv && (!undone || (await landed(mv.card, mv.to))))
    fail("Game > Undo by touch did not put the card back");
  else if (mv) console.log("Game > Undo by touch put the card back");

  // drag: finger down on the card, slide to the column, lift
  mv = await legalMove();
  if (!mv) fail("no tableau move to drag after the undo");
  else {
    const a = await cardCenter(mv.card);
    const b = await colCenter(mv.to, mv.viaCard);
    const cdp = await ctx.newCDPSession(page);
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: a.x, y: a.y }] });
    const steps = 10;
    for (let i = 1; i <= steps; i++)
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [{ x: a.x + ((b.x - a.x) * i) / steps, y: a.y + ((b.y - a.y) * i) / steps }],
      });
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await page.waitForTimeout(200);
    if (await landed(mv.card, mv.to)) console.log(`drag moved ${mv.card} to column ${mv.to}`);
    else fail(`drag: ${mv.card} did not land on column ${mv.to}`);
  }

  // the stock deals on a tap
  const stock = await center(page, '.slot[data-pile="stock"]');
  await page.touchscreen.tap(stock.x, stock.y);
  await page.waitForTimeout(200);
  const waste = await page.evaluate(() => !!document.querySelector('.slot[data-pile="waste"] .card'));
  if (!waste) fail("tapping the stock dealt nothing to the waste");
  else console.log("stock deals on a tap");

  // a tap on the table (below the cards, nothing chosen) turns the deck too
  const wasteTop = () =>
    page.evaluate(() => document.querySelector('.slot[data-pile="waste"] [data-card]')?.dataset.card);
  const was = await wasteTop();
  const table = await page.evaluate(() => {
    const f = document.querySelector(".felt").getBoundingClientRect();
    return { x: f.left + f.width / 2, y: f.bottom - 40 };
  });
  await page.touchscreen.tap(table.x, table.y);
  await page.waitForTimeout(500);
  const turned = await wasteTop();
  if (turned === was) fail("a tap on the table did not turn the deck");
  else console.log("a tap on the table turns the deck");

  // a swipe left on the table takes it back
  {
    const cdp = await ctx.newCDPSession(page);
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: table.x + 80, y: table.y }] });
    for (let i = 1; i <= 6; i++)
      await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: table.x + 80 - i * 20, y: table.y }] });
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await page.waitForTimeout(400);
    if ((await wasteTop()) !== was) fail("a swipe left on the table did not undo the turn");
    else console.log("a swipe left on the table undoes");
  }

  await page.screenshot({ path: here("../shots/mobile-sol.png") });
  console.log("shot mobile-sol");

  // decided: stock spent, everything face up — one card home and the machine plays the rest
  await page.goto(`${BASE}/?state=sol&rig=decided`);
  await page.waitForTimeout(1200);
  // two taps on the table send the first card that can leave
  const tbl = await page.evaluate(() => {
    const f = document.querySelector(".felt").getBoundingClientRect();
    return { x: f.left + f.width / 2, y: f.bottom - 40 };
  });
  await page.touchscreen.tap(tbl.x, tbl.y);
  await page.waitForTimeout(100);
  await page.touchscreen.tap(tbl.x, tbl.y);
  try {
    await page.waitForFunction(
      () => [...document.querySelectorAll(".titlebar .t")].some((t) => t.textContent === "SOL.EXE") &&
        !document.querySelector(".tabcol [data-card]") && !!document.querySelector(".solbounce"),
      null,
      { timeout: 8000 },
    );
    console.log("decided game finished itself");
  } catch {
    fail("decided game did not finish itself");
  }
  await page.screenshot({ path: here("../shots/mobile-sol-finished.png") });
  console.log("shot mobile-sol-finished");
  await ctx.close();

  // landscape: same deal, the whole table on screen
  const land = await phone({ width: 852, height: 393 }, "sol-landscape");
  await land.page.goto(`${BASE}/?state=sol&rig=deal`);
  await land.page.waitForTimeout(1500);
  {
    const r = await land.page.evaluate(() => {
      const w = [...document.querySelectorAll(".win")].find((el) =>
        el.querySelector(".titlebar .t")?.textContent.startsWith("SOL"),
      );
      const b = w.getBoundingClientRect();
      return { bottom: b.bottom, taskbar: document.querySelector("#taskbar").getBoundingClientRect().top };
    });
    if (r.bottom > r.taskbar + 1) fail(`landscape SOL.EXE runs under the taskbar: ${JSON.stringify(r)}`);
    else console.log("landscape SOL.EXE fits the desk");
  }
  await land.page.screenshot({ path: here("../shots/mobile-sol-landscape.png") });
  console.log("shot mobile-sol-landscape");
  await land.ctx.close();
}

/* ---- snake: a tap on either half turns it; it goes around every edge ---- */
{
  const { ctx, page } = await phone({ width: 393, height: 852 }, "snake");
  await page.goto(`${BASE}/?state=snake`);
  await page.waitForTimeout(1200);
  const field = await page.evaluate(() => {
    const r = document.querySelector(".snakefield").getBoundingClientRect();
    return { l: r.left + r.width * 0.25, r: r.left + r.width * 0.75, y: r.top + r.height / 2 };
  });
  const status = () => page.evaluate(() => document.querySelector("#snakeStatus")?.textContent ?? "");
  await page.touchscreen.tap(field.r, field.y);
  await page.waitForTimeout(300);
  if (!(await status()).startsWith("LENGTH")) fail("a tap did not start the snake");
  else console.log("a tap starts the snake");
  // steer it around for a while: left, left (a U-turn), right, right — and it
  // crosses an edge or two on the way; only itself can stop it
  for (const side of ["l", "l", "r", "r", "l", "r"]) {
    await page.touchscreen.tap(field[side], field.y);
    await page.waitForTimeout(450);
  }
  await page.waitForTimeout(1500);
  const dialogs = await page.evaluate(
    () => [...document.querySelectorAll(".win")].filter((w) => w.querySelector(".dlg-body")).length,
  );
  if (dialogs) fail("the snake died steering around by taps");
  else console.log("taps turn the snake; it is still going");
  await page.screenshot({ path: here("../shots/mobile-snake.png") });
  console.log("shot mobile-snake");
  await ctx.close();
}

/* ---- landscape: big variants ---- */
{
  const { ctx, page } = await phone({ width: 852, height: 393 }, "landscape");
  await page.goto(`${BASE}/?state=midgame&variant=connect5`);
  await page.waitForTimeout(1500);
  const cellPx = await page.evaluate(() => {
    const c = document.querySelector(".cell");
    return c ? c.getBoundingClientRect().width : 0;
  });
  if (cellPx < 30) fail(`landscape c5 cell is ${cellPx.toFixed(1)} device px`);
  await page.screenshot({ path: here("../shots/mobile-landscape-c5.png") });
  console.log("shot mobile-landscape-c5");
  await ctx.close();
}

await browser.close();
server?.kill();
console.log(failed ? "MOBILE HARNESS: FAILURES ABOVE" : "mobile harness: all good");
process.exit(failed ? 1 : 0);
