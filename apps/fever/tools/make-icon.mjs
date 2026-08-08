/**
 * Render tools/icon-art.js to apps/fever/public at integer scales of the 64px art.
 * Usage:  npm run icon
 * Env:    CHROME path to a Chrome/Chromium binary
 *
 * Uses playwright-core driving the system Chrome, same as tools/shots.mjs, so
 * nothing downloads a browser. The art is a canvas rather than an SVG because
 * nearest-neighbour upscaling is the only thing that keeps the pixel edges hard.
 */
import { chromium } from 'playwright-core';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { createServer } from 'node:http';

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, '..', 'public');
const SIZES = [192, 512, 1024]; // 3x, 8x, 16x of the 64px source

// Served over http, not file://: Chromium blocks ES module imports from file URLs.
const types = { '.html': 'text/html', '.js': 'text/javascript' };
const server = createServer((req, res) => {
  const name = req.url === '/' ? '/icon.html' : req.url;
  const ext = name.slice(name.lastIndexOf('.'));
  if (!(ext in types)) return res.writeHead(404).end(); // Chrome asks for favicon.ico
  res.writeHead(200, { 'content-type': types[ext] });
  res.end(readFileSync(join(here, name)));
});
await new Promise((r) => server.listen(0, r));

const CHROME =
  process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const page = await browser.newPage();
await page.goto(`http://localhost:${server.address().port}/icon.html`);

for (const size of SIZES) {
  const data = await page.evaluate(async (size) => {
    const { drawIcon, S } = window;
    const src = document.createElement('canvas');
    src.width = src.height = S;
    drawIcon(src.getContext('2d'));
    const dst = document.createElement('canvas');
    dst.width = dst.height = size;
    const c = dst.getContext('2d');
    c.imageSmoothingEnabled = false;
    c.drawImage(src, 0, 0, size, size);
    return dst.toDataURL('image/png').split(',')[1];
  }, size);
  mkdirSync(out, { recursive: true });
  const file = join(out, `icon-${size}.png`);
  writeFileSync(file, Buffer.from(data, 'base64'));
  console.log('wrote', file);
}

await browser.close();
server.close();
