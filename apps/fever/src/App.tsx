/**
 * App shell: the 3D stage underneath, DOM chrome floating above. All game
 * logic lives in the match store and controller; this file only wires state
 * to the StageView's model.
 *
 * There is one canvas and it never unmounts — the menu, the roster and every
 * dialog float over the same live void, and changing screens is a state change
 * rather than a page. Rebuilding a WebGL context to show a menu would be the
 * most expensive thing the app does.
 */

import { useState } from "react";
import { playSpike } from "./audio/index.js";
import { canHumanPlay, humanPlayer, useMatchStore } from "./match/store.js";
import { useScrub } from "./review/store.js";
import { StageView, type StageModel } from "./stage/Stage.js";
import { Chrome } from "./chrome/Chrome.js";
import { useShellStore } from "./chrome/store.js";
import { DebugPanel } from "./debug/Panel.js";

export function App() {
  const s = useMatchStore();
  // Free on the dev server, and behind a long press on the wordmark everywhere
  // else — playtesting the fever curve on a phone means a real build.
  const debug = useShellStore((x) => x.debug);
  const screen = useShellStore((x) => x.screen);
  const [hoverCol, setHoverCol] = useState<number | null>(null);
  const myTurn = canHumanPlay(s);
  // The review pointing at a move winds the board back to it. `landed` matches
  // the shortened list exactly, so nothing re-drops: rewinding is not replaying,
  // and a disc falling every time you click a row in a list would be theater
  // about theater.
  const scrub = useScrub(s.generation);

  // The release slider arms on a finished, settled bot game on the match screen
  // — the state you're left in after closing the outcome window. Not online
  // (a rematch there is a fresh code, not a fresh board), and not while the
  // review has the board wound back to somewhere mid-game.
  const releaseReady =
    screen === "match" &&
    s.mode === "bot" &&
    s.match.status !== "playing" &&
    s.landed === s.moves.length &&
    s.moves.length > 0 &&
    !scrub;

  const model: StageModel = {
    variant: s.variant,
    moves: scrub ? s.moves.slice(0, scrub.ply) : s.moves,
    landed: scrub ? scrub.ply : s.landed,
    // Nothing is won in a position that hasn't been reached yet, so the win
    // blink is off while the board is wound back.
    winningCells: scrub ? [] : s.match.winningCells,
    marks: scrub?.marks,
    // Red opens, so the mover at ply n is red on even plies. The same parity
    // `placements` uses, and for the same reason: colour is never about who the
    // human is.
    markPlayer: scrub && scrub.ply % 2 === 0 ? "red" : "yellow",
    hoverCol: myTurn ? hoverCol : null,
    ghostPlayer: myTurn ? humanPlayer(s) : null,
    // A click on a full column is the software's fault as far as the software
    // is concerned, so it complains. Off-turn clicks stay silent — you already
    // know it isn't your turn, and a scolding every time the bot thinks is how
    // a sound gets muted for good.
    onColumn: (col) => {
      if (myTurn && !s.match.canPlay(col)) return playSpike("error-ding", 0.5);
      s.playColumn(col);
    },
    onHover: (col) => {
      if (col !== null && col !== hoverCol && myTurn) playSpike("column-hover", 0.5);
      setHoverCol(col);
    },
    onDiscLanded: s.discLanded,
    // The last chip out the bottom is what starts the next game — the bar is
    // the AGAIN button you can hold.
    release: releaseReady
      ? { ready: true, auto: s.releasePending, onDone: () => s.newGame() }
      : undefined,
  };

  return (
    <div className="shell">
      <div className="stage">
        {/* No key: a new game empties the move list, which unmounts any
            in-flight drop by itself. Remounting the Canvas would rebuild the
            whole WebGL context per rematch. */}
        <StageView model={model} />
      </div>
      <Chrome />
      {(import.meta.env.DEV || debug) && <DebugPanel />}
    </div>
  );
}
