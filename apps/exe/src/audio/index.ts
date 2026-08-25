/**
 * The audio bus: recipe → (bed | spike) bus → master. Callers use `play(name)`.
 * - Autoplay: rig built at load; runs if the browser allows, else the first gesture
 *   wakes it (and plays `startup` only if soon after load).
 * - Only the bus applies fever (pitch flat + bigger room); recipes never read it.
 * - The context re-suspends on tab background, so every sound path goes through
 *   `wake()`; nothing reads `ctx.state` and gives up.
 */

import { startBed, type Bed } from "./bed.js";
import { room } from "./synth.js";
import { RECIPES, SOUND_NAMES, soundBuffer, type SoundName } from "./library.js";

export type { SoundName } from "./library.js";
export { RECIPES, SOUND_NAMES, soundBuffer } from "./library.js";

/** Control Panel schemes: `board95` default, `possessed` pins fever to 1, `none` is mute. */
export type Scheme = "board95" | "possessed" | "none";

export interface AudioSettings {
  scheme: Scheme;
  muted: boolean;
  /** 0..1; bed and one-shots together. */
  volume: number;
}

const STORE_KEY = "exe.audio";

const DEFAULTS: AudioSettings = { scheme: "board95", muted: false, volume: 0.7 };

function load(): AudioSettings {
  try {
    const raw = JSON.parse(localStorage.getItem(STORE_KEY) ?? "null") as Partial<AudioSettings> | null;
    if (!raw) return { ...DEFAULTS };
    return {
      scheme: raw.scheme === "possessed" || raw.scheme === "none" ? raw.scheme : "board95",
      muted: raw.muted === true,
      volume: typeof raw.volume === "number" ? Math.max(0, Math.min(1, raw.volume)) : DEFAULTS.volume,
    };
  } catch {
    return { ...DEFAULTS };
  }
}

let settings = load();
const listeners: ((s: AudioSettings) => void)[] = [];

interface Rig {
  ctx: AudioContext;
  master: GainNode;
  bedBus: GainNode;
  spikeBus: GainNode;
  /** Wet send on one-shots; opens with fever. */
  spikeRoom: GainNode;
  bed: Bed;
}

let rig: Rig | null = null;
/** Fever is pulled, never pushed. */
let feverSource: () => number = () => 0;

const levelOf = (s: AudioSettings): number =>
  s.muted || s.scheme === "none" ? 0 : 0.9 * s.volume;

/** Current fever; `possessed` pins it to 1. */
const heat = (): number =>
  settings.scheme === "possessed" ? 1 : Math.max(0, Math.min(1, feverSource()));

function buildRig(): Rig {
  const ctx = new AudioContext();
  const master = ctx.createGain();
  master.gain.value = levelOf(settings);
  master.connect(ctx.destination);

  const bedBus = ctx.createGain();
  bedBus.gain.value = 1;
  bedBus.connect(master);

  const spikeBus = ctx.createGain();
  spikeBus.gain.value = 0.9;
  spikeBus.connect(master);

  const space = room(ctx, 1.6, 2.2);
  const spikeRoom = ctx.createGain();
  spikeRoom.gain.value = 0;
  spikeBus.connect(space);
  space.connect(spikeRoom);
  spikeRoom.connect(master);

  const bed = startBed(ctx, bedBus);

  const STEP = 0.12;
  setInterval(() => {
    const f = heat();
    bed.update(f);
    spikeRoom.gain.setTargetAtTime(0.3 * f * f, ctx.currentTime, 0.5);
    bed.tick(STEP, () => play("drive-seek", 0.5));
  }, STEP * 1000);

  // Pre-render every recipe, shortest first so a click isn't queued behind the 3s boot swell.
  void (async () => {
    const order = [...SOUND_NAMES].sort((a, b) => RECIPES[a].seconds - RECIPES[b].seconds);
    for (const name of order) {
      try {
        await soundBuffer(name);
      } catch (e) {
        // one failed render must not abandon the rest
        console.warn(`sound "${name}" failed to render`, e);
      }
    }
  })();

  return { ctx, master, bedBus, spikeBus, spikeRoom, bed };
}

let waking: Promise<void> | null = null;
function wake(r: Rig): Promise<void> {
  if (r.ctx.state === "running") return Promise.resolve();
  waking ??= r.ctx
    .resume()
    .catch(() => {
    })
    .finally(() => (waking = null));
  return waking;
}

/** Call once from `main.ts`. */
export function installAudio(deps: { fever: () => number }): void {
  feverSource = deps.fever;
  let booted = false;
  const loadedAt = performance.now();
  const boot = (): void => {
    if (booted) return;
    booted = true;
    play("startup", 0.9);
  };
  // chime only if the first gesture is near load; a late click wants its own sound
  const BOOT_WINDOW_MS = 4000;
  const unlock = (): void => {
    if (!rig) rig = buildRig();
    // Not `wake()`: an off-gesture resume() hangs in Chrome (neither resolves nor
    // rejects), and `wake` would dedupe onto that hung promise.
    void rig.ctx.resume().then(() => {
      if (performance.now() - loadedAt < BOOT_WINDOW_MS) boot();
      else booted = true;
    });
  };
  // Chrome allows autoplay once you've interacted with the site this session (a reboot).
  rig = buildRig();
  if (rig.ctx.state === "running") boot();
  addEventListener("pointerdown", unlock, { passive: true });
  // iOS may only honour the *end* of a touch as the gesture
  addEventListener("pointerup", unlock, { passive: true });
  addEventListener("keydown", unlock);

  // Returning to a backgrounded tab is not a gesture; the context was suspended on the way out.
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && rig) void wake(rig);
  });
}

// Retrigger floor: a flick across seven columns must not stack identical transients into a click.
const RETRIGGER_MS = 28;
const lastFired = new Map<SoundName, number>();

// Drop sounds later than this: also stops a never-waking context banking one-shots
// that all fire on the same sample when it finally does.
const LATE_MS = 250;

/**
 * Fire a one-shot. `level` scales this call only — volume belongs at the callsite,
 * not in the recipe. A call on a sleeping context wakes it rather than dropping.
 */
export function play(name: SoundName, level = 1): void {
  const r = rig;
  if (!r) return;
  const now = performance.now();
  if (now - (lastFired.get(name) ?? -Infinity) < RETRIGGER_MS) return;
  lastFired.set(name, now);

  const f = heat();
  void wake(r)
    .then(() => soundBuffer(name))
    .then((buffer) => {
      if (r.ctx.state !== "running") return;
      if (performance.now() - now > LATE_MS) return;
      const source = r.ctx.createBufferSource();
      source.buffer = buffer;
      // flat, not sharp: bogging down, not speeding up
      source.playbackRate.value = 1 - 0.06 * f;
      if (level === 1) {
        source.connect(r.spikeBus);
      } else {
        const trim = r.ctx.createGain();
        trim.gain.value = level;
        source.connect(trim);
        trim.connect(r.spikeBus);
      }
      source.start();
    })
    .catch((e) => console.warn(`sound "${name}" didn't play`, e));
}

/* settings, shared by the tray and sounds.ctl */

export const audioSettings = (): AudioSettings => ({ ...settings });

/** Returns an unsubscribe; sounds.ctl must call it on close or it keeps redrawing a dead window. */
export function onAudioChange(cb: (s: AudioSettings) => void): () => void {
  listeners.push(cb);
  return () => {
    const at = listeners.indexOf(cb);
    if (at >= 0) listeners.splice(at, 1);
  };
}

export function setAudio(next: Partial<AudioSettings>): void {
  settings = { ...settings, ...next };
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(settings));
  } catch {
  }
  if (rig) {
    // fade, don't cut: a hard cut on a running hum is a click
    rig.master.gain.setTargetAtTime(
      levelOf(settings),
      rig.ctx.currentTime,
      levelOf(settings) === 0 ? 0.06 : 0.02,
    );
  }
  for (const cb of listeners) cb({ ...settings });
}

export const audible = (): boolean => levelOf(settings) > 0;

/* dev hooks for `npm run audio` */
export const rigState = (): AudioContextState | null => rig?.ctx.state ?? null;
export const masterLevel = (): number | null => rig?.master.gain.value ?? null;
