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
import { hostMatch, joinMatch, leaveOnline, openLobby } from "../online/runtime.js";
import { joinLink } from "../online/session.js";
import { useOnlineStore } from "../online/store.js";
import { useReviewStore } from "../review/store.js";
import { recordKey, useRecordStore } from "../settings/records.js";
import { stageFx } from "../stage/fx.js";
import { About, ErrorBox, OnlineOutcome, Outcome, Quit } from "./Dialogs.js";
import { Review } from "./Review.js";
import { Hud } from "./Hud.js";
import { Menu } from "./Menu.js";
import { Online } from "./Online.js";
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
  const online = useOnlineStore();
  const review = useReviewStore();
  const [copied, setCopied] = useState(false);
  // Stepped, not raw: this component is most of the DOM and it must not
  // re-render sixty times a second.
  const fever = useFeverStep(20);

  const bot = byId(s.botId);
  const wire = s.mode === "online";
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
  // condition, and says so without saying anything. And every window lands
  // with mass: the same camera flinch a disc impact fires, so the chrome and
  // the stage are one surface rather than a picture over a picture.
  useEffect(() => {
    if (!showOutcome) return;
    playSpike(result === "loss" ? "error-ding" : "dialog-open", 0.8);
    return windowLands();
  }, [showOutcome, result]);

  // Every other window gets the ordinary chirp; the error gets the ding.
  useEffect(() => {
    if (!dialog) return;
    playSpike(dialog.kind === "error" ? "error-ding" : "dialog-open", 0.8);
    return windowLands();
  }, [dialog]);

  // A review is about one finished game. Starting another one throws it away
  // here rather than in the match store, because the match store has no business
  // knowing this screen exists — and because the same clear has to take the
  // window down with it.
  useEffect(() => {
    review.clear();
    if (useShellStore.getState().dialog?.kind === "review") close();
    // Deliberately keyed on the generation alone: `review` is a whole store
    // slice and re-running this whenever it changed would clear the review the
    // moment it arrived.
  }, [s.generation]); // eslint-disable-line react-hooks/exhaustive-deps

  /**
   * Read the game back. Dismissing the outcome window is part of it: the review
   * replaces that window rather than stacking on it, and closing the review
   * leaves you on the finished board the way the X always has.
   */
  const openReview = () => {
    setDismissedGen(s.generation);
    open({ kind: "review" });
    void review.run({
      generation: s.generation,
      variantId: s.variant.id,
      moves: s.moves,
      forPlayer: human,
    });
  };

  // The record is written once per finished game, identified by its moves.
  // Bot games only: the record is your standing against a rung of the ladder,
  // and folding a stranger's win into it would make the ladder a lie.
  useEffect(() => {
    if (screen !== "match" || !over || !settled || wire) return;
    record(recordKey(s.botId, s.variant.id), result, `${s.botId}@${s.variant.id}:${s.moves.join()}`);
  }, [screen, over, settled, result, record, wire, s.botId, s.variant.id, s.moves]);

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

  // Leaving a bot game keeps the board as menu scenery; leaving an online one
  // hands the row back and puts the bot board you had before it back on the
  // stage, because a wire board with nobody on the other end is not scenery,
  // it's a game you can't resume.
  const leaveMatch = () => {
    if (wire) {
      leaveOnline();
      go("menu");
      return;
    }
    s.setLive(false);
    go("menu");
  };

  const backToLobby = () => {
    leaveOnline();
    void openLobby();
  };

  const copyLink = () => {
    const code = online.row?.join_code;
    if (!code) return;
    void navigator.clipboard
      ?.writeText(joinLink(location.origin, location.pathname, code))
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1600);
      });
  };

  return (
    <div className={`chrome ${fever >= HOT ? "chrome--hot" : ""}`}>
      {screen === "match" && (
        <Hud
          bot={bot}
          opponentName={wire ? (online.opponentName ?? COPY.stranger) : undefined}
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
          onOnline={() => void openLobby()}
          onSettings={() => open({ kind: "settings" })}
          onAbout={() => open({ kind: "about" })}
        />
      )}

      {/* The review gets no veil: the board behind it is what it is talking
          about, and you can still take hold of the void and turn it while you
          read. Every other window is over something you shouldn't be clicking. */}
      {(screen === "roster" ||
        screen === "online" ||
        (dialog !== null && dialog.kind !== "review") ||
        showOutcome) && <div className="veil" />}

      {screen === "online" && (
        <Online
          variant={s.variant}
          me={online.me}
          code={online.row?.join_code ?? null}
          busy={online.busy}
          error={online.error}
          copied={copied}
          onVariant={(v) => configure({ variant: v })}
          onHost={() => void hostMatch()}
          onJoin={(code) => void joinMatch(code)}
          onCopyLink={copyLink}
          // Closing the lobby while hosting drops the row you were waiting on,
          // which is what "cancel" has to mean — the code stops working and
          // nobody arrives into an empty screen.
          onClose={() => {
            leaveOnline();
            go("menu");
          }}
        />
      )}

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
          // There is nothing to try again online: the only error that reaches
          // here is a desync, and re-reading a move that can't be played gets
          // the same answer. The way out is out.
          onRetry={
            wire
              ? undefined
              : () => {
                  close();
                  retryBotTurn();
                }
          }
          onLeave={() => {
            close();
            leaveMatch();
          }}
        />
      )}

      {dialog?.kind === "review" && (
        <Review
          status={review.status}
          review={review.review}
          humanPlayer={human}
          lost={result === "loss"}
          selected={review.selected}
          onSelect={review.select}
          // "Again" from in here means the same thing it means in the outcome
          // window — which online is a fresh row with a fresh code, because
          // there is no "same opponent, one more" without asking them again.
          onAgain={() => {
            close();
            if (!wire) return s.newGame();
            leaveOnline();
            void openLobby().then(() => hostMatch());
          }}
          onClose={close}
        />
      )}

      {showOutcome && wire && (
        <OnlineOutcome
          result={result}
          onReview={openReview}
          // A rematch is a fresh row with a fresh code — there is no "same
          // opponent, one more" without asking them again, so it says so by
          // putting you back in front of the code.
          onRematch={() => {
            leaveOnline();
            void openLobby().then(() => hostMatch());
          }}
          onLobby={backToLobby}
          onClose={() => setDismissedGen(s.generation)}
        />
      )}

      {showOutcome && !wire && (
        <Outcome
          bot={bot}
          result={result}
          botStarts={s.humanFirst}
          onReview={openReview}
          // AGAIN. doesn't cut to a fresh board — it closes the window and
          // pulls the release slider itself, so the button and the hand on the
          // handle are the same gesture: chips out the bottom, then the deal.
          onAgain={() => {
            setDismissedGen(s.generation);
            s.requestRelease();
          }}
          onSwap={() => s.newGame({ humanFirst: !s.humanFirst })}
          onClose={() => setDismissedGen(s.generation)}
        />
      )}
    </div>
  );
}

/**
 * The stage flinch, timed to the overshoot frame of the window's entrance
 * (`win-in` in app.css hits its too-big frame ~half way through 0.21s) rather
 * than to the mount — the dip is the window *landing*, not the window
 * existing. Returns the cleanup so a window dismissed mid-entrance doesn't
 * shake a stage nothing landed on.
 */
function windowLands(): () => void {
  const t = setTimeout(() => {
    stageFx.lastLandAt = performance.now();
  }, 120);
  return () => clearTimeout(t);
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
  const wire = s.mode === "online";
  const settled = s.landed === s.moves.length;
  // A board that isn't being played says nothing. Online this is the moment
  // after the other person walks out: the game is unfinished, but "THEY ARE
  // THINKING." under a window that says they left is the software lying.
  if (!s.live) return "";
  if (s.match.status !== "playing") {
    if (!dismissed || !settled) return "";
    return s.match.status === "draw"
      ? COPY.drew
      : s.match.winner === human
        ? COPY.won
        : wire
          ? COPY.lostOnline
          : COPY.lost(bot);
  }
  if (s.match.turn === human && settled && !s.thinking) return COPY.yourTurn;
  // Online the other seat is a person, and a person doesn't get one of the
  // roster's written thinking lines — those belong to a character.
  return wire ? COPY.theirTurn : COPY.thinking(bot);
}
