/**
 * Dev-only panel. The fever slider is phase 0's whole obligation to the
 * Director: it writes a real value into the real store that real subsystems
 * will subscribe to — it just drives nothing yet. The event buttons only log;
 * phase 1 makes them fire actual `SpectacleEvent`s so every gag can be
 * reviewed against the panel before a live game ever drives it.
 */

import { useEffect, useState } from "react";
import { useDirectorStore } from "../director/store.js";
import { EVENT_KINDS } from "../director/types.js";
import { useDebugStore } from "./store.js";

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
  const fever = useDirectorStore((s) => s.frame.fever);
  const setFever = useDirectorStore((s) => s.setFever);
  const postEnabled = useDebugStore((s) => s.postEnabled);
  const setPostEnabled = useDebugStore((s) => s.setPostEnabled);
  const [open, setOpen] = useState(true);
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
      <label className="debug-row">
        <input
          type="checkbox"
          checked={postEnabled}
          onChange={(e) => setPostEnabled(e.target.checked)}
        />
        post stack
      </label>
      <div className="debug-row debug-events">
        {EVENT_KINDS.map((kind) => (
          <button key={kind} onClick={() => console.log(`[debug] fire event: ${kind}`)}>
            {kind}
          </button>
        ))}
      </div>
    </div>
  );
}
