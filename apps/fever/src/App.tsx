/**
 * App shell: the 3D stage underneath, DOM chrome floating above. All game
 * logic lives in the match store and controller; this file only wires state
 * to the StageView's model.
 */

import { useState } from "react";
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
    onColumn: (col) => s.playColumn(col),
    onHover: setHoverCol,
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
