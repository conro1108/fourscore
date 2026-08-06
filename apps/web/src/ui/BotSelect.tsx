/**
 * The opponent picker.
 *
 * The ladder reads top to bottom; the Oracle is pulled out below it because it
 * isn't a harder rung, it's a different proposition — the rest of the roster
 * plays well, and that one plays perfectly once the board is deep enough.
 * Filing it as "tier 8" would undersell what it actually is.
 */

import { ROSTER, VARIANTS, exactnessNote, type BotProfile, type Variant } from "@fourscore/engine";
import { bodyArt, faceArt } from "../render/art.js";
import { artUrl, overlay, tint } from "../render/pixel.js";

interface Props {
  onPick: (bot: BotProfile) => void;
  record: Record<string, { wins: number; losses: number; draws: number }>;
  variant: Variant;
  onVariant: (v: Variant) => void;
  onPlayPerson: () => void;
}

function portrait(bot: BotProfile): string {
  return artUrl(
    overlay(tint(bodyArt(bot.id), { b: bot.colors.body, s: bot.colors.shade }), faceArt("idle")),
  );
}

/**
 * Personality, plus what this bot can prove on the board you've chosen.
 *
 * The second half is generated from `exactFrom` rather than written into the
 * blurb, so a bot can't go on advertising Connect 4's crossover while you're
 * looking at a Connect 5 board.
 */
function blurbFor(bot: BotProfile, variant: Variant): string {
  const note = exactnessNote(bot, variant);
  return note ? `${bot.blurb} ${note}` : bot.blurb;
}

function BotCard({
  bot,
  onPick,
  record,
  variant,
}: {
  bot: BotProfile;
  onPick: () => void;
  record?: { wins: number; losses: number; draws: number };
  variant: Variant;
}) {
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
        <p className="bot-card__blurb">{blurbFor(bot, variant)}</p>
        {played > 0 && (
          <div className="bot-card__record">
            {record!.wins}W · {record!.losses}L{record!.draws > 0 ? ` · ${record!.draws}D` : ""}
          </div>
        )}
      </div>
    </button>
  );
}

export function BotSelect({ onPick, record, variant, onVariant, onPlayPerson }: Props) {
  const ladder = ROSTER.filter((b) => !b.perfect);
  const perfect = ROSTER.filter((b) => b.perfect);

  return (
    <div className="screen screen--select">
      <header className="masthead">
        <h1>Fourscore</h1>
        <p>Seven opponents, then one that doesn&rsquo;t make mistakes.</p>
      </header>

      <div className="variant-picker" role="group" aria-label="Game">
        {VARIANTS.map((v) => (
          <button
            key={v.id}
            className={`variant-chip${v.id === variant.id ? " variant-chip--on" : ""}`}
            aria-pressed={v.id === variant.id}
            onClick={() => onVariant(v)}
          >
            <span className="variant-chip__name">{v.name}</span>
            <span className="variant-chip__size">
              {v.width}&times;{v.height}, {v.run} in a row
            </span>
          </button>
        ))}
      </div>

      <button className="person-card" onClick={onPlayPerson}>
        <span className="person-card__name">Play a person</span>
        <span className="person-card__blurb">
          Send a link and play whoever opens it. No account, no waiting room.
        </span>
      </button>

      <div className="bot-list">
        {ladder.map((bot) => (
          <BotCard
            key={bot.id}
            bot={bot}
            variant={variant}
            onPick={() => onPick(bot)}
            record={record[`${bot.id}@${variant.id}`]}
          />
        ))}
      </div>

      <h2 className="section-heading">Out of the ladder</h2>
      <div className="bot-list">
        {perfect.map((bot) => (
          <BotCard
            key={bot.id}
            bot={bot}
            variant={variant}
            onPick={() => onPick(bot)}
            record={record[`${bot.id}@${variant.id}`]}
          />
        ))}
      </div>
    </div>
  );
}
