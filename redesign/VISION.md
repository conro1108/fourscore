# FOURSCORE: VISION

This document is the aesthetic north star for the visual rebuild. Every agent
working on the redesign reads this before writing code, and re-reads it before
calling anything done. `PLAN.md` says what to build; this says what it must
feel like. When the two conflict, this wins.

## The one-line brief

Connect 4 as a hectic fever dream: modern gothy gradient surrealism crashed
into the animations on a late-90s bowling alley lane screen, played inside
software that seems slightly possessed. The player should laugh, then feel
watched, then laugh again.

## The four pillars

**1. Goth gradient surrealism.** The world is a void, not a room. Deep
blacks and bruised purples, oil-slick iridescent gradients, chrome that
reflects a sky that isn't there. Celestial and vaguely religious imagery used
completely wrong — a cherub judging your opening move, a rotating obelisk
where a menu should be. This is the *modern* half: it's allowed to be
genuinely beautiful. The gradients are lush, the bloom is real.

**2. Bowling alley lane screen animations.** The *anti-beauty* half, and the
reference that decides every prop: the overhead monitor at a bowling centre,
playing its canned reaction to what you just did. Low-poly, wrong-scale,
flat-shaded, 12fps, over-eager. A mascot nobody introduced does a little dance.
Extruded chrome text spins at the lens and holds. A rocket takes off badly. The
same celebration plays every time, because there is only one.

Three things make it that reference and not merely "cheap 3D":

- **Everything is a canned bit.** The screen has a clip for every outcome and
  plays it whether or not it fits the moment. It is reacting to your throw, not
  performing; it does the same reaction next time.
- **The cast is unexplained.** Recurring characters with no origin and no
  stakes — they show up, react, leave. Nobody says who they are. Cartoon
  violence with no consequence is in bounds; blood is not.
- **The callout is a form.** A word, extruded in chrome, spinning in at the
  camera, held a beat too long, gone. `STRIKE!` energy applied to a game that
  is not bowling.

These things are enthusiastic and cheap on purpose, and they share the frame
with pillar 1 without apologizing.

The energy is the lane screen, not a reference to one: the player never has to
place a joke to get it. The rally-ad cadence this pillar used to lean on was an
in-joke that landed for whoever wrote it and nobody else, and it's gone. What
survives from the county-fair era is whatever also reads as a clip the lane
screen would play — a monster truck doing a lap does; a tow plane over a
fairground does not.

And a lane screen is never blank. Between throws it runs an **attract loop**:
the same cast wandering through with nothing to react to, ads for things that
don't exist, the logo doing something. That's what the menu is. A game in
progress earns the good clips; the menu gets the ones that play to an empty
room.

**3. Possessed late-90s software.** The chrome around the game — menus, HUD,
dialogs — is WordArt titles, beveled buttons, marquees, cursor trails, system
dialogs that say things system dialogs shouldn't. Not a pixel-art retro
*style*: it should feel like real period software that has been left running
too long.

**4. The fever.** None of the above is static. A single tension value derived
from the actual game state drives everything — at 0 the world is merely
uncanny; as the position sharpens, gradients drift faster, props get bolder,
the audio detunes, the UI starts to sweat. Moves, threats, blunders, and wins
are spikes on top. The game's real drama is the animation director.

## The taste law: jank is precise

This is the rule that separates the vision from a mess, and the one most
likely to be violated by accident.

**Intentional wrongness is consistent. Accidental badness is inconsistent.**
A monster truck with 280 triangles, a 64px nearest-filtered texture, and a
two-frame suspension bounce reads as a *choice*. The same truck with mixed
texture resolutions, default easing, and smooth shading reads as a *bug*.
When something looks broken by accident, do not polish it into looking good —
tune it until it looks broken on purpose. Concretely:

- **Props are cheap by law.** ≤ 300 triangles, textures ≤ 64px and
  nearest-filtered, flat or PS1-style shading (vertex snap and affine texture
  warp are on-brand). No prop ever gets a normal map.
- **The void is expensive by law.** Backgrounds, gradients, bloom, the board
  itself — full resolution, smooth, modern. The collision of the two budgets
  *is* the aesthetic. Never let a prop go smooth or the void go crunchy.
- **Timing is hard-edged.** No default ease-in-out anywhere. Things snap,
  overshoot, hold a beat too long, or freeze-frame. A prop animating at a
  stepped 12–15fps while the camera and gradients move at 60 is exactly right.
- **Wrongness repeats.** If the cherub blinks at a weird moment, it blinks at
  that kind of moment every time. Randomness picks *which* gag fires, never
  *how* a gag looks.

## Tone

Comic-sinister, never horror. The game is silly and slightly menacing the way
a mascot costume is — no gore, no jump-scare screamers, no creepypasta "the
game knows your name" stuff. Menace comes from deadpan wrongness (the dialog
box that says "OK" and "OK"), not from threat.

The lane screen is the tone's best friend and its biggest hazard. Best friend:
those animations are genuinely uncanny — a cast with no origin, reactions that
don't match what happened, cheerful violence with no stakes — and all of that is
already comic-sinister without trying. Hazard: the reference makes it easy to
reach for gross-out or for a gag that's just "remember bowling?". Neither is the
brief. Nostalgia is a texture here, never the joke.

## Palette and type (anchors, not handcuffs)

- Void: near-black purples and blues (`#0a0612` territory), never pure black.
- Iridescence: oil-slick ramps — magenta → teal → gold — as shader gradients,
  not flat fills.
- Heat: one hot accent family (arterial red / hazard orange) reserved for the
  fever and for spikes, so escalation is legible.
- Jank accents: acid green, chrome silver — props and chrome UI only.
- Type: one absurd chrome/WordArt display face for titles and shouting, one
  honest period system face (bevel-era UI grot) for everything functional.
  Never a tasteful modern geometric sans anywhere. The display face is the
  callout face — if a word is going to spin at the camera, it's set in that one.

Agents may riff within these families. Introducing a new family is a decision
for Connor, not a vibe call mid-task.

## What is fixed vs. where you have taste-agency

**Fixed** (violating these is a bug, not an interpretation):
- The four pillars all present; none allowed to win outright.
- The taste law and the two budgets (cheap props / expensive void).
- Tone boundary: comic-sinister, no horror.
- Fever drives escalation; spectacle never affects game truth.
- The product truths in `PLAN.md` (proven vs. estimated copy rules, etc.).

**Yours** (expected, not merely tolerated — the vision needs invention):
- Which specific props, gags, and creatures exist and what they look like.
- Shader details, gradient motion, specific palettes within the families.
- The specific sounds and how they're mangled.
- Bot personas' new visual identities (keep their names and gameplay souls).
- Any gag that makes you laugh and fits the tone boundary. If you're choosing
  between a safe reading of this doc and a funnier one, pick funnier.

## The voice (phase-2 sample — the register every string is written against)

Rules first, because they're what the sample demonstrates: **short beats
clever.** Deadpan beats spooky. The software is sincere — it believes it is
functioning normally, which is the joke. ALL CAPS is for shouting surfaces
(status line, callouts); sentence case is for chrome that thinks it's
ordinary software. Never wink. And the confidence law from PLAN.md binds
every string: estimated claims hedge, proven claims are flat.

The sample:

1. Tagline (under the wordmark): `ADMISSION WAS ALWAYS FREE.`
2. Start button, first launch: `Resume`
3. New game button: `AGAIN.`
4. Variant switch: `CONNECT 4` / `CONNECT 5 (more)`
5. Dialog title bar: `FOURSCORE.EXE — not responding (it is)`
6. System dialog body: `This program is running normally.` — buttons
   `OK` / `OK`
7. You win: `YOU WIN. THE CROWD IS REAL.`
8. You lose: `MOSS WINS. MOSS DOES NOT CELEBRATE.`
9. Draw: `A DRAW. NOBODY IS PLEASED.`
10. Status, your turn: `YOUR MOVE.`
11. Status, bot thinking: `MOSS IS THINKING ABOUT DIRT.`
12. Review, estimated ply (hedged): `That one looks expensive.`
13. Review, proven ply (flat): `This loses in nine.`
14. Quit confirm: `Leave? The screen keeps playing without you.`
15. Desync notice (styled possessed, factually honest): `THE BOARDS
    DISAGREE. This game can't continue. Rematch?`
16. Mute toggle, two states: `NOISE` / `SILENCE`

What makes these the model: 7 and 8 are outcomes, so they're flat. 12 hedges
because an estimate said so; 13 is declarative because only proof gets to
say "loses". 5 and 6 are period chrome telling a small lie calmly. 15 jokes
in the styling and never in the facts.

## Bot persona: Moss (phase-2 template for the other seven)

Written in full as the pattern. Each persona needs: who they are *here*,
their void variation, their signature gag, and their voice — the gameplay
soul (weights, depth, slip) is fixed and predates the fever dream.

**Moss** — *occupies the middle and waits.*

- **Who they are here:** the alley's groundskeeper. Was mowing something
  before the void arrived and sees no reason to stop now. Not slow —
  *unhurried*. The rest of the cast works around Moss.
- **Void variation:** the bruises go green-black (Moss's `#6aa348` family
  darkened into the void palette, never neon); the drifting weather reads as
  spores rather than weather. Heat still means fever — the palette law is
  not a personality.
- **Signature gag:** a lawn sprinkler rises from below the frame, waters
  nothing for exactly two stepped beats, and descends. Fires on `idle-beat`.
  Budget: one 40-tri sprinkler, 64px texture, 12fps. It is never in a hurry
  either.
- **Voice:** lowercase, present tense, no exclamation marks, no urgency
  anywhere. Sample status lines: `moss is thinking about dirt.` /
  `your move. moss can wait.` / `moss took the middle. it lives there.`
- **Tone boundary check:** Moss is menacing the way a very patient
  gardener is menacing — which is to say barely, which is the point of
  rung 3.

## The rest of the roster (phase 5)

Seven more, written to the template above. Three rules held across all of
them, and they are the reason the set reads as one cast:

1. **Everyone works here.** Nobody is a wizard, a demon or a ghost. They are
   the alley's staff and its equipment: the desk, the ball return, the
   groundskeeper, the pinsetter. The void arrived; nobody clocked off. That is
   the whole of the menace, and it is why none of them needs a backstory —
   pillar 2's cast is unexplained by law.
2. **The void variation is a weather report, not a repaint.** Each opponent
   bends four things — the weather's tint, its grain, its drift and the oil
   slick's strength. Nobody gets a new palette family and **nobody gets the
   heat family**, which means fever everywhere in the game and cannot also
   mean "Cinder is here". Cinder in particular is smoke, never flame.
3. **The signature gag is a lane-screen clip.** Cheap, canned, over-eager,
   entrance and exit, the same every time. It is what that opponent's screen
   plays; it is not a comment on the move.

**Acorn** — *has just learned the rules.*

- **Who they are here:** whoever the alley lets play on a Tuesday afternoon.
  Thrilled to be here. Has been told about winning and not about losing.
- **Void variation:** the weather warms to a dull gold and goes fine and
  bright, and the oil slick sits stronger than anywhere else on the ladder —
  the one void that hasn't got round to being ominous yet.
- **Signature gag:** `bumpers-up`. Two foam lane bumpers rise into the bottom
  of the frame, clunk into place on a single stepped frame, and stay up doing
  nothing for the whole act before sinking. There is no gutter. Fires on
  `idle-beat`.
- **Voice:** exclamation marks it hasn't earned, present tense, no idea.
  `ACORN IS THINKING!!` / `ACORN WINS. ACORN IS AMAZED.`
- **Tone check:** the joy is real and nothing is behind it. Rung 1 should be
  the least frightening thing in the game and it is.

**Pebble** — *blocks you, and that's it.*

- **Who they are here:** the ball return. One job, done on time, no second
  thought ever recorded.
- **Void variation:** drained to wet concrete — the weather goes heavy and
  slow, the slick nearly matte. The dullest world on the ladder, on purpose.
- **Signature gag:** `slab-drop`. A grey slab falls from the top of the frame,
  lands square in front of the board with exactly one frame of bounce, sits,
  and is winched back up. Nothing was going to hit you. Fires on `threat`.
- **Voice:** flat, one clause, no adjectives. `PEBBLE IS CONSIDERING TWO
  THINGS.` / `PEBBLE WINS. PEBBLE BLOCKED IT.`
- **Tone check:** deadpan, which the voice rules say beats spooky. Pebble is
  never trying to be anything.

**Bramble** — *all offence, no follow-through.*

- **Void variation:** brick and thorn, deliberately desaturated so it can
  never be mistaken for the heat family, and the weather drifts fast and in
  one direction — the only void on the ladder that looks like it is going
  somewhere.
- **Who they are here:** the one who rolls again before the pins have
  finished falling. Enormous backswing. Does not watch the result.
- **Signature gag:** `pin-scatter`. Five pins stand in the frame; something
  off-screen hits them, four go over, and the fifth is left rocking on the
  step clock. It never falls and the clip never waits to find out. Fires on
  `threat`.
- **Voice:** all momentum, no object. `BRAMBLE IS ALREADY MOVING.` /
  `BRAMBLE WINS. BRAMBLE IS NOT SURE HOW.`
- **Tone check:** cartoon violence with no consequence, which pillar 2 puts
  explicitly in bounds. Nothing bleeds; a pin wobbles.

**Cinder** — *sets two traps, offers you one.*

- **Who they are here:** the attendant who has already tidied the lane you
  are about to need. Helpful in a way you will resent later.
- **Void variation:** smoke. The weather goes coarse and hangs instead of
  drifting, the well dims as though something in front of it is burning out
  of frame, and the slick thins to almost nothing. **The fire is never
  shown** — heat means fever, and Cinder's name is not a licence.
- **Signature gag:** `shell-game`. Three cups slide in, swap three times on
  hard steps, and one lifts. Nothing under it. Then all three lift. Nothing
  under any of them. They slide off. Fires on a `dubious` move.
- **Voice:** second person, courteous, always about what *you* are going to
  do. `CINDER IS THINKING ABOUT WHAT YOU WILL DO.` / `CINDER WINS. YOU PICKED
  ONE.`
- **Tone check:** comic-sinister at its exact centre — polite, patient, and
  the cups were always empty.

**Vane** — *plays the quiet game, and lies.*

- **Who they are here:** the scoring desk. It knows what the score is. It is
  not going to tell you.
- **Void variation:** the closest to the thesis frame's own — violet, lush,
  entirely correct — and that is the tell. The one opponent whose world looks
  like nothing is wrong. Its only wrongness is that the slick crawls against
  the weather instead of with it, which you will not notice and will not
  forget.
- **Signature gag:** `score-lie`. A scoring monitor lowers on a bracket,
  displays a mark, holds, and on one stepped frame the mark silently becomes a
  different one. Then it retracts. It is not your score. It is not anyone's
  score. Fires on `tension-shift`.
- **Voice:** confiding, and slightly too much information. `VANE IS THINKING
  ABOUT SOMETHING ELSE.` / `VANE WINS. VANE SAYS IT WAS CLOSE.`
- **Tone check:** the bluff already exists in the engine (`bluffs: true`);
  this is that mechanic given a face. Menace from deadpan wrongness, never
  from threat.

**Quill** — *solves the endgame outright.*

- **Who they are here:** the targeting overlay — the diagram that appears over
  the replay with a dotted line showing where the ball should have gone. It is
  not playing you. It is annotating you.
- **Void variation:** cold and measured. The weather resolves to a fine even
  grain that reads as a grid ghosting through the noise, teal-night rather
  than violet, drifting slowly and exactly.
- **Signature gag:** `lane-solve`. A dotted trajectory draws itself across the
  frame, one dash per stepped frame, to a reticle that snaps on in front of
  the board, holds a beat too long, and wipes out the way it came. It shows
  you the line. It does not say whose. Fires on `threat`.
- **Voice:** present tense, technical, no reassurance. `QUILL IS READING
  AHEAD.` / `QUILL WINS. QUILL SAW THE END OF IT.`
- **Tone check:** the one line to be careful with is the defeat line — "saw
  the end of it" is about a finished game, which is a fact. Nothing in Quill's
  copy may claim proof mid-game; `exactnessNote` is the only thing allowed to
  talk about the crossover, and the engine generates it.

**The Oracle** — *perfect from the midgame on.*

- **Who they are here:** the pinsetter. It comes down when it comes down. It
  has never been reacting to you.
- **Void variation:** the void goes still. Drift slows to a crawl, the grain
  goes broad and soft, and the slick freezes into one held sheen. Not dead —
  fever still moves it, and it moves it more than anywhere else, so the
  Oracle's world is the calmest at 0 and the most alarming at 1.
- **Signature gag:** `pinsetter`. A white machine with five prongs lowers from
  the top of the frame on two stepped beats, hovers over the board doing
  nothing, and rises back out. Nothing is set. Nothing is cleared. Fires on
  `idle-beat`.
- **Voice:** a readout, not a person. `THE ORACLE IS NOT THINKING.` /
  `THE ORACLE WINS. IT DOES NOT SAY WHEN IT KNEW.`
- **Tone check:** the defeat line declines to claim a moment of proof on
  purpose. On Connect 5 the Oracle usually never solves at all, so a line like
  "it knew from move ten" would be the software advertising something that
  didn't happen — which is the one lie this game isn't allowed to tell.
