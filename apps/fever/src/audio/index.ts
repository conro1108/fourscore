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
 */

import { directorFrame } from "../director/store.js";
import { startAmbient, type AmbientBed } from "./ambient.js";
import { soundBuffer, type SoundName } from "./library.js";

interface AudioRig {
  ctx: AudioContext;
  master: GainNode;
  ambientBus: GainNode;
  spikeBus: GainNode;
  bed: AmbientBed;
}

let rig: AudioRig | null = null;
let muted = false;

function buildRig(): AudioRig {
  const ctx = new AudioContext();
  const master = ctx.createGain();
  master.gain.value = muted ? 0 : 0.9;
  master.connect(ctx.destination);

  const ambientBus = ctx.createGain();
  ambientBus.gain.value = 1;
  ambientBus.connect(master);
  const spikeBus = ctx.createGain();
  spikeBus.gain.value = 0.9;
  spikeBus.connect(master);

  const bed = startAmbient(ctx, ambientBus);
  // Ambient params move at a human rate; nothing audible needs 60Hz control.
  setInterval(() => bed.update(directorFrame().fever), 80);

  // Warm the spike cache so the first gag isn't late to its own moment.
  void soundBuffer("spike-truck");

  return { ctx, master, ambientBus, spikeBus, bed };
}

/** Call once from the app entry. Parks a gesture listener; builds nothing. */
export function installAudio(): void {
  const unlock = () => {
    if (!rig) rig = buildRig();
    if (rig.ctx.state === "suspended") void rig.ctx.resume();
  };
  window.addEventListener("pointerdown", unlock, { passive: true });
}

/** Fire a one-shot by semantic name. Silent until audio is unlocked. */
export function playSpike(name: SoundName): void {
  const r = rig;
  if (!r || r.ctx.state !== "running") return;
  void soundBuffer(name).then((buffer) => {
    const source = r.ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(r.spikeBus);
    source.start();
  });
}

/** Hard mute — the whole master, not a bus. Wired to the debug panel now, the settings chrome in phase 6. */
export function setMuted(next: boolean): void {
  muted = next;
  if (rig) rig.master.gain.setTargetAtTime(muted ? 0 : 0.9, rig.ctx.currentTime, 0.02);
}

export function isMuted(): boolean {
  return muted;
}
