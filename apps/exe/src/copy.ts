/**
 * Every string BOARD.EXE says, in one place — fever's copy.ts pattern, because
 * it's what made the copy pass possible there.
 *
 * Voice (DIRECTION.md): sincere period software, deadpan. The software
 * believes it is fine. Bots get persona lines (they're software); the win
 * cascade is sincere, never sarcastic; nothing winks.
 */

import type { SoundName } from "./audio/library.js";

export interface BotVoice {
  /** Statusbar while it's your move. */
  waiting: string;
  /** Statusbar while it deliberates. */
  thinking: string;
  /** Dialog body when it wins — a function of the run, so a bot can't claim
      "four" on a Connect 5 board (the claim is generated, never written). */
  winBody: (run: number) => string;
  /** Statusbar after it wins. */
  winStatus: string;
  /** Statusbar after you beat it. */
  lostStatus: string;
}

/** "connected four" / "connected five" — the claim, generated from the run. */
const connected = (run: number): string => `connected ${numberWord(run).toLowerCase()}`;

export const BOT_VOICE: Record<string, BotVoice> = {
  acorn: {
    waiting: "ACORN is waiting to see what happens.",
    thinking: "ACORN is guessing.",
    winBody: (r) => `ACORN has ${connected(r)}.<br>ACORN is as surprised as you are.`,
    winStatus: "ACORN did not plan this.",
    lostStatus: "ACORN never saw it. ACORN never sees it.",
  },
  pebble: {
    waiting: "PEBBLE is sitting there.",
    thinking: "PEBBLE is being moved by larger forces.",
    winBody: (r) => `PEBBLE has ${connected(r)}.<br>PEBBLE remains a pebble about it.`,
    winStatus: "PEBBLE has not noticed winning.",
    lostStatus: "PEBBLE accepts this, as it accepts everything.",
  },
  moss: {
    waiting: "MOSS is waiting.",
    thinking: "MOSS is thinking about dirt.",
    winBody: (r) => `MOSS has ${connected(r)}.<br>MOSS does not celebrate.`,
    winStatus: "MOSS is already thinking about dirt.",
    lostStatus: "MOSS will grow over this eventually.",
  },
  bramble: {
    waiting: "BRAMBLE is coiled.",
    thinking: "BRAMBLE is feeling for something to grab.",
    winBody: (r) => `BRAMBLE has ${connected(r)}.<br>It was holding them the whole time.`,
    winStatus: "BRAMBLE tightens slightly.",
    lostStatus: "BRAMBLE has been pruned.",
  },
  cinder: {
    waiting: "CINDER is smoldering.",
    thinking: "CINDER is getting warmer.",
    winBody: (r) => `CINDER has ${connected(r)}.<br>The room was already warm.`,
    winStatus: "CINDER glows about it.",
    lostStatus: "CINDER has been put out. For now.",
  },
  vane: {
    waiting: "VANE is pointing somewhere.",
    thinking: "VANE is checking the wind.",
    winBody: (r) => `VANE has ${connected(r)}.<br>The wind was going that way.`,
    winStatus: "VANE points at the result.",
    lostStatus: "VANE blames the weather.",
  },
  quill: {
    waiting: "QUILL is taking notes.",
    thinking: "QUILL is writing something down about you.",
    winBody: (r) => `QUILL has ${connected(r)}.<br>It had this drafted several moves ago.`,
    winStatus: "QUILL is writing the ending down.",
    lostStatus: "QUILL is revising.",
  },
  oracle: {
    waiting: "THE ORACLE already knows.",
    thinking: "THE ORACLE is confirming what it knew.",
    winBody: (r) => `THE ORACLE has ${connected(r)}.<br>This was always going to happen.`,
    winStatus: "THE ORACLE knew.",
    lostStatus: "THE ORACLE did not know. This is a problem.",
  },
};

export const FALLBACK_VOICE: BotVoice = {
  waiting: "The opponent is waiting.",
  thinking: "The opponent is thinking.",
  winBody: (r) => `The opponent has ${connected(r)}.`,
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
  condolences: (name: string): { title: string; body: string } => ({
    title: "Condolences",
    body: `${name} WINS.`,
  }),
  about: {
    title: "About BOARD.EXE",
    body: "BOARD.EXE<br>Version 4.0 (of 4)<br><br>This computer is functioning normally.",
  },
  /** What the machine says when you ask it to stop. It declines, sincerely. */
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
 * Start ▸ Shut Down — the period's own dialog, and the period's own answer to
 * "reset the whole screen". A question, the ways of answering it, Yes/No/Help.
 * Shutting down is still refused (`DIALOG.shutdown`); restarting is real.
 */
export const SHUTDOWN = {
  title: "Shut Down Windows",
  prompt: "Are you sure you want to:",
  /** In the period's order, and the period's default: shut down is first.
      The third is this machine's own — a restart that also empties C:\ and
      every setting, offered out loud rather than done to anyone. */
  options: [
    "Shut down the computer?",
    "Restart the computer?",
    "Restart the computer and forget everything?",
  ] as const,
  yes: "Yes",
  no: "No",
  help: "Help",
} as const;

/**
 * The restart, out loud. A machine that came back without saying anything
 * would have been a page reload; this one counts its memory first, the way
 * every machine of the period did, in the same console the terminal uses.
 *
 * The version number is the one COMMAND.COM already claims and the clock
 * already believes.
 */
export const REBOOT = {
  wait: "Please wait while your computer restarts.",
  post: [
    "BOARD BIOS v4.00.666",
    "Memory Test : 640K OK",
    "Detecting IDE drives ...  C: BOARD 95",
    "Starting BOARD 95 ...",
  ],
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

/**
 * The loss cascade: the same sincere furniture, the opposite register. The
 * win multiplies announcements; the loss files paperwork. Quiet, no taskbar
 * crush — the crushed taskbar is the win's signature. `behind` puts a dialog
 * underneath the board window, where you find it later.
 */
export const LOSS_CASCADE: readonly (CascadeSpec & { behind?: boolean })[] = [
  { title: "Sound", body: "No fanfare has played.", x: 175, y: 265, w: 310, dwell: 620 },
  { title: "moves.txt", body: "The file now says you lost.<br>It will keep saying it.", x: 924, y: 292, w: 306, dwell: 900 },
  { title: "Information", body: "This is not being celebrated.", x: 560, y: 300, w: 320, dwell: 420, behind: true },
  { title: "flames.scr", body: "The fire has gone low.<br>It is not for you.", x: 1080, y: 540, w: 300, dwell: 760 },
] as const;

/**
 * What the desktop says between tier crossings — the beat roster's words.
 *
 * Two laws bind every string in here.
 *
 * **The confidence law (CLAUDE.md).** A beat's grade comes from the live feed,
 * which is `estimated` on every ply of every game — this engine's read, not a
 * fact about the game. So nothing here may declare a result. No line says a
 * move lost, or won, or was wrong; the blunder dialogs notice that something
 * happened and then decline to say what they think of it, which is both honest
 * and funnier than a verdict. `endgame.ts` is where the software is allowed to
 * be flat and declarative, because by then the game is actually over.
 *
 * **The voice.** Sincere period software, deadpan, believes it is fine. The OS
 * is not commenting on your game; it is filing, printing, previewing and
 * acknowledging, and your game is simply what is happening while it does that.
 *
 * Positions are authored against 1280x800 and carry anchors, like every other
 * window spec. They are hand-tuned per line rather than drawn from a hat: the
 * cascade's rule holds here too — randomness picks which act fires, never how
 * it looks.
 */
export interface BeatDialog {
  title: string;
  body: string;
  icon?: "i" | "!";
  buttons?: readonly string[];
  x: number;
  y: number;
  ax?: "left" | "center" | "right";
  ay?: "top" | "bottom";
  w: number;
  /** Milliseconds before the OS takes it back. You may close it first. */
  dwell: number;
}

export const BEAT_DIALOGS: Record<string, readonly BeatDialog[]> = {
  "move:fine": [
    { title: "Information", body: "A move has been made.<br>The move has been acknowledged.", x: 300, y: 200, ax: "center", w: 320, dwell: 2200 },
    { title: "Print", body: "Nothing has been sent to the printer.", x: 840, y: 168, ax: "center", w: 316, dwell: 2000 },
    { title: "Display", body: "The display is keeping up.", x: 250, y: 470, ax: "left", w: 288, dwell: 1900 },
  ],
  "move:brilliant": [
    { title: "Information", body: "That looks stronger.<br>The machine is prepared to say so.", x: 620, y: 150, ax: "center", w: 340, dwell: 2600 },
    { title: "Sound", body: "A small sound has played.<br>You may not have heard it.", x: 330, y: 250, ax: "center", w: 322, dwell: 2400 },
    { title: "flames.scr", body: "The fire has been informed.", x: 880, y: 470, ax: "right", w: 300, dwell: 2200 },
  ],
  "move:dubious": [
    { title: "System", body: "The system has said hmm.<br>The system does not elaborate.", x: 560, y: 220, ax: "center", w: 340, dwell: 2600 },
    { title: "Display", body: "The display noticed.<br>The display is saying nothing.", x: 300, y: 390, ax: "center", w: 330, dwell: 2400 },
    { title: "moves.txt", body: "The file has recorded that.<br>The file is not editorialising.", x: 900, y: 250, ax: "right", w: 336, dwell: 2600 },
  ],
  // Hedged by law, and better for it. Not one of these says the move was bad.
  "move:blunder": [
    { title: "Information", body: "This program has an opinion.<br>It is keeping it.", x: 480, y: 260, ax: "center", w: 330, dwell: 3000 },
    { title: "Display", body: "That looked like something.<br>The display is not sure what.", x: 700, y: 180, ax: "center", w: 348, dwell: 2800 },
    { title: "System", icon: "!", body: "A column has been used.<br>It may not have been the one.", x: 360, y: 430, ax: "center", w: 344, dwell: 3000 },
    { title: "FOURSCORE.EXE — not responding (it is)", body: "This move is running normally.", buttons: ["OK", "OK"], x: 540, y: 320, ax: "center", w: 372, dwell: 2800 },
  ],
  "threat:you": [
    { title: "Information", body: "There is a winning column.<br>It is one of them.", x: 520, y: 190, ax: "center", w: 330, dwell: 3000 },
    { title: "flames.scr", body: "The fire has read the board.<br>The fire is encouraged.", x: 870, y: 430, ax: "right", w: 312, dwell: 2800 },
  ],
  "threat:bot": [
    { title: "System", icon: "!", body: "Something is available to the opponent.<br>This is not a warning.", x: 470, y: 230, ax: "center", w: 366, dwell: 3200 },
    { title: "Display", body: "The next move has been previewed.<br>It went well for them.", x: 690, y: 350, ax: "center", w: 348, dwell: 3000 },
  ],
  "swing:rising": [
    { title: "System", body: "The room has changed temperature.<br>No action is required.", x: 600, y: 170, ax: "center", w: 352, dwell: 2600 },
    { title: "flames.scr", body: "The fire has increased.<br>This is within tolerance.", x: 880, y: 490, ax: "right", w: 316, dwell: 2600 },
  ],
  // The best line in fever's roster, and this is the only beat that plays it.
  "swing:collapsing": [
    { title: "Information", body: "Never mind.", x: 540, y: 280, ax: "center", w: 300, dwell: 2400 },
    { title: "Display", body: "That has passed.<br>The display was ready for nothing.", x: 320, y: 330, ax: "center", w: 344, dwell: 2600 },
  ],
};

/** What BOARD.EXE's titlebar says when it briefly says something else. */
export const BEAT_TITLES: Record<string, readonly string[]> = {
  "move:fine": ["BOARD.EXE — working", "BOARD.EXE — please wait", "BOARD.EXE — (1 move)"],
  "move:dubious": ["BOARD.EXE — thinking about it", "BOARD.EXE — (not responding)", "BOARD.EXE — hm"],
  "swing:collapsing": ["BOARD.EXE — never mind", "BOARD.EXE — (nothing)", "BOARD.EXE — working"],
};

/** What moves.txt volunteers, in its own lowercase. */
export const BEAT_NOTES: Record<string, readonly string[]> = {
  "move:fine": ["that happened.", "noted without comment.", "the file is keeping up.", "still writing this down."],
  "move:brilliant": ["that one is going in.", "underlined.", "the file approves. the file is a file."],
  "move:dubious": ["hm.", "noted. no further notes.", "written down twice."],
  "swing:collapsing": ["never mind.", "scratched out.", "the file has moved on."],
};

export const NOTES = {
  hesitated: ["and then you", "hesitated"],
  sameColumn: (col: number): string => `column ${col + 1} again.`,
  notAMetaphor: ["the flames are not", "a metaphor."],
  youWon: "you won. it is",
  youWonTail: "written down now.",
  theyWon: (name: string): string => `${name.toLowerCase()} won. noted.`,
  theyWonTail: "no further notes.",
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
  "Q: There are too",
  "   many windows.",
  "A: Shut Down, then",
  "   Restart.",
  "   Ctrl+Alt+Del",
  "   also asks.",
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

/**
 * The other things the machine can run. Same voice: sincere period software,
 * deadpan, believes it is fine.
 */
export const GAMES_COPY = {
  mines: {
    win: { title: "MINES.EXE", body: "All mines have been avoided.<br>They remain where they are." },
    lose: { title: "MINES.EXE", body: "You have found a mine.<br>It was always there." },
    help: { title: "MINES.EXE", body: "The numbers count the mines nearby.<br>The mines count nothing." },
  },
  snake: {
    dead: { title: "SNAKE.EXE", body: "The snake has met itself.<br>It could not agree." },
    wall: { title: "SNAKE.EXE", body: "The snake has reached the edge.<br>There was nothing out there." },
    score: (n: number): string => `LENGTH: ${n}. The snake is being reasonable about it.`,
    idle: "Press an arrow key. The snake is waiting.",
    help: { title: "SNAKE.EXE", body: "The snake goes where you point it. It cannot stop.<br>The sides go around. The top and the bottom are final." },
  },
  sol: {
    win: { title: "SOL.EXE", body: "The cards have been freed.<br>They will be recaptured." },
    stuckDeal: "The deck has started over. It does this.",
    nothingToUndo: "Nothing to take back.",
    help: { title: "SOL.EXE", body: "Red on black, in descending order.<br>The aces leave first. Undo takes it back." },
  },
  checkers: {
    mustCapture: "A capture is available. It is not optional.",
    yourMove: "YOUR MOVE.",
    thinking: "The computer is moving its men.",
    machineWins: { title: "CHECKERS.EXE", body: "You have nowhere to go.<br>The computer does not gloat. Visibly." },
    youWin: { title: "CHECKERS.EXE", body: "The computer has nowhere to go.<br>It has filed this under draughts." },
    stale: { title: "CHECKERS.EXE", body: "Nothing has been captured for some time.<br>The men have agreed to stop." },
    help: { title: "CHECKERS.EXE", body: "Diagonal moves only. Captures are compulsory.<br>Kings come back down the board." },
  },
  chess: {
    yourMove: "YOUR MOVE.",
    check: "CHECK. The king has been made aware.",
    thinking: "The computer is considering all of it.",
    thinkingMost: "The computer is considering most of it.",
    thinkingSome: "The computer is considering some of it.",
    youWin: { title: "CHESS.EXE", body: "Checkmate.<br>The computer accepts this as information." },
    machineWins: { title: "CHESS.EXE", body: "Checkmate.<br>The computer has written it down somewhere." },
    stalemate: { title: "CHESS.EXE", body: "Stalemate.<br>Nobody can do anything. This is official." },
    fifty: { title: "CHESS.EXE", body: "Fifty moves and nothing has happened.<br>The pieces have agreed to stop." },
    threefold: { title: "CHESS.EXE", body: "This position keeps happening.<br>The rules say three times is enough." },
    promote: { title: "Promotion", body: "The pawn has reached the end.<br>It must become something." },
    help: { title: "CHESS.EXE", body: "It is chess.<br>You may already know how this goes." },
    /* ---- the result, which is a fact ----
       Checkmate and stalemate are proven by the rules, not read off an
       evaluation, so this half of the file is allowed to be flat and
       declarative. It stays in the statusbar for as long as the position
       stands, because the position stands. */
    over: {
      youWin: "CHECKMATE. You win.",
      machineWins: "CHECKMATE. The computer wins.",
      stalemate: "STALEMATE. Nobody may move.",
      fifty: "DRAW. Fifty moves and nothing happened.",
      threefold: "DRAW. The position happened three times.",
    },
    /** What the titlebar carries afterwards, for good. */
    overTitle: {
      youWin: "Checkmate",
      machineWins: "Checkmate",
      stalemate: "Stalemate",
      fifty: "Draw",
      threefold: "Draw",
    },
    overButtons: ["OK", "New Game"],
    /* ---- and the pressure, which is a guess ----
       These hang off a heuristic reading of the position — material standing
       loose, a king addressed, a mate on the board — so every one of them
       hedges, and not one says a move won or lost anything. The titlebar
       carries them while they last and drops them when the position calms. */
    pressure: {
      check: "The king is aware",
      loose: "Something is loose",
      swing: "Something has changed",
      mate: "This looks nearly over",
    },
  },
  notepad: {
    saved: (name: string): { title: string; body: string } => ({
      title: "Notepad",
      body: `${name} has been saved.<br>It is on C:\\ with everything else.`,
    }),
    cleared: { title: "Notepad", body: "The page is blank again.<br>Nothing was lost that mattered." },
    replace: (name: string): { title: string; body: string } => ({
      title: "Save As",
      body: `${name} already exists.<br>Replace it?`,
    }),
    noName: { title: "Notepad", body: "The file needs a name.<br>It can be almost anything." },
  },
  /* PAINT.EXE speaks the same flat filing language as Notepad — a picture is
     just another file, and the machine is not impressed by either. */
  paint: {
    saved: (name: string): { title: string; body: string } => ({
      title: "Paint",
      body: `${name} has been saved.<br>It is on C:\\ with everything else.`,
    }),
    replace: (name: string): { title: string; body: string } => ({
      title: "Save As",
      body: `${name} already exists.<br>Replace it?`,
    }),
    noName: { title: "Paint", body: "The picture needs a name.<br>It can be almost anything." },
    notAPicture: (name: string): { title: string; body: string } => ({
      title: "Paint",
      body: `Paint cannot see a picture in ${name}.<br>Notepad may know what it is.`,
    }),
  },
} as const;

/**
 * REVIEW.EXE — the game, gone back over.
 *
 * The confidence law (CLAUDE.md) binds every string here harder than anywhere
 * else, because this is the one window that grades moves. A ply's score is
 * either a fact about the game or this machine's read of it, and the sentence
 * has to carry which one it is without ever naming the machinery: flat and
 * declarative where it is known, hedged everywhere else. One line on the
 * chart, no legend, no badges — the player is never asked to hold the
 * distinction, only protected from the overclaim.
 */
export const REVIEW = {
  /** While the machine reads the game back. */
  working: "The machine is going back over it.",
  workingSub: "This takes as long as it takes.",
  none: {
    title: "REVIEW.EXE",
    body: "Nothing has finished yet.<br>There is nothing to go over.",
  },
  failed: {
    title: "REVIEW.EXE",
    body: "The review has stopped working.<br>The game remains played.",
  },
  /** The result is a fact — the game is over, so this half is flat. */
  result: {
    win: "YOU WON.",
    loss: (name: string): string => `${name} WON.`,
    draw: "NOBODY WON.",
  },
  /** Proven: the sentence is allowed to be a verdict. */
  turningPoint: (move: number): string => `Move ${move} is where it went. This is known.`,
  /** Estimated: the sentence is a lead, and sounds like one. */
  biggestSwing: (move: number): string => `Move ${move} looks like the loose one.`,
  clean: "Nothing stands out. It was simply played.",
  moveRow: (move: number, col: number): string => `Move ${move}, column ${col}`,
  /** One remark per grade, in two registers: proven says, estimated hedges. */
  remark: {
    proven: {
      best: "correct.",
      good: "kept the result.",
      inaccuracy: "slower.",
      mistake: "gave something up.",
      blunder: "the game changed here.",
      unknown: "",
    },
    estimated: {
      best: "looks right.",
      good: "looks fine.",
      inaccuracy: "hm.",
      mistake: "looks loose.",
      blunder: "looked expensive.",
      unknown: "",
    },
  },
} as const;

export const TITLES = {
  board: "BOARD.EXE",
  /** The titlebar carries which game this is — a Connect 6 window should
      never have to be counted to be identified. */
  boardVariant: (name: string): string => `BOARD.EXE — ${name}`,
  moves: "moves.txt — Notepad",
  flames: "flames.scr — Preview",
  flamesN: (n: number): string => `flames.scr — Preview (${n})`,
  roamN: (n: number): string => `roam.scr (${n})`,
  coals: "coals.scr — Preview",
  pieces: "pieces.ctl",
  help: "help.txt — Notepad",
  bin: "the rest",
  games: "games",
  mines: "MINES.EXE",
  sol: "SOL.EXE",
  snake: "SNAKE.EXE",
  checkers: "CHECKERS.EXE",
  chess: "CHESS.EXE",
  /** CHESS.EXE's titlebar carries what the window currently knows — a hedged
      note while the position is sharp, the result once there is one. */
  chessNote: (note: string): string => `CHESS.EXE — ${note}`,
  notepad: (name: string): string => `${name} — Notepad`,
  paint: (name: string): string => `${name} — Paint`,
  terminal: "COMMAND.COM",
  saveAs: "Save As",
  openFile: "Open",
  feverCtl: "FEVER.CTL",
  sounds: "sounds.ctl",
  review: "REVIEW.EXE",
  congratulations: "Congratulations",
} as const;

export const PIECES_NOTE = "Applies immediately. No restart required, unusually.";

/**
 * The Sounds control panel's event list — one row per sound in the scheme, in
 * the Control Panel's own flat language.
 *
 * The joke is the filing, and it only works if nothing in here winks: the
 * machine lists the fever's symptoms in the same list as Minimize and Maximize,
 * because from inside the OS they are the same kind of event. `Clock corrected`
 * is a clock losing four minutes. `Icons rearranged` is the desk flinching.
 * Neither is described as a problem, because this computer is functioning
 * normally.
 *
 * A test keeps this list and the library exactly in step in both directions —
 * a sound with no event row is a sound the player can never find, and an event
 * row with no sound is a dead control.
 */
export const SOUND_EVENTS: readonly { sound: SoundName; label: string }[] = [
  { sound: "startup", label: "Start Windows" },
  { sound: "shutdown-chime", label: "Exit Windows" },
  { sound: "ding", label: "Default sound" },
  { sound: "chord", label: "Program error" },
  { sound: "tada", label: "Game won" },
  { sound: "click", label: "Command accepted" },
  { sound: "menu", label: "Menu popup" },
  { sound: "window-open", label: "Open program" },
  { sound: "window-close", label: "Close program" },
  { sound: "window-min", label: "Minimize" },
  { sound: "window-max", label: "Maximize" },
  { sound: "hover-tick", label: "Disc over column" },
  { sound: "disc-drop", label: "Disc released" },
  { sound: "disc-land", label: "Disc landed" },
  { sound: "bot-step", label: "Opponent deliberating" },
  { sound: "line-catch", label: "Line connected" },
  { sound: "smolder", label: "Line connected (theirs)" },
  { sound: "tier-cross", label: "System state changed" },
  { sound: "flare", label: "flames.scr — flare" },
  { sound: "clock-tick", label: "Clock corrected" },
  { sound: "twitch", label: "Icons rearranged" },
  { sound: "saver-thunk", label: "Screen saver" },
  { sound: "drive-seek", label: "Disk activity" },
];

export const SOUNDS = {
  events: "Events:",
  scheme: "Schemes:",
  volume: "Volume:",
  mute: "Mute all sounds",
  play: "Play",
  schemes: {
    board95: "BOARD 95",
    possessed: "BOARD 95 (as it is now)",
    none: "No Sounds",
  },
  /** The note under the list, which changes with what the panel can do. */
  note: {
    ok: "This scheme is the one the machine came with.",
    possessed: "The machine prefers this one. It has not said why.",
    none: "There are no sounds to preview in this scheme.",
    muted: "Sounds are muted. The scheme is unaffected.",
  },
  tray: {
    on: "Volume",
    off: "Volume (muted)",
  },
} as const;

export const START_MENU = {
  programs: "Programs",
  documents: "Documents",
  settings: "Settings",
  help: "Help",
  shutdown: "Shut Down...",
} as const;

/** The clock believes these, in order of fever tier. */
export const CLOCK_BASE = { h: 6, m: 66 } as const;

/**
 * COMMAND.COM. The error strings are the period's own — "Bad command or file
 * name" needs no possession, it always sounded like that. The banner and HELP
 * are where this machine gets a word in.
 */
export const TERM = {
  banner: ["BOARD 95 [Version 4.00.666]", "The disk is genuine. Type HELP.", ""],
  prompt: "C:\\>",
  help: [
    "DIR              the disk's contents",
    "TYPE file        print a file",
    "EDIT file        open a file in Notepad",
    "PAINT file.spr   open a picture in Paint",
    "RUN file.asm     assemble and run a program",
    "ASM file.asm     assemble only, and report",
    "CC file.c        compile C; file.asm appears",
    "DEL, REN, COPY   what they always did",
    "MKDIR name       a folder; it lands on the desk",
    "ECHO text        it comes back",
    "CLS              a clean screen",
    "VER, TIME        facts about the machine",
    "EXIT             close this window",
    "",
    "ls, cat, rm, mv, cp, clear also answer.",
    "The machine does not ask where you learned them.",
    "",
    "A running program stops on ESC.",
    "TYPE ASM.TXT explains the processor.",
    "TYPE C.TXT explains the other language.",
  ],
  badCommand: "Bad command or file name",
  fileNotFound: "File not found",
  duplicateOrMissing: "Duplicate file name or file not found",
  dirExists: "Directory already exists",
  copied: "        1 file(s) copied",
  deleted: (name: string): string => `${name} has been deleted. It is not in the rest.`,
  ver: "BOARD 95 [Version 4.00.666]",
  time: "The current time is 6:66 PM.",
  date: "It has been 8/14/96 for some time now.",
  needsFile: (cmd: string): string => `${cmd} needs a file name`,
  dirHeader: [" Volume in drive C is POSSESSED", " Directory of C:\\", ""],
  dirFooter: (count: number, bytes: string, free: string): string[] => [
    "",
    `        ${count} file(s)          ${bytes} bytes`,
    `                        ${free} bytes free`,
  ],
  asmOk: (name: string, words: number): string => `${name}: ${words} words. The processor accepts it.`,
  ccOk: (src: string, outName: string, words: number): string =>
    `${src} -> ${outName}: ${words} words. The processor accepts it.`,
  /** CC emitted assembly its own assembler rejects — the compiler's fault,
      and the machine says so instead of blaming the program. */
  ccBadAsm: "CC has produced something the processor refuses. This is CC's fault:",
  asmErrLine: (line: number, msg: string): string => (line > 0 ? `Line ${line}: ${msg}` : msg),
  asmErrCount: (n: number): string => `${n} error(s). Nothing was run.`,
  broke: "^C",
  faulted: (msg: string): string => `${msg}. The program has been stopped.`,
} as const;

/**
 * What a fresh disk arrives holding: the machine's own documentation and two
 * programs known to work. asm.txt is real documentation — it must agree with
 * vm.ts, and vm.test.ts assembles both .asm seeds to keep everyone honest.
 */
export const SEED_FILES: readonly { name: string; text: string }[] = [
  {
    name: "readme.txt",
    text: [
      "README.TXT",
      "----------",
      "",
      "This computer has a disk now. The files on it are",
      "real: they survive the machine turning off, which",
      "the machine does not do, but still.",
      "",
      "COMMAND.COM is on the desk. Things to type into it:",
      "",
      "  DIR              what is on the disk",
      "  TYPE ASM.TXT     how to program this computer",
      "  TYPE C.TXT       the other language",
      "  EDIT HELLO.ASM   look at a program",
      "  RUN HELLO.ASM    run it",
      "  CC FIZZ.C        compile the C one",
      "  HELP             the rest",
      "",
      "Notepad opens and saves files now (the File menu).",
      "Anything you save is on C:\\ with everything else.",
      "",
      "PAINT.EXE draws pictures. A picture is a .SPR file,",
      "which is text, like everything here — TYPE one and",
      "see. rocket.spr came with the machine. Right-click",
      "a picture on the desk to pin it up.",
      "",
      "The processor is real. See ASM.TXT.",
    ].join("\n"),
  },
  {
    name: "asm.txt",
    text: [
      "ASM.TXT — the processor",
      "=======================",
      "",
      "This machine's processor is a 16-bit unit with 4096",
      "words of memory. A program is a text file of",
      "instructions, one per line. COMMAND.COM runs it:",
      "",
      "  RUN NAME.ASM     assemble and run",
      "  ASM NAME.ASM     assemble only, and report",
      "  ESC              stops a running program",
      "",
      "REGISTERS",
      "",
      "  R0..R7 hold one word (0..65535) each. There is",
      "  also a program counter and a stack pointer. You",
      "  do not get to argue with the stack pointer.",
      "",
      "INSTRUCTIONS",
      "",
      "  A value (v below) is a register (R1), a number",
      "  (7, 0x0F00, -1), a character ('A'), or a label.",
      "",
      "  MOV Ra, v        Ra = v",
      "  ADD SUB MUL      arithmetic onto Ra: ADD R0, 1",
      "  DIV MOD          whole numbers only. Dividing by",
      "                   zero is a fault, as in life",
      "  AND OR XOR       bitwise, onto Ra",
      "  SHL SHR          shift Ra by v bits",
      "  CMP Ra, v        compare and remember (see jumps)",
      "  LD  Ra, [v]      read memory at address v into Ra",
      "  ST  Ra, [v]      write Ra to memory at address v",
      "  JMP v            go to v (usually a label)",
      "  JZ JNZ           go if the last result was zero,",
      "                   or if it was not",
      "  JC JNC           after CMP A, B: JC goes if A < B",
      "  JN JNN           go if the last result was",
      "                   negative (bit 15), or not",
      "  CALL v, RET      go, and come back",
      "  PUSH v, POP Ra   the stack",
      "  HLT              the program is over",
      "  NOP              nothing, on purpose",
      "",
      "DATA",
      "",
      "  name:            a label — a place in the program",
      "  .word 1, 2, 3    these words, placed here",
      '  .str "TEXT"      characters, then a zero',
      "  .space 20        that many zero words",
      "  ; anything       a comment",
      "",
      "THE HARDWARE",
      "",
      "  The top of memory is the hardware. Read and write",
      "  it with LD and ST; the names are built in.",
      "",
      "  CON  0x0F00  write a character code, it prints.",
      "               10 ends the line",
      "  NUM  0x0F01  write a value, it prints as a number",
      "  KEY  0x0F02  read the next typed key, 0 if none",
      "  RND  0x0F03  read 16 random bits",
      "",
      "The stack starts under the hardware at 0x0F00 and",
      "grows down. HELLO.ASM and GUESS.ASM on this disk are",
      "known to work. Programs you write are between you",
      "and the machine.",
    ].join("\n"),
  },
  {
    name: "c.txt",
    text: [
      "C.TXT — the other language",
      "==========================",
      "",
      "The disk carries CC, a C compiler. It reads a .c",
      "file and writes the .asm the processor actually",
      "runs — TYPE the output if you doubt it.",
      "",
      "  CC NAME.C        compile; NAME.ASM appears",
      "  RUN NAME         run it (RUN will also take",
      "                   the .c straight, quietly)",
      "",
      "THE LANGUAGE",
      "",
      "  int and char are one 16-bit word each.",
      "  Pointers and arrays are word addresses;",
      "  *p and p[i] both work. void is accepted.",
      "",
      "  Functions take arguments and return one word.",
      "  Recursion works. main() is where it starts.",
      "",
      "  if/else, while, do/while, for, break,",
      "  continue, return. The operators are C's, with",
      "  C's precedence, including ?: and op=.",
      "",
      "  #define NAME 123 is the entire preprocessor.",
      "  /* comments */ and // comments.",
      "",
      "THE HARDWARE, WEARING C",
      "",
      "  putc(c)   print one character. 10 ends a line",
      "  putn(n)   print a signed number",
      "  puts(s)   print a string. No newline arrives",
      "            unless you send one",
      "  getc()    wait for a key, return it",
      "  key()     the key if one is waiting, else 0",
      "  rand()    16 random bits",
      "",
      '  asm("st r0, [con]") passes a line straight to',
      "  the assembler, for when C is not enough.",
      "",
      "SMALL PRINT",
      "",
      "  Numbers are 16 bits and wrap. >> shifts in",
      "  zeros. Arguments and locals live under 0x0E00",
      "  and grow down; a large enough program can walk",
      "  into them. The compiler will not stop you.",
      "  FIZZ.C on this disk is known to work.",
    ].join("\n"),
  },
  {
    name: "fizz.c",
    text: [
      "/* fizz.c — the machine counts to 30 and follows the rules.",
      "   CC FIZZ.C in COMMAND.COM makes FIZZ.ASM; RUN FIZZ runs it. */",
      "",
      "int main() {",
      "    int i;",
      "    for (i = 1; i <= 30; i++) {",
      "        if (i % 15 == 0) puts(\"FIZZBUZZ\");",
      "        else if (i % 3 == 0) puts(\"FIZZ\");",
      "        else if (i % 5 == 0) puts(\"BUZZ\");",
      "        else putn(i);",
      "        putc('\\n');",
      "    }",
      "    puts(\"THE RULES HAVE BEEN FOLLOWED.\\n\");",
      "    return 0;",
      "}",
    ].join("\n"),
  },
  {
    name: "hello.asm",
    text: [
      "; hello.asm — the disk says hello.",
      "; RUN HELLO.ASM in COMMAND.COM, or EDIT HELLO.ASM to change it.",
      "",
      "        mov r1, msg      ; r1 walks the string",
      "loop:   ld  r0, [r1]",
      "        cmp r0, 0        ; strings end on a zero",
      "        jz  done",
      "        st  r0, [con]    ; the console port prints one character",
      "        add r1, 1",
      "        jmp loop",
      "done:   hlt",
      "",
      'msg:    .str "HELLO FROM THE DISK.\\n"',
    ].join("\n"),
  },
  {
    name: "guess.asm",
    text: [
      "; guess.asm — the machine has thought of a number from 1 to 100.",
      "; Type a guess and press Enter. ESC stops any program.",
      "",
      "        ld  r0, [rnd]",
      "        mod r0, 100",
      "        add r0, 1        ; the number, in r0",
      "        mov r1, prompt",
      "        call print",
      "",
      "again:  mov r2, 0        ; the guess being typed",
      "getk:   ld  r3, [key]",
      "        cmp r3, 0",
      "        jz  getk         ; no key yet; ask again",
      "        cmp r3, 13       ; Enter",
      "        jz  judge",
      "        cmp r3, '0'",
      "        jc  getk         ; below '0' is not a digit",
      "        cmp r3, 58       ; one past '9'",
      "        jnc getk         ; and neither is that",
      "        st  r3, [con]    ; echo the digit",
      "        sub r3, '0'",
      "        mul r2, 10",
      "        add r2, r3",
      "        jmp getk",
      "",
      "judge:  mov r3, 10",
      "        st  r3, [con]    ; end the line",
      "        cmp r2, r0",
      "        jz  win",
      "        jc  toolow",
      "        mov r1, lower",
      "        call print",
      "        jmp again",
      "toolow: mov r1, higher",
      "        call print",
      "        jmp again",
      "win:    mov r1, yes",
      "        call print",
      "        hlt",
      "",
      "; print: writes the zero-ended string at r1 to the console.",
      "print:  ld  r3, [r1]",
      "        cmp r3, 0",
      "        jz  pdone",
      "        st  r3, [con]",
      "        add r1, 1",
      "        jmp print",
      "pdone:  ret",
      "",
      'prompt: .str "GUESS THE NUMBER (1-100).\\n"',
      'higher: .str "HIGHER.\\n"',
      'lower:  .str "LOWER.\\n"',
      'yes:    .str "YES. THAT IS THE NUMBER.\\n"',
    ].join("\n"),
  },
  {
    /* The rocket used to be chrome nobody asked for; now it is a file. It
       arrives on every disk in the picture format, where it can be repainted,
       pinned up, filed away, or thrown in the rest like anything else. */
    name: "rocket.spr",
    text: [
      ".....rr.....",
      "....rrrr....",
      "....rrrr....",
      "...swssss...",
      "...swssss...",
      "..sswkksss..",
      "..sswbbkss..",
      "..sswbbkss..",
      "..sswkksss..",
      ".rsswssssr..",
      ".rrswsssrr..",
      "rrrssssssrr.",
      "rr.ssssss.rr",
      "....oyyo....",
      "...oyyyyo...",
      "...oyyyyo...",
      "....oyyo....",
      ".....oo.....",
    ].join("\n"),
  },
];
