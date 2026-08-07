/**
 * The preview harness (`/preview.html` on the dev server). Renders every
 * named scene state side by side; `?state=<id>` renders one of them
 * fullscreen for screenshots. No store, no bot, no controller — states mount
 * the StageView directly, which is the whole reason StageView takes a model
 * instead of reading global state.
 */

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Match } from "@fourscore/engine";
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
    fever: override ?? c.fever ?? 0,
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
    <div style={{ display: "flex", flexWrap: "wrap", gap: 16, padding: 16 }}>
      {PREVIEW_STATES.map((c) => (
        <figure key={c.id} style={{ margin: 0 }}>
          <div style={{ width: 470, height: 380, border: "1px solid #3a2b55" }}>
            <StageView model={modelFor(c, override)} />
          </div>
          <figcaption
            style={{ fontFamily: "monospace", fontSize: 12, color: "#a99bc4", paddingTop: 6 }}
          >
            {c.id} — {c.caption}
          </figcaption>
        </figure>
      ))}
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <PreviewApp />
  </StrictMode>,
);
