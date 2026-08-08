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

function buildRig(): AudioRig {
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
  void (async () => {
    for (const name of SOUND_NAMES) await soundBuffer(name);
  })();

  return { ctx, master, ambientBus, spikeBus, spikeRoom, bed };
}

/** Call once from the app entry. Parks a gesture listener; builds nothing. */
export function installAudio(): void {
  const unlock = () => {
    if (!rig) rig = buildRig();
    if (rig.ctx.state === "suspended") void rig.ctx.resume();
  };
  window.addEventListener("pointerdown", unlock, { passive: true });

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
 * Fire a one-shot by semantic name. Silent until audio is unlocked.
 * `level` scales this call only — the quiet furniture (the column tick, the
 * drop) is quiet at the callsite, not in its recipe, so the recipe stays a
 * description of the sound and not of the moment.
 */
export function playSpike(name: SoundName, level = 1): void {
  const r = rig;
  if (!r || r.ctx.state !== "running") return;
  const now = performance.now();
  if (now - (lastFired.get(name) ?? -Infinity) < RETRIGGER_MS) return;
  lastFired.set(name, now);

  const fever = directorFrame().fever;
  void soundBuffer(name).then((buffer) => {
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
  });
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
