/**
 * The audio equivalent of `npm run shots`: renders every recipe in the library
 * inside a real browser, writes each one out as a wav, and prints what it
 * measured.
 *
 * Sound can't be screenshotted and it can't be unit tested — a recipe that
 * schedules its oscillators after `startRendering` is silence that typechecks,
 * and a gain envelope with a typo is a click that passes every test in the
 * repo. So this listens for the two things a machine can hear (is it there,
 * and how loud) and hands the rest to Connor's ears as files.
 *
 * It also checks the autoplay law from the outside: no AudioContext may exist
 * before the first gesture, and it must be running after one.
 *
 * Usage:  npm run dev  (in apps/fever), then  npm run audio
 * Env:    BASE, CHROME — same as tools/shots.mjs.
 */
import { chromium } from "playwright-core";
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const BASE = process.env.BASE ?? "http://localhost:5173";
const exe =
  process.env.CHROME ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const outDir = fileURLToPath(new URL("../shots/audio", import.meta.url));
mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({ executablePath: exe, headless: true });
const page = await browser.newPage({ viewport: { width: 1100, height: 760 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));

await page.goto(BASE);
await page.waitForFunction(() => window.__fever !== undefined);
await page.waitForSelector("canvas");

// -- the autoplay law ---------------------------------------------------------
const before = await page.evaluate(() => window.__fever.audio.rigState());
if (before !== null) throw new Error(`audio existed before any gesture: ${before}`);
// A click on the HUD rather than the board: this must not also play a move.
await page.click(".wordmark", { force: true });
await page.waitForTimeout(400);
const after = await page.evaluate(() => window.__fever.audio.rigState());
if (after !== "running") throw new Error(`audio did not start on a gesture: ${after}`);
console.log(`[autoplay] context: none before the gesture, "${after}" after it`);

// -- the ambient bed's two loops ----------------------------------------------
// They're offline renders that arrive a moment after the rig, wired into
// `source.detune`, and if either throws it does so inside a promise nobody
// awaits — the bed simply never gets a crowd and nothing says so.
await page.waitForFunction(
  () => {
    const l = window.__fever.audio.bedLoops();
    return l && l.crowd && l.tape;
  },
  undefined,
  { timeout: 10000 },
);
console.log("[bed] crowd and tape loops both running");

// -- hard mute, through the real chrome ---------------------------------------
// Driven by clicking the button a player clicks, not by calling the store: the
// bug this catches is a toggle wired to a second copy of the setting.
const level = () => page.evaluate(() => window.__fever.audio.masterLevel());
const loud = await level();
await page.click('button:has-text("NOISE")');
await page.waitForTimeout(600);
const quiet = await level();
await page.click('button:has-text("SILENCE")');
await page.waitForTimeout(400);
const loudAgain = await level();
if (!(loud > 0.1 && quiet < 0.01 && loudAgain > 0.1)) {
  throw new Error(`mute did not work: ${loud} → ${quiet} → ${loudAgain}`);
}
console.log(
  `[mute] master ${loud.toFixed(2)} → ${quiet.toFixed(3)} → ${loudAgain.toFixed(2)}`,
);

// -- render every recipe ------------------------------------------------------
const names = await page.evaluate(() => window.__fever.audio.names);
const rows = [];

for (const name of names) {
  const result = await page.evaluate(async (name) => {
    const t0 = performance.now();
    const buffer = await window.__fever.audio.soundBuffer(name);
    const renderMs = performance.now() - t0;

    // Measure on the mix of both channels, then encode 16-bit stereo wav.
    const channels = [];
    for (let c = 0; c < buffer.numberOfChannels; c++) channels.push(buffer.getChannelData(c));
    let peak = 0;
    let sum = 0;
    let firstAudible = -1;
    for (let i = 0; i < buffer.length; i++) {
      let v = 0;
      for (const ch of channels) v += ch[i];
      v = Math.abs(v / channels.length);
      if (v > peak) peak = v;
      sum += v * v;
      if (firstAudible < 0 && v > 0.02) firstAudible = i;
    }

    const bytes = 44 + buffer.length * channels.length * 2;
    const view = new DataView(new ArrayBuffer(bytes));
    const ascii = (at, s) => [...s].forEach((c, i) => view.setUint8(at + i, c.charCodeAt(0)));
    ascii(0, "RIFF");
    view.setUint32(4, bytes - 8, true);
    ascii(8, "WAVEfmt ");
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, channels.length, true);
    view.setUint32(24, buffer.sampleRate, true);
    view.setUint32(28, buffer.sampleRate * channels.length * 2, true);
    view.setUint16(32, channels.length * 2, true);
    view.setUint16(34, 16, true);
    ascii(36, "data");
    view.setUint32(40, bytes - 44, true);
    let at = 44;
    for (let i = 0; i < buffer.length; i++) {
      for (const ch of channels) {
        const v = Math.max(-1, Math.min(1, ch[i]));
        view.setInt16(at, v < 0 ? v * 0x8000 : v * 0x7fff, true);
        at += 2;
      }
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
      renderMs,
      wav: btoa(binary),
    };
  }, name);

  writeFileSync(`${outDir}/${name}.wav`, Buffer.from(result.wav, "base64"));
  rows.push({ name, ...result, pcm: Buffer.from(result.wav, "base64").subarray(44) });
}

// One file with everything in it, in the order printed below, half a second
// apart. The whole point of "judged against the signature spike" is hearing
// them back to back, and nobody is going to open twenty-two files.
{
  const gap = Buffer.alloc(44100 * 2 * 2 * 0.5);
  const pcm = Buffer.concat(rows.flatMap((r) => [r.pcm, gap]));
  const header = Buffer.alloc(44);
  header.write("RIFF");
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write("WAVEfmt ", 8);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(2, 22);
  header.writeUInt32LE(44100, 24);
  header.writeUInt32LE(44100 * 4, 28);
  header.writeUInt16LE(4, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(pcm.length, 40);
  writeFileSync(`${outDir}/all.wav`, Buffer.concat([header, pcm]));
}

// -- report -------------------------------------------------------------------
const signature = rows.find((r) => r.name === "spike-truck");
// No render column: the page warms every recipe on the unlock gesture, so by
// the time this asks for one it is a cache hit and the number is a lie.
console.log("\nname                      len    peak   rms    onset");
for (const r of rows) {
  console.log(
    `${r.name.padEnd(24)} ${r.seconds.toFixed(2)}s  ${r.peak.toFixed(3)}  ` +
      `${r.rms.toFixed(3)}  ${r.startsAt < 0 ? "  —  " : `${r.startsAt.toFixed(3)}`}`,
  );
}
console.log(
  `\nsignature spike: peak ${signature.peak.toFixed(3)}, rms ${signature.rms.toFixed(3)} — ` +
    `everything else is judged against that, by ear, in shots/audio/`,
);

// -- the two things a machine can hear ----------------------------------------
const silent = rows.filter((r) => r.peak < 0.02);
if (silent.length) throw new Error(`silent recipes: ${silent.map((r) => r.name).join(", ")}`);
// A one-shot that takes a beat to start is a spike that misses its moment.
const late = rows.filter((r) => !r.name.startsWith("ambient-") && r.startsAt > 0.12);
if (late.length) {
  throw new Error(
    `late onsets: ${late.map((r) => `${r.name} @${r.startsAt.toFixed(2)}s`).join(", ")}`,
  );
}
const clipped = rows.filter((r) => r.peak > 1.001);
if (clipped.length) {
  console.log(`[warn] over full scale: ${clipped.map((r) => r.name).join(", ")}`);
}
if (errors.length) throw new Error(`page errors: ${errors.join(" | ")}`);

await browser.close();
console.log(`\n${rows.length} sounds rendered to shots/audio/, plus all.wav in that order`);
