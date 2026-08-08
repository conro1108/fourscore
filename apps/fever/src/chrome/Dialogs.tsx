/**
 * The small windows: about, quit, error, outcome.
 *
 * The tone boundary lives in here more than anywhere else in the game, so it's
 * worth being explicit about which lie each one is telling. `About` is the
 * exemplar from the voice sample — a dialog that calmly asserts the program is
 * fine, with two buttons that agree with each other. `Error` is its opposite
 * number and the one that isn't allowed to be funny about the facts: the first
 * sentence is what actually happened, passed in by whatever broke (PLAN.md
 * product truth 4). The joke is the title bar; the joke is never the report.
 */

import type { BotProfile } from "@fourscore/engine";
import { Btn, Window } from "./Window.js";
import { COPY } from "./copy.js";

export function About({ onClose }: { onClose: () => void }) {
  return (
    <Window
      title={COPY.windowTitle}
      label="about"
      onClose={onClose}
      buttons={
        <>
          <Btn onClick={onClose}>{COPY.ok}</Btn>
          <Btn onClick={onClose}>{COPY.ok}</Btn>
        </>
      }
    >
      <p>{COPY.aboutBody}</p>
    </Window>
  );
}

export function Quit({ onLeave, onStay }: { onLeave: () => void; onStay: () => void }) {
  return (
    <Window
      title={COPY.quitTitle}
      label="leave the match"
      onClose={onStay}
      buttons={
        <>
          <Btn onClick={onStay}>{COPY.stay}</Btn>
          <Btn onClick={onLeave}>{COPY.leave}</Btn>
        </>
      }
    >
      <p>{COPY.quitBody}</p>
    </Window>
  );
}

export function ErrorBox({
  detail,
  onRetry,
  onLeave,
}: {
  detail: string;
  onRetry: () => void;
  onLeave: () => void;
}) {
  return (
    <Window
      title={COPY.errorTitle}
      label="error"
      buttons={
        <>
          <Btn onClick={onLeave}>{COPY.leave}</Btn>
          <Btn onClick={onRetry}>{COPY.retry}</Btn>
        </>
      }
    >
      <p>{detail}</p>
      <p>{COPY.errorTail}</p>
    </Window>
  );
}

export function Outcome({
  bot,
  result,
  botStarts,
  onAgain,
  onSwap,
  onClose,
}: {
  bot: BotProfile;
  result: "win" | "loss" | "draw";
  /** Who moves first if you take the swap — the opposite of this game. */
  botStarts: boolean;
  onAgain: () => void;
  onSwap: () => void;
  onClose: () => void;
}) {
  const line = result === "draw" ? COPY.drew : result === "win" ? COPY.won : COPY.lost(bot);
  return (
    <Window
      title={COPY.windowTitle}
      label="game over"
      className="win--outcome"
      onClose={onClose}
      buttons={
        <>
          <Btn onClick={onAgain}>{COPY.again}</Btn>
          <Btn onClick={onSwap}>{COPY.swap(bot, botStarts)}</Btn>
        </>
      }
    >
      <div className="outcome">{line}</div>
    </Window>
  );
}
