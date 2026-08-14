// BOARD.EXE proposal mocks — shared runtime, plain script so file:// works.
// The law (DIRECTION.md): run the period artifact, never illustrate it.
// Everything in here genuinely computes.
window.EXE = (() => {

// ---- stage scaling ----
function fitStage(w = 1280, h = 800) {
  const s = document.getElementById("stage");
  const fit = () => {
    const k = Math.min(innerWidth / w, innerHeight / h);
    s.style.transformOrigin = "top left";
    s.style.transform = `scale(${k}) translateX(${(innerWidth / k - w) / 2}px)`;
  };
  fit(); addEventListener("resize", fit);
}

const q = (sel) => document.querySelector(sel);
const param = (name) => new URLSearchParams(location.search).get(name);

// ---- pixel icons ----
function px(canvasOrId, rows, pal = P) {
  const el = typeof canvasOrId === "string" ? document.getElementById(canvasOrId) : canvasOrId;
  const ctx = el.getContext("2d");
  rows.forEach((s, y) => [...s].forEach((ch, x) => {
    if (ch !== ".") { ctx.fillStyle = pal[ch]; ctx.fillRect(x, y, 1, 1); }
  }));
}

const P = { b: "#000080", c: "#c0c0c0", w: "#fff", r: "#e0332e", y: "#f0b400", k: "#000",
                   o: "#ff7a00", d: "#808080", g: "#0e8078", s: "#d8d8d8", t: "#14b09e" };

const ICONS = {
  board: [
    "................","kkkkkkkkkkkkkkk.","kbbbbbbbbbbbbbk.","kbrbybrbybrbybk.",
    "kbbbbbbbbbbbbbk.","kbybrbybrbybrbk.","kbbbbbbbbbbbbbk.","kbrbybrbybrbybk.",
    "kbbbbbbbbbbbbbk.","kbybrbybrbybrbk.","kbbbbbbbbbbbbbk.","kkkkkkkkkkkkkkk.",
    ".kk..........kk.","................","................","................"],
  flame: [
    "................","......k.........",".....kok........","....koyok.......",
    "....koyok...k...","...koyyok..kok..","...koyyyok.kok..","..koyyyyokkoyk..",
    "..koyywyokoyok..",".koyywwyoyyyok..",".koyywwwyyyyok..",".koywwwwwyyok...",
    "..koywwwyyok....","...kooyyook.....","....kkkkkk......","................"],
  moves: [
    "..wwwwwwwwww....","..w........wk...","..w.kkkkkk.wwk..","..w........wwwk.",
    "..w.kkkkkkk...k.","..w...........k.","..w.kkkkk.kkk.k.","..w...........k.",
    "..w.kkkkkkkk..k.","..w...........k.","..w.kkk.......k.","..w...........k.",
    "..w.kkkkkkkkk.k.","..w...........k.","..wkkkkkkkkkkkk.","................"],
  bin: [
    "................","....kkkkkkkk....","...k........k...","..kkkkkkkkkkkk..",
    "..k..........k..","...k.k.k.k.k....","...k.k.k.k.k....","...k.k.k.k.k....",
    "...k.k.k.k.k....","...k.k.k.k.k....","...k.k.k.k.k....","...k.k.k.k.k....",
    "....k......k....","....kkkkkkkk....","................","................"],
  scr: [
    "................",".kkkkkkkkkkkkk..",".kwwwwwwwwwwwk..",".kwkkkkkkkkkwk..",
    ".kwkooyyyookwk..",".kwkoyywwyokwk..",".kwkoywwwyokwk..",".kwkkkkkkkkkwk..",
    ".kwwwwwwwwwwwk..",".kkkkkkkkkkkkk..","....kkkkkkk.....","......kkk.......",
    "....kkkkkkk.....","................","................","................"],
  folder: [
    "................","................","..kkkkk.........",".k.....k........",
    "k.......kkkkkkk.","k..............k","k.yyyyyyyyyyyy.k","k.yyyyyyyyyyyy.k",
    "k.yyyyyyyyyyyy.k","k.yyyyyyyyyyyy.k","k.yyyyyyyyyyyy.k","k.yyyyyyyyyyyy.k",
    "k..............k",".kkkkkkkkkkkkkk.","................","................"],
  start: [
    "................",".rrrr..ggggg....",".rrrr..ggggg....",".rrrr..ggggg....",
    ".rrrr..ggggg....","................",".bbbb..yyyyy....",".bbbb..yyyyy....",
    ".bbbb..yyyyy....",".bbbb..yyyyy....","................","................",
    "................","................","................","................"],
};

const ROCKET = [
  ".....rr.....","....rrrr....","....rrrr....","...swssss...","...swssss...",
  "..sswkksss..","..sswbbkss..","..sswbbkss..","..sswkksss..",".rsswssssr..",
  ".rrswsssrr..","rrrssssssrr.","rr.ssssss.rr","....oyyo....","...oyyyyo...",
  "...oyyyyo...","....oyyo....",".....oo....."];

// ---- palettes for the fire automaton ----
// A palette is 64 [r,g,b] entries indexed by heat.
function lerp(a, b, t) { return a + (b - a) * t; }
function ramp(stops) {
  // stops: [[t0,[r,g,b]], ...] sorted by t
  const pal = [];
  for (let i = 0; i < 64; i++) {
    const t = i / 63;
    let j = 0;
    while (j < stops.length - 2 && stops[j + 1][0] < t) j++;
    const [t0, c0] = stops[j], [t1, c1] = stops[j + 1];
    const k = Math.max(0, Math.min(1, (t - t0) / (t1 - t0 || 1)));
    pal.push([0, 1, 2].map((n) => Math.round(lerp(c0[n], c1[n], k))));
  }
  return pal;
}

const PALETTES = {
  // the approved mock's formula ramp: black → red → yellow → white
  classic: (() => {
    const pal = [];
    for (let i = 0; i < 64; i++) {
      const t = i / 63;
      pal.push([
        Math.min(255, t * 3 * 255) | 0,
        Math.max(0, Math.min(255, (t - 0.33) * 3 * 255)) | 0,
        Math.max(0, Math.min(255, (t - 0.75) * 4 * 255)) | 0,
      ]);
    }
    return pal;
  })(),
  // white creeps further down the flame — the same fire, angrier
  inferno: ramp([[0,[0,0,0]],[0.22,[160,8,0]],[0.45,[255,120,0]],[0.62,[255,220,40]],[0.8,[255,255,210]],[1,[255,255,255]]]),
  // the loss fire: it doesn't go out, it goes low
  coals: ramp([[0,[0,0,0]],[0.3,[52,10,4]],[0.55,[132,28,8]],[0.8,[204,84,24]],[1,[242,132,44]]]),
  // the desktop's own teal, burning
  desktop: ramp([[0,[6,26,24]],[0.3,[10,64,58]],[0.55,[14,128,120]],[0.78,[60,200,185]],[1,[220,255,250]]]),
};

// ---- the fire automaton (cooling + upward drift on a palette ramp) ----
// Factory so a page can run several at different sizes and temperaments.
// Personality hooks: `stoke(heat,W,H,tick)` replaces the flat bottom-row
// injection, `wind(tick)` biases the drift, `flip` hangs the fire from the
// top of the window, `transparent` fades cold pixels out instead of to black.
function makeFire(canvas, opts = {}) {
  const state = {
    palette: opts.palette ?? PALETTES.classic,
    baseHeat: opts.baseHeat ?? 40,   // bottom-row stoke floor
    stokeVar: opts.stokeVar ?? 24,   // bottom-row stoke randomness
    cool: opts.cool ?? 3,            // max per-step cooling (lower = taller flames)
    interval: opts.interval ?? 90,
    stoke: opts.stoke ?? null,
    wind: opts.wind ?? 0,
    flip: opts.flip ?? false,
    transparent: opts.transparent ?? false,
    tick: 0,
  };
  let W = canvas.width, H = canvas.height;
  let heat = new Uint8Array(W * H);
  let ctx = canvas.getContext("2d");
  let img = ctx.createImageData(W, H);
  let timer = null;

  function step() {
    state.tick++;
    if (state.stoke) state.stoke(heat, W, H, state.tick);
    else for (let x = 0; x < W; x++)
      heat[(H - 1) * W + x] = Math.min(63, state.baseHeat + (Math.random() * state.stokeVar | 0));
    const wind = Math.round(typeof state.wind === "function" ? state.wind(state.tick) : state.wind);
    for (let y = 0; y < H - 1; y++) for (let x = 0; x < W; x++) {
      const src = (y + 1) * W + x;
      const drift = x + ((Math.random() * 3 | 0) - 1) + wind;
      const cool = Math.random() * state.cool | 0;
      heat[y * W + Math.max(0, Math.min(W - 1, drift))] = Math.max(0, heat[src] - cool);
    }
    for (let i = 0; i < W * H; i++) {
      const y = (i / W) | 0, x = i % W;
      const h = heat[state.flip ? (H - 1 - y) * W + x : i];
      const [r, g, b] = state.palette[Math.min(63, h)];
      img.data[i * 4] = r; img.data[i * 4 + 1] = g; img.data[i * 4 + 2] = b;
      img.data[i * 4 + 3] = state.transparent ? (h <= 2 ? 0 : Math.min(255, h * 12)) : 255;
    }
    ctx.putImageData(img, 0, 0); // putImageData replaces alpha too, so transparency just works
  }

  function start() {
    stop();
    // pre-burn so it never starts cold; tall fields need proportionally more
    for (let i = 0; i < Math.max(40, H * 1.6 | 0); i++) step();
    timer = setInterval(step, state.interval);
  }
  function stop() { if (timer) { clearInterval(timer); timer = null; } }
  function set(patch) {
    const restart = patch.interval && patch.interval !== state.interval;
    Object.assign(state, patch);
    if (restart && timer) start();
  }
  function resize(w, h) {
    // keep whatever heat field overlaps; the flame recovers in a few frames
    const old = heat, oW = W, oH = H;
    W = canvas.width = w; H = canvas.height = h;
    heat = new Uint8Array(W * H);
    for (let y = 0; y < Math.min(H, oH); y++)
      for (let x = 0; x < Math.min(W, oW); x++)
        heat[(H - 1 - y) * W + x] = old[(oH - 1 - y) * oW + x];
    img = ctx.createImageData(W, H);
  }
  return { start, stop, set, resize, step, canvas };
}

// ---- a disc falls ----
// Real gravity, no easing curve: v += g each frame, one cheap frame of
// overshoot on landing. Positions are local `top` pixels on `el`.
function gravityFall(el, y0, y1, done, g = 1.15) {
  let y = y0, v = 0;
  el.style.top = y + "px";
  function f() {
    v += g; y += v;
    if (y >= y1) {
      el.style.top = (y1 + 4) + "px";
      requestAnimationFrame(() => { el.style.top = y1 + "px"; done && done(); });
      return;
    }
    el.style.top = y + "px";
    requestAnimationFrame(f);
  }
  requestAnimationFrame(f);
}

// ---- window helpers ----
let zTop = 40;
function raise(el) { el.style.zIndex = ++zTop; }

// Build a dialog window. spec: {title, body, buttons:[..], icon:'i'|'!', defIdx, x, y, w, active}
function makeDialog(spec) {
  const d = document.createElement("div");
  d.className = "win bevel";
  d.style.left = spec.x + "px"; d.style.top = spec.y + "px";
  d.style.width = (spec.w ?? 340) + "px";
  const btns = (spec.buttons ?? ["OK"]).map((b, i) =>
    `<div class="btn${i === (spec.defIdx ?? 0) ? " def" : ""}">${b}</div>`).join("");
  d.innerHTML = `
    <div class="titlebar ${spec.active ? "active" : "inactive"}"><span class="t">${spec.title}</span><div class="tbtn">×</div></div>
    <div class="dlg-body">
      <div class="dlg-ico${spec.icon === "!" ? " warn" : ""}">${spec.icon ?? "i"}</div>
      <div style="padding-top:6px;line-height:1.5">${spec.body}</div>
    </div>
    <div class="btnrow">${btns}</div>`;
  return d;
}

return { fitStage, q, param, px, P, ICONS, ROCKET, ramp, PALETTES, makeFire, gravityFall, raise, makeDialog };
})();
