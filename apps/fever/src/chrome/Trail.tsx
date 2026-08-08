/**
 * The cursor trail. Yes, really.
 *
 * It is the most period-correct thing in the game and it would be unbearable
 * for a whole match, so it isn't on for a whole match: nothing renders at all
 * below the fever threshold, and the software only starts leaving a smear
 * behind your pointer once the position is genuinely hot. Escalation you can
 * feel in your hand.
 *
 * Positions are sampled at 12fps and rounded to whole pixels — the props'
 * framerate, not the void's — so the trail lags the pointer in visible steps
 * rather than sliding after it. Written straight to the DOM rather than through
 * state, because a React render per pointermove is a real cost for seven divs.
 */

import { useEffect, useRef } from "react";

const DOTS = 7;
const SAMPLE_MS = 1000 / 12;

export function Trail({ active }: { active: boolean }) {
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = box.current;
    if (!active || !el) return;
    const dots = Array.from(el.children) as HTMLElement[];
    const history: { x: number; y: number }[] = [];
    let last = 0;

    const move = (e: PointerEvent) => {
      const now = performance.now();
      if (now - last < SAMPLE_MS) return;
      last = now;
      history.unshift({ x: Math.round(e.clientX), y: Math.round(e.clientY) });
      history.length = Math.min(history.length, DOTS);
      dots.forEach((dot, i) => {
        const p = history[i];
        dot.style.display = p ? "block" : "none";
        if (p) {
          dot.style.left = `${p.x}px`;
          dot.style.top = `${p.y}px`;
        }
      });
    };

    window.addEventListener("pointermove", move);
    return () => window.removeEventListener("pointermove", move);
  }, [active]);

  if (!active) return null;

  return (
    <div className="trail" ref={box} aria-hidden>
      {Array.from({ length: DOTS }, (_, i) => (
        // Stepped, not faded: each dot has its own fixed opacity and there is
        // no transition between them.
        <i key={i} style={{ display: "none", opacity: 1 - i * 0.13 }} />
      ))}
    </div>
  );
}
