/**
 * Phase-0 chrome: functional, minimal, and already period-flavored — a gray
 * system dialog floating over the void is pillar 3 meeting pillar 1. Phase 6
 * rebuilds all of this properly and gives every string its copy pass; nothing
 * here is precedent beyond "the chrome is DOM, layered over the canvas".
 */

import { useEffect, useState } from "react";
import { CONNECT4, CONNECT5 } from "@fourscore/engine";
import { playSpike } from "../audio/index.js";
import { botPlayer, humanPlayer, useMatchStore } from "../match/store.js";
import { useSettingsStore } from "../settings/store.js";

/**
 * The audio control, in the two states VISION.md's voice sample names. It
 * shows what the game currently *is* — NOISE while it's making some — rather
 * than what the button does, which is how a period toggle behaved and is also
 * funnier.
 *
 * Turning it off gets a switch clunk and then a fast fade rather than a hard
 * cut; turning it on gets the same switch. The volume slider ticks as it
 * moves, because a volume control you can't hear is a guess.
 */
function AudioControl() {
  const muted = useSettingsStore((s) => s.muted);
  const volume = useSettingsStore((s) => s.volume);
  const setMuted = useSettingsStore((s) => s.setMuted);
  const setVolume = useSettingsStore((s) => s.setVolume);

  return (
    <>
      <button
        className={`btn ${muted ? "" : "btn--on"}`}
        onClick={() => {
          playSpike(muted ? "toggle-on" : "toggle-off");
          setMuted(!muted);
        }}
      >
        {muted ? "SILENCE" : "NOISE"}
      </button>
      <input
        className="vol"
        type="range"
        min={0}
        max={1}
        step={0.02}
        value={volume}
        aria-label="volume"
        disabled={muted}
        onChange={(e) => {
          setVolume(Number(e.target.value));
          playSpike("column-hover", 0.7);
        }}
      />
    </>
  );
}

const outcomeFor = (draw: boolean, won: boolean) =>
  draw
    ? "A DRAW. NOBODY IS PLEASED."
    : won
      ? "YOU WIN. THE CROWD IS REAL."
      : "MOSS WINS. MOSS DOES NOT CELEBRATE.";

export function Hud() {
  const s = useMatchStore();
  const human = humanPlayer(s);
  const over = s.match.status !== "playing";
  const settled = s.landed === s.moves.length;

  // Closing the dialog leaves you on the finished board — the win still lit, the
  // last disc where it landed — and nothing else happens until you start a game.
  // That's the point of the X: look at the position without a box over it.
  // Storing which game was dismissed rather than a bool means a new game brings
  // the dialog back without anything having to remember to reset it.
  const [dismissedGen, setDismissedGen] = useState(-1);
  const dismissed = dismissedGen === s.generation;
  const showOutcome = over && settled && !dismissed;

  const outcome = outcomeFor(s.match.status === "draw", s.match.winner === human);

  // The dialog announces itself. Losing opens with the system error sound
  // instead of the window sound — this software considers your defeat a fault
  // condition, and says so without saying anything.
  const lost = over && s.match.status !== "draw" && s.match.winner !== human;
  useEffect(() => {
    if (showOutcome) playSpike(lost ? "error-ding" : "dialog-open", 0.8);
  }, [showOutcome, lost]);

  // Strings from the phase-2 voice sample (VISION.md, "The voice"). Phase 6
  // owns the full chrome pass; these are here so the register ships.
  const status = over
    ? // Once the dialog is closed the outcome moves down here, so the board
      // you're left sitting on still says how it ended.
      dismissed && settled
      ? outcome
      : ""
    : s.match.turn === human && settled && !s.thinking
      ? "YOUR MOVE."
      : "MOSS IS THINKING ABOUT DIRT.";

  return (
    <div className="hud">
      <header className="hud-top">
        <div className="wordmark">FOURSCORE</div>
        <div className="hud-controls">
          <AudioControl />
          {[CONNECT4, CONNECT5].map((v) => (
            <button
              key={v.id}
              className={`btn ${s.variant.id === v.id ? "btn--on" : ""}`}
              onClick={() => {
                playSpike("ui-click");
                s.newGame({ variant: v });
              }}
            >
              {v.name}
            </button>
          ))}
          <button
            className="btn"
            onClick={() => {
              playSpike("ui-click");
              s.newGame();
            }}
          >
            New game
          </button>
        </div>
      </header>

      {status && <div className="status">{status}</div>}

      {showOutcome && (
        <div className="dialog" role="dialog" aria-label="game over">
          <div className="dialog-title">
            <span>FOURSCORE.EXE — not responding (it is)</span>
            <button
              type="button"
              className="dialog-x"
              aria-label="Close"
              onClick={() => {
                playSpike("dialog-close", 0.8);
                setDismissedGen(s.generation);
              }}
            >
              ×
            </button>
          </div>
          <div className="dialog-body">
            <p>{outcome}</p>
            <div className="dialog-buttons">
              <button
                className="btn btn--dialog"
                onClick={() => {
                  playSpike("ui-click");
                  s.newGame();
                }}
              >
                AGAIN.
              </button>
              <button
                className="btn btn--dialog"
                onClick={() => {
                  playSpike("ui-click");
                  s.newGame({ humanFirst: !s.humanFirst });
                }}
              >
                Rematch, {botPlayer(s) === "yellow" ? "Moss starts" : "you start"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
