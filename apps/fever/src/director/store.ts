/**
 * Where subsystems read the current DirectorFrame from.
 *
 * The runtime publishes a frame every tick; everything visual and audible
 * subscribes here and to nothing else. Three read surfaces, because a 60Hz
 * value has three genuinely different consumers:
 *
 * - `directorFrame()` — non-reactive, for anything already inside a render or
 *   audio loop. Shader uniforms and prop animation want this one.
 * - `useFeverStep()` — quantized, for React chrome. A DOM component subscribing
 *   to the raw fever re-renders sixty times a second for a number nobody can
 *   see change that fast; the steps make React re-render only when it matters.
 * - `subscribeEvents()` — the spike feed. Events are a stream, not state: a gag
 *   must see each one exactly once, which polling `frame.events` can't promise.
 *
 * The debug override sits in front of all of it, so a subsystem can be built
 * and reviewed against the slider before a real game ever drives it — which is
 * the point of the panel, and the reason it stays wired after phase 1.
 */

import { create } from "zustand";
import type { DirectorFrame, Fever, SpectacleEvent } from "./types.js";

interface DirectorStore {
  /** What subsystems should act on: the live frame, or the override if set. */
  frame: DirectorFrame;
  /** The Director's own reading, ignored while `override` is set. Debug only. */
  live: Fever;
  /** Dev override. Null means the real game is driving. */
  override: Fever | null;
  /** Called by the runtime once per tick. */
  publish(frame: DirectorFrame): void;
  /** Debug: pin fever, or pass null to hand control back to the Director. */
  setFever(fever: Fever | null): void;
  /** Debug: inject a spike, so gags can be reviewed without playing a game. */
  fire(event: SpectacleEvent): void;
}

const listeners = new Set<(event: SpectacleEvent) => void>();

const emit = (events: readonly SpectacleEvent[]): void => {
  for (const event of events) for (const fn of listeners) fn(event);
};

export const useDirectorStore = create<DirectorStore>((set, get) => ({
  // `match` until the runtime says otherwise, so the preview harness — which
  // never starts the Director — sees the stricter one-act-at-a-time stage.
  frame: { fever: 0, events: [], mode: "match" },
  live: 0,
  override: null,

  publish: (frame) => {
    const { override } = get();
    set({ live: frame.fever, frame: override === null ? frame : { ...frame, fever: override } });
    emit(frame.events);
  },

  setFever: (fever) => {
    const override = fever === null ? null : clamp01(fever);
    set((s) => ({
      override,
      frame: { ...s.frame, fever: override ?? s.live },
    }));
  },

  fire: (event) => {
    set((s) => ({ frame: { ...s.frame, events: [event] } }));
    emit([event]);
  },
}));

/** Non-reactive read, for consumers already running per frame. */
export const directorFrame = (): DirectorFrame => useDirectorStore.getState().frame;

/**
 * Exact fever, as a hook. Re-renders its component every tick — correct for a
 * canvas-free consumer that genuinely needs the precise value, wrong for
 * anything else. Reach for `useFeverStep` first.
 */
export const useFever = (): Fever => useDirectorStore((s) => s.frame.fever);

/** Fever rounded to `steps` bands, so DOM chrome re-renders at a human rate. */
export const useFeverStep = (steps = 20): Fever =>
  useDirectorStore((s) => Math.round(s.frame.fever * steps) / steps);

/** Subscribe to spikes. Returns an unsubscribe. */
export function subscribeEvents(fn: (event: SpectacleEvent) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x);
