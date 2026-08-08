/**
 * A canvas of the icon's fire, sized to whatever it's put inside.
 *
 * Integer upscale only: the art is drawn at `1 / FLAME_SCALE` of the box and
 * blown up with `image-rendering: pixelated`, so the canvas is always a whole
 * number of art pixels and each one is a whole number of screen pixels. A
 * fractional scale here would soften every edge in the fire, which is the one
 * thing the cheap budget can't survive.
 *
 * The redraw is stepped at 12fps and skipped entirely when the fire is out, so
 * the menu costs nothing while nobody is looking at it.
 */

import { useEffect, useRef } from "react";
import { FLAME_SCALE, drawFlames } from "./fire.js";

const FPS = 12;

export function Flames({ heat = 1, className }: { heat?: number; className?: string }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  // The loop reads the current heat without being restarted by it, so a fever
  // that moves every tick doesn't tear down a rAF sixty times a second.
  const level = useRef(heat);
  level.current = heat;

  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    const ctx = el.getContext("2d");
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;

    let raf = 0;
    let frame = -1;
    let art = { w: 0, h: 0 };

    // Resize to the box, in whole art pixels. Resizing a canvas resets its 2D
    // context, so the smoothing flag has to go back off afterwards.
    const fit = () => {
      const w = Math.max(1, Math.round(el.clientWidth / FLAME_SCALE));
      const h = Math.max(1, Math.round(el.clientHeight / FLAME_SCALE));
      if (w === art.w && h === art.h) return false;
      art = { w, h };
      el.width = w;
      el.height = h;
      ctx.imageSmoothingEnabled = false;
      return true;
    };

    const loop = () => {
      raf = requestAnimationFrame(loop);
      const next = Math.floor((performance.now() / 1000) * FPS);
      const resized = fit();
      if (next === frame && !resized) return;
      frame = next;
      drawFlames(ctx, art.w, art.h, frame, level.current);
    };

    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  return <canvas className={`flames ${className ?? ""}`} ref={canvas} aria-hidden />;
}
