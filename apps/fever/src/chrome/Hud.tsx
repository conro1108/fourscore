/**
 * Phase-0 chrome: functional, minimal, and already period-flavored — a gray
 * system dialog floating over the void is pillar 3 meeting pillar 1. Phase 6
 * rebuilds all of this properly and gives every string its copy pass; nothing
 * here is precedent beyond "the chrome is DOM, layered over the canvas".
 */

import { useState } from "react";
import { CONNECT4, CONNECT5 } from "@fourscore/engine";
import { botPlayer, humanPlayer, useMatchStore } from "../match/store.js";

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
          {[CONNECT4, CONNECT5].map((v) => (
            <button
              key={v.id}
              className={`btn ${s.variant.id === v.id ? "btn--on" : ""}`}
              onClick={() => s.newGame({ variant: v })}
            >
              {v.name}
            </button>
          ))}
          <button className="btn" onClick={() => s.newGame()}>
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
              onClick={() => setDismissedGen(s.generation)}
            >
              ×
            </button>
          </div>
          <div className="dialog-body">
            <p>{outcome}</p>
            <div className="dialog-buttons">
              <button className="btn btn--dialog" onClick={() => s.newGame()}>
                AGAIN.
              </button>
              <button
                className="btn btn--dialog"
                onClick={() => s.newGame({ humanFirst: !s.humanFirst })}
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
