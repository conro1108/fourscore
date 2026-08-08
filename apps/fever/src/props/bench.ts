/**
 * The bench: play one named act, right now, because somebody asked for it.
 *
 * The game's only way into the prop stage is a `SpectacleEvent`, and `gags.ts`
 * turns that into a *weighted draw*. That is right for a lane screen and useless
 * for review — clicking "blunder" gets you the mascot, or the rocket, or the
 * callout, and reviewing the rocket means clicking until it turns up. So the
 * dev panel needs a channel that names the act instead of describing the moment.
 *
 * It lives here rather than on the Director's bus because the Director must not
 * know acts exist (`director/types.ts`): everything on that bus is a statement
 * about the game, and "play the mower" is a statement about the software.
 *
 * It also bypasses the stage's pacing — the quiet gap, the one-act limit, the
 * berth veto. Those rules are about how a game feels over minutes; a person who
 * clicked a button wants the act, not a dropped trigger.
 */

const listeners = new Set<(name: string) => void>();

/** Ask the prop stage to play this act. No-op if nothing is listening. */
export function requestAct(name: string): void {
  for (const fn of listeners) fn(name);
}

/** Subscribe to bench requests. Returns an unsubscribe. */
export function subscribeActRequests(fn: (name: string) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
