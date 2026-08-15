/**
 * The audio equivalent of `npm run shots`: renders every recipe in a real
 * browser, writes each one out as a wav, and prints what it measured.
 *
 * Sound can't be screenshotted and it can't be unit tested — a recipe that
 * schedules its oscillators after `startRendering` is silence that typechecks,
 * and an envelope with a typo is a click that passes every test in the repo.
 * So this listens for the two things a machine can hear (is it there, and how
 * loud) and hands the rest to Connor's ears as files.
 *
 * It also checks the laws from the outside, the way a player meets them: no
 * AudioContext may exist before the first gesture, one must exist and be
 * running after it, a suspended context has to come back, and the tray speaker
 * has to actually mute the machine.
 *
 * Usage:  npm run audio          (spawns its own dev server, like shots)
 * Env:    BASE    reuse a running dev server instead of spawning one
 *         CHROME  path to a Chrome binary
 * Output: apps/exe/shots/audio/ (gitignored), including all.wav — everything
 * in the printed order, half a second apart, because nobody opens 23 files.
 */
import { chromium } from "playwright-core";
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const CHROME =
  process.env.CHROME ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const outDir = here("../shots/audio");
mkdirSync(outDir, { recursive: true });

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
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
// A thrown exception fails the run; a console error is printed and doesn't.
// The desktop has no favicon, and a run that fails on the browser asking for
// one is a harness that cries wolf about the thing it can't hear.
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => m.type() === "error" && console.log("[console]", m.text()));

// A handle on the real context, so the check below can suspend it behind the
// desktop's back the way a backgrounded tab does. Nothing else may touch
// `__ctx`: the point of these checks is that they only use what a player or
// the OS uses.
await page.addInitScript(() => {
  const Real = window.AudioContext;
  window.AudioContext = class extends Real {
    constructor(...args) {
      super(...args);
      window.__ctx = this;
    }
  };
});

// The volume is remembered, and a previous run leaving it muted would fail
// every check below for the wrong reason.
await page.addInitScript(() => localStorage.removeItem("exe.audio"));

await page.goto(BASE);
await page.waitForFunction(() => window.__exe !== undefined);
await page.waitForSelector("#taskbar");

// -- the autoplay law ---------------------------------------------------------
const before = await page.evaluate(() => window.__exe.audio.rigState());
if (before !== null) throw new Error(`audio existed before any gesture: ${before}`);
// On the desk itself, not on a control: this must not also open something.
await page.mouse.click(640, 700);
await page.waitForTimeout(500);
const after = await page.evaluate(() => window.__exe.audio.rigState());
if (after !== "running") throw new Error(`audio did not start on a gesture: ${after}`);
console.log(`[autoplay] context: none before the gesture, "${after}" after it`);

// -- coming back from an interruption -----------------------------------------
// A tab that loses the foreground gets its context suspended, and coming back
// is not a gesture — so nothing on the unlock path fires. The failure mode is a
// desktop that is silent for the rest of the session and looks muted.
for (const [how, wake] of [
  ["a sound firing", () => window.__exe.audio.play("ding")],
  ["coming back to the foreground", () => document.dispatchEvent(new Event("visibilitychange"))],
]) {
  await page.evaluate(() => window.__ctx.suspend());
  if ((await page.evaluate(() => window.__ctx.state)) !== "suspended") {
    throw new Error("could not suspend the context to test recovery");
  }
  await page.evaluate(wake);
  await page
    .waitForFunction(() => window.__ctx.state === "running", undefined, { timeout: 3000 })
    .catch(() => {
      throw new Error(`a suspended context did not come back on ${how}`);
    });
  console.log(`[interrupt] suspended context recovers on ${how}`);
}

// -- the tray speaker, worked the way a player works it -----------------------
// Driven by clicking the icon in the taskbar, not by calling the store: the bug
// this catches is a tray wired to a second copy of the setting.
const level = () => page.evaluate(() => window.__exe.audio.masterLevel());
// Poll for the fade rather than sleeping through it — headless Chrome's null
// sink advances the audio clock slower than wall time, so a fixed wait reads
// the fade partway through and fails a mute that works in a real browser.
const settle = async (done, ms = 6000) => {
  const t0 = Date.now();
  let v = await level();
  while (!done(v) && Date.now() - t0 < ms) {
    await page.waitForTimeout(100);
    v = await level();
  }
  return v;
};
const loud = await level();
await page.click("#tray");
await page.waitForSelector("#volpop", { state: "visible" });
await page.click("#volpop .cbrow");
const quiet = await settle((v) => v < 0.01);
await page.click("#volpop .cbrow");
const loudAgain = await settle((v) => v > 0.1);
if (!(loud > 0.1 && quiet < 0.01 && loudAgain > 0.1)) {
  throw new Error(`the tray did not mute the machine: ${loud} → ${quiet} → ${loudAgain}`);
}
console.log(`[tray] master ${loud.toFixed(2)} → ${quiet.toFixed(3)} → ${loudAgain.toFixed(2)}`);

// -- and the No Sounds scheme, which is the other way to silence -------------
await page.evaluate(() => window.__exe.audio.setAudio({ scheme: "none" }));
const schemeQuiet = await settle((v) => v < 0.01);
await page.evaluate(() => window.__exe.audio.setAudio({ scheme: "board95" }));
const schemeLoud = await settle((v) => v > 0.1);
if (!(schemeQuiet < 0.01 && schemeLoud > 0.1)) {
  throw new Error(`the No Sounds scheme is not silent: ${schemeQuiet} → ${schemeLoud}`);
}
console.log(`[scheme] No Sounds ${schemeQuiet.toFixed(3)}, BOARD 95 ${schemeLoud.toFixed(2)}`);

// -- render every recipe ------------------------------------------------------
const names = await page.evaluate(() => window.__exe.audio.SOUND_NAMES);
const rows = [];

for (const name of names) {
  const result = await page.evaluate(async (name) => {
    const buffer = await window.__exe.audio.soundBuffer(name);
    const data = buffer.getChannelData(0);
    let peak = 0;
    let sum = 0;
    let firstAudible = -1;
    for (let i = 0; i < buffer.length; i++) {
      const v = Math.abs(data[i]);
      if (v > peak) peak = v;
      sum += v * v;
      if (firstAudible < 0 && v > 0.02) firstAudible = i;
    }

    // 16-bit mono wav
    const bytes = 44 + buffer.length * 2;
    const view = new DataView(new ArrayBuffer(bytes));
    const ascii = (at, s) => [...s].forEach((c, i) => view.setUint8(at + i, c.charCodeAt(0)));
    ascii(0, "RIFF");
    view.setUint32(4, bytes - 8, true);
    ascii(8, "WAVEfmt ");
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, buffer.sampleRate, true);
    view.setUint32(28, buffer.sampleRate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    ascii(36, "data");
    view.setUint32(40, bytes - 44, true);
    for (let i = 0; i < buffer.length; i++) {
      const v = Math.max(-1, Math.min(1, data[i]));
      view.setInt16(44 + i * 2, v < 0 ? v * 0x8000 : v * 0x7fff, true);
    }
    let binary = "";
    const raw = new Uint8Array(view.buffer);
    for (let i = 0; i < raw.length; i += 0x8000) {
      binary += String.fromCharCode(...raw.subarray(i, i + 0x8000));
    }

    return {
      seconds: buffer.duration,
      peak,
      rms: Math.sqrt(sum / buffer.length),
      startsAt: firstAudible < 0 ? -1 : firstAudible / buffer.sampleRate,
      wav: binary,
    };
  }, name);

  const wav = Buffer.from(result.wav, "binary");
  writeFileSync(`${outDir}/${name}.wav`, wav);
  rows.push({ name, ...result, pcm: wav.subarray(44) });
}

// One file with everything in it, in the printed order, half a second apart.
{
  const gap = Buffer.alloc(44100 * 2 * 0.5);
  const pcm = Buffer.concat(rows.flatMap((r) => [r.pcm, gap]));
  const header = Buffer.alloc(44);
  header.write("RIFF");
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write("WAVEfmt ", 8);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(44100, 24);
  header.writeUInt32LE(44100 * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(pcm.length, 40);
  writeFileSync(`${outDir}/all.wav`, Buffer.concat([header, pcm]));
}

// -- report -------------------------------------------------------------------
console.log("\nname                 len     peak   rms    onset");
for (const r of rows) {
  console.log(
    `${r.name.padEnd(20)} ${r.seconds.toFixed(2)}s  ${r.peak.toFixed(3)}  ` +
      `${r.rms.toFixed(3)}  ${r.startsAt < 0 ? "  —  " : r.startsAt.toFixed(3)}`,
  );
}
const ding = rows.find((r) => r.name === "ding");
console.log(
  `\nthe default sound: peak ${ding.peak.toFixed(3)}, rms ${ding.rms.toFixed(3)} — ` +
    `everything else is judged against that, by ear, in shots/audio/`,
);

// -- the two things a machine can hear ----------------------------------------
const silent = rows.filter((r) => r.peak < 0.02);
if (silent.length) throw new Error(`silent recipes: ${silent.map((r) => r.name).join(", ")}`);
// A one-shot that takes a beat to start is a sound that misses its moment. The
// boot swell is the one thing allowed to take its time, because it is the only
// sound nothing is waiting on.
const late = rows.filter((r) => r.name !== "startup" && r.startsAt > 0.05);
if (late.length) {
  throw new Error(
    `late onsets: ${late.map((r) => `${r.name} @${r.startsAt.toFixed(3)}s`).join(", ")}`,
  );
}
const clipped = rows.filter((r) => r.peak > 1.001);
if (clipped.length) {
  console.log(`[warn] over full scale: ${clipped.map((r) => r.name).join(", ")}`);
}
if (errors.length) throw new Error(`page errors: ${errors.join(" | ")}`);

await browser.close();
server?.kill();
console.log(`\n${rows.length} sounds rendered to shots/audio/, plus all.wav in that order`);
process.exit(0);
