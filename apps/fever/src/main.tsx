import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.js";
import { startMatchController } from "./match/controller.js";
import { useMatchStore } from "./match/store.js";
import { startEvalFeed, useEvalFeed } from "./director/feed.js";
import { startDirector } from "./director/runtime.js";
import { subscribeEvents, useDirectorStore } from "./director/store.js";
import { useShellStore } from "./chrome/store.js";
import { stageFx } from "./stage/fx.js";
import { bedLoops, installAudio, masterLevel, playSpike, rigState } from "./audio/index.js";
import { startAudioCues } from "./audio/cues.js";
import { SOUND_NAMES, soundBuffer } from "./audio/library.js";
import "./app.css";

// Four loops, none of them React: the turn loop plays the game, the eval feed
// scores it, the Director turns that into spectacle, and the audio cues watch
// the flow of a match for the two sounds that aren't spikes and aren't clicks.
// See each module's header for why none of them is an effect. Audio parks a
// gesture listener and builds nothing until the first pointerdown (autoplay
// law).
startMatchController();
startEvalFeed();
startDirector();
installAudio();
startAudioCues();

// Dev hooks for the preview harness and scripted play (a full game vs Moss is
// driven through these from a headless browser).
if (import.meta.env.DEV) {
  (window as unknown as Record<string, unknown>).__fever = {
    matchStore: useMatchStore,
    directorStore: useDirectorStore,
    evalFeed: useEvalFeed,
    subscribeEvents,
    shellStore: useShellStore,
    // Which gag the prop stage actually drew. `tools/live-bots.mjs` asks after
    // firing an opponent's own event, because whether the signature reaches
    // the stage depends on the live Director and nothing else can see that.
    stageFx,
    // Audio can't be screenshotted, so `tools/audio-check.mjs` renders every
    // recipe through here instead and writes the results out as wavs.
    audio: { names: SOUND_NAMES, soundBuffer, playSpike, rigState, masterLevel, bedLoops },
  };
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
