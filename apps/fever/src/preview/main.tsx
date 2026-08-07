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
import { useDirectorStore } from "../director/store.js";
import { StageView, type StageModel } from "../stage/Stage.js";
import { PREVIEW_STATES, type PreviewCase } from "./states.js";
import "../app.css";

function modelFor(c: PreviewCase): StageModel {
  const match = Match.fromMoves(c.moves, c.variant);
  return {
    variant: c.variant,
    moves: c.moves,
    landed: c.moves.length,
    winningCells: match.winningCells,
    hoverCol: c.hoverCol ?? null,
    ghostPlayer: c.ghostPlayer ?? null,
  };
}

function PreviewApp() {
  const params = new URLSearchParams(window.location.search);
  const only = params.get("state");
  const fever = params.get("fever");
  if (fever !== null) useDirectorStore.getState().setFever(Number(fever));

  if (only) {
    const c = PREVIEW_STATES.find((s) => s.id === only);
    if (!c) return <pre style={{ color: "#e5dcf2" }}>unknown state: {only}</pre>;
    if (c.fever !== undefined && fever === null) {
      useDirectorStore.getState().setFever(c.fever);
    }
    return (
      <div style={{ position: "fixed", inset: 0 }}>
        <StageView model={modelFor(c)} />
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 16, padding: 16 }}>
      {PREVIEW_STATES.map((c) => (
        <figure key={c.id} style={{ margin: 0 }}>
          <div style={{ width: 470, height: 380, border: "1px solid #3a2b55" }}>
            <StageView model={modelFor(c)} />
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
