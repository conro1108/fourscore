# FOURSCORE: VISION

This document is the aesthetic north star for the visual rebuild. Every agent
working on the redesign reads this before writing code, and re-reads it before
calling anything done. `PLAN.md` says what to build; this says what it must
feel like. When the two conflict, this wins.

## The one-line brief

Connect 4 as a hectic fever dream: modern gothy gradient surrealism crashed
into a late-90s monster truck rally, played inside software that seems slightly
possessed. The player should laugh, then feel watched, then laugh again.

## The four pillars

**1. Goth gradient surrealism.** The world is a void, not a room. Deep
blacks and bruised purples, oil-slick iridescent gradients, chrome that
reflects a sky that isn't there. Celestial and vaguely religious imagery used
completely wrong — a cherub judging your opening move, a rotating obelisk
where a menu should be. This is the *modern* half: it's allowed to be
genuinely beautiful. The gradients are lush, the bloom is real.

**2. Shitty rockets, tanks, and monster trucks.** The *anti-beauty* half.
Low-poly, wrong-scale, over-eager props with the energy of a 1999 toy
commercial and a county fair. A monster truck does a lap for no reason. A
rocket celebrates a good move by taking off badly. SUNDAY SUNDAY SUNDAY. These
things are enthusiastic and cheap on purpose, and they share the frame with
pillar 1 without apologizing.

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

## Palette and type (anchors, not handcuffs)

- Void: near-black purples and blues (`#0a0612` territory), never pure black.
- Iridescence: oil-slick ramps — magenta → teal → gold — as shader gradients,
  not flat fills.
- Heat: one hot accent family (arterial red / hazard orange) reserved for the
  fever and for spikes, so escalation is legible.
- Jank accents: acid green, chrome silver — props and chrome UI only.
- Type: one absurd chrome/WordArt display face for titles and shouting, one
  honest period system face (bevel-era UI grot) for everything functional.
  Never a tasteful modern geometric sans anywhere.

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
