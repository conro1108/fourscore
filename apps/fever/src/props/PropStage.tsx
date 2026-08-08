/**
 * The prop stage: the one place spectacle events become acts on the 3D stage.
 *
 * Two policies, and they differ by where the game is (`StageMode`):
 *
 * - **In a match, one act at a time.** Two trucks is not twice as funny, and a
 *   spike only reads as a spike against a quiet stage. A trigger that arrives
 *   mid-act is dropped, not queued: by the time the stage is free the moment it
 *   reacted to is gone.
 * - **On the menu, two.** The attract loop has no spikes to protect — the props
 *   *are* the content there (VISION.md: a lane screen is never blank), so acts
 *   overlap and the gap between them is short. One act per berth still holds,
 *   which is what keeps two of them out of the same corner.
 *
 * The one thing both share is the ending. `win` and `draw` preempt whatever is
 * running, because the alternative is a sprinkler quietly finishing its
 * watering while the game is over — the detonation is the biggest thing in the
 * game and it does not wait its turn.
 *
 * What each act is allowed to claim is decided in `director/types.ts` and
 * enforced in `gags.ts` by which pool it sits in: only `win`/`draw` may draw an
 * act that declares a result, because only those two events are facts.
 * Everything else on the bus is this engine's estimate.
 *
 * In a pinned scene (preview harness) the event bus is ignored entirely and
 * the pinned act renders frozen at its pinned phase — that's how the thesis
 * frame holds a truck mid-air for a screenshot.
 */

import { useEffect, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import { useBotSource, usePinnedProp } from "../director/scope.js";
import { directorFrame, subscribeEvents } from "../director/store.js";
import type { SpectacleEvent } from "../director/types.js";
import { playSpike } from "../audio/index.js";
import { stageFx } from "../stage/fx.js";
import type { StageLayout } from "../stage/layout.js";
import { pickGag } from "./gags.js";
import { PROP_ACTS, type PropAct } from "./registry.js";

/** The two events that are facts, and the two acts that may interrupt. */
const preempts = (event: SpectacleEvent): boolean =>
  event.kind === "win" || event.kind === "draw";

/**
 * Quiet stage between acts, and how many may run at once.
 *
 * In a match the gap is what stops the roster saturating: a real game fires a
 * `move` event every couple of seconds, acts run 1.5–4 seconds, and "drop the
 * trigger if the stage is busy" alone leaves a prop on screen nearly always —
 * at which point the props stop being spikes and become scenery. Spectacle
 * needs the gaps as much as the gags. On the menu scenery is the point, so the
 * gap is barely there.
 */
const STAGE = {
  match: { quietMs: 1600, maxActs: 1 },
  // No gap at all on the menu. A gap here doesn't pace anything, it just eats
  // the next beat: the Director's idle beats arrive on a fixed cadence, so a
  // quiet window that happens to straddle one drops that act entirely and the
  // stage sits empty for two more seconds.
  attract: { quietMs: 0, maxActs: 2 },
} as const;

interface Running {
  act: PropAct;
  startedAt: number;
}

export function PropStage({ layout }: { layout: StageLayout }) {
  const pinned = usePinnedProp();
  const botOf = useBotSource();
  const [running, setRunning] = useState<readonly Running[]>([]);
  /**
   * The same list as a ref, and the only thing the event handler reads.
   *
   * Admitting an act depends on what is on stage *now*, and events can arrive
   * several to a tick. A `setRunning` updater would see the right list but is
   * the wrong place to fire a sound from — StrictMode calls updaters twice and
   * the spike would double — so the decision happens out here against the ref
   * and state is written once, at the end.
   */
  const live = useRef<readonly Running[]>([]);
  const freeAt = useRef(0);
  /** What played last, so the picker can avoid an immediate repeat. */
  const previous = useRef<string | undefined>(undefined);

  const commit = (next: readonly Running[]) => {
    live.current = next;
    setRunning(next);
  };

  useEffect(() => {
    if (pinned) return;
    return subscribeEvents((event) => {
      const now = performance.now();
      const forced = preempts(event);
      const current = live.current;
      const rules = STAGE[directorFrame().mode];
      if (!forced && (now < freeAt.current || current.length >= rules.maxActs)) return;

      const busy = new Set(current.map((r) => r.act.berth));
      const name = pickGag(event, Math.random, {
        avoid: previous.current,
        eligible: (act) => forced || !busy.has(act.berth),
        // Read at draw time, not at subscribe time: the opponent changes on
        // the menu while this subscription is alive, and the very next attract
        // beat should already be theirs.
        bot: botOf(),
      });
      const act = name ? PROP_ACTS[name] : undefined;
      if (!act) return;

      previous.current = act.name;
      stageFx.lastAct = act.name;
      playSpike(act.spike);
      commit(forced ? [{ act, startedAt: now }] : [...current, { act, startedAt: now }]);
    });
  }, [pinned, botOf]);

  // Retire acts after their exit; polled here because this is the component
  // that owns act lifetime, and it's already inside the render loop.
  useFrame(() => {
    if (live.current.length === 0) return;
    const now = performance.now();
    const still = live.current.filter((r) => now - r.startedAt < r.act.durationMs);
    if (still.length === live.current.length) return;
    freeAt.current = now + STAGE[directorFrame().mode].quietMs;
    commit(still);
  });

  if (pinned) {
    return (
      <>
        {(Array.isArray(pinned) ? pinned : [pinned]).map(({ name, phase }) => {
          const act = PROP_ACTS[name];
          return act ? (
            <act.Component key={name} layout={layout} phase={() => phase} />
          ) : null;
        })}
      </>
    );
  }

  return (
    <>
      {running.map(({ act, startedAt }) => (
        <act.Component
          key={`${act.name}:${startedAt}`}
          layout={layout}
          phase={() => Math.min(1, (performance.now() - startedAt) / act.durationMs)}
        />
      ))}
    </>
  );
}
