/**
 * Match cues: the two sounds that belong to the *flow* of a game rather than
 * to anything you clicked or anything on the prop stage.
 *
 * A plain store subscription rather than a React effect, for the same reason
 * the turn loop is (`match/controller.ts`): this isn't rendering, and under
 * StrictMode an effect that fires a sound fires it twice.
 */

import { canHumanPlay, useMatchStore } from "../match/store.js";
import { playSpike } from "./index.js";

export function startAudioCues(): void {
  let generation = useMatchStore.getState().generation;
  let couldPlay = canHumanPlay(useMatchStore.getState());

  useMatchStore.subscribe((s) => {
    if (s.generation !== generation) {
      generation = s.generation;
      couldPlay = false;
      // Only a game somebody is playing gets announced. The menu rebuilds the
      // board every time you change the variant or the opponent, and a rally
      // sting for each of those turns the announcement into a click sound.
      if (s.live) playSpike("match-start");
      return;
    }
    const canPlay = canHumanPlay(s);
    // Control coming back to you, but not the opening move — the rally has
    // just announced itself and does not need to also tell you it's your turn.
    if (canPlay && !couldPlay && s.moves.length > 0) playSpike("turn-yours", 0.7);
    couldPlay = canPlay;
  });
}
