/**
 * The wordmark, and the back door behind it.
 *
 * Holding it for two-thirds of a second toggles the Director panel — the only
 * way to reach the fever slider and the event buttons in a build that wasn't
 * served by Vite, which is every build you'd actually play on a phone. A long
 * press rather than a tap because the wordmark is a big target sitting where
 * the eye lands, and nothing should happen to a player who rests a thumb there.
 *
 * The press cancels if the finger travels: a drag that starts on the wordmark
 * is still a drag of the board behind it.
 */

import { useCallback, useRef } from "react";
import { useShellStore } from "./store.js";
import { COPY } from "./copy.js";

const HOLD_MS = 650;
const SLOP_PX = 10;

export function Wordmark({ small = false }: { small?: boolean }) {
  const toggleDebug = useShellStore((s) => s.toggleDebug);
  const timer = useRef<number | null>(null);
  const from = useRef({ x: 0, y: 0 });

  const cancel = useCallback(() => {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
  }, []);

  return (
    <div
      className={`wordmark ${small ? "wordmark--small" : ""}`}
      data-text={COPY.title}
      onPointerDown={(e) => {
        from.current = { x: e.clientX, y: e.clientY };
        cancel();
        timer.current = window.setTimeout(toggleDebug, HOLD_MS);
      }}
      onPointerMove={(e) => {
        if (Math.hypot(e.clientX - from.current.x, e.clientY - from.current.y) > SLOP_PX) cancel();
      }}
      onPointerUp={cancel}
      onPointerCancel={cancel}
      onPointerLeave={cancel}
      // A long press on a phone otherwise raises the text-selection loupe.
      onContextMenu={(e) => e.preventDefault()}
    >
      {COPY.title}
    </div>
  );
}
