/**
 * Dev-only panel, and the reason every subsystem after this phase can be built
 * before the game is capable of producing the moment it reacts to. The slider
 * pins fever; the buttons fire real `SpectacleEvent`s down the real bus. A gag
 * that only looks right when a live game happens to produce a blunder is a gag
 * nobody will ever review.
 *
 * `live` is shown next to the override so it's obvious when the panel is lying
 * to the rest of the app — a pinned slider left on by accident otherwise reads
 * as a Director that stopped working.
 */

import { useEffect, useState } from "react";
import { playSpike } from "../audio/index.js";
import { SOUND_NAMES, type SoundName } from "../audio/library.js";
import { useSettingsStore } from "../settings/store.js";
import { useDirectorStore } from "../director/store.js";
import type { SpectacleEvent } from "../director/types.js";

/**
 * One representative payload per event kind. Fixed, not random: the taste law
 * says randomness picks which gag fires, never how it looks, and a review pass
 * needs the same spike twice in a row to judge it.
 */
const SAMPLES: { label: string; event: SpectacleEvent }[] = [
  { label: "brilliant", event: { kind: "move", player: "red", col: 3, quality: "brilliant" } },
  { label: "blunder", event: { kind: "move", player: "red", col: 3, quality: "blunder" } },
  { label: "threat", event: { kind: "threat", player: "yellow" } },
  { label: "rising", event: { kind: "tension-shift", direction: "rising" } },
  { label: "collapsing", event: { kind: "tension-shift", direction: "collapsing" } },
  { label: "win", event: { kind: "win", player: "red", line: [] } },
  { label: "draw", event: { kind: "draw" } },
  { label: "idle", event: { kind: "idle-beat" } },
];

function useFps(): number {
  const [fps, setFps] = useState(0);
  useEffect(() => {
    let frames = 0;
    let last = performance.now();
    let raf = 0;
    const loop = () => {
      frames++;
      const now = performance.now();
      if (now - last >= 500) {
        setFps((frames * 1000) / (now - last));
        frames = 0;
        last = now;
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);
  return fps;
}

export function DebugPanel() {
  // Quantized on purpose: the readout is for a human, and subscribing a DOM
  // component to the raw value re-renders this panel sixty times a second.
  const fever = useDirectorStore((s) => Math.round(s.frame.fever * 100) / 100);
  const live = useDirectorStore((s) => Math.round(s.live * 100) / 100);
  const override = useDirectorStore((s) => s.override);
  const setFever = useDirectorStore((s) => s.setFever);
  const fire = useDirectorStore((s) => s.fire);
  // The player-facing setting, not a debug copy of it — see settings/store.ts.
  const postEnabled = useSettingsStore((s) => s.effects);
  const setPostEnabled = useSettingsStore((s) => s.setEffects);
  const [open, setOpen] = useState(true);
  const muted = useSettingsStore((s) => s.muted);
  const setMuted = useSettingsStore((s) => s.setMuted);
  const [sound, setSound] = useState<SoundName>(SOUND_NAMES[0]!);
  const fps = useFps();

  if (!open) {
    return (
      <button className="debug-tab" onClick={() => setOpen(true)}>
        debug
      </button>
    );
  }

  return (
    <div className="debug">
      <div className="debug-row debug-head">
        <span>director debug</span>
        <span>{fps.toFixed(0)} fps</span>
        <button onClick={() => setOpen(false)}>–</button>
      </div>
      <label className="debug-row">
        fever {fever.toFixed(2)}
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={fever}
          onChange={(e) => setFever(Number(e.target.value))}
        />
      </label>
      <div className="debug-row">
        <span className={override === null ? "debug-on" : undefined}>
          {override === null ? "live" : `pinned — live ${live.toFixed(2)}`}
        </span>
        {override !== null && (
          <button className="debug-mini" onClick={() => setFever(null)}>
            release
          </button>
        )}
      </div>
      <label className="debug-row">
        <input
          type="checkbox"
          checked={postEnabled}
          onChange={(e) => setPostEnabled(e.target.checked)}
        />
        post stack
      </label>
      <label className="debug-row">
        <input type="checkbox" checked={muted} onChange={(e) => setMuted(e.target.checked)} />
        mute
      </label>
      {/* Audition any sound on demand. Judging one against the signature spike
          means hearing them back to back, which no game will ever arrange. */}
      <div className="debug-row">
        <select value={sound} onChange={(e) => setSound(e.target.value as SoundName)}>
          {SOUND_NAMES.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
        <button className="debug-mini" onClick={() => playSpike(sound)}>
          play
        </button>
      </div>
      <div className="debug-row debug-events">
        {SAMPLES.map((s) => (
          <button key={s.label} onClick={() => fire(s.event)}>
            {s.label}
          </button>
        ))}
      </div>
    </div>
  );
}
