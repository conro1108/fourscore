/**
 * The prop stage: the one place spectacle events become acts on the 3D stage.
 *
 * One act at a time, by design — two trucks is not twice as funny, and the
 * taste law wants every act reviewable in isolation. A trigger that arrives
 * mid-act is dropped, not queued: by the time the stage is free the moment
 * it reacted to is gone.
 *
 * The one exception is the ending. `win` and `draw` preempt whatever is
 * running, because the alternative is a sprinkler quietly finishing its
 * watering while the game is over — the detonation is the biggest thing in the
 * game and it does not wait its turn.
 *
 * What each act is allowed to claim is decided in `director/types.ts` and
 * enforced here by which event it hangs off: only `win`/`draw` gags may assert
 * a result, because only those two events are facts. Everything else on the
 * bus is this engine's estimate.
 *
 * In a pinned scene (preview harness) the event bus is ignored entirely and
 * the pinned act renders frozen at its pinned phase — that's how the thesis
 * frame holds a truck mid-air for a screenshot.
 */

import { useEffect, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import { usePinnedProp } from "../director/scope.js";
import { subscribeEvents } from "../director/store.js";
import type { SpectacleEvent } from "../director/types.js";
import { playSpike } from "../audio/index.js";
import type { StageLayout } from "../stage/layout.js";
import { PROP_ACTS, type PropAct } from "./registry.js";

/**
 * The gag roster: every `SpectacleEvent` kind has at least one act, and a
 * `fine` move has none — most moves are ordinary, and a game where every move
 * summons a vehicle has no spikes left for the moves that matter.
 */
export function gagFor(event: SpectacleEvent): string | null {
  switch (event.kind) {
    case "move":
      return event.quality === "brilliant"
        ? "truck-lap"
        : event.quality === "blunder"
          ? "rocket-fizzle"
          : event.quality === "dubious"
            ? "sign-hmm"
            : null;
    case "threat":
      return "beacon-drop";
    case "tension-shift":
      return event.direction === "rising" ? "banner-rising" : "banner-collapsing";
    case "win":
      return "win-detonation";
    case "draw":
      return "banner-draw";
    case "idle-beat":
      return "sprinkler";
  }
}

/** The two events that are facts, and the two acts that may interrupt. */
const preempts = (event: SpectacleEvent): boolean =>
  event.kind === "win" || event.kind === "draw";

/**
 * Quiet stage between acts. Without it the roster saturates: a real game fires
 * a `move` event every couple of seconds, acts run 1.5–4 seconds, and "drop the
 * trigger if the stage is busy" alone leaves a prop on screen nearly always —
 * at which point the props stop being spikes and become scenery. Spectacle
 * needs the gaps as much as the gags.
 */
const STAGE_QUIET_MS = 1600;

interface Running {
  act: PropAct;
  startedAt: number;
}

export function PropStage({ layout }: { layout: StageLayout }) {
  const pinned = usePinnedProp();
  const [running, setRunning] = useState<Running | null>(null);
  const freeAt = useRef(0);

  useEffect(() => {
    if (pinned) return;
    return subscribeEvents((event) => {
      const name = gagFor(event);
      if (!name) return;
      const act = PROP_ACTS[name];
      if (!act) return;
      const now = performance.now();
      if (now < freeAt.current && !preempts(event)) return;
      setRunning((current) => {
        if (current && !preempts(event)) return current;
        playSpike(act.spike);
        return { act, startedAt: now };
      });
    });
  }, [pinned]);

  // Retire the act after its exit; polled here because this is the component
  // that owns act lifetime, and it's already inside the render loop.
  useFrame(() => {
    if (running && performance.now() - running.startedAt >= running.act.durationMs) {
      freeAt.current = performance.now() + STAGE_QUIET_MS;
      setRunning(null);
    }
  });

  if (pinned) {
    const act = PROP_ACTS[pinned.name];
    if (!act) return null;
    const phase = pinned.phase;
    return <act.Component layout={layout} phase={() => phase} />;
  }

  if (!running) return null;
  const { act, startedAt } = running;
  return (
    <act.Component
      key={`${act.name}:${startedAt}`}
      layout={layout}
      phase={() => Math.min(1, (performance.now() - startedAt) / act.durationMs)}
    />
  );
}
