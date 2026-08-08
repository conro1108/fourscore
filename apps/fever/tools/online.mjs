/**
 * Two browsers play each other, through the real chrome and the real database.
 *
 * This is phase 8's accept criterion and the only thing that can prove it: the
 * online path is a socket, an RLS policy and two clients agreeing about a list
 * of numbers, and not one of those is visible to a unit test or a screenshot.
 * So this hosts in one browser context, joins from another *through the invite
 * link*, plays a full game alternating sides, and then asserts the two move
 * lists — and the two outcomes — are identical.
 *
 * Two contexts rather than two browsers because a context is its own
 * localStorage, which is its own anonymous user. One browser with one context
 * would have both players signed in as the same person, and the database would
 * correctly refuse to let them play each other.
 *
 * Usage:  npm run dev  (in apps/fever), then  npm run online
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

async function open(label) {
  const context = await browser.newContext({ viewport: { width: 1100, height: 760 } });
  const page = await context.newPage();
  page.on("pageerror", (e) => console.log(`[${label}: pageerror]`, e.message));
  page.on("console", (m) => {
    if (m.type() === "error") console.log(`[${label}: console.error]`, m.text());
  });
  return page;
}

const matchState = (page) =>
  page.evaluate(() => {
    const s = window.__fever.matchStore.getState();
    return {
      mode: s.mode,
      live: s.live,
      moves: s.moves,
      landed: s.landed,
      status: s.match.status,
      turn: s.match.turn,
      winner: s.match.winner,
      me: s.humanFirst ? "red" : "yellow",
      variantId: s.variant.id,
      botId: s.botId,
    };
  });

/** Wait until this page's player is on move and everything has settled. */
const myTurn = (page) =>
  page.waitForFunction(
    () => {
      const s = window.__fever.matchStore.getState();
      return (
        s.match.status !== "playing" ||
        (s.match.turn === (s.humanFirst ? "red" : "yellow") && s.landed === s.moves.length)
      );
    },
    undefined,
    { timeout: 30000 },
  );

// -- host -------------------------------------------------------------------

const host = await open("host");
await host.goto(BASE);
await host.waitForFunction(() => window.__fever !== undefined);
await host.waitForSelector("canvas");

await host.click('button:has-text("Play a person")');
await host.waitForFunction(() => window.__fever.onlineStore.getState().me !== null, undefined, {
  timeout: 20000,
});
await host.click('button:has-text("Host a game")');
await host.waitForFunction(() => window.__fever.onlineStore.getState().row !== null, undefined, {
  timeout: 20000,
});
const code = await host.evaluate(() => window.__fever.onlineStore.getState().row.join_code);
if (!/^[A-Z0-9]{4}$/.test(code ?? "")) throw new Error(`bad join code: ${code}`);
console.log(`[host] hosting, code ${code}`);
await host.waitForTimeout(500);
await host.screenshot({ path: `${outDir}/online-waiting.png` });

// -- guest, through the invite link -----------------------------------------

const guest = await open("guest");
await guest.goto(`${BASE}/?join=${code}`);
await guest.waitForFunction(() => window.__fever !== undefined);
await guest.waitForSelector("canvas");

for (const [label, page] of [
  ["host", host],
  ["guest", guest],
]) {
  await page.waitForFunction(
    () => {
      const s = window.__fever.matchStore.getState();
      return s.mode === "online" && s.live;
    },
    undefined,
    { timeout: 25000 },
  );
  const s = await matchState(page);
  console.log(`[${label}] in a wire match as ${s.me}, opponent looks like ${s.botId}`);
}

const seats = [(await matchState(host)).me, (await matchState(guest)).me];
if (seats[0] === seats[1]) throw new Error(`both players got the same colour: ${seats}`);
if (await guest.evaluate(() => location.search)) throw new Error("the join code stayed in the URL");

// -- a whole game -----------------------------------------------------------

let clicked = false;
for (let guard = 0; guard < 200; guard++) {
  // Only the side to move is waited on: the other one is *correctly* stuck,
  // watching. That asymmetry is the whole difference from the bot acceptance
  // run, and getting it wrong hangs on a game that is working perfectly.
  const s = await matchState(host);
  if (s.status !== "playing") {
    console.log(
      `[game] over after ${s.moves.length} plies: ${
        s.status === "draw" ? "draw" : `${s.winner} wins`
      } | moves: ${s.moves.join(",")}`,
    );
    break;
  }
  const onMove = s.turn === s.me ? host : guest;
  const label = onMove === host ? "host" : "guest";
  await myTurn(onMove);

  if (!clicked && onMove === host) {
    // One move through an actual canvas click, so the raycast path is proved
    // online as well as against a bot.
    await onMove.mouse.click(550, 400);
    await onMove.waitForFunction(
      (n) => window.__fever.matchStore.getState().moves.length > n,
      s.moves.length,
      { timeout: 5000 },
    );
    console.log(`[${label}] canvas click landed`);
    clicked = true;
  } else {
    await onMove.evaluate(() => {
      const t = window.__fever.matchStore.getState();
      const col = [...t.variant.moveOrder].find((c) => t.match.canPlay(c));
      t.playColumn(col);
    });
  }

  // The other machine has to see it, and it has to arrive as a drop rather
  // than as a board that changed while nobody was looking.
  const other = onMove === host ? guest : host;
  await other.waitForFunction(
    (n) => window.__fever.matchStore.getState().moves.length > n,
    s.moves.length,
    { timeout: 20000 },
  );
  if (!clicked) clicked = false;
}

const a = await matchState(host);
const b = await matchState(guest);
if (a.moves.join() !== b.moves.join())
  throw new Error(`move lists diverged:\n  host  ${a.moves}\n  guest ${b.moves}`);
if (a.status === "playing") throw new Error("the game never finished");
if (a.status !== b.status || a.winner !== b.winner)
  throw new Error(`outcomes disagree: ${a.status}/${a.winner} vs ${b.status}/${b.winner}`);
console.log(`[game] both clients agree: ${a.moves.length} plies, ${a.status}, ${a.winner ?? "—"}`);

// Nothing may have gone wrong on either machine.
for (const [label, page] of [
  ["host", host],
  ["guest", guest],
]) {
  const dialog = await page.evaluate(() => window.__fever.shellStore.getState().dialog);
  if (dialog?.kind === "error") throw new Error(`[${label}] error dialog: ${dialog.detail}`);
}

await host.waitForTimeout(1200);
await host.screenshot({ path: `${outDir}/online-host-end.png` });
await guest.screenshot({ path: `${outDir}/online-guest-end.png` });

// The row is bookkeeping, but it is bookkeeping somebody has to do: whoever
// noticed first writes the result. Asked of the database rather than of the
// store, because a client that missed the UPDATE it didn't send is fine — the
// finished board is what either of them actually renders.
const matchId = await host.evaluate(() => window.__fever.onlineStore.getState().row.id);
await host.waitForFunction(
  async (id) => {
    const { data } = await window.__fever.supabase
      .from("matches")
      .select("status,winner")
      .eq("id", id)
      .single();
    return data?.status === "finished";
  },
  matchId,
  { timeout: 15000, polling: 1000 },
);
console.log("[db] the match row was closed out");

await browser.close();
console.log("online run complete");
