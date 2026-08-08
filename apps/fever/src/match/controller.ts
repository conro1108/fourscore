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

import { shellError } from "../chrome/store.js";
import { engineClient } from "../engine/client.js";
import { botPlayer, useMatchStore } from "./store.js";

/**
 * How long the bot sits with the position before committing, even when the
 * search came back instantly.
 *
 * Two rules, both from watching it play: it has to be long enough that a move
 * reads as a decision rather than a glitch (380ms was not — the disc arrived
 * while you were still letting go of the mouse), and it must not be the *same*
 * length twice, or the pause reads as a timer counting down rather than someone
 * thinking. The jitter is the whole difference between "waiting" and "waited".
 *
 * This is timing, not theater — the taste law's "randomness never picks how a
 * gag looks" doesn't reach it, and a fixed think time is the thing that looks
 * mechanical.
 */
const THINK_MIN_MS = 900;
const THINK_JITTER_MS = 1000;

const thinkPause = (): number => THINK_MIN_MS + Math.random() * THINK_JITTER_MS;

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
  // Still the same game, still being played, still waiting on this move.
  const fresh = () => {
    const t = store.getState();
    return t.live && t.generation === gen && t.moves.length === at;
  };

  s.setThinking(true);
  try {
    const [decision] = await Promise.all([
      engineClient().decide(s.botId, s.variant.id, s.moves),
      sleep(thinkPause()),
    ]);
    await waitForStore(() => {
      const t = store.getState();
      return !fresh() || t.landed === t.moves.length;
    });
    if (!fresh()) return;
    store.getState().setThinking(false);
    store.getState().commitMove(decision.col);
  } catch (e) {
    // A dead worker means no move is coming, and the position it died on stays
    // claimed — so without a way out the game is over and says nothing. Unlock
    // the HUD and put the failure in front of the player in a dialog that can
    // start a new one. The console still gets the real error; the dialog gets
    // the sentence a person can act on.
    console.error("bot turn failed:", e);
    if (fresh()) {
      store.getState().setThinking(false);
      shellError("The opponent stopped answering.");
    }
  }
}

function maybeBotTurn(): void {
  const s = useMatchStore.getState();
  if (!s.live) return;
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

/**
 * Have another go at the position the bot died on.
 *
 * One attempt per position is what stops a dead worker being hammered, so the
 * only way back is to un-claim it deliberately — which is exactly what the
 * error dialog's "Try again" means and the only thing that means it.
 */
export function retryBotTurn(): void {
  inFlight = null;
  maybeBotTurn();
}

/** Call once from the app entry. The preview harness never calls it. */
export function startMatchController(): void {
  if (started) return;
  started = true;
  useMatchStore.subscribe(maybeBotTurn);
  maybeBotTurn();
}
