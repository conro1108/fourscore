/**
 * The Director's drive shaft: reads the world once per frame, hands it to the
 * pure `advance`, publishes the result.
 *
 * All the impurity the Director isn't allowed to have lives here — the clock,
 * the stores, the DOM. Kept deliberately thin: if something is hard to test,
 * the fix is to move it into `director.ts` and give it a `dt`, not to test the
 * loop.
 *
 * A plain module again, started from the app entry. The preview harness never
 * starts it, which is what leaves the debug slider in sole control there.
 */

import { Position, popcount, type Player } from "@fourscore/engine";
import { useShellStore } from "../chrome/store.js";
import { useMatchStore } from "../match/store.js";
import { advance, initialDirectorState, type DirectorInput } from "./director.js";
import { evalPoints } from "./feed.js";
import { useDirectorStore } from "./store.js";

/**
 * A tab that was backgrounded comes back with an enormous gap. Left alone that
 * teleports fever and fires every debounced event at once — the game would
 * appear to have had a seizure while you were reading email.
 */
const MAX_STEP_MS = 100;

let state = initialDirectorState(0);
let raf = 0;
let previous = 0;

/**
 * Threats need a `Position`, which means rebuilding the board. Once per move
 * rather than once per frame: the move list is the only thing that changes it.
 */
let threatCache: { key: string; threats: Record<Player, number> } | null = null;

function immediateThreats(): Record<Player, number> {
  const s = useMatchStore.getState();
  const key = `${s.generation}:${s.moves.length}`;
  if (threatCache?.key === key) return threatCache.threats;

  let threats: Record<Player, number> = { red: 0, yellow: 0 };
  if (s.match.status === "playing") {
    const p = Position.fromMoves(s.moves, s.variant);
    const playable = p.possibleMoves();
    const mover = p.turn;
    const other: Player = mover === "red" ? "yellow" : "red";
    threats = {
      ...threats,
      [mover]: popcount(p.winningPositions() & playable),
      [other]: popcount(p.opponentWinningPositions() & playable),
    };
  }
  threatCache = { key, threats };
  return threats;
}

function readWorld(): DirectorInput {
  const s = useMatchStore.getState();
  return {
    // Anywhere that isn't the match screen is the attract loop, roster
    // included: the board is scenery there and the props are the show.
    mode: useShellStore.getState().screen === "match" ? "match" : "attract",
    generation: s.generation,
    moves: s.moves,
    points: evalPoints(),
    status: s.match.status,
    winner: s.match.winner,
    winningLine: s.match.winningCells.map((c) => c.row * s.variant.width + c.col),
    immediateThreats: immediateThreats(),
    cells: s.variant.cells,
  };
}

/**
 * The DOM's copy of fever, so stylesheets can escalate with everything else.
 * Quantized to a hundredth: writing a custom property invalidates style on the
 * whole document, and nobody can see the difference between 0.412 and 0.418.
 */
let publishedProperty = -1;

function writeFeverProperty(fever: number): void {
  const quantized = Math.round(fever * 100) / 100;
  if (quantized === publishedProperty) return;
  publishedProperty = quantized;
  document.documentElement.style.setProperty("--fever", quantized.toFixed(2));
}

function tick(now: number): void {
  const dt = previous === 0 ? 16 : Math.min(MAX_STEP_MS, now - previous);
  previous = now;

  const result = advance(state, readWorld(), dt);
  state = result.state;

  useDirectorStore.getState().publish(result.frame);
  // Read back rather than using `result` directly: the debug override wins over
  // the Director, and the DOM has to escalate with the same fever the scene does.
  writeFeverProperty(useDirectorStore.getState().frame.fever);

  raf = requestAnimationFrame(tick);
}

/** Call once from the app entry. The preview harness never calls it. */
export function startDirector(): void {
  if (raf !== 0) return;
  raf = requestAnimationFrame(tick);
}
