/**
 * The chrome container: the one component that reads the stores.
 *
 * Everything else in this directory takes props, which is what lets the preview
 * harness render the menu, the roster and every dialog as fixtures with no
 * stores, no bot and no running game (same trick as `StageView`). This file is
 * where routing, the match config, the record and the composed status line all
 * meet — and it is the only place that knows what the software should be saying
 * about the game right now.
 */

import { useEffect, useState } from "react";
import { byId, type Variant } from "@fourscore/engine";
import { playSpike } from "../audio/index.js";
import { useFeverStep } from "../director/store.js";
import { retryBotTurn } from "../match/controller.js";
import { humanPlayer, useMatchStore } from "../match/store.js";
import { recordKey, useRecordStore } from "../settings/records.js";
import { About, ErrorBox, Outcome, Quit } from "./Dialogs.js";
import { Hud } from "./Hud.js";
import { Menu } from "./Menu.js";
import { Roster } from "./Roster.js";
import { Settings } from "./Settings.js";
import { COPY } from "./copy.js";
import { useShellStore } from "./store.js";

/**
 * Where the chrome starts sweating: the title bars vibrate. High enough that
 * most of a game doesn't have it, because an escalation that's always on is a
 * texture.
 */
const HOT = 0.66;

export function Chrome() {
  const s = useMatchStore();
  const screen = useShellStore((x) => x.screen);
  const dialog = useShellStore((x) => x.dialog);
  const go = useShellStore((x) => x.go);
  const open = useShellStore((x) => x.open);
  const close = useShellStore((x) => x.close);
  const records = useRecordStore((x) => x.records);
  const record = useRecordStore((x) => x.record);
  // Stepped, not raw: this component is most of the DOM and it must not
  // re-render sixty times a second.
  const fever = useFeverStep(20);

  const bot = byId(s.botId);
  const human = humanPlayer(s);
  const over = s.match.status !== "playing";
  const settled = s.landed === s.moves.length;
  const result = s.match.status === "draw" ? "draw" : s.match.winner === human ? "win" : "loss";

  // Closing the outcome window leaves you on the finished board — the win still
  // lit, the last disc where it landed — and nothing else happens until you
  // start a game. That's the point of the X: look at the position without a box
  // over it. Storing which game was dismissed rather than a bool means a new
  // game brings the window back without anything having to remember to reset.
  const [dismissedGen, setDismissedGen] = useState(-1);
  const dismissed = dismissedGen === s.generation;
  const showOutcome = screen === "match" && over && settled && !dismissed && dialog === null;

  // The window announces itself. Losing opens with the system error sound
  // instead of the window sound — this software considers your defeat a fault
  // condition, and says so without saying anything.
  useEffect(() => {
    if (showOutcome) playSpike(result === "loss" ? "error-ding" : "dialog-open", 0.8);
  }, [showOutcome, result]);

  // Every other window gets the ordinary chirp; the error gets the ding.
  useEffect(() => {
    if (dialog) playSpike(dialog.kind === "error" ? "error-ding" : "dialog-open", 0.8);
  }, [dialog]);

  // The record is written once per finished game, identified by its moves.
  useEffect(() => {
    if (screen !== "match" || !over || !settled) return;
    record(recordKey(s.botId, s.variant.id), result, `${s.botId}@${s.variant.id}:${s.moves.join()}`);
  }, [screen, over, settled, result, record, s.botId, s.variant.id, s.moves]);

  // A board left half-played on the menu is still that game: picking it back up
  // hands it to the players rather than throwing it away. Anything else — a
  // finished game, an empty board, a pick from the roster — deals a new one.
  const canResume = s.moves.length > 0 && s.match.status === "playing";

  const start = () => {
    if (canResume) s.setLive(true);
    else s.newGame();
    go("match");
  };

  /** The roster's Play always means a new game, whatever is on the board. */
  const startFresh = () => {
    s.newGame();
    go("match");
  };

  // Menu-side config: set the board up without handing it to anyone. One call,
  // because a game the human doesn't lead is the bot's turn the instant it's
  // live (see `newGame`).
  const configure = (opts: Partial<{ variant: Variant; botId: string; humanFirst: boolean }>) =>
    s.newGame({ ...opts, live: false });

  const leaveMatch = () => {
    s.setLive(false);
    go("menu");
  };

  return (
    <div className={`chrome ${fever >= HOT ? "chrome--hot" : ""}`}>
      {screen === "match" && (
        <Hud
          bot={bot}
          variant={s.variant}
          status={statusLine(s, bot, dismissed)}
          heat={fever}
          onSettings={() => open({ kind: "settings" })}
          // Abandoning a game in progress asks; abandoning a finished one just
          // goes, because there is nothing left to abandon.
          onLeave={() => (over || s.moves.length === 0 ? leaveMatch() : open({ kind: "quit" }))}
        />
      )}

      {screen === "menu" && (
        <Menu
          variant={s.variant}
          bot={bot}
          canResume={canResume}
          onVariant={(v) => configure({ variant: v })}
          onStart={start}
          onRoster={() => go("roster")}
          onSettings={() => open({ kind: "settings" })}
          onAbout={() => open({ kind: "about" })}
        />
      )}

      {(screen === "roster" || dialog !== null || showOutcome) && <div className="veil" />}

      {screen === "roster" && (
        <Roster
          variant={s.variant}
          botId={s.botId}
          humanFirst={s.humanFirst}
          records={records}
          onSelect={(botId) => configure({ botId })}
          onFirst={(humanFirst) => configure({ humanFirst })}
          onPlay={startFresh}
          onClose={() => go("menu")}
        />
      )}

      {dialog?.kind === "settings" && <Settings onClose={close} />}
      {dialog?.kind === "about" && <About onClose={close} />}
      {dialog?.kind === "quit" && (
        <Quit
          onStay={close}
          onLeave={() => {
            close();
            leaveMatch();
          }}
        />
      )}
      {dialog?.kind === "error" && (
        <ErrorBox
          detail={dialog.detail}
          onRetry={() => {
            close();
            retryBotTurn();
          }}
          onLeave={() => {
            close();
            leaveMatch();
          }}
        />
      )}

      {showOutcome && (
        <Outcome
          bot={bot}
          result={result}
          botStarts={s.humanFirst}
          onAgain={() => s.newGame()}
          onSwap={() => s.newGame({ humanFirst: !s.humanFirst })}
          onClose={() => setDismissedGen(s.generation)}
        />
      )}
    </div>
  );
}

/**
 * What the software says about the game right now.
 *
 * Once the outcome window is closed the result moves down here, so the board
 * you're left sitting on still says how it ended.
 */
function statusLine(
  s: ReturnType<typeof useMatchStore.getState>,
  bot: ReturnType<typeof byId>,
  dismissed: boolean,
): string {
  const human = humanPlayer(s);
  const settled = s.landed === s.moves.length;
  if (s.match.status !== "playing") {
    if (!dismissed || !settled) return "";
    return s.match.status === "draw"
      ? COPY.drew
      : s.match.winner === human
        ? COPY.won
        : COPY.lost(bot);
  }
  return s.match.turn === human && settled && !s.thinking
    ? COPY.yourTurn
    : COPY.thinking(bot);
}
