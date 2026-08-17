/**
 * Live-drive the filesystem through a real browser: cd/ls/cat/run and
 * mkdir/rmdir in the terminal, a program file launching by name, the drive
 * window walking into DOCS, the picker saving across directories, and a
 * desk drag that moves a file on disk. `npm run files` is the hand.
 */
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import { spawn } from "node:child_process";

const CHROME =
  process.env.CHROME ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const SHOTS = here("../shots");
let failures = 0;
const fail = (m) => {
  console.log("FAIL:", m);
  failures++;
};

const PORT = 5199;
const server = spawn("npx", ["vite", "--port", String(PORT), "--strictPort"], {
  cwd: here(".."),
  stdio: ["ignore", "pipe", "inherit"],
});
const BASE = `http://localhost:${PORT}`;
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

const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.on("pageerror", (e) => fail(`pageerror: ${e.message}`));

await page.goto(`${BASE}/`);
await page.waitForTimeout(1200);

/* ---- terminal: cd, ls, cat across dirs, run, program launch ---- */
await page.locator("#stage > .icon", { hasText: "COMMAND.COM" }).dblclick();
await page.waitForTimeout(400);
const type = async (cmd) => {
  await page.locator(".termin").fill(cmd);
  await page.keyboard.press("Enter");
  await page.waitForTimeout(250);
};
const termText = () => page.locator(".termwell").innerText();

await type("ls");
let out = await termText();
if (!/DESKTOP\//.test(out)) fail("ls at root shows no DESKTOP/");
if (!/PAINT\.EXE/.test(out)) fail("ls at root shows no PAINT.EXE");

await type("cd docs");
if (!(await page.locator(".termprompt").last().textContent())?.includes("docs %"))
  fail("prompt did not follow cd docs");
await type("cat asm.txt");
out = await termText();
if (!out.includes("REGISTERS")) fail("cat asm.txt in docs printed nothing");

await type("cd ..");
await type("cd /src");
await type("run hello.asm");
await page.waitForTimeout(600);
out = await termText();
if (!out.includes("HELLO FROM THE DISK.")) fail("run hello.asm did not say hello");

await type("cat /desktop/BOARD.EXE");
out = await termText();
if (!out.includes("MZ board")) fail("cat on a program did not print its MZ line");

await type("MINES");
await page.waitForTimeout(600);
if (!(await page.locator(".win", { hasText: "MINES.EXE" }).count()))
  fail("typing MINES did not launch MINES.EXE");

await type("mkdir stuff");
await type("cd stuff");
await type("cd ..");
await type("rmdir stuff");
await type("ls");
out = await termText();
if (/stuff\//i.test(out.split("rmdir")[1] ?? "")) fail("rmdir left stuff behind");
await page.screenshot({ path: `${SHOTS}/files-terminal.png` });

/* ---- the drive window: root browser opens, DOCS opens from it ---- */
await page.goto(`${BASE}/`); // a clean desk, so no window covers the icons
await page.waitForTimeout(800);
await page.locator("#stage > .icon", { hasText: "(C:)" }).dblclick();
await page.waitForTimeout(400);
const driveWin = page.locator(".win", { hasText: "(C:)" });
if (!(await driveWin.count())) fail("no drive window");
await driveWin.locator(".fic", { hasText: "DOCS" }).dblclick();
await page.waitForTimeout(400);
if (!(await page.locator(".win .fic", { hasText: "help.txt" }).count()))
  fail("DOCS window shows no help.txt");
await page.screenshot({ path: `${SHOTS}/files-browser.png` });

/* ---- desk double-click launches a program file ---- */
await page.goto(`${BASE}/`);
await page.waitForTimeout(800);
await page.locator("#stage > .icon", { hasText: "BOARD.EXE" }).dblclick();
await page.waitForTimeout(600);
if (!(await page.locator(".win", { hasText: "BOARD.EXE — Connect 4" }).count()))
  fail("desk BOARD.EXE did not boot the board");

/* ---- moves.txt on the desk opens the pad, and the pad wrote the file ---- */
await page.locator("#stage > .icon", { hasText: "moves.txt" }).dblclick();
await page.waitForTimeout(300);
if (!(await page.locator(".win", { hasText: "moves.txt — Notepad" }).count()))
  fail("moves.txt icon did not open the pad");

/* ---- notepad picker: save into DOCS by navigating ---- */
await page.goto(`${BASE}/`);
await page.waitForTimeout(800);
await page.locator("#stage > .icon", { hasText: "readme.txt" }).dblclick();
await page.waitForTimeout(400);
const edWin = page.locator(".win", { hasText: "readme.txt — Notepad" });
if (!(await edWin.count())) fail("readme.txt did not open in Notepad");
await edWin.locator(".menu span", { hasText: "File" }).click();
await page.locator(".popup div", { hasText: "Save As" }).click();
await page.waitForTimeout(300);
const pick = page.locator(".win", { hasText: "Save As" });
if (!(await pick.locator("div", { hasText: "C:\\DESKTOP" }).count()))
  fail("picker did not open in C:\\DESKTOP");
await pick.locator(".lrow", { hasText: "[..]" }).click();
await page.waitForTimeout(200);
await pick.locator(".lrow", { hasText: "[DOCS]" }).click();
await page.waitForTimeout(200);
await page.locator(".pickin").fill("copy.txt");
await page.locator(".btn", { hasText: "OK" }).first().click();
await page.waitForTimeout(400);
const saved = await page.evaluate(() => {
  const files = JSON.parse(localStorage.getItem("exe.fs") ?? "{}").files ?? [];
  return files.some((f) => f.name.toLowerCase() === "docs\\copy.txt");
});
if (!saved) fail("Save As into DOCS did not land in DOCS");
await page.locator(".btn", { hasText: "OK" }).first().click().catch(() => {});
await page.screenshot({ path: `${SHOTS}/files-picker.png` });

/* ---- drag a desk file into a folder: rocket.spr into games ---- */
await page.goto(`${BASE}/`);
await page.waitForTimeout(800);
const rocket = await page.locator("#stage > .icon", { hasText: "rocket.spr" }).boundingBox();
const games = await page.locator("#stage > .icon", { hasText: "games" }).boundingBox();
await page.mouse.move(rocket.x + 20, rocket.y + 20);
await page.mouse.down();
await page.mouse.move(games.x + 20, games.y + 20, { steps: 8 });
await page.mouse.up();
await page.waitForTimeout(400);
const moved = await page.evaluate(() => {
  const files = JSON.parse(localStorage.getItem("exe.fs") ?? "{}").files ?? [];
  return files.some((f) => f.name.toLowerCase() === "desktop\\games\\rocket.spr");
});
if (!moved) fail("dragging rocket.spr onto games did not move it on disk");
if (await page.locator("#stage > .icon", { hasText: "rocket.spr" }).count())
  fail("rocket.spr icon still on the desk after the move");
await page.screenshot({ path: `${SHOTS}/files-drag.png` });

console.log(failures ? `filesystem drive FAILED (${failures})` : "filesystem drive ok");
await browser.close();
server.kill();
process.exit(failures ? 1 : 0);
