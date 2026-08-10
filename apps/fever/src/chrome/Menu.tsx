/**
 * The title screen: the home-screen icon, at full size, with buttons in it.
 *
 * The icon is the game's visual thesis for the chrome — a Win95 dialog with
 * hot-rod flames pouring out of its client area and a chrome sticker slapped
 * over the top — so the menu is that same dialog rather than something in its
 * spirit. Picture box, marquee status strip, a column of beveled buttons, and
 * the void showing round the edges.
 *
 * Pure props, like `StageView`: the preview harness renders this with fixtures
 * and no stores at all.
 */

import type { BotProfile, Variant } from "@fourscore/engine";
import { VARIANTS } from "@fourscore/engine";
import { Flames } from "./Flames.js";
import { Wordmark } from "./Wordmark.js";
import { Btn, Window } from "./Window.js";
import { COPY } from "./copy.js";

export interface MenuProps {
  variant: Variant;
  bot: BotProfile;
  /** There's a half-played board waiting, so the top button resumes it. */
  canResume: boolean;
  onVariant: (v: Variant) => void;
  onStart: () => void;
  onRoster: () => void;
  onOnline: () => void;
  onSettings: () => void;
  onAbout: () => void;
}

export function Menu({
  variant,
  bot,
  canResume,
  onVariant,
  onStart,
  onRoster,
  onOnline,
  onSettings,
  onAbout,
}: MenuProps) {
  return (
    <div className="menu">
      <Window title={COPY.windowTitle} label="fourscore" className="win--menu">
        {/* The picture box: night, on fire, with the wordmark stuck over it. */}
        <div className="pictbox">
          <Flames />
          <Wordmark />
        </div>

        {/* Repeated so the strip is always full — see the marquee rule in
            app.css. Four copies is enough that half of them overfill the
            widest the strip ever gets. */}
        <div className="marquee">
          <span>{`${COPY.tagline} · `.repeat(4)}</span>
        </div>

        <div className="menu-buttons">
          <Btn wide onClick={onStart}>
            {canResume ? COPY.resume : COPY.start}
          </Btn>
          <Btn wide onClick={onRoster}>
            {COPY.opponent}: {bot.name}
          </Btn>
          {/* Third, under the two that pick a bot game, because that is what it
              is an alternative to. */}
          <Btn wide onClick={onOnline}>
            {COPY.online}
          </Btn>
          {/* The variant switch, every state visible at once: a period toggle
              showed you the choice, not the consequence of pressing it. Two
              rows of two, because four across squeezes the labels into
              ellipses and the labels are the joke. */}
          <div className="menu-pair">
            {VARIANTS.slice(0, 2).map((v) => (
              <Btn key={v.id} on={variant.id === v.id} onClick={() => onVariant(v)}>
                {COPY.variant(v.id)}
              </Btn>
            ))}
          </div>
          <div className="menu-pair">
            {VARIANTS.slice(2).map((v) => (
              <Btn key={v.id} on={variant.id === v.id} onClick={() => onVariant(v)}>
                {COPY.variant(v.id)}
              </Btn>
            ))}
          </div>
          <div className="menu-pair">
            <Btn onClick={onSettings}>{COPY.settings}</Btn>
            <Btn onClick={onAbout}>{COPY.about}</Btn>
          </div>
        </div>
      </Window>
    </div>
  );
}
