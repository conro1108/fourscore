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
 * Lines a specific opponent gets instead of the generic one — the chrome half
 * of "bots as characters", written from the eight personas in VISION.md.
 *
 * Two lines each, and that is on purpose. These are the only two places in the
 * game where an opponent speaks in their own voice, so each one has to carry
 * the whole persona: the thinking line is who they are while nothing is
 * happening, and the defeat line is who they are when they have won. Everything
 * else about them is the void they stand in and the clip their screen plays.
 *
 * The confidence law reaches here too, and it bites hardest on the top two
 * rungs. A defeat line describes a finished board, which is a fact, so it may
 * be flat — but it may not claim *proof*, and "it knew from the start" would be
 * exactly that. Quill's line is about the end of a game that has ended; the
 * Oracle's declines to say when it knew, which on Connect 5 is usually "never"
 * (`exactnessNote` is the one thing allowed to talk about the crossover, and
 * the engine generates it from the measurement).
 *
 * The fallback below is still live and still deliberately plain: an opponent
 * with no entry gets `${NAME} IS THINKING.` rather than an improvised voice.
 */
const THINKING: Record<string, string> = {
  acorn: "ACORN IS THINKING!!",
  pebble: "PEBBLE IS CONSIDERING TWO THINGS.",
  moss: "MOSS IS THINKING ABOUT DIRT.",
  bramble: "BRAMBLE IS ALREADY MOVING.",
  cinder: "CINDER IS THINKING ABOUT WHAT YOU WILL DO.",
  vane: "VANE IS THINKING ABOUT SOMETHING ELSE.",
  quill: "QUILL IS READING AHEAD.",
  oracle: "THE ORACLE IS NOT THINKING.",
};

const DEFEAT: Record<string, string> = {
  acorn: "ACORN WINS. ACORN IS AMAZED.",
  pebble: "PEBBLE WINS. PEBBLE BLOCKED IT.",
  moss: "MOSS WINS. MOSS DOES NOT CELEBRATE.",
  bramble: "BRAMBLE WINS. BRAMBLE IS NOT SURE HOW.",
  cinder: "CINDER WINS. YOU PICKED ONE.",
  vane: "VANE WINS. VANE SAYS IT WAS CLOSE.",
  quill: "QUILL WINS. QUILL SAW THE END OF IT.",
  oracle: "THE ORACLE WINS. IT DOES NOT SAY WHEN IT KNEW.",
};

export const COPY = {
  title: "FOURSCORE",
  tagline: "ADMISSION WAS ALWAYS FREE.",

  // The menu. Sentence case: this is software that thinks it's ordinary.
  //
  // VISION.md's voice sample has this button saying "Resume" on first launch,
  // as a small calm lie. It isn't one here, because the menu keeps a half-played
  // board as scenery and this button really does resume it — so a "Resume" with
  // nothing to resume reads as a bug rather than as a joke, and it lied about
  // what pressing it did.
  start: "Start",
  resume: "Resume",
  opponent: "Opponent",
  settings: "Settings",
  about: "About",
  online: "Play a person",

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

  // Playing a person. Sentence case again: this is the connection dialog of an
  // ordinary application, and the only funny thing about it is how calm it is
  // about there being somebody else on the other end.
  //
  // The opponent has no persona and gets none. Every other opponent in the game
  // is written; this one is a stranger the software knows nothing about, so it
  // says "they" and leaves it there — inventing a voice for a real person is the
  // one thing the possessed software isn't allowed to do.
  onlineTitle: "Two players",
  onlineBody: "One of you hosts. The other one types the code in.",
  onlineHost: "Host a game",
  /** The button under that label. Short, because the groove already said it. */
  onlineHostGo: "Host",
  onlineJoin: "Join",
  onlineCode: "Code",
  connecting: "Connecting…",
  waitingTitle: "Waiting for them",
  waitingBody: "Send them the code. The game starts the moment they're in.",
  /** Under the code: which board, and the one thing hosting decides. */
  waitingNote: (v: { name: string }): string => `${v.name} · you move first.`,
  copyLink: "Copy link",
  copied: "Copied",
  cancel: "Cancel",
  lobby: "Lobby",
  /** Who you're playing, when they haven't told the database their name. */
  stranger: "somebody",
  /** The status line's other half online. They are a person; they get no persona. */
  theirTurn: "THEY ARE THINKING.",
  waitingForThem: "NOBODY IS HERE YET.",

  // Outcomes. Flat and declarative, because a finished board is a fact — the
  // one class of claim in the game that doesn't have to hedge.
  won: "YOU WIN. THE SCREEN IS DELIGHTED.",
  drew: "A DRAW. NOBODY IS PLEASED.",
  lost: (bot: BotProfile): string => DEFEAT[bot.id] ?? `${shout(bot)} WINS.`,
  /** Online, the loss line can't name a persona, so it names nobody. */
  lostOnline: "THEY WIN. THE SCREEN IS DELIGHTED ANYWAY.",
  again: "AGAIN.",
  swap: (bot: BotProfile, botStarts: boolean): string =>
    botStarts ? `Rematch, ${bot.name} starts` : "Rematch, you start",

  // System dialogs. Period chrome telling a small lie calmly.
  windowTitle: "FOURSCORE.EXE — not responding (it is)",
  aboutBody: "This program is running normally.",
  ok: "OK",
  quitTitle: "Leave?",
  quitBody: "Leave? The screen keeps playing.",
  stay: "Stay",

  // The error dialog jokes in the styling and never in the facts: the first
  // sentence is what actually happened, and it is passed in by whatever broke.
  errorTitle: "fourscore.exe",
  errorTail: "Nothing else is wrong.",
  retry: "Try again",
  /**
   * The desync report. Client-authoritative play means this can happen and the
   * software has to say what happened rather than render a board neither of you
   * is playing — possessed styling, honest facts (PLAN.md product truth 4).
   */
  desync: "Their game is out of step with this one. The move it sent can't be played here.",
  /** The other honest online report: the game ended, and not on the board. */
  opponentLeft: "They left the game.",
} as const;
