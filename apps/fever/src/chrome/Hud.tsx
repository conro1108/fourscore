/**
 * Phase-0 chrome: functional, minimal, and already period-flavored — a gray
 * system dialog floating over the void is pillar 3 meeting pillar 1. Phase 6
 * rebuilds all of this properly and gives every string its copy pass; nothing
 * here is precedent beyond "the chrome is DOM, layered over the canvas".
 */

import { CONNECT4, CONNECT5 } from "@fourscore/engine";
import { botPlayer, humanPlayer, useMatchStore } from "../match/store.js";

export function Hud() {
  const s = useMatchStore();
  const human = humanPlayer(s);
  const over = s.match.status !== "playing";
  const settled = s.landed === s.moves.length;
  const showOutcome = over && settled;

  const status = over
    ? ""
    : s.match.turn === human && settled && !s.thinking
      ? "YOUR MOVE."
      : "MOSS IS THINKING.";

  const outcome =
    s.match.status === "draw"
      ? "A DRAW. NOBODY IS PLEASED."
      : s.match.winner === human
        ? "YOU WIN."
        : "MOSS WINS.";

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
            <span>FOURSCORE.EXE</span>
            <span className="dialog-x">×</span>
          </div>
          <div className="dialog-body">
            <p>{outcome}</p>
            <div className="dialog-buttons">
              <button className="btn btn--dialog" onClick={() => s.newGame()}>
                Rematch
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
