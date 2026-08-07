import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.js";
import { startMatchController } from "./match/controller.js";
import { useMatchStore } from "./match/store.js";
import { useDirectorStore } from "./director/store.js";
import "./app.css";

// The turn loop lives outside React on purpose — see controller.ts.
startMatchController();

// Dev hooks for the preview harness and scripted play (a full game vs Moss is
// driven through these from a headless browser).
if (import.meta.env.DEV) {
  (window as unknown as Record<string, unknown>).__fever = {
    matchStore: useMatchStore,
    directorStore: useDirectorStore,
  };
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
