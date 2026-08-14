# BOARD.EXE — direction

Connect 4 played inside a possessed Windows 95 that believes it is functioning
normally. The game never leaves the operating system.

This is a sibling app to `apps/fever`, not a theme of it — same
`packages/engine`, its own world (the clickers-repo pattern: one repo, several
games). Workspace name `@fourscore/exe`; root scripts follow the clickers
convention (`dev:exe`, `build:exe`) when the scaffold lands. This doc is
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
`reference/mock.png` is the frame Connor approved.

## The world

One desktop, DOM/CSS all the way down. No three.js, no scene behind — the
desktop IS the stage. The board is `BOARD.EXE`, one real window among windows:
beveled cells, dithered discs, a status bar that talks. Desktop icons, a
taskbar, `moves.txt` (the OS annotates your game in Notepad: "and then you
hesitated"), `flames.scr`, a clock reading 6:66 PM, dialogs whose buttons are
`OK` and `OK`. The rocket is a pixel sprite that has escaped a window and
nobody comments.

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

## Anti-goals

- Not a retro *theme* on a normal game UI. If you could swap the bevels for
  material design and the app still worked, it's built wrong.
- No modern easing anywhere. Window operations are instant or stepped.
- No pixel-art illustrations pretending to be screenshots — run it (the law).
- Nothing exists outside the OS fiction. The teal desktop is this app's void.

## Practical

- Engine via the worker protocol (port from `apps/fever/src/engine/` — it was
  itself ported from `apps/web`, it travels well). Engine stays I/O-free.
- Geometry is a value: `BOARD.EXE`'s window sizes itself from `variant`.
  Connect 5+ is a bigger window, maybe a scrollbar — which is funny and free.
- A Director-shaped module (fever 0..1 + events) drives degradation; port
  fever's pure `director/` or derive a lighter one. Subsystems read it, never
  match state.
- Harness from day one: a preview page of named desktop states + the shots
  tooling pattern. Screenshot before you claim — that rule caught real bugs in
  fever and both mocks here.
- Review/online: later phases, same product truths as the repo (proven vs
  estimated confidence law binds every string; online stays
  client-authoritative).
