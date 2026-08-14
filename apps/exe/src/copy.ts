/**
 * Every string BOARD.EXE says, in one place — fever's copy.ts pattern, because
 * it's what made the copy pass possible there.
 *
 * Voice (DIRECTION.md): sincere period software, deadpan. The software
 * believes it is fine. Bots get persona lines (they're software); the win
 * cascade is sincere, never sarcastic; nothing winks.
 */

export interface BotVoice {
  /** Statusbar while it's your move. */
  waiting: string;
  /** Statusbar while it deliberates. */
  thinking: string;
  /** Dialog body when it wins. */
  winBody: string;
  /** Statusbar after it wins. */
  winStatus: string;
  /** Statusbar after you beat it. */
  lostStatus: string;
}

export const BOT_VOICE: Record<string, BotVoice> = {
  acorn: {
    waiting: "ACORN is waiting to see what happens.",
    thinking: "ACORN is guessing.",
    winBody: "ACORN has connected four.<br>ACORN is as surprised as you are.",
    winStatus: "ACORN did not plan this.",
    lostStatus: "ACORN never saw it. ACORN never sees it.",
  },
  pebble: {
    waiting: "PEBBLE is sitting there.",
    thinking: "PEBBLE is being moved by larger forces.",
    winBody: "PEBBLE has connected four.<br>PEBBLE remains a pebble about it.",
    winStatus: "PEBBLE has not noticed winning.",
    lostStatus: "PEBBLE accepts this, as it accepts everything.",
  },
  moss: {
    waiting: "MOSS is waiting.",
    thinking: "MOSS is thinking about dirt.",
    winBody: "MOSS has connected four.<br>MOSS does not celebrate.",
    winStatus: "MOSS is already thinking about dirt.",
    lostStatus: "MOSS will grow over this eventually.",
  },
  bramble: {
    waiting: "BRAMBLE is coiled.",
    thinking: "BRAMBLE is feeling for something to grab.",
    winBody: "BRAMBLE has connected four.<br>It was holding them the whole time.",
    winStatus: "BRAMBLE tightens slightly.",
    lostStatus: "BRAMBLE has been pruned.",
  },
  cinder: {
    waiting: "CINDER is smoldering.",
    thinking: "CINDER is getting warmer.",
    winBody: "CINDER has connected four.<br>The room was already warm.",
    winStatus: "CINDER glows about it.",
    lostStatus: "CINDER has been put out. For now.",
  },
  vane: {
    waiting: "VANE is pointing somewhere.",
    thinking: "VANE is checking the wind.",
    winBody: "VANE has connected four.<br>The wind was going that way.",
    winStatus: "VANE points at the result.",
    lostStatus: "VANE blames the weather.",
  },
  quill: {
    waiting: "QUILL is taking notes.",
    thinking: "QUILL is writing something down about you.",
    winBody: "QUILL has connected four.<br>It had this drafted several moves ago.",
    winStatus: "QUILL is writing the ending down.",
    lostStatus: "QUILL is revising.",
  },
  oracle: {
    waiting: "THE ORACLE already knows.",
    thinking: "THE ORACLE is confirming what it knew.",
    winBody: "THE ORACLE has connected four.<br>This was always going to happen.",
    winStatus: "THE ORACLE knew.",
    lostStatus: "THE ORACLE did not know. This is a problem.",
  },
};

export const FALLBACK_VOICE: BotVoice = {
  waiting: "The opponent is waiting.",
  thinking: "The opponent is thinking.",
  winBody: "The opponent has connected four.",
  winStatus: "The opponent has won.",
  lostStatus: "The opponent has lost.",
};

export const voiceOf = (botId: string): BotVoice => BOT_VOICE[botId] ?? FALLBACK_VOICE;

export const STATUS = {
  yourMove: "YOUR MOVE.",
  yourMoveTakeYourTime: "YOUR MOVE. Take your time.",
  yourMoveWarm: "YOUR MOVE. The room is warm.",
  yourMoveLoud: "YOUR MOVE.",
  yourMoveNow: "YOUR MOVE. NOW.",
  theirMove: (name: string): string => `${name}'S MOVE.`,
  youWin: "YOU WIN.",
  crowd: "The crowd is real.",
  connected: (run: number): string => `${NUMBER_WORDS[run] ?? run} ARE CONNECTED.`,
  stoppedThinking: (name: string): string => `${name} has stopped thinking.`,
  draw: "A DRAW.",
  drawStatus: "Nobody is pleased.",
  forfeited: "YOU HAVE FORFEITED.",
} as const;

const NUMBER_WORDS: Record<number, string> = { 4: "FOUR", 5: "FIVE", 6: "SIX", 7: "SEVEN" };
export const numberWord = (n: number): string => NUMBER_WORDS[n] ?? String(n);

export const DIALOG = {
  win: (run: number): { title: string; body: string } => ({
    title: "BOARD.EXE",
    body: `${numberWord(run).charAt(0)}${numberWord(run).slice(1).toLowerCase()} have been connected.`,
  }),
  draw: {
    title: "BOARD.EXE",
    body: "The board is full.<br>Nothing further can happen here.",
  },
  forfeit: (name: string): { title: string; body: string } => ({
    title: "BOARD.EXE",
    body: `You have surrendered.<br>${name} accepts, in its way.`,
  }),
  finale: { title: "Congratulations", body: "YOU WIN." },
  about: {
    title: "About BOARD.EXE",
    body: "BOARD.EXE<br>Version 4.0 (of 4)<br><br>This computer is functioning normally.",
  },
  shutdown: {
    title: "Shut Down Windows",
    body: "The system is not ready to shut down.<br>The system may never be ready.",
  },
  exitGame: {
    title: "BOARD.EXE",
    body: "This program has closed.<br>The board remembers.",
  },
  screensaverEarly: {
    title: "System",
    body: "The screen saver would like to start early.",
  },
} as const;

/**
 * The cascade (approved in 02-win.html): sincere dialogs scattered across the
 * desktop at hand-tuned positions on irregular beats. Tuned, not random —
 * wrongness repeats.
 */
export interface CascadeSpec {
  title: string;
  body: string;
  icon?: "i" | "!";
  buttons?: string[];
  x: number;
  y: number;
  w: number;
  dwell: number;
}

export const CASCADE: readonly CascadeSpec[] = [
  { title: "BOARD.EXE", body: "Four have been connected.", x: 640, y: 110, w: 336, dwell: 420 },
  { title: "Information", body: "This is being celebrated.", x: 300, y: 290, w: 320, dwell: 260 },
  { title: "moves.txt", body: "The file now says you won.<br>It will keep saying it.", x: 924, y: 292, w: 306, dwell: 600 },
  { title: "Sound", body: "A fanfare has played.", x: 420, y: 80, w: 310, dwell: 220 },
  { title: "Print", body: "The result has been sent to the printer.", x: 856, y: 122, w: 348, dwell: 380 },
  { title: "System", icon: "!", body: "Every window has been told.", x: 330, y: 470, w: 330, dwell: 520 },
  { title: "flames.scr", body: "The fire is for you.", x: 1080, y: 540, w: 300, dwell: 260 },
  { title: "FOURSCORE.EXE — not responding (it is)", body: "This win is running normally.", buttons: ["OK", "OK"], x: 560, y: 250, w: 372, dwell: 420 },
];

/** The cascade names the run it saw. */
export const cascadeFor = (run: number): CascadeSpec[] =>
  CASCADE.map((c, i) =>
    i === 0 ? { ...c, body: `${numberWord(run).charAt(0)}${numberWord(run).slice(1).toLowerCase()} have been connected.` } : c,
  );

export const NOTES = {
  hesitated: ["and then you", "hesitated"],
  sameColumn: (col: number): string => `column ${col + 1} again.`,
  notAMetaphor: ["the flames are not", "a metaphor."],
  youWon: "you won. it is",
  youWonTail: "written down now.",
  theyWon: (name: string): string => `${name.toLowerCase()} won. noted.`,
  draw: "nobody won. noted.",
} as const;

export const HELP_TEXT = [
  "BOARD.EXE Help",
  "==============",
  "",
  "Q: How do I play?",
  "A: Connect four.",
  "",
  "Q: Four of what?",
  "A: Yes.",
  "",
  "Q: The clock says",
  "   6:66 PM.",
  "A: The clock is",
  "   correct.",
  "",
  "Q: There is a fire",
  "   on my desktop.",
  "A: The fire came",
  "   with the computer.",
  "",
  "Q: Who is MOSS?",
  "A: MOSS is thinking",
  "   about dirt.",
  "",
  "This help file is",
  "complete.",
].join("\n");

export const BIN_TEXT = [
  "the rest",
  "--------",
  "",
  "solitaire (gone)",
  "a fifth disc",
  "several 3-in-a-rows",
  "the year 1996",
  "one (1) fanfare, used",
  "",
  "These items cannot",
  "be restored.",
].join("\n");

export const TITLES = {
  board: "BOARD.EXE",
  moves: "moves.txt — Notepad",
  flames: "flames.scr — Preview",
  flamesN: (n: number): string => `flames.scr — Preview (${n})`,
  roamN: (n: number): string => `roam.scr (${n})`,
  coals: "coals.scr — Preview",
  pieces: "pieces.ctl",
  help: "help.txt — Notepad",
  bin: "the rest",
  feverCtl: "FEVER.CTL",
  congratulations: "Congratulations",
} as const;

export const PIECES_NOTE = "Applies immediately. No restart required, unusually.";

export const START_MENU = {
  programs: "Programs",
  documents: "Documents",
  settings: "Settings",
  help: "Help",
  shutdown: "Shut Down...",
} as const;

/** The clock believes these, in order of fever tier. */
export const CLOCK_BASE = { h: 6, m: 66 } as const;
