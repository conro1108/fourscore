/**
 * The in-match chrome: who you're playing, the controls, and the status line.
 *
 * Deliberately thin. The board is the thing you're looking at, and every pixel
 * of furniture over it is a pixel of void you can't see — so the HUD is one
 * strip at the top and one shouted sentence at the bottom, and everything else
 * that could live here lives in a window you have to open.
 *
 * Pure props: the status line arrives already composed, because deciding *what*
 * the software says about the game is the shell's job (it's the one place that
 * knows whether the bot is thinking), and saying it is this component's.
 */

import type { BotProfile, Variant } from "@fourscore/engine";
import { Flames } from "./Flames.js";
import { Btn } from "./Window.js";
import { SoundToggle } from "./Settings.js";
import { COPY } from "./copy.js";

export interface HudProps {
  bot: BotProfile;
  variant: Variant;
  /** Already-shouted; empty renders nothing. */
  status: string;
  /** Fever, 0..1 — how much of the floor is on fire. */
  heat?: number;
  onLeave: () => void;
  onSettings: () => void;
}

/**
 * Fever, remapped to how much of the floor is alight.
 *
 * The fire doesn't start until the game is a third of the way up, because
 * fever spends most of a match in the low middle (it has a floor that creeps
 * with the disc count) and a screen that is always burning is wallpaper. Below
 * the threshold nothing is rendered at all.
 */
const FIRE_FROM = 0.25;
const fireLevel = (fever: number): number =>
  Math.max(0, (fever - FIRE_FROM) / (1 - FIRE_FROM));

export function Hud({ bot, variant, status, heat = 0, onLeave, onSettings }: HudProps) {
  const fire = fireLevel(heat);
  return (
    <>
      {/* Behind everything else in the layer, so the status line reads over it
          rather than through it. */}
      {fire > 0 && (
        <div className="floor">
          <Flames heat={fire} />
        </div>
      )}

      <header className="hud-top">
        <div className="hud-left">
          <div className="wordmark wordmark--small" data-text={COPY.title}>
            {COPY.title}
          </div>
          <div className="hud-vs">
            vs <b>{bot.name}</b> · {variant.name}
          </div>
        </div>
        {/* A floating toolbar, raised off the void like a palette window that
            got detached and never went home. */}
        <div className="hud-tools">
          <SoundToggle />
          <Btn onClick={onSettings}>{COPY.settings}</Btn>
          <Btn onClick={onLeave}>{COPY.leave}</Btn>
        </div>
      </header>

      {status && (
        <div className="status">
          <span>{status}</span>
        </div>
      )}
    </>
  );
}
