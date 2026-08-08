import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.js";
import { startMatchController } from "./match/controller.js";
import { useMatchStore } from "./match/store.js";
import { startEvalFeed, useEvalFeed } from "./director/feed.js";
import { startDirector } from "./director/runtime.js";
import { subscribeEvents, useDirectorStore } from "./director/store.js";
import { installAudio } from "./audio/index.js";
import "./app.css";

// Three loops, none of them React: the turn loop plays the game, the eval feed
// scores it, the Director turns that into spectacle. See each module's header
// for why none of them is an effect. Audio parks a gesture listener and builds
// nothing until the first pointerdown (autoplay law).
startMatchController();
startEvalFeed();
startDirector();
installAudio();

// Dev hooks for the preview harness and scripted play (a full game vs Moss is
// driven through these from a headless browser).
if (import.meta.env.DEV) {
  (window as unknown as Record<string, unknown>).__fever = {
    matchStore: useMatchStore,
    directorStore: useDirectorStore,
    evalFeed: useEvalFeed,
    subscribeEvents,
  };
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
