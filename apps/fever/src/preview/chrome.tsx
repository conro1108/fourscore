/**
 * Chrome fixtures for the preview harness.
 *
 * The chrome is the half of this game that unit tests can see least: every
 * string, every bevel and every escalation is a look, and the only way to judge
 * a look is to put it next to the others. So each surface gets a named state
 * here, rendered from fixtures with no stores and no running game — the same
 * deal `StageView` takes, which is why every component in `chrome/` except the
 * container takes props.
 *
 * Fever is set as a local custom property rather than on the root, because the
 * harness never starts the Director and the grid shows several temperatures at
 * once. Every escalation in `app.css` reads `var(--fever)` from inside
 * `.chrome`, so a per-tile value is all it takes.
 */

import type { CSSProperties } from "react";
import { CONNECT4, byId, type Variant } from "@fourscore/engine";
import { About, ErrorBox, OnlineOutcome, Outcome, Quit } from "../chrome/Dialogs.js";
import { Hud } from "../chrome/Hud.js";
import { Menu } from "../chrome/Menu.js";
import { Online } from "../chrome/Online.js";
import { Roster } from "../chrome/Roster.js";
import { Settings } from "../chrome/Settings.js";
import { COPY } from "../chrome/copy.js";

/** Same threshold the container uses; see `chrome/Chrome.tsx`. */
const HOT = 0.66;

export type ChromeState =
  | "menu"
  | "roster"
  | "online"
  | "online-waiting"
  | "online-outcome"
  | "desync"
  | "settings"
  | "about"
  | "quit"
  | "error"
  | "hud"
  | "outcome-win"
  | "outcome-loss";

const noop = () => {};

/** A record with something in it, so the roster's line isn't the empty one. */
const RECORDS = { "oracle@connect5": { wins: 0, losses: 3, draws: 1 } };

function Surface({
  state,
  variant,
  botId,
}: {
  state: ChromeState;
  variant: Variant;
  botId: string;
}) {
  const bot = byId(botId);
  switch (state) {
    case "menu":
      return (
        <Menu
          variant={variant}
          bot={bot}
          canResume={false}
          onVariant={noop}
          onStart={noop}
          onRoster={noop}
          onOnline={noop}
          onSettings={noop}
          onAbout={noop}
        />
      );
    case "roster":
      return (
        <Roster
          variant={variant}
          botId={botId}
          humanFirst
          records={RECORDS}
          onSelect={noop}
          onFirst={noop}
          onPlay={noop}
          onClose={noop}
        />
      );
    case "online":
      return (
        <Online
          variant={variant}
          me="preview-user"
          code={null}
          busy={false}
          error={null}
          copied={false}
          onVariant={noop}
          onHost={noop}
          onJoin={noop}
          onCopyLink={noop}
          onClose={noop}
        />
      );
    case "online-waiting":
      return (
        <Online
          variant={variant}
          me="preview-user"
          code="QK7M"
          busy={false}
          error={null}
          copied={false}
          onVariant={noop}
          onHost={noop}
          onJoin={noop}
          onCopyLink={noop}
          onClose={noop}
        />
      );
    case "online-outcome":
      return <OnlineOutcome result="loss" onRematch={noop} onLobby={noop} onClose={noop} />;
    // The desync report: the same error window with nothing to retry, which is
    // most of what makes it read as final rather than as a hiccup.
    case "desync":
      return <ErrorBox detail={COPY.desync} onLeave={noop} />;
    case "settings":
      return <Settings onClose={noop} />;
    case "about":
      return <About onClose={noop} />;
    case "quit":
      return <Quit onLeave={noop} onStay={noop} />;
    case "error":
      return <ErrorBox detail="The opponent stopped answering." onRetry={noop} onLeave={noop} />;
    case "outcome-win":
      return (
        <Outcome bot={bot} result="win" botStarts onAgain={noop} onSwap={noop} onClose={noop} />
      );
    case "outcome-loss":
      return (
        <Outcome
          bot={bot}
          result="loss"
          botStarts={false}
          onAgain={noop}
          onSwap={noop}
          onClose={noop}
        />
      );
    case "hud":
      return null;
  }
}

export function ChromeFixture({
  state,
  variant = CONNECT4,
  botId = "moss",
  fever = 0,
  status,
}: {
  state: ChromeState;
  variant?: Variant;
  botId?: string;
  fever?: number;
  status?: string;
}) {
  const bot = byId(botId);
  // The HUD is behind everything else in a real match, so it's behind
  // everything else here too — a dialog state that hides the strip it floats
  // over isn't the state the player sees. The two full-screen states replace
  // the HUD rather than covering it.
  const inMatch = !(["menu", "roster", "online", "online-waiting"] as ChromeState[]).includes(state);
  const veiled = state !== "menu" && state !== "hud";

  return (
    <div
      className={`chrome ${fever >= HOT ? "chrome--hot" : ""}`}
      style={{ ["--fever" as string]: fever.toFixed(2) } as CSSProperties}
    >
      {inMatch && (
        <Hud
          bot={bot}
          variant={variant}
          status={status ?? COPY.thinking(bot)}
          heat={fever}
          onLeave={noop}
          onSettings={noop}
        />
      )}
      {veiled && <div className="veil" />}
      <Surface state={state} variant={variant} botId={botId} />
    </div>
  );
}
