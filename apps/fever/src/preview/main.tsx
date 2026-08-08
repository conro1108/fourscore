/**
 * The preview harness (`/preview.html` on the dev server). Renders every
 * named scene state side by side; `?state=<id>` renders one of them
 * fullscreen for screenshots. No store, no bot, no controller — states mount
 * the StageView directly, which is the whole reason StageView takes a model
 * instead of reading global state.
 */

import { StrictMode, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { Match } from "@fourscore/engine";
import { PROP_ACTS } from "../props/registry.js";
import { StageView, type StageModel } from "../stage/Stage.js";
import { PREVIEW_STATES, type PreviewCase } from "./states.js";
import "../app.css";

/**
 * Fever is pinned per scene, not globally: the grid shows the same board at
 * several temperatures at once, and one global would render three copies of
 * one of them. A state with no fever of its own sits at 0 here — the harness
 * never starts the Director, so there's nothing live to follow.
 */
function modelFor(c: PreviewCase, override: number | null): StageModel {
  const match = Match.fromMoves(c.moves, c.variant);
  return {
    variant: c.variant,
    moves: c.moves,
    landed: c.moves.length,
    winningCells: match.winningCells,
    hoverCol: c.hoverCol ?? null,
    ghostPlayer: c.ghostPlayer ?? null,
    pin: { fever: override ?? c.fever ?? 0, prop: c.prop },
  };
}

function PreviewApp() {
  const params = new URLSearchParams(window.location.search);
  const only = params.get("state");
  const feverParam = params.get("fever");
  const override = feverParam === null ? null : Number(feverParam);

  if (only) {
    const c = PREVIEW_STATES.find((s) => s.id === only);
    if (!c) return <pre style={{ color: "#e5dcf2" }}>unknown state: {only}</pre>;
    return (
      <div style={{ position: "fixed", inset: 0 }}>
        <StageView model={modelFor(c, override)} />
      </div>
    );
  }

  return (
    <div className="harness-grid" style={{ display: "flex", flexWrap: "wrap", gap: 16, padding: 16 }}>
      {PREVIEW_STATES.map((c) => (
        <Tile key={c.id} c={c} override={override} />
      ))}
    </div>
  );
}

/**
 * One grid cell, mounted only while it's near the viewport.
 *
 * Not an optimization — a correctness fix. Every StageView is its own WebGL
 * context and browsers hard-cap those at around sixteen; the roster took the
 * grid past the cap and Chrome started handing back null contexts, which
 * surfaces as `Cannot read properties of null (reading 'alpha')` and a page of
 * blank cards. Mounting on visibility keeps live contexts to what's on screen.
 */
function Tile({ c, override }: { c: PreviewCase; override: number | null }) {
  const box = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const io = new IntersectionObserver((entries) => setVisible(entries[0]!.isIntersecting), {
      rootMargin: "120px",
    });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const act = c.prop ? PROP_ACTS[c.prop.name] : undefined;

  return (
    <figure style={{ margin: 0 }}>
      <div ref={box} style={{ width: 470, height: 380, border: "1px solid #3a2b55" }}>
        {visible && <StageView model={modelFor(c, override)} />}
      </div>
      <figcaption
        style={{ fontFamily: "monospace", fontSize: 12, color: "#a99bc4", paddingTop: 6 }}
      >
        {c.id} — {c.caption}
        {/* The budget, in front of the thing it constrains. */}
        {act && ` · ${act.tris} tris`}
      </figcaption>
    </figure>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <PreviewApp />
  </StrictMode>,
);
