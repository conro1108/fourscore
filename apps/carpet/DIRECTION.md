# COSMIC CARPET — direction

Connect 4 printed into the carpet of a blacklight bowling alley that has been
open since 1987. Cartoon content, physical material.

Sibling app to `apps/fever` (clickers pattern: one repo, several games). Same
`packages/engine`, its own world. Workspace `@fourscore/carpet`; root scripts
`dev:carpet` / `build:carpet` when the scaffold lands. Directional doc; the
executing session owns the decisions.

## The law: gritty, not cartoony — even though the content is cartoony

Connor rejected the first draft's "dead flat" poster claim in exactly these
terms: *"i want texture and life, even if it's shitty neon lights and bowling
alley carpet. gritty not cartoony even tho the content is cartoony."*

So: the shapes stay cartoon — zigzags, planets, pins, a rocket with a swoosh —
but **every element on screen must have a material answer**:

- **Printed into the pile.** Ragged edges (the mock uses turbulence
  displacement), fiber reading through the ink, wear where feet go.
- **A neon tube.** Uneven glow, a core and a halo, and failure modes: the
  wordmark's second O is dead. Neon is hardware, not a text style.
- **A thing on the carpet.** Gum, a coffee ring, scuffs, lint. The venue has
  been open for decades and the carpet remembers.

If an element has no material answer, it isn't allowed on screen. That's the
whole taste law here. Clean vector on black — the thing the first draft was —
is the failure mode.

`reference/mock.html` / `reference/mock.png` are the approved frame: the
neon sign with the dying letter, the rough-printed board sitting in the pile,
wear pools, stains, and one crisp beige Win95 window ("Shoes required.")
floating over it all, unexplained.

## The world

Top-down onto the carpet; the board is print. Light is the living layer over
dead material: blacklight pools (uneven, because the fixtures are cheap),
neon signage, UV-reactive ink.

**The open design question — name it early, decide it against play-feel, not
in the abstract:** what is a *move* physically?

- Discs as UV plastic pucks that land ON the carpet (real objects, real
  shadows — grittiest, and gives the drop real motion), or
- the print itself igniting — a column flickers on cell by cell like a neon
  tube starting, the disc is lit ink rather than an object.

The second keeps everything in-material and makes light the game's verb;
the first is more physical. Prototype both in the first phase before
committing the renderer to either.

## Escalation

**Fever is the lighting rig.** At 0 the venue is half-lit and tired; as the
position sharpens the fixtures wake up: pools brighten and multiply, neon hum
and flicker rise, more of the print ignites — and at full fever the dead O in
the wordmark comes back to life, which is the single best beat available and
should be saved for exactly that. A win blazes the whole print. Escalation
lives in light and never in the shapes changing style.

## Anti-goals

- No clean gradients-on-black poster look (rejected by name).
- No cartoon outline without a material answer.
- Nostalgia is texture, never the joke. The carpet is not a meme; it's a place.
- The beige window stays crisp and period-honest — it is the one thing in the
  venue the blacklight doesn't touch, and that contrast is the collision this
  direction runs on.

## Practical

- Renderer: open. The mock is SVG + filters and holds up as a still; live
  noise/glow/flicker at 60fps probably wants canvas or WebGL for the carpet
  and light layers, with DOM for the window chrome. Executing session decides
  after the move-physicality prototype.
- Engine via the shared worker protocol (port from `apps/fever/src/engine/`);
  engine stays I/O-free. Geometry is a value: the print re-registers per
  variant — a Connect 5 board is a bigger patch of the same carpet.
- A Director-shaped module (fever 0..1 + events) drives the rig; port fever's
  pure `director/` or a lighter derivation.
- Harness + screenshots from day one, same as everything in this repo.
- Review/online later; all repo product truths bind (confidence law,
  client-authoritative online).
