/**
 * The prop stage: the one place spectacle events become acts on the 3D stage.
 *
 * One act at a time, by design — two trucks is not twice as funny, and the
 * taste law wants every act reviewable in isolation. A trigger that arrives
 * mid-act is dropped, not queued: by the time the stage is free the moment
 * it reacted to is gone.
 *
 * Phase 2 wires the one exemplar trigger (a brilliant move sends the truck).
 * Phase 3 owns the full event → gag mapping and extends the table here; per
 * `director/types.ts`, only `win`/`draw` gags may assert a result.
 *
 * In a pinned scene (preview harness) the event bus is ignored entirely and
 * the pinned act renders frozen at its pinned phase — that's how the thesis
 * frame holds a truck mid-air for a screenshot.
 */

import { useEffect, useState } from "react";
import { useFrame } from "@react-three/fiber";
import { usePinnedProp } from "../director/scope.js";
import { subscribeEvents } from "../director/store.js";
import { playSpike } from "../audio/index.js";
import type { StageLayout } from "../stage/layout.js";
import { PROP_ACTS, type PropAct } from "./registry.js";

interface Running {
  act: PropAct;
  startedAt: number;
}

export function PropStage({ layout }: { layout: StageLayout }) {
  const pinned = usePinnedProp();
  const [running, setRunning] = useState<Running | null>(null);

  useEffect(() => {
    if (pinned) return;
    return subscribeEvents((event) => {
      if (event.kind === "move" && event.quality === "brilliant") {
        setRunning((current) => {
          if (current) return current;
          playSpike("spike-truck");
          return { act: PROP_ACTS["truck-lap"]!, startedAt: performance.now() };
        });
      }
    });
  }, [pinned]);

  // Retire the act after its exit; polled here because this is the component
  // that owns act lifetime, and it's already inside the render loop.
  useFrame(() => {
    if (running && performance.now() - running.startedAt >= running.act.durationMs) {
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
      layout={layout}
      phase={() => Math.min(1, (performance.now() - startedAt) / act.durationMs)}
    />
  );
}
