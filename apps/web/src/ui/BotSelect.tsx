/**
 * The opponent picker.
 *
 * The ladder reads top to bottom; the Oracle is pulled out below it because it
 * isn't a harder rung, it's a different proposition — the rest of the roster
 * plays well, and that one plays perfectly once the board is deep enough.
 * Filing it as "tier 8" would undersell what it actually is.
 */

import { ROSTER, type BotProfile } from "@fourscore/engine";
import { bodyArt, faceArt } from "../render/art.js";
import { artUrl, overlay, tint } from "../render/pixel.js";

interface Props {
  onPick: (bot: BotProfile) => void;
  record: Record<string, { wins: number; losses: number; draws: number }>;
}

function portrait(bot: BotProfile): string {
  return artUrl(
    overlay(tint(bodyArt(bot.id), { b: bot.colors.body, s: bot.colors.shade }), faceArt("idle")),
  );
}

function BotCard({ bot, onPick, record }: { bot: BotProfile; onPick: () => void; record?: { wins: number; losses: number; draws: number } }) {
  const played = record ? record.wins + record.losses + record.draws : 0;
  return (
    <button className={`bot-card${bot.perfect ? " bot-card--perfect" : ""}`} onClick={onPick}>
      <img className="bot-card__sprite" src={portrait(bot)} alt="" />
      <div className="bot-card__text">
        <div className="bot-card__name">
          {bot.name}
          {!bot.perfect && <span className="bot-card__tier">tier {bot.tier}</span>}
        </div>
        <div className="bot-card__title">{bot.title}</div>
        <p className="bot-card__blurb">{bot.blurb}</p>
        {played > 0 && (
          <div className="bot-card__record">
            {record!.wins}W · {record!.losses}L{record!.draws > 0 ? ` · ${record!.draws}D` : ""}
          </div>
        )}
      </div>
    </button>
  );
}

export function BotSelect({ onPick, record }: Props) {
  const ladder = ROSTER.filter((b) => !b.perfect);
  const perfect = ROSTER.filter((b) => b.perfect);

  return (
    <div className="screen screen--select">
      <header className="masthead">
        <h1>Fourscore</h1>
        <p>Seven opponents, then one that doesn&rsquo;t make mistakes.</p>
      </header>

      <div className="bot-list">
        {ladder.map((bot) => (
          <BotCard key={bot.id} bot={bot} onPick={() => onPick(bot)} record={record[bot.id]} />
        ))}
      </div>

      <h2 className="section-heading">Out of the ladder</h2>
      <div className="bot-list">
        {perfect.map((bot) => (
          <BotCard key={bot.id} bot={bot} onPick={() => onPick(bot)} record={record[bot.id]} />
        ))}
      </div>
    </div>
  );
}
