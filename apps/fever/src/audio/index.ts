/**
 * The audio bus — the one public surface. Everything audible goes:
 *
 *   source → (ambient | spike) bus → master → destination
 *
 * and every consumer talks to this module by semantic sound name or by
 * calling nothing at all (the ambient bed subscribes itself to fever).
 *
 * Autoplay law: nothing is constructed until the first user gesture —
 * `install()` just parks a listener. Until then `playSpike` is a silent
 * no-op, which also makes it safe from the preview harness (which never
 * installs audio at all).
 *
 * Waking up is not a one-time event, which is the thing this module got wrong
 * for a while. On iOS the context is suspended again every time the PWA loses
 * the foreground, the state it comes back in is a non-standard `"interrupted"`
 * that no `=== "suspended"` test catches, and a page returning to the front is
 * not a gesture. So every path that wants sound goes through `wake()` and no
 * path reads `ctx.state` and gives up. A silent game is indistinguishable from
 * a muted one from the player's side, so the failure mode has to be "this one
 * sound was late" and never "the rig is asleep and nothing will wake it".
 * `tools/audio-check.mjs` suspends a real context and asserts it comes back.
 *
 * The spike bus is the one place fever touches one-shots: at full fever
 * everything plays a few percent sharp and sits in a bigger, wronger room.
 * Individual recipes never look at fever — a gag has to sound the same every
 * time it fires (the taste law), and the whole room running hot is a
 * property of the evening, not of the gag.
 */

import { directorFrame } from "../director/store.js";
import { useSettingsStore } from "../settings/store.js";
import { startAmbient, type AmbientBed } from "./ambient.js";
import { convolver } from "./mangle.js";
import { SOUND_NAMES, soundBuffer, type SoundName } from "./library.js";

interface AudioRig {
  ctx: AudioContext;
  master: GainNode;
  ambientBus: GainNode;
  spikeBus: GainNode;
  /** Wet send on the spike bus; opens with fever. */
  spikeRoom: GainNode;
  bed: AmbientBed;
}

let rig: AudioRig | null = null;

/** Master gain when not muted, from the settings store. */
const levelOf = (s: { muted: boolean; volume: number }): number =>
  s.muted ? 0 : 0.9 * s.volume;

/**
 * iOS silences a page's Web Audio with the hardware ring/silent switch unless
 * the page asks for a playback session, and it says nothing about it — no
 * error, no state change, no muted flag, just no sound. That is the single
 * most common way this game is silent on a phone, and it looks exactly like a
 * bug in here. Safari 16.4+; a no-op everywhere else.
 *
 * The cost is that we stop whatever the player had going, rather than mixing
 * under it. For a game with its own ambient bed that's the right side of the
 * trade — an evening that quietly refuses to make noise isn't one.
 */
function claimPlaybackSession(): void {
  const session = (navigator as Navigator & { audioSession?: { type: string } }).audioSession;
  if (session) session.type = "playback";
}

/**
 * Get the context running, and tell the caller when it is.
 *
 * The autoplay unlock is only the first of these. iOS suspends the context
 * every time the PWA loses the foreground — a call, the app switcher, the lock
 * button — and reports a *non-standard* `"interrupted"` state on the way back,
 * which is why nothing here tests for `"suspended"`: anything that isn't
 * running needs the same resume. `resume()` is also async, so callers wait on
 * this rather than reading `ctx.state` in the same tick and finding it stale.
 */
let waking: Promise<void> | null = null;
function wake(r: AudioRig): Promise<void> {
  if (r.ctx.state === "running") return Promise.resolve();
  waking ??= r.ctx
    .resume()
    .catch(() => {
      /* Refused off-gesture; the next tap gets another go. */
    })
    .finally(() => (waking = null));
  return waking;
}

function buildRig(): AudioRig {
  claimPlaybackSession();
  const ctx = new AudioContext();
  const master = ctx.createGain();
  master.gain.value = levelOf(useSettingsStore.getState());
  master.connect(ctx.destination);

  const ambientBus = ctx.createGain();
  ambientBus.gain.value = 1;
  ambientBus.connect(master);
  const spikeBus = ctx.createGain();
  spikeBus.gain.value = 0.9;
  spikeBus.connect(master);

  const room = convolver(ctx, 1.1, 2.2);
  const spikeRoom = ctx.createGain();
  spikeRoom.gain.value = 0;
  spikeBus.connect(room);
  room.connect(spikeRoom);
  spikeRoom.connect(master);

  const bed = startAmbient(ctx, ambientBus);
  // Ambient params move at a human rate; nothing audible needs 60Hz control.
  setInterval(() => {
    const fever = directorFrame().fever;
    bed.update(fever);
    spikeRoom.gain.setTargetAtTime(0.36 * fever * fever, ctx.currentTime, 0.4);
  }, 80);

  // Warm every recipe so no gag is late to its own moment — the first HMM
  // arriving after the sign has stopped waggling is worse than no HMM. One at
  // a time rather than all at once: this runs on a click, and twenty offline
  // renders in parallel is a hitch at exactly the wrong moment.
  //
  // Furniture first. This whole loop starts on the same tap that plays a
  // ui-click, and a gag's prop can't reach the stage for seconds yet, so the
  // sounds that fire immediately must not queue behind thirty they don't need.
  // (`sort` is stable, so within each half the declared order survives.)
  const warmOrder = [...SOUND_NAMES].sort(
    (a, b) => Number(a.startsWith("spike-")) - Number(b.startsWith("spike-")),
  );
  void (async () => {
    for (const name of warmOrder) {
      // One recipe failing to render must not cost the other thirty theirs —
      // WebKit will stall an offline render on a page that isn't in front, and
      // an un-caught throw here used to abandon the rest of the list silently.
      try {
        await soundBuffer(name);
      } catch (e) {
        console.warn(`sound "${name}" failed to render`, e);
      }
    }
  })();

  return { ctx, master, ambientBus, spikeBus, spikeRoom, bed };
}

/** Call once from the app entry. Parks a gesture listener; builds nothing. */
export function installAudio(): void {
  const unlock = () => {
    rig ??= buildRig();
    void wake(rig);
  };
  window.addEventListener("pointerdown", unlock, { passive: true });
  window.addEventListener("keydown", unlock);

  // Coming back to a backgrounded PWA is not a gesture, so none of the above
  // fires — and iOS suspended the context on the way out. Without this the
  // game comes back permanently silent and every later tap looks ignored.
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && rig) void wake(rig);
  });

  useSettingsStore.subscribe((s) => {
    if (!rig) return;
    // Muting fades over a fifth of a second rather than cutting: the switch
    // itself gets to be heard on the way out, and a hard cut on a running
    // drone is a click.
    rig.master.gain.setTargetAtTime(levelOf(s), rig.ctx.currentTime, s.muted ? 0.08 : 0.02);
  });
}

/**
 * Anything firing faster than this is a bug in a caller, not a sound: the
 * column tick can be dragged across seven columns in a flick, and a stack of
 * identical transients an audio frame apart is a click, not a tick.
 */
const RETRIGGER_MS = 30;
const lastFired = new Map<SoundName, number>();

/**
 * How late a sound is still worth playing. Waking a suspended context and
 * rendering a cold recipe both take time that is not the same on two devices,
 * and a gag arriving after its prop has left the stage is worse than a gag
 * that made no noise. It is also what stops a context that never wakes from
 * banking a queue of one-shots that all fire on the same sample when it does.
 */
const LATE_MS = 250;

/**
 * Fire a one-shot by semantic name. Silent until audio is unlocked.
 * `level` scales this call only — the quiet furniture (the column tick, the
 * drop) is quiet at the callsite, not in its recipe, so the recipe stays a
 * description of the sound and not of the moment.
 *
 * A call on a sleeping context isn't dropped, it's a reason to wake up: on iOS
 * the tap that unlocks the rig is usually a tap that also wanted a sound, and
 * the interruption after a phone call is only discovered by something trying
 * to play. Waking is racy against `LATE_MS` on purpose — recovering costs this
 * one sound at worst, where the old early return cost every sound after it.
 */
export function playSpike(name: SoundName, level = 1): void {
  const r = rig;
  if (!r) return;
  const now = performance.now();
  if (now - (lastFired.get(name) ?? -Infinity) < RETRIGGER_MS) return;
  lastFired.set(name, now);

  const fever = directorFrame().fever;
  void wake(r)
    .then(() => soundBuffer(name))
    .then((buffer) => {
      if (r.ctx.state !== "running") return;
      if (performance.now() - now > LATE_MS) return;
      const source = r.ctx.createBufferSource();
      source.buffer = buffer;
      // The evening runs hot: everything plays up to 5% sharp at full fever.
      source.playbackRate.value = 1 + 0.05 * fever;
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

/** Hard mute, through the settings store so the two surfaces can't disagree. */
export function setMuted(next: boolean): void {
  useSettingsStore.getState().setMuted(next);
}

export function isMuted(): boolean {
  return useSettingsStore.getState().muted;
}

/** Dev/tooling hook: null until the first gesture built the rig. */
export function rigState(): AudioContextState | null {
  return rig?.ctx.state ?? null;
}

/** Dev/tooling hook: where the master actually is, so "mute works" is checkable. */
export function masterLevel(): number | null {
  return rig?.master.gain.value ?? null;
}

/** Dev/tooling hook: the bed's two looped voices arrive late and quietly. */
export function bedLoops(): { crowd: boolean; tape: boolean } | null {
  return rig?.bed.loops() ?? null;
}
