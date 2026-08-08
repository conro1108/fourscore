/**
 * Opponent select, as a list box.
 *
 * A period application would have shipped exactly this — a sunken white list on
 * the left, a details pane on the right, a level meter for the thing being
 * ranked — and it costs no art at all, which is the point: the bots' *visual*
 * identities are phase 5's, and nothing here should pre-empt them. What this
 * screen owes the player is the ladder, legibly.
 *
 * The engine writes two of these strings itself. `blurb` is the bot's character
 * and `exactnessNote` is generated from its measured crossover on *this* board,
 * so an opponent can never advertise a Connect 4 fact on a Connect 5 game
 * (PLAN.md product truth 2). Neither is ever hardcoded here.
 */

import { ROSTER, exactnessNote, type BotProfile, type Variant } from "@fourscore/engine";
import { recordFor, recordKey, type Record_ } from "../settings/records.js";
import { Btn, Window } from "./Window.js";
import { COPY } from "./copy.js";

/** The ladder as a period level meter: seven rungs, and one that isn't on it. */
function Rungs({ bot }: { bot: BotProfile }) {
  return (
    <div className="rungs">
      {Array.from({ length: 7 }, (_, i) => (
        <i
          key={i}
          className={
            bot.perfect ? "on perfect" : i < bot.tier ? "on" : ""
          }
        />
      ))}
      <em>{bot.perfect ? "outside the ladder" : `rung ${bot.tier} of 7`}</em>
    </div>
  );
}

export interface RosterProps {
  variant: Variant;
  botId: string;
  humanFirst: boolean;
  records: Record<string, Record_>;
  onSelect: (botId: string) => void;
  onFirst: (humanFirst: boolean) => void;
  onPlay: () => void;
  onClose: () => void;
}

export function Roster({
  variant,
  botId,
  humanFirst,
  records,
  onSelect,
  onFirst,
  onPlay,
  onClose,
}: RosterProps) {
  const bot = ROSTER.find((b) => b.id === botId) ?? ROSTER[0]!;
  const note = exactnessNote(bot, variant);
  const r = recordFor(records, recordKey(bot.id, variant.id));

  return (
    <Window
      title={COPY.rosterTitle(ROSTER.length)}
      className="win--roster"
      onClose={onClose}
      buttons={
        <>
          <Btn onClick={onClose}>{COPY.back}</Btn>
          <Btn onClick={onPlay}>{COPY.play}</Btn>
        </>
      }
    >
      <div className="roster">
        <div className="roster-list">
          {ROSTER.map((b) => (
            <button
              key={b.id}
              type="button"
              className={`roster-item ${b.id === bot.id ? "roster-item--on" : ""}`}
              onClick={() => onSelect(b.id)}
              // Double-click a list item to open it, because that is what a
              // list item did.
              onDoubleClick={onPlay}
            >
              <b>{b.name}</b>
              <span>{b.title}</span>
            </button>
          ))}
        </div>

        <div className="roster-detail">
          <h2>{bot.name}</h2>
          <p className="roster-title">{bot.title}</p>
          <Rungs bot={bot} />
          <p className="roster-blurb">{bot.blurb}</p>
          {note && <p className="roster-note">{note}</p>}
          <div className="spacer" />
          <div className="row">
            <span className="row-label">{COPY.firstMove}</span>
            <Btn on={humanFirst} onClick={() => onFirst(true)}>
              {COPY.you}
            </Btn>
            <Btn on={!humanFirst} onClick={() => onFirst(false)}>
              {COPY.them}
            </Btn>
          </div>
          <div className="roster-record">{COPY.record(r.wins, r.losses, r.draws)}</div>
        </div>
      </div>
    </Window>
  );
}
