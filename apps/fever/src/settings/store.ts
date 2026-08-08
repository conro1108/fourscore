/**
 * Player settings. Audio only for now — phase 6 owns the settings chrome and
 * will have more to put here.
 *
 * Persisted, because the one setting a player changes in anger is the volume
 * and having it come back loud is the sort of thing that gets a tab closed.
 * The store is the source of truth and the audio bus subscribes to it; nothing
 * calls into the bus to set volume directly.
 */

import { create } from "zustand";

const KEY = "fourscore.audio";

interface Saved {
  muted: boolean;
  /** 0..1, master. */
  volume: number;
}

const DEFAULTS: Saved = { muted: false, volume: 0.8 };

function load(): Saved {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULTS;
    const parsed = JSON.parse(raw) as Partial<Saved>;
    return {
      muted: typeof parsed.muted === "boolean" ? parsed.muted : DEFAULTS.muted,
      volume:
        typeof parsed.volume === "number" && parsed.volume >= 0 && parsed.volume <= 1
          ? parsed.volume
          : DEFAULTS.volume,
    };
  } catch {
    // Private browsing, a corrupt value, a browser with storage switched off:
    // none of these are worth failing to start the game over.
    return DEFAULTS;
  }
}

export interface SettingsStore extends Saved {
  setMuted(muted: boolean): void;
  setVolume(volume: number): void;
}

export const useSettingsStore = create<SettingsStore>((set) => ({
  ...load(),
  setMuted: (muted) => set({ muted }),
  setVolume: (volume) => set({ volume: Math.max(0, Math.min(1, volume)) }),
}));

useSettingsStore.subscribe((s) => {
  try {
    localStorage.setItem(KEY, JSON.stringify({ muted: s.muted, volume: s.volume }));
  } catch {
    /* see load() */
  }
});
