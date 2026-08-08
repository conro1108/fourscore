/**
 * The settings window.
 *
 * Reads the settings store directly rather than taking props: these are global
 * by definition, the store is already the single source of truth the audio bus
 * and the post stack subscribe to, and every control here changes the thing
 * live. Nothing is applied on OK, because nothing was ever pending — the OK is
 * furniture.
 */

import { playSpike } from "../audio/index.js";
import { useSettingsStore } from "../settings/store.js";
import { Btn, Window } from "./Window.js";
import { COPY } from "./copy.js";

/**
 * The audio control, in the two states the voice sample names. It shows what
 * the game currently *is* — NOISE while it's making some — rather than what the
 * button does, which is how a period toggle behaved and is also funnier.
 *
 * Turning it off gets a switch clunk and then a fast fade rather than a hard
 * cut; the click sound is suppressed because this button has its own.
 */
export function SoundToggle() {
  const muted = useSettingsStore((s) => s.muted);
  const setMuted = useSettingsStore((s) => s.setMuted);
  return (
    <Btn
      quiet
      on={!muted}
      onClick={() => {
        playSpike(muted ? "toggle-on" : "toggle-off");
        setMuted(!muted);
      }}
    >
      {muted ? COPY.silence : COPY.noise}
    </Btn>
  );
}

export function VolumeSlider() {
  const muted = useSettingsStore((s) => s.muted);
  const volume = useSettingsStore((s) => s.volume);
  const setVolume = useSettingsStore((s) => s.setVolume);
  return (
    <input
      className="vol"
      type="range"
      min={0}
      max={1}
      step={0.02}
      value={volume}
      aria-label="volume"
      disabled={muted}
      onChange={(e) => {
        setVolume(Number(e.target.value));
        // A volume control you can't hear is a guess.
        playSpike("column-hover", 0.7);
      }}
    />
  );
}

export function Settings({ onClose }: { onClose: () => void }) {
  const effects = useSettingsStore((s) => s.effects);
  const setEffects = useSettingsStore((s) => s.setEffects);

  return (
    <Window
      title={COPY.settings}
      onClose={onClose}
      buttons={<Btn onClick={onClose}>{COPY.ok}</Btn>}
    >
      <div className="groove">
        <div className="groove-label">{COPY.sound}</div>
        <div className="row">
          <span className="row-label">{COPY.output}</span>
          <SoundToggle />
        </div>
        <div className="row">
          <span className="row-label">{COPY.volume}</span>
          <VolumeSlider />
        </div>
      </div>

      <div className="groove">
        <div className="groove-label">{COPY.picture}</div>
        <div className="row">
          {/* The post stack. Named for what a player would call it, and worth
              having in front of them: it's the first thing to turn off on a
              laptop that can't hold the frame rate. */}
          <span className="row-label">{COPY.effects}</span>
          <Btn on={effects} onClick={() => setEffects(true)}>
            {COPY.on}
          </Btn>
          <Btn on={!effects} onClick={() => setEffects(false)}>
            {COPY.off}
          </Btn>
        </div>
      </div>
    </Window>
  );
}
