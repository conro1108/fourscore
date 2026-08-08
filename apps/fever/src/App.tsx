/**
 * App shell: the 3D stage underneath, DOM chrome floating above. All game
 * logic lives in the match store and controller; this file only wires state
 * to the StageView's model.
 */

import { useState } from "react";
import { playSpike } from "./audio/index.js";
import { canHumanPlay, humanPlayer, useMatchStore } from "./match/store.js";
import { StageView, type StageModel } from "./stage/Stage.js";
import { Hud } from "./chrome/Hud.js";
import { DebugPanel } from "./debug/Panel.js";

export function App() {
  const s = useMatchStore();
  const [hoverCol, setHoverCol] = useState<number | null>(null);
  const myTurn = canHumanPlay(s);

  const model: StageModel = {
    variant: s.variant,
    moves: s.moves,
    landed: s.landed,
    winningCells: s.match.winningCells,
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
  };

  return (
    <div className="shell">
      <div className="stage">
        {/* No key: a new game empties the move list, which unmounts any
            in-flight drop by itself. Remounting the Canvas would rebuild the
            whole WebGL context per rematch. */}
        <StageView model={model} />
      </div>
      <Hud />
      {import.meta.env.DEV && <DebugPanel />}
    </div>
  );
}
