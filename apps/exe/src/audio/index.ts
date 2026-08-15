/**
 * The audio bus — the one public surface. Everything audible goes:
 *
 *   recipe → (bed | scheme) bus → master → destination
 *
 * and every caller on the desktop talks to it by semantic name: `play("ding")`.
 *
 * **Autoplay law.** Nothing is constructed until the first user gesture;
 * `installAudio()` only parks a listener. Until then `play` is a silent no-op,
 * which is also what keeps `npm run shots` — which never clicks anything —
 * from being a page with an AudioContext in it.
 *
 * The law turns out to be a gift here rather than a workaround: the gesture
 * that builds the rig plays `startup`, so the machine finishes booting the
 * moment you touch it. It has been sitting there since the page loaded.
 *
 * **The fever bends the scheme, and only the bus knows that.** At high fever
 * every one-shot plays a little flat and sits in a bigger, wronger room —
 * a machine bogging down, not a machine going faster. Individual recipes never
 * look at fever: a ding has to be the same ding every time (the taste law), and
 * the room running hot is a property of the evening, not of the ding.
 *
 * Waking up is not a one-time event. A context is suspended again whenever the
 * tab loses the foreground, and coming back is not a gesture — so every path
 * that wants sound goes through `wake()`, and no path reads `ctx.state` and
 * gives up. A silent desktop is indistinguishable from a muted one from the
 * player's side, so the failure mode has to be "that one ding was late" and
 * never "the rig is asleep and nothing will wake it".
 */

import { startBed, type Bed } from "./bed.js";
import { room } from "./synth.js";
import { RECIPES, SOUND_NAMES, soundBuffer, type SoundName } from "./library.js";

export type { SoundName } from "./library.js";
export { RECIPES, SOUND_NAMES, soundBuffer } from "./library.js";

/**
 * The schemes the Control Panel offers, and they all do something (the second
 * law — no dead controls):
 *
 * - `board95` — the scheme this desktop shipped with.
 * - `possessed` — every sound played the way the machine plays them at full
 *   fever, whatever the game is actually doing. The OS offers this sincerely.
 * - `none` — silence, which is how a period Control Panel spelled mute.
 */
export type Scheme = "board95" | "possessed" | "none";

export interface AudioSettings {
  scheme: Scheme;
  muted: boolean;
  /** 0..1. The bed and the one-shots ride it together. */
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
    /* a corrupt setting is the default scheme, not a crash */
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
  /** Wet send on the one-shots; opens with fever. */
  spikeRoom: GainNode;
  bed: Bed;
}

let rig: Rig | null = null;
/** Where the fever comes from. The bus pulls it; nothing pushes. */
let feverSource: () => number = () => 0;

/** Master gain when the scheme has any sound in it at all. */
const levelOf = (s: AudioSettings): number =>
  s.muted || s.scheme === "none" ? 0 : 0.9 * s.volume;

/** How wrong the machine sounds right now. `possessed` pins it open. */
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

  // The bed and the room move at a human rate; nothing audible needs 60Hz.
  const STEP = 0.12;
  setInterval(() => {
    const f = heat();
    bed.update(f);
    spikeRoom.gain.setTargetAtTime(0.3 * f * f, ctx.currentTime, 0.5);
    bed.tick(STEP, () => play("drive-seek", 0.5));
  }, STEP * 1000);

  // Warm every recipe so no sound is late to its own moment. Shortest first:
  // this loop starts on the same click that plays a `click`, and the furniture
  // must not queue behind the three-second boot swell it fired alongside.
  void (async () => {
    const order = [...SOUND_NAMES].sort((a, b) => RECIPES[a].seconds - RECIPES[b].seconds);
    for (const name of order) {
      try {
        await soundBuffer(name);
      } catch (e) {
        // One recipe failing to render must not cost the other twenty-two
        // theirs — an uncaught throw here used to abandon the rest silently.
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
      /* refused off-gesture; the next click gets another go */
    })
    .finally(() => (waking = null));
  return waking;
}

/**
 * Call once from `main.ts`. Parks a gesture listener and builds nothing.
 * `fever` is pulled, not pushed, so the director stays something the audio
 * reads rather than something that has to know audio exists.
 */
export function installAudio(deps: { fever: () => number }): void {
  feverSource = deps.fever;
  let booted = false;
  const unlock = (): void => {
    if (!rig) rig = buildRig();
    void wake(rig).then(() => {
      if (booted) return;
      booted = true;
      play("startup", 0.9);
    });
  };
  addEventListener("pointerdown", unlock, { passive: true });
  // iOS has historically only honoured the *end* of a touch as the gesture
  // that may start audio, so the lift gets a listener too — `wake()` makes
  // the second call a no-op.
  addEventListener("pointerup", unlock, { passive: true });
  addEventListener("keydown", unlock);

  // Coming back to a backgrounded tab is not a gesture, so none of the above
  // fires — and the context was suspended on the way out. Without this the
  // desktop comes back permanently silent and every later click looks ignored.
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && rig) void wake(rig);
  });
}

/**
 * Anything firing faster than this is a bug in a caller, not a sound: the
 * column tick can be dragged across seven columns in a flick, and a stack of
 * identical transients an audio frame apart is a click, not a tick.
 */
const RETRIGGER_MS = 28;
const lastFired = new Map<SoundName, number>();

/**
 * How late a sound is still worth playing. Waking a suspended context and
 * rendering a cold recipe both take time that isn't the same on two machines,
 * and a ding arriving after its dialog has closed is worse than a silent one.
 * It also stops a context that never wakes from banking a queue of one-shots
 * that all fire on the same sample when it finally does.
 */
const LATE_MS = 250;

/**
 * Fire a one-shot by name. Silent until the rig exists.
 *
 * `level` scales this call only. The quiet furniture is quiet at the callsite,
 * not in its recipe, so a recipe stays a description of a sound and not of a
 * moment — `disc-land` under the board and `disc-land` behind the win cascade
 * are the same knock at two volumes.
 *
 * A call on a sleeping context isn't dropped, it's a reason to wake up: the
 * click that unlocks the rig is usually a click that also wanted a sound.
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
      // Flat, not sharp: this machine is bogging down, not speeding up.
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

/* ---- the settings, which two surfaces share: the tray and sounds.ctl ---- */

export const audioSettings = (): AudioSettings => ({ ...settings });

/**
 * Fires on every change, so the tray icon and the applet can't disagree.
 * Returns its own undo — sounds.ctl can be closed and opened all evening, and
 * every one of those would otherwise leave a subscriber redrawing a window
 * that isn't on the desk any more.
 */
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
    /* a desk that can't remember the volume still has one */
  }
  if (rig) {
    // Fade over a fifth of a second rather than cutting: the switch itself gets
    // to be heard on the way out, and a hard cut on a running hum is a click.
    rig.master.gain.setTargetAtTime(
      levelOf(settings),
      rig.ctx.currentTime,
      levelOf(settings) === 0 ? 0.06 : 0.02,
    );
  }
  for (const cb of listeners) cb({ ...settings });
}

/** Is anything going to come out if something plays right now? */
export const audible = (): boolean => levelOf(settings) > 0;

/* ---- dev/tooling hooks; `npm run audio` drives the app through these ---- */
export const rigState = (): AudioContextState | null => rig?.ctx.state ?? null;
export const masterLevel = (): number | null => rig?.master.gain.value ?? null;
