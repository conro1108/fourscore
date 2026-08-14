/**
 * The 90s demoscene fire automaton — cooling + upward drift on a palette ramp.
 * Ported from proposals/lib.js, which is the approved exemplar (DIRECTION.md):
 * it genuinely computes per-frame; nothing in here is a picture of fire.
 *
 * Personality hooks: `stoke(heat,W,H,tick)` replaces the flat bottom-row
 * injection, `wind` biases the drift, `flip` hangs the fire from the top of
 * the window, `transparent` fades cold pixels out instead of to black.
 */

export type Rgb = readonly [number, number, number];
export type Palette = readonly Rgb[];
export type StokeFn = (heat: Uint8Array, w: number, h: number, tick: number) => void;

export interface FireOptions {
  palette?: Palette;
  /** Bottom-row stoke floor. */
  baseHeat?: number;
  /** Bottom-row stoke randomness. */
  stokeVar?: number;
  /** Max per-step cooling — lower means taller flames. */
  cool?: number;
  interval?: number;
  stoke?: StokeFn | null;
  wind?: number | ((tick: number) => number);
  flip?: boolean;
  transparent?: boolean;
}

export interface Fire {
  start(): void;
  stop(): void;
  set(patch: FireOptions): void;
  resize(w: number, h: number): void;
  step(): void;
  readonly canvas: HTMLCanvasElement;
}

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/** Build a 64-entry palette from gradient stops: [[t0,[r,g,b]], ...]. */
export function ramp(stops: readonly (readonly [number, Rgb])[]): Palette {
  const pal: Rgb[] = [];
  for (let i = 0; i < 64; i++) {
    const t = i / 63;
    let j = 0;
    while (j < stops.length - 2 && stops[j + 1]![0] < t) j++;
    const [t0, c0] = stops[j]!;
    const [t1, c1] = stops[j + 1]!;
    const k = Math.max(0, Math.min(1, (t - t0) / (t1 - t0 || 1)));
    pal.push([
      Math.round(lerp(c0[0], c1[0], k)),
      Math.round(lerp(c0[1], c1[1], k)),
      Math.round(lerp(c0[2], c1[2], k)),
    ]);
  }
  return pal;
}

/**
 * Blend two palettes. The fever lean lives here: the classic ramp only ever
 * blends *toward* the white-hot one, at most halfway — full white across the
 * flame body reads as butter, not fire (DIRECTION.md), so it never arrives.
 */
export function mixPalettes(a: Palette, b: Palette, k: number): Palette {
  return a.map((c, i) => {
    const d = b[i]!;
    return [
      Math.round(c[0] + (d[0] - c[0]) * k),
      Math.round(c[1] + (d[1] - c[1]) * k),
      Math.round(c[2] + (d[2] - c[2]) * k),
    ] as const;
  });
}

export const PALETTES: Record<"classic" | "inferno" | "coals" | "desktop", Palette> = {
  // the approved mock's formula ramp: black → red → yellow → white
  classic: (() => {
    const pal: Rgb[] = [];
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
  inferno: ramp([
    [0, [0, 0, 0]],
    [0.22, [160, 8, 0]],
    [0.45, [255, 120, 0]],
    [0.62, [255, 220, 40]],
    [0.8, [255, 255, 210]],
    [1, [255, 255, 255]],
  ]),
  // the loss fire: it doesn't go out, it goes low
  coals: ramp([
    [0, [0, 0, 0]],
    [0.3, [52, 10, 4]],
    [0.55, [132, 28, 8]],
    [0.8, [204, 84, 24]],
    [1, [242, 132, 44]],
  ]),
  // the desktop's own teal, burning
  desktop: ramp([
    [0, [6, 26, 24]],
    [0.3, [10, 64, 58]],
    [0.55, [14, 128, 120]],
    [0.78, [60, 200, 185]],
    [1, [220, 255, 250]],
  ]),
};

export function makeFire(canvas: HTMLCanvasElement, opts: FireOptions = {}): Fire {
  const state = {
    palette: opts.palette ?? PALETTES.classic,
    baseHeat: opts.baseHeat ?? 40,
    stokeVar: opts.stokeVar ?? 24,
    cool: opts.cool ?? 3,
    interval: opts.interval ?? 90,
    stoke: opts.stoke ?? null,
    wind: opts.wind ?? 0,
    flip: opts.flip ?? false,
    transparent: opts.transparent ?? false,
    tick: 0,
  };
  let W = canvas.width;
  let H = canvas.height;
  let heat = new Uint8Array(W * H);
  const ctx = canvas.getContext("2d")!;
  let img = ctx.createImageData(W, H);
  let timer: ReturnType<typeof setInterval> | null = null;

  function step(): void {
    state.tick++;
    if (state.stoke) state.stoke(heat, W, H, state.tick);
    else
      for (let x = 0; x < W; x++)
        heat[(H - 1) * W + x] = Math.min(63, state.baseHeat + ((Math.random() * state.stokeVar) | 0));
    const wind = Math.round(typeof state.wind === "function" ? state.wind(state.tick) : state.wind);
    for (let y = 0; y < H - 1; y++)
      for (let x = 0; x < W; x++) {
        const src = (y + 1) * W + x;
        const drift = x + (((Math.random() * 3) | 0) - 1) + wind;
        const cool = (Math.random() * state.cool) | 0;
        heat[y * W + Math.max(0, Math.min(W - 1, drift))] = Math.max(0, heat[src]! - cool);
      }
    for (let i = 0; i < W * H; i++) {
      const y = (i / W) | 0;
      const x = i % W;
      const h = heat[state.flip ? (H - 1 - y) * W + x : i]!;
      const [r, g, b] = state.palette[Math.min(63, h)]!;
      img.data[i * 4] = r;
      img.data[i * 4 + 1] = g;
      img.data[i * 4 + 2] = b;
      img.data[i * 4 + 3] = state.transparent ? (h <= 2 ? 0 : Math.min(255, h * 12)) : 255;
    }
    ctx.putImageData(img, 0, 0); // putImageData replaces alpha too, so transparency just works
  }

  function start(): void {
    stop();
    // pre-burn so it never starts cold; tall fields need proportionally more
    for (let i = 0; i < Math.max(40, (H * 1.6) | 0); i++) step();
    timer = setInterval(step, state.interval);
  }
  function stop(): void {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
  }
  function set(patch: FireOptions): void {
    const restart = patch.interval !== undefined && patch.interval !== state.interval;
    Object.assign(state, patch);
    if (restart && timer) {
      clearInterval(timer);
      timer = setInterval(step, state.interval);
    }
  }
  function resize(w: number, h: number): void {
    // keep whatever heat field overlaps; the flame recovers in a few frames
    const old = heat;
    const oW = W;
    const oH = H;
    W = canvas.width = w;
    H = canvas.height = h;
    heat = new Uint8Array(W * H);
    for (let y = 0; y < Math.min(H, oH); y++)
      for (let x = 0; x < Math.min(W, oW); x++)
        heat[(H - 1 - y) * W + x] = old[(oH - 1 - y) * oW + x]!;
    img = ctx.createImageData(W, H);
  }
  return { start, stop, set, resize, step, canvas };
}

/* ---- personalities (the approved shelf, 03-shelf.html) ---- */

/** coals.scr: a low bed that flares when you look away. */
export function coalsStoke(): StokeFn {
  let flare = -1;
  let flareX = 0;
  return (heat, W, H) => {
    for (let x = 0; x < W; x++)
      heat[(H - 1) * W + x] = Math.min(63, 28 + ((Math.random() * 12) | 0));
    if (flare < 0 && Math.random() < 0.02) {
      flare = 20;
      flareX = (12 + Math.random() * (W - 24)) | 0;
    }
    if (flare >= 0) {
      for (let x = Math.max(0, flareX - 4); x <= Math.min(W - 1, flareX + 4); x++)
        heat[(H - 1) * W + x] = Math.min(63, 52 + ((Math.random() * 10) | 0));
      flare--;
    }
  };
}

/** pillar.scr: one column of flame, swaying — a candle for the oracle. */
export function pillarStoke(): StokeFn {
  return (heat, W, H, tick) => {
    const c = W / 2 + Math.sin(tick * 0.045) * 7;
    for (let x = 0; x < W; x++) {
      const d = Math.abs(x - c);
      heat[(H - 1) * W + x] =
        d < 8 ? Math.min(63, (58 - d * 4 + Math.random() * 6) | 0) : (Math.random() * 5) | 0;
    }
  };
}

/** rain.scr options: the desktop's own palette, hanging from the ceiling. */
export const RAIN_OPTIONS: FireOptions = {
  palette: PALETTES.desktop,
  flip: true,
  baseHeat: 26,
  stokeVar: 14,
  cool: 3.4,
  interval: 100,
};

export const COALS_OPTIONS: FireOptions = {
  palette: PALETTES.coals,
  cool: 3.4,
  interval: 130,
};

/**
 * roam.scr: ONE heat field spanning several windows. The heat source wanders
 * the full width — two incommensurate sines plus a bounded random walk, so it
 * goes where it wants — and the flame walks out of one window into the next.
 * `onFocus` fires when it crosses a window boundary: focus follows the fire.
 */
export function makeRoam(
  canvases: readonly HTMLCanvasElement[],
  onFocus: (index: number) => void,
): { start(): void; stop(): void } {
  const SLICE = canvases[0]!.width;
  const TH = canvases[0]!.height;
  const TW = SLICE * canvases.length;
  const heat = new Uint8Array(TW * TH);
  const targets = canvases.map((c) => {
    const ctx = c.getContext("2d")!;
    return { ctx, img: ctx.createImageData(SLICE, TH) };
  });
  const pal = PALETTES.classic;
  let tick = 0;
  let focused = -1;
  let wander = 0;
  let timer: ReturnType<typeof setInterval> | null = null;

  function step(): void {
    tick++;
    wander = Math.max(-30, Math.min(30, wander + (Math.random() - 0.5) * 3));
    const p =
      TW * (0.5 + 0.3 * Math.sin(tick * 0.011) + 0.16 * Math.sin(tick * 0.037 + 1.7)) + wander;
    for (let x = 0; x < TW; x++) {
      const g = Math.exp(-(((x - p) / 20) ** 2));
      heat[(TH - 1) * TW + x] = Math.min(63, (10 + Math.random() * 8 + g * 46) | 0);
    }
    for (let y = 0; y < TH - 1; y++)
      for (let x = 0; x < TW; x++) {
        const src = (y + 1) * TW + x;
        const drift = x + (((Math.random() * 3) | 0) - 1);
        const cool = (Math.random() * 2.6) | 0;
        heat[y * TW + Math.max(0, Math.min(TW - 1, drift))] = Math.max(0, heat[src]! - cool);
      }
    targets.forEach(({ ctx, img }, w) => {
      for (let y = 0; y < TH; y++)
        for (let x = 0; x < SLICE; x++) {
          const [r, g, b] = pal[Math.min(63, heat[y * TW + w * SLICE + x]!)]!;
          const i = (y * SLICE + x) * 4;
          img.data[i] = r;
          img.data[i + 1] = g;
          img.data[i + 2] = b;
          img.data[i + 3] = 255;
        }
      ctx.putImageData(img, 0, 0);
    });
    const fw = Math.min(canvases.length - 1, (p / SLICE) | 0);
    if (fw !== focused) {
      focused = fw;
      onFocus(fw);
    }
  }

  return {
    start() {
      this.stop();
      for (let i = 0; i < 40; i++) step();
      timer = setInterval(step, 70);
    },
    stop() {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
    },
  };
}
