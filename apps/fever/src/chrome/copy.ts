/**
 * Every string the player reads, in one file.
 *
 * Not an i18n table — a *voice* table. Possessed-software humor lives or dies
 * in the writing, and the only way to hear whether it's one voice or six is to
 * read all of it in one sitting, which is exactly what phase 9's copy pass is.
 * So new strings go here even when they'd be shorter inline.
 *
 * The register (VISION.md, "The voice"): short beats clever, deadpan beats
 * spooky, the software is sincere and believes it is functioning normally.
 * ALL CAPS is for shouting surfaces — the status line, outcomes, rally copy.
 * Sentence case is for chrome that thinks it's ordinary software. Never wink.
 *
 * And the confidence law binds every one of these: estimated claims hedge,
 * proven claims are flat. Nothing in this file is allowed to assert a result
 * the engine hasn't proved — which today means only the outcome lines, because
 * a finished board is a fact.
 */

import type { BotProfile } from "@fourscore/engine";

const shout = (bot: BotProfile): string => bot.name.toUpperCase();

/**
 * Lines a specific opponent gets instead of the generic one.
 *
 * Moss is written out in VISION.md as the persona template; the other seven are
 * phase 5's job, and until then they take the plain line rather than an
 * improvised voice. Filling this table in is most of what "bots as characters"
 * means on the chrome side.
 */
const THINKING: Record<string, string> = {
  moss: "MOSS IS THINKING ABOUT DIRT.",
};

const DEFEAT: Record<string, string> = {
  moss: "MOSS WINS. MOSS DOES NOT CELEBRATE.",
};

export const COPY = {
  title: "FOURSCORE",
  tagline: "EVERY SUNDAY IS TONIGHT.",

  // The menu. Sentence case: this is software that thinks it's ordinary.
  // "Resume" on a game you have never played is the joke, and it is the joke
  // every time, so it never becomes "Start".
  start: "Resume",
  opponent: "Opponent",
  settings: "Settings",
  about: "About",

  /** The variant switch, exactly as the voice sample writes it. */
  variant: (id: string): string => (id === "connect5" ? "CONNECT 5 (more)" : "CONNECT 4"),

  // The roster.
  rosterTitle: (n: number): string => `Opponents — ${n} installed`,
  play: "Play",
  back: "Back",
  firstMove: "First move",
  you: "You",
  them: "Them",
  /** Your record against this opponent on this board. */
  record: (w: number, l: number, d: number): string =>
    w + l + d === 0 ? "You have not played this one." : `You ${w}–${l}${d ? `–${d}` : ""}.`,

  // The match.
  leave: "Leave",
  yourTurn: "YOUR MOVE.",
  thinking: (bot: BotProfile): string => THINKING[bot.id] ?? `${shout(bot)} IS THINKING.`,
  noise: "NOISE",
  silence: "SILENCE",
  effects: "Effects",
  volume: "Volume",
  sound: "Sound",
  /** The mute row's label. Not "Sound" again — the group box already said it. */
  output: "Output",
  picture: "Picture",
  on: "On",
  off: "Off",

  // Outcomes. Flat and declarative, because a finished board is a fact — the
  // one class of claim in the game that doesn't have to hedge.
  won: "YOU WIN. THE CROWD IS REAL.",
  drew: "A DRAW. NOBODY IS PLEASED.",
  lost: (bot: BotProfile): string => DEFEAT[bot.id] ?? `${shout(bot)} WINS.`,
  again: "AGAIN.",
  swap: (bot: BotProfile, botStarts: boolean): string =>
    botStarts ? `Rematch, ${bot.name} starts` : "Rematch, you start",

  // System dialogs. Period chrome telling a small lie calmly.
  windowTitle: "FOURSCORE.EXE — not responding (it is)",
  aboutBody: "This program is running normally.",
  ok: "OK",
  quitTitle: "Leave?",
  quitBody: "Leave? The rally continues without you.",
  stay: "Stay",

  // The error dialog jokes in the styling and never in the facts: the first
  // sentence is what actually happened, and it is passed in by whatever broke.
  errorTitle: "fourscore.exe",
  errorTail: "Nothing else is wrong.",
  retry: "Try again",
} as const;
