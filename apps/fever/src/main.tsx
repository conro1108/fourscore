import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.js";
import { startMatchController } from "./match/controller.js";
import { useMatchStore } from "./match/store.js";
import { startEvalFeed, useEvalFeed } from "./director/feed.js";
import { startDirector } from "./director/runtime.js";
import { subscribeEvents, useDirectorStore } from "./director/store.js";
import { useShellStore } from "./chrome/store.js";
import { joinMatch, openLobby, startOnline } from "./online/runtime.js";
import { pendingJoin } from "./online/session.js";
import { useOnlineStore } from "./online/store.js";
import { supabase } from "./online/supabase.js";
import { stageFx } from "./stage/fx.js";
import { bedLoops, installAudio, masterLevel, playSpike, rigState } from "./audio/index.js";
import { startAudioCues } from "./audio/cues.js";
import { SOUND_NAMES, soundBuffer } from "./audio/library.js";
import "./app.css";

// Five loops, none of them React: the turn loop plays the game, the eval feed
// scores it, the Director turns that into spectacle, the audio cues watch the
// flow of a match for the two sounds that aren't spikes and aren't clicks, and
// the online runtime watches for a finished wire game to report. See each
// module's header for why none of them is an effect. Audio parks a gesture
// listener and builds nothing until the first pointerdown (autoplay law), and
// online signs nobody in until the lobby is opened.
startMatchController();
startEvalFeed();
startDirector();
installAudio();
startAudioCues();
startOnline();

// An invite link. Opening one *is* the request to join, so it goes straight
// through the lobby rather than landing you on it, and the code is taken out of
// the URL — a reload would otherwise try to join a match you're already in.
const invite = pendingJoin(location.search);
if (invite) {
  history.replaceState(null, "", location.pathname);
  void openLobby().then(() => joinMatch(invite));
}

// Dev hooks for the preview harness and scripted play (a full game vs Moss is
// driven through these from a headless browser).
if (import.meta.env.DEV) {
  (window as unknown as Record<string, unknown>).__fever = {
    matchStore: useMatchStore,
    directorStore: useDirectorStore,
    evalFeed: useEvalFeed,
    subscribeEvents,
    shellStore: useShellStore,
    // Two browsers playing each other is the one thing in the game no unit
    // test and no screenshot can see; `tools/online.mjs` drives both through
    // here (and through the real lobby buttons).
    onlineStore: useOnlineStore,
    // The row is the one piece of online state the app doesn't render, so the
    // only way to check it was written is to ask the database.
    supabase,
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
