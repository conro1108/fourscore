# BOARD.EXE — direction

> **State (2026-08-14):** v1 is built and lives in `src/`. The desktop runs
> (`npm run dev`), plays the real ladder over the worker protocol, and has
> the win cascade, fever escalation (director.ts + effects.ts), the flat-16
> chips with the pieces.ctl lab, and the deep-link harness. `npm run shots`
> (in apps/exe) screenshots every named state through its own dev server;
> `node tools/live.mjs` click-drives a real game. Everything below remains
> the law.
>
> A loss now gets the coals parade (endgame.ts): the line smolders, the OS
> files condolence paperwork, Condolences arrives in the win's own type —
> still quieter than the win on purpose. And the machine grew other software,
> all genuinely running (src/games/): MINES.EXE (three sizes), SOL.EXE
> (card bounce, undo), SNAKE.EXE (sides wrap), CHECKERS.EXE (alpha-beta
> draughts), CHESS.EXE (full rules, perft-verified movegen, time-boxed
> search), an editable untitled.txt, and a games folder whose icons drag
> out onto the desk and persist; everything reachable from the desk and
> the Start menu, each with a `?state=` pose.
>
> **The middle of a game is no longer empty (2026-08-14).** It was: measured
> over real games, two in three peaked at fever 0.38 — one tier crossing
> around the minute mark, then nothing until the endgame. Two causes, both
> in director.ts, both now fixed and both written up there. And the desktop
> gained a second channel: **beats** (beats.ts), discrete acts answering a
> move grade, a live threat or the room changing, drawn from weighted pools
> the way fever's `gags.ts` draws its gags. Eight acts, all reversible —
> a dialog, a titlebar that changes its mind, a note in moves.txt, a flare,
> the clock lurching, the taskbar stuttering, the icons flinching, a preview
> that opens itself. `npm run trace` prints the tier timeline over real
> games; `npm run fever` plays one in a real browser and reports what the
> desktop actually did.
>
> **The desktop makes noise now (2026-08-14).** `src/audio/` is a synthesized
> period sound scheme — 23 sounds, no wav files anywhere (see below) — plus a
> live machine bed that gets busier with fever. `sounds.ctl` is in Settings and
> behind the tray speaker, and `npm run audio` renders every recipe through
> real Chrome, writes them to `shots/audio/` (including `all.wav`, everything
> back to back) and checks the laws from outside.

> **The machine fits in a hand (2026-08-15).** Installable as an iOS PWA
> (manifest + service worker + icons rendered from the board's own pixel art
> by `tools/appicon.mjs`), and every gesture is a pointer event now — one
> path for mouse and finger (`onPointerDrag` in dom.ts). On a coarse-pointer
> screen where the 1280x800 fit would make a cell untappable, the *monitor*
> gets smaller instead of the pixels (wm.ts `FIT_W`/`FIT_H`); windows clamp
> onto the smaller desk, and the icons keep to a dock row above the taskbar
> where the board can't cover them. Touch grew period-correct verbs: the
> hover disc rides the finger and drops on release, a tap launches an icon,
> a held finger is Minesweeper's right button, a swipe steers the snake, two
> taps send a card home. The taskbar thickens over the home-indicator inset
> so the chrome still reaches the physical edge. `npm run mobile` is the
> harness — a touchscreen Chromium phone that plays a real move and
> screenshots what a PWA user gets.

> **The machine can be programmed (2026-08-15).** C:\ is real: one
> localStorage volume (`fs.ts`) seeded with its own manual (readme.txt,
> asm.txt) and two working programs, edited by a Notepad that genuinely
> Opens/Saves/Saves As (per-file windows, a period picker), and served by
> COMMAND.COM (`terminal.ts`) — DIR/TYPE/EDIT/DEL/REN/COPY plus RUN, which
> assembles a .asm file to machine words and executes them on the machine's
> own processor (`vm.ts`: a 16-bit CPU, 4096 words, memory-mapped
> console/keyboard/RNG ports, real binary encoding so self-modifying code
> just works). A running program gets a step budget per frame, so an
> infinite loop animates instead of hanging and ESC always breaks.
> `vm.test.ts` assembles and plays the shipped programs, which pins the
> manual, the seeds and the CPU together; port names are reserved words in
> the assembler because a label called `key` once silently shadowed the
> keyboard.

> **The desk answers its edges, and the fever lets go (2026-08-15).** Seven
> notes from the desk's owner, all landed. **Size is a value now, the way
> geometry is in the engine:** `CELL` was a constant and is one stepped
> whole-pixel unit per game, walking a ladder as you drag the window — a
> fractional transform mushes a 1px bevel and an integer-only one does nothing
> until it doubles, so the ladder is what lets a drag land on a handful of
> crisp sizes. Everything derived steps with it (`board.ts`'s cabinet mask and
> hole radius, the drop's landing, the touch hit-test, chess's `--sq`, the
> card pitch), and `wm.test.ts` pins the round-trip: the natural window
> measures back to exactly the authored cell, so nothing moves until you ask.
> A hardcoded 64 is now a bug that only shows on a dragged window — the class
> of bug this pass existed to remove. **Leaving the ending brings the machine
> down:** the director always cooled, but `gameOver` short-circuited the tidy
> loop, so `OK` did nothing and the litter waited for a new game. And the
> fever produces the drag-ghost trail itself now, as a transform and never a
> position, only on windows whose rect grown by the full drift still misses
> the grid. **A new game drains the old one out of the cabinet** — the floor
> gives out left to right and the position falls through the same hole mask a
> drop wears, on `gravityFall`'s own physics; an empty board is instant, which
> is what keeps 47 scripted poses landing where they land. **The machine
> reboots** (`reboot.ts`): the period's real Shut Down box, Ctrl+Alt+Del as
> the other door, a POST and an honest page load — it writes to localStorage
> at no point, so `C:\` and the Control Panel come back untouched. **And
> CHESS.EXE keeps its result**: ants on the mated king, the word in the
> titlebar and the status bar, plus a minor fever of its own, keyed off its
> own evaluation and scoped to its own window — a shelf game does not get to
> set the desktop's temperature.

> **The machine speaks C (2026-08-16).** `cc.ts` is a real compiler for a
> Small-C dialect — functions, recursion, pointers, arrays, the full C
> operator set with C precedence, `asm("...")` as the escape hatch, and
> `#define NAME 123` as the entire preprocessor — that emits real assembly
> text for the machine's own assembler; `CC FIZZ.C` writes FIZZ.ASM onto C:\
> where you can TYPE it, and RUN takes a .c straight. The hardware stack
> can't be addressed from the ISA, so compiled code runs a second stack for
> arguments and locals (R7 points, R5 frames, top at 0x0E00); comparisons go
> signed by the 0x8000-bias trick and signed DIV/MOD are runtime routines
> emitted only when used. c.txt and fizz.c seed every disk — old volumes are
> topped up with seeds they're missing, edits kept — and `cc.test.ts` runs
> every construct through compile → assemble → the real CPU, fizz.c
> included, so the manual, the seed and the compiler can't drift. Notepad
> grew the period courtesies for source files only (.c/.h/.asm): Enter keeps
> the indent and opens a brace onto its own line, Tab types spaces, pairs
> close themselves and step over their closers.

> **The game gets gone back over (2026-08-16).** REVIEW.EXE — the worker
> half had answered "review" since the port; now there's a window. Entry is
> the finale's third button (win, condolences, draw — never forfeit) and
> Start ▸ Programs; `?state=review` is the pose. The confidence law does the
> visible work: the result line is flat because the game is over, the curve
> is one solid line with no legend (the proven band's step *is* the game
> going decisive, unexplained on purpose), per-move remarks hedge when
> estimated ("looks loose.") and declare only when proven ("the game changed
> here."), and the verdict line is `turningPoint` (proven, flat) or
> `biggestSwing` (estimated, "looks like the loose one.") or nothing stands
> out. Red is always the player, so the review grades `forPlayer: "red"` on
> the analysis worker — a game in progress never queues behind it.

> **The machine draws, and the rocket is a file now (2026-08-16).**
> PAINT.EXE edits the machine's picture format: a .spr is rows of palette
> letters — the same alphabet the desk's own icons are drawn in (`icons.ts`
> PAL), `.` for transparent — so a picture is a text file like everything
> else on C:\. TYPE prints one, Notepad can hand-edit one, PAINT (also a
> COMMAND.COM verb) is the door with a pencil behind it: pencil, fill,
> right-click erases, the system palette because those are every color this
> machine has, File against the same disk through Notepad's own picker. A
> .spr's icon everywhere *is* its drawing (`itemFace` + a size-general
> `iconCanvas`), and right-click ▸ **Pin to desk** puts it up big (`pins.ts`,
> one localStorage key): label-less, draggable, under the windows, repainted
> live when the file is saved, down when the file is deleted. The hardcoded
> rocket chrome is gone; `rocket.spr` seeds every disk instead, where it can
> be repainted, filed away or thrown in the rest. `?state=paint` is the pose
> and `npm run paint` is the hands — a real browser draws a stroke, saves,
> pins, reloads and takes it down. `sprite.test.ts` pins the format against
> what Notepad could plausibly type at it.

> **C:\ grew directories, and the desk is one of them (2026-08-16).** The
> volume (`fs.ts`) is a tree now — paths, mkdir/rmdir, dir renames that
> carry children and announce every file — and the desktop renders
> `C:\DESKTOP`: put a file there and it grows an icon, drag an icon into a
> folder and the file moves. The programs are files too — BOARD.EXE, the
> games, flames.scr all seed the disk with an `MZ <token>` first line, and
> dispatch reads the file, not the name, so COPY keeps a program runnable
> and DEL BOARD.EXE just meets the seed law (presence judged by basename
> anywhere, so a *filed-away* seed doesn't come back as a twin). shellfs is
> gone; what remains is `deskpos.ts` (icon [x,y] per path) and an authored
> boot arrangement in main.ts — machine things down the left, papers in a
> second column with the `(C:)` drive icon, manuals in `\DOCS`, sources in
> `\SRC`. COMMAND.COM has a cwd in its prompt, CD/MKDIR/RMDIR, `DIR` of any
> path, and a tiny PATH (cwd → root → DESKTOP → games) so typing `MINES`
> works from anywhere; Notepad/Paint's shared picker walks `[..]`/`[DIR]`
> rows; moves.txt is a real file the pad writes through. Flat-era volumes
> are **formatted, not migrated** — version-gated, the one deliberate data
> loss, decided with the desk's owner. `fs.test.ts`/`deskpos.test.ts` pin
> the tree, the format and the tokens; `npm run files` is the hands — a real
> browser CDs around, RUNs a program, walks the drive window, saves across
> directories through the picker and drags a file into a folder. The live
> harnesses (`live`/`fever`/`mobile`) now start BOARD.EXE from its desk icon,
> because the machine boots to a desk and they had never been told.

> **The shelf games got their faces (2026-08-16).** SOL.EXE's deck was the
> one modern thing on the machine — a font pip centred in a div, a CSS-stripe
> back — and now it's drawn: one canvas painter (`paintCard`) for the table,
> the drag ghost and the ceremony alike, with the real pip layouts, mirrored
> serif indices, pixel suits in two sizes, point-symmetric court busts in the
> icons' own palette, a drawn lattice back and stepped corners. The table
> answers a second grammar — click the run, then click where it goes, same
> legality as the drag — and the chosen cards wear the blue dither a selected
> icon wears; an empty stock shows the period's go-around circle. CHESS.EXE's
> men stopped being antialiased font glyphs: 16x16 sprites through the same
> `px()` as every icon on the desk, landing 2x at the natural square.

> **The machine has a screen now (2026-08-17).** Phase 1 of `llm_llm_llm.md`:
> three new ports in `vm.ts`'s MMIO page — VPOS aims a cell cursor on a 40×24
> character framebuffer, VCHR writes-and-advances (and reads back), and a
> VSYNC read ends the CPU's turn for the frame, which is how a program rests
> instead of burning its step budget flat-out. The terminal meters the
> processor to ~60 frames/sec by wall-clock, so a paced program runs at the
> same speed on every monitor, and while the screen is lit the grid *is* the
> terminal — its own smaller type so the whole court fits, the scrollback
> hidden, the prompt line clipped rather than `display:none` because a hidden
> input drops focus and would take the program's keyboard with it. CC wears
> the ports as `vpos()`/`vput()`/`vsync()`; asm.txt and c.txt teach them; and
> `SRC\pong.c` seeds every disk — the human-written reference pong, compiled
> by CC on the machine, W/S against a beatable house paddle, first to seven.
> `vm.test.ts`/`cc.test.ts` pin the hardware and play the game headless.

> **The machine has a drive, and a language model on it (2026-08-17).** Phase
> 2 of `llm_llm_llm.md`: three more ports — DPOS and DBNK aim a head that
> counts bytes and carries between its halves, DSK hands one over and moves
> on — and `SRC\llm.c`, which runs 260,032 int8 weights of TinyStories on the
> 16-bit processor. `cd /src; cc llm.c; run llm` and it writes a story a word
> every 1.7 seconds, which is what reading every weight for every word costs.
> The slowness is the point and must never be papered over: no progress bar,
> no spinner, no fake typing. A word appears when the arithmetic is done.
> The banner says what it is doing in the machine's own flat voice and then
> gets out of the way, and an empty drive says "NO MODEL ON THE DRIVE."
> rather than pretending. `npm run llm` photographs it every five seconds
> because one screenshot cannot tell thinking from stuck.

Connect 4 played inside a possessed Windows 95 that believes it is functioning
normally. The game never leaves the operating system.

This began as a sibling app to `apps/fever`, not a theme of it — same
`packages/engine`, its own world (the clickers-repo pattern: one repo, several
games). Fever has since been retired (it lives in git history); BOARD.EXE is
now the repo's only app and owns the plain root scripts (`npm run dev`,
`npm run build`). Workspace name `@fourscore/exe`. This doc is
directional; the executing session owns every decision inside it.

## The law: don't draw the OS — run it

Connor's reaction to the mock singled out the fire, and the reason it lands is
the reason this direction works at all: it is not a picture of fire, it is the
actual 90s demoscene fire automaton (cooling + upward drift on a palette ramp)
genuinely computing per-frame in a 100x64 canvas, upscaled with
`image-rendering: pixelated`, inside a real window titled `flames.scr —
Preview`. **Build the period artifact; never illustrate it.** The test for
every element: could you have shipped this on a real 1995 machine, and is it
actually executing here? Dialogs are real windows with real z-order and focus.
The screensaver actually takes over on real idle. Notepad scrolls because it's
a text box. A marquee marquees. When something is fake, the whole desktop
becomes a poster of a desktop.

`reference/mock.html` — the fire automaton in it is the exemplar and the bar.
`reference/mock.png` is the frame Connor approved. `proposals/index.html` is
the approved live iteration set built from it — escalation, the win, fire
personalities, and the playable board, all genuinely executing; `node
proposals/shots.mjs` screenshots every named state.

## The second law: nothing is dead

Everything on the desktop is interactible, like a real OS (Connor,
2026-08-13). Every menu opens, every button does something, every icon
launches, both `OK`s click. Joke content is fine — Help is allowed to be
unhelpful, the Recycle Bin is allowed to contain "the rest" — but inert
chrome is not. A dead control breaks the fiction harder than a wrong one.

## The scheme is computed, for the same reason the fire is

A wav file is the audio equivalent of a pixel-art illustration pretending to be
a screenshot, so there is no `public/sounds/` and there should never be one.
Every sound is a struck bell, a filtered noise sweep or a relay tick built out
of `audio/synth.ts` at render time, the way a period sound card's own scheme
was made. Same recipe, same bytes, every time.

Three things about it that are load-bearing:

- **The fever bends the scheme, and only the bus knows that.** One-shots play
  flat and in a bigger, wronger room as things sharpen — a machine bogging
  down, never speeding up. A recipe may not read the fever: a ding has to be
  the same ding every time, and the room running hot is a property of the
  evening.
- **The bed is the machine, not a soundtrack.** Transformer hum, fan, and a
  CRT's 15.7kHz flyback, all under the level where you'd call them a sound —
  plus the disk, which is asked for something on a fixed uneven schedule that
  compresses with fever. It is the one channel that reports the position
  sharpening with every window shut. Muting it should feel like the room got
  smaller, not like a sound stopped.
- **The autoplay rule is a gift, not a workaround.** Nothing is built until the
  first gesture, so the gesture plays `startup`: the machine has been sitting
  there since the page loaded, and it finishes booting the moment you touch it.

`sounds.ctl` files the fever's symptoms as ordinary system events —
`Clock corrected`, `Icons rearranged`, `Line connected (theirs)` — in the
Control Panel's own flat language. That list and the library are held in step
by a test in both directions: a sound with no event row is one the player can
never find, and an event row with no sound is a dead control.

## Settled by the proposal rounds (Connor, 2026-08-13)

The mocks in `proposals/` are the approved answers to these; port their code
(`lib.js`'s fire automaton with stoke/wind/flip/transparency hooks,
`chrome.css`'s bevel kit) rather than re-deriving it. Deep-linkable states
(`?fever=`, `?beat=`, `?demo=`, `?chips=`) are the harness pattern to keep.

- **Fire personalities are dynamics, not recolors.** Approved set: classic
  (the original, untouched — the bar), coals (the loss fire: low bed that
  flares when you look away), pillar (a swaying candle), rain (teal, hangs
  from the top of the window), and roam — one heat field spanning three
  windows, the flame wanders between them, and *focus follows the fire*.
  Never let a palette ramp read full-white across the flame body — it turns
  to butter; blend toward the white-hot ramp at most halfway.
- **Escalation multiplies windows.** The fever doesn't grow one corner: at
  higher tiers more `flames.scr` previews open across the whole desktop,
  every fire's heat/speed scales continuously, a dragged dialog leaves
  un-repainted copies of itself, the clock loses its grip, icons drift
  off-grid; at 1.0 the screensaver wins the desktop and the board stays
  playable on top of it. `FEVER.CTL` is dev-only chrome and does not ship.
- **The win.** The drop is real gravity (v += g, one cheap frame of
  overshoot, no easing curve) — but per *60Hz frame*, scaled by the real
  elapsed time, or the same drop runs twice as fast on a 120Hz panel as on
  the monitor it's plugged into. The win line is highlighted continuously,
  not per-cell: a rotated marching-ants capsule hugging the whole line, then
  one fire stoked along the line itself, growing from the new disc toward
  the old. Then the cascade: sincere dialogs scattered across the desktop at
  hand-tuned positions on irregular beats (tuned, not random — wrongness
  repeats), taskbar buttons crushing to slivers, one dialog half off-screen,
  finale `Congratulations — YOU WIN.` with `OK` / `Again`.
- **The board feel.** The hover disc *is* your piece and falls from where it
  hovers; there is no aiming arrow. It falls *into* the cabinet, not across
  its face: from the board's top edge down it is only what the holes let you
  see, which is a mask on `#fx` aligned to the live grid rect (maximize, a
  variant switch and a scrolled frame all move it). The opponent deliberates visibly — a
  mirrored hover disc that wanders a few columns before committing, then
  falls with the same physics. `moves.txt` is a live Notepad annotating the
  game, including `and then you hesitated` after a real pause of ~5s.
- **Chips: flat 16 for now.** Flat fill, hard dark outline, nothing else;
  the mocks default to it and it's cheap to revisit. The 11-style
  `pieces.ctl` lab in `04-board.html` is the place to iterate later, and a
  pieces picker like it should exist in the real app (see the second law).

## The world

One desktop, DOM/CSS all the way down. No three.js, no scene behind — the
desktop IS the stage. The board is `BOARD.EXE`, one real window among windows:
beveled cells, dithered discs, a status bar that talks. Desktop icons, a
taskbar, `moves.txt` (the OS annotates your game in Notepad: "and then you
hesitated"), `flames.scr`, a clock reading 6:66 PM, dialogs whose buttons are
`OK` and `OK`. The rocket is a pixel sprite that has escaped a window and
nobody comments.

The desk fills the browser window — the taskbar reaches both edges, the icons
sit in the true corner. 1280x800 is what positions are *authored* against, not
what ships, so every window spec carries an anchor (`ax`/`ay`) naming the edge
its coordinates are measured from. A window placed on the right half without
`ax: "right"` strands itself mid-desk on a wide screen.

Voice: sincere period software, deadpan. The software believes it is fine.
All strings in one `copy.ts` (fever's pattern — it made the copy pass
possible).

## Escalation

The fever axis here is **the OS degrading as the position sharpens** — legible,
reversible, and never blocking play. The ladder is the executing session's to
invent; the register (ideas, not a spec): windows open on their own; dialogs
multiply and overlap; the un-repainted drag-ghost trail; the clock loses its
grip; flames.scr's preview grows; at full fever the screensaver wins the
desktop. A win should be the biggest thing the machine has ever announced,
still in the OS's own furniture — a cascade of sincere dialogs beats any
custom banner. Comic-sinister, never crash-horror: no BSOD, no fake data loss.

**Escalation is not enough on its own.** There are four tier crossings in a
whole game and a game runs two minutes, so a desktop that *only* escalates is
one that does something every thirty seconds at best and nothing in between —
which is what shipped first, and what it felt like. The fever is the weather;
the **beats** are the reactions, and every one of them is an answer to a ply
rather than something the screen decided to do on its own. Keep them apart:
a beat is a moment and puts itself back, a tier is a state and stays. Nothing
in `beats.ts` may leave the desktop permanently altered, and nothing may cover
the grid — "never blocking play" is a rule about clicks, and a beat dialog is
a real window with real pointer events.

**Never let the software declare a result it hasn't got.** A beat's grade comes
from the live feed, which is `estimated` on every ply of every game, so no beat
copy says a move won or lost — the blunder dialogs notice that something
happened and decline to say what they think of it. `endgame.ts` is where the
machine gets to be flat and declarative, because by then the game is over.

## Anti-goals

- Not a retro *theme* on a normal game UI. If you could swap the bevels for
  material design and the app still worked, it's built wrong.
- No modern easing anywhere. Window operations are instant or stepped.
- No pixel-art illustrations pretending to be screenshots — run it (the law).
- Nothing exists outside the OS fiction. The teal desktop is this app's void.

## Practical

- Engine via the worker protocol (ported from `apps/fever/src/engine/`, now
  deleted — it was itself ported from `apps/web`, it travels well). Engine
  stays I/O-free.
- Geometry is a value: `BOARD.EXE`'s window sizes itself from `variant`.
  Connect 5+ is a bigger window, maybe a scrollbar — which is funny and free.
- A Director-shaped module (fever 0..1 + events) drives degradation; port
  fever's pure `director/` or derive a lighter one. Subsystems read it, never
  match state.
- Harness from day one: a preview page of named desktop states + the shots
  tooling pattern. Screenshot before you claim — that rule caught real bugs in
  fever and both mocks here. `npm run shots` always looks at 1800ms, so it is
  blind to anything that happens over seconds; `npm run timeline -- "?state=win"
  3 8 14 18 40` is the one that can see the fever rise and let go. Sound can't
  be screenshotted at all, which is what `npm run audio` is for: a recipe that
  schedules its oscillators after `startRendering` is silence that typechecks.
  It listens for the two things a machine can hear — is it there, and how loud
  — and hands the rest to your ears as `shots/audio/all.wav`.
- Review landed (REVIEW.EXE, see the pass log); online remains a later phase,
  same product truths as the repo (the confidence law binds every string;
  online stays client-authoritative).
