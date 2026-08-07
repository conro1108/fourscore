/**
 * The turn loop: watches the match store and plays the bot's moves.
 *
 * Deliberately a plain module rather than a React effect — game flow isn't
 * rendering, and keeping it out of the tree means the preview harness can
 * mount the whole stage without a bot ever waking up (it just never calls
 * `startMatchController`).
 *
 * Sequencing: the decide request goes out the moment it's the bot's turn, so
 * the search runs *while* the previous disc is still falling. The commit then
 * waits for three things — the decision, a minimum think time, and all discs
 * landed — so the bot never reads as instant and never drops a disc into
 * mid-air theater.
 */

import { engineClient } from "../engine/client.js";
import { botPlayer, useMatchStore } from "./store.js";

/** Even an instant bot pauses, or its move reads as a glitch rather than a move. */
const MIN_THINK_MS = 380;

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Resolves when `pred` holds. Checks immediately, then on every store change. */
function waitForStore(pred: () => boolean): Promise<void> {
  return new Promise((resolve) => {
    if (pred()) return resolve();
    const unsub = useMatchStore.subscribe(() => {
      if (pred()) {
        unsub();
        resolve();
      }
    });
  });
}

let inFlight: string | null = null;
let started = false;

async function botTurn(): Promise<void> {
  const store = useMatchStore;
  const s = store.getState();
  const gen = s.generation;
  const at = s.moves.length;
  const fresh = () => {
    const t = store.getState();
    return t.generation === gen && t.moves.length === at;
  };

  s.setThinking(true);
  try {
    const [decision] = await Promise.all([
      engineClient().decide(s.botId, s.variant.id, s.moves),
      sleep(MIN_THINK_MS),
    ]);
    await waitForStore(() => {
      const t = store.getState();
      return !fresh() || t.landed === t.moves.length;
    });
    if (!fresh()) return;
    store.getState().setThinking(false);
    store.getState().commitMove(decision.col);
  } catch (e) {
    // A dead worker means no move is coming; unlock the HUD rather than
    // spinning forever. The console is the right audience until phase 6 gives
    // errors a possessed dialog to live in.
    console.error("bot turn failed:", e);
    if (fresh()) store.getState().setThinking(false);
  }
}

function maybeBotTurn(): void {
  const s = useMatchStore.getState();
  if (s.match.status !== "playing") return;
  if (s.match.turn !== botPlayer(s)) return;
  // One attempt per position, ever. The key never repeats — `generation` only
  // grows and so does the move count — which is also what stops a dead worker
  // from being hammered in a retry loop: the failed position stays claimed
  // until a new game moves the key on.
  const key = `${s.generation}:${s.moves.length}`;
  if (inFlight === key) return;
  inFlight = key;
  void botTurn();
}

/** Call once from the app entry. The preview harness never calls it. */
export function startMatchController(): void {
  if (started) return;
  started = true;
  useMatchStore.subscribe(maybeBotTurn);
  maybeBotTurn();
}
