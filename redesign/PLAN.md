# FOURSCORE: FEVER DREAM — IMPLEMENTATION PLAN

Read `VISION.md` first. This document is the technical spine, the phase plan,
and the shared memory between work sessions. It is written for capable agents
executing largely unsupervised: the *contracts* here are firm, the
*implementations* are yours. When you hit a genuine fork this plan doesn't
cover, write it down under Open Questions at the bottom rather than silently
picking — unless waiting would block you, in which case pick, and log what you
picked and why.

## How this plan runs

Connor kicks off each unit of work with a prompt like "start the next phase"
(possibly with extra direction). The session then:

1. Reads `VISION.md`, this plan, the **Phase ledger**, and the completion-log
   entries of every finished phase — that's where earlier sessions left things
   the plan doesn't know.
2. Flips its ledger line to `in progress` and does the work.
3. **Writes back before it's done**: flips the ledger line to `done`, appends
   a Completion-log entry (what shipped, deviations from this plan, what the
   next phase needs to know — a few honest lines, not a changelog), appends
   any Open Questions / Decisions, and commits. A phase whose write-back
   isn't committed is not complete, no matter what the code does.

### Model casting: Fable vs. Opus

Two tiers of model run this plan, deployed by what each is for:

- **Fable** does the work where *precedent gets set*: the scaffold whose
  architecture everything inherits, the first instance of each subsystem's
  look and voice, and the final judgment against a real artifact. Fable's
  deliverable is small and vertical — an exemplar built to final quality that
  defines the bar.
- **Opus** does the work where *precedent gets extended*: breadth, mechanics,
  ports, and every additional instance of a thing that already has an
  exemplar. This is most of the codebase by volume.

The boundary in one sentence: **Opus has full agency within established
precedent and the freedoms VISION.md grants; anything that would set new
precedent for the whole game — a new palette family, a new class of prop, a
subsystem's founding structure — waits for a Fable step.** An Opus session
that finds itself about to set precedent should log it as an Open Question
and route around it, not improvise it.

**There are exactly two Fable steps left, and each is a whole phase**, not a
sub-step inside one: **phase 2, The Thesis** (which sets every sensory
precedent in one sitting) and **phase 9, The Polish Lap** (which judges the
finished thing). Phase 0 was the third. Everything between them is Opus.

That has a consequence worth stating plainly: **the phase-2 artifacts are the
taste gate.** There is no separate reviewer session. Phases 3–8 each end by
putting their own output next to the thesis frame, the exemplar gag, the
signature sound and the voice sample, and asking whether it belongs to the
same world — in the completion log, with screenshots. If the honest answer is
"not really, and I don't know how to fix it", that is an Open Question for
phase 9, not a reason to keep polishing blind.

### Phase ledger

- [x] 0 — Stage *(Fable)*
- [x] 1 — The Director *(Opus)*
- [x] 2 — **The Thesis** ⚑ *(Fable)*
- [x] 3 — Props and spikes *(Opus)*
- [x] 4 — Audio *(Opus)*
- [ ] 5 — Bots as characters *(Opus)* — **skipped for now**, at Connor's call;
      phase 6 took its "bot select UI as possessed chrome" bullet
- [x] 6 — Chrome *(Opus)*
- [ ] 7 — Review, reimagined *(Opus)*
- [ ] 8 — Online *(Opus)*
- [ ] 9 — **The Polish Lap** ⚑ *(Fable, with Connor)*

## What survives, what dies

**Survives untouched:** `packages/engine` — the variant system, bitboards,
solver, heuristic search, bot ladder, and its tests. It is I/O-free by design
and stays that way. Also survives: `db/schema.sql` and the Supabase contract
(move list of column indices, RLS turn enforcement), and the worker protocol
idea in `apps/web/src/engine/` (port or reuse it).

**Dies:** everything visual. `apps/web` is a reference for *behavior* (what
screens exist, how online state flows) and nothing else. Build the new client
as `apps/fever` alongside it; delete `apps/web` only when `apps/fever` has
full feature parity (bots, review, online).

## Stack

- Vite + React + TypeScript, in the existing npm workspace.
- **three.js via @react-three/fiber + drei** for the scene,
  **@react-three/postprocessing** for the post stack.
- **zustand** for app state (match, director output, settings).
- **Raw WebAudio** for sound (no audio framework — the mangling *is* the
  feature and frameworks fight it).
- DOM/CSS for all chrome (menus, HUD, dialogs, review) layered over the
  canvas. The 3D scene is the stage; the DOM is the possessed software.

No pixel-buffer constraints carry over. The old "never scale fractionally"
rule was about a 120px sprite buffer; the new equivalent is the two budgets
in VISION.md (cheap props / expensive void).

## Architecture: the Director

The load-bearing idea. One module turns game truth into spectacle
instructions; every visual and audio subsystem consumes those and nothing
else. Subsystems never read match state directly and never talk to each
other. This is what keeps ten agents' worth of chaos coherent.

```ts
// packages: apps/fever/src/director/

/** Continuous 0..1. 0 = uncanny idle, 1 = full fever. */
type Fever = number;

type SpectacleEvent =
  | { kind: "move"; player: Player; col: number; quality: "brilliant" | "fine" | "dubious" | "blunder" }
  | { kind: "threat"; player: Player /* a live open-N threat appeared */ }
  | { kind: "tension-shift"; direction: "rising" | "collapsing" }
  | { kind: "win"; player: Player; line: number[] }
  | { kind: "draw" }
  | { kind: "idle-beat" };  // fired occasionally so ambient gags have a hook

interface DirectorFrame {
  fever: Fever;          // smoothed; never jumps discontinuously except on "win"
  events: SpectacleEvent[]; // this tick's spikes, already debounced
}
```

Inputs: the move list, the eval history (same numbers the review uses), and
whose turn it is. The Director is pure and synchronous — it must be unit
testable with no DOM. `fever` rises with |eval| and with eval *volatility*,
and gets a floor that creeps up with disc count so long games escalate even
when level. Exact curve: agent's judgment, but expose its constants in one
tunable object, and add a **debug panel** (dev-only) with a fever override
slider and event-firing buttons — every subsystem gets built and reviewed
against the slider before it's ever driven by a real game.

Subsystems (each subscribes to `DirectorFrame`, owns its own mapping):
scene/shader uniforms, post-processing stack, prop spawner, audio bus, DOM
chrome (CSS custom property `--fever` so stylesheets can escalate too).

**Determinism rule:** spectacle never affects game truth. The disc lands in
the column the engine recorded; animation is theater on top. Discs animate
off the move list, not the click (this is what makes online moves land
identically — preserve the old client's `rendered`-lags-`moves` idea).

## Product truths that survive the reskin

These are semantics, not visuals, and they are non-negotiable
(background in the repo `CLAUDE.md`, "Say what the solver actually knows"):

1. **Proven vs. estimated never reaches the player's eyes as a label.** One
   line on the eval curve, no legend, no badges. The distinction lives in
   copy confidence: estimated plies hedge ("looks lost"), proven plies are
   flat ("this loses"). `turningPoint` requires proof — an estimated ply may
   never claim "this move lost the game", no matter how funny the gag.
   The fever dream makes this *more* dangerous, not less: a prop screaming
   "IT'S OVER!!" is a proven-only gag. Route spectacle claims through the
   same confidence rule as review copy.
2. **`exactnessNote` stays generated from the measured `exactFrom`** — a bot
   can't advertise a crossover it doesn't have on this variant.
3. **Geometry is a value.** Layouts, camera framing, prop placement all
   derive from `variant`, never a hardcoded 7x6. Both variants ship.
4. **Multiplayer stays client-authoritative**; desyncs surface as an honest
   on-screen message (which may be styled as a possessed error dialog —
   encouraged — but must actually say what happened).

## Asset strategy: everything is code

Agents can't draw, so nothing depends on drawn assets:

- **Geometry**: procedural in code (or a build script emitting glTF). The
  poly budget in VISION.md makes this practical — a 300-tri monster truck is
  a lunch-break of `BufferGeometry`.
- **Textures**: generated at runtime or build time via canvas/SVG — gradients,
  dithers, decals, WordArt titles. 64px nearest-filtered for props.
- **Audio**: a `samples/manifest.json` of short CC0 source samples with a
  loader and a WebAudio mangling graph (pitch, reverse, granular chop,
  convolution). Phase 4 produces a *shopping list* of ~30 described samples
  (e.g. "airhorn, dry, <1s") for Connor to source; until then every entry has
  a synthesized placeholder so the bus is testable. Sounds are addressed by
  semantic name ("spike-big", "ambient-choir"), never by filename.

## Verification culture

Unit tests can't see any of this, so the harness is visual:

- **`apps/fever/preview.html`** from phase 0 on: renders named scene states
  (idle board both variants, mid-fever, full fever, win moment, each bot's
  stage) against the dev server. Every phase adds its states. Every visual
  change ships with a screenshot of the relevant states, looked at by the
  agent — this repo has caught real bugs this way that typechecked fine.
- **Taste check** against VISION.md's fixed list before calling a phase done —
  specifically the two budgets and the timing rule, the two most likely
  silent drifts.
- **Perf budget**: 60fps on an integration-GPU laptop at full fever, both
  variants. Post stack must be toggleable for debugging. If a phase can't
  hold 60, cut spectacle density before cutting frame rate.
- Director gets ordinary unit tests (it's pure). `npm test` and
  `npm run typecheck` stay green at every commit.

## Phases

Each phase is independently shippable and leaves the app playable. Sizes are
roughly one focused agent-session each; 2, 3 and 5 may be two.

**0 — Stage.** *(Fable — every later session inherits this architecture, so
its shape is the highest-leverage code in the project.)* Scaffold `apps/fever`
(stack above). Board as 3D geometry in the void, discs drop with snappy
theater, playable vs. one bot via the worker, both variants, preview harness
up, fever debug slider present (driving nothing yet). *Accept:* full game vs.
Moss on both variants at 60fps; harness screenshots.

**1 — The Director.** Implement the module + tests, wire the eval feed, pipe
`fever` to one cheap consumer (void gradient speed) end-to-end, `--fever`
custom property on the DOM root. *Accept:* slider and a real game both
visibly move the void; tests cover curve shape and event debouncing.

**2 — The Thesis ⚑.** *(Fable. The one session where the game's senses get
their precedent, all at once. Bigger than a normal phase and worth it: the
five phases after it are extension work, and they can only be extension work
if there is something to extend.)* One harness state at mid-fever, built to
final quality, containing:

- **The look.** Void gradient/iridescence shader, the post stack, the board
  material, bloom. The "genuinely beautiful" pillar. This frame is the game's
  visual thesis and phases 3–8 hold it invariant.
- **One prop gag, end to end.** The prop system's founding structure plus a
  single exemplar — say the monster truck lap — nailing the taste law:
  ≤300 tris, 64px nearest, stepped timing, choreographed entrance *and* exit,
  sharing the frame with the beautiful half without apologizing. Both budgets
  visible in one screenshot is the point.
- **The signature sound.** The WebAudio bus and mangling-graph architecture,
  the ambient bed's fever escalation, and the one spike that goes with the
  exemplar gag — tuned by ear until they're right.
- **The voice.** ~15 player-facing strings written as the model — a title, a
  couple of buttons, a system dialog that says something a system dialog
  shouldn't, one review sentence hedged and one flat — plus **one bot persona
  written in full** (who they are here, their void variation, their signature
  gag, their voice) as the template for the other seven. Appended to
  `VISION.md`, since it's north star and not plan.

*Accept:* the state renders at 60fps with the post stack on; the four
deliverables above exist and are pointed at by name from the completion log,
because later phases will be told to copy them; tri/texture budgets logged.
Deliberately *not* in scope: the fever range, the second variant, other gags,
other bots, chrome breadth. Depth over breadth — extension is phases 3–6.

**3 — Spectacle, extended.** *(Opus. May be two sessions — gags, then the
look.)* Two extensions of the thesis, in this order:

*The gag roster.* Extend the exemplar into the full gag
roster: move-quality reactions, threat alarms, the win detonation. Proven-only
gags gated per Product Truths. Every gag is built by holding it next to the
phase-2 exemplar; a gag that needs a new *class* of prop behavior the exemplar
doesn't cover is an Open Question, not an improvisation. *Accept:* each
`SpectacleEvent` kind has ≥1 gag; win moment is the biggest thing in the game;
budgets audited (tri counts logged in the harness); roster screenshotted
against the exemplar.

*The look.* Carry the thesis frame across the whole fever range and both
variants: idle/mid/full read as three moods of one world, Connect 5 framing
included. The thesis frame is invariant — if extending it breaks it, the frame
wins and the extension changes. *Accept:* the idle/mid/full row holds at
60fps on both boards.

**4 — Audio.** *(Opus.)* Extend the phase-2 bus: the full manifest,
placeholder synth for every entry, the remaining one-shots (one per gag), the
mute/volume settings wiring, and the ~30-sample shopping list for Connor to
source. Every new sound is voiced through the phase-2 mangling graph and
judged against the signature spike. *Accept:* full game with sound feels
escalating and spike-y; hard mute works; no autoplay-policy violations.

**5 — Bots as characters.** *(Opus.)* The eight rungs (Acorn → The Oracle)
reinvented — same names, same gameplay souls, new visual identities and stage
presence (a variation of the void + a signature prop or gag each). Write the
remaining seven personas to the template phase 2 established, **and get them
in front of Connor before building them** — that review is the taste gate here
and it costs him five minutes. Bot select UI as possessed chrome.
`exactnessNote` surfaced per Product Truths. *Accept:* harness state per bot; a
stranger could tell rungs apart with the eval hidden.

**6 — Chrome.** *(Opus.)* Menus, HUD, dialogs, settings in the
possessed-90s-software style; app shell, routing, variant switch. Copy is
written against the phase-2 voice sample — same register, same tone boundary,
and it has to be actually funny, which mostly means short. Every string in the
game gets read again in phase 9, so leave anything you're unsure about in the
completion log rather than agonizing. *Accept:* no unstyled surface left;
every dialog passes the tone boundary.

**7 — Review, reimagined.** The score-over-time curve and ply-by-ply copy in
the new world. All confidence rules apply exactly as in the old client — port
the copy logic, restyle the presentation. *Accept:* review of a decisive game
reads correctly hedged/flat; turningPoint only on proof; curve is one line.

**8 — Online.** Port `src/online/` state flow into the new client; opponent
gets a persona by hashing their user id (as today, but from the new roster
identities); desync message styled but honest. *Accept:* two browsers play a
full game; `npm run db:verify` green; wire moves land identically to local.

**9 — The Polish Lap ⚑.** *(Fable, with Connor playing. The second and last
Fable step: the only session that judges the whole thing at once, which is
also the only way most of these problems become visible.)* Play ten full
games. Fix what's flat, cut what's annoying, tune the fever curve (`TUNING`,
not the code) against real play, mobile/touch pass, perf audit. Then the
**copy pass**: read every player-facing string in the game in one sitting and
punch it up — possessed-software humor lives or dies in the writing, and by
now there's enough of it in one place to hear whether it's one voice or six.
Work the Open Questions phases 3–8 left behind; they were saved for exactly
this session. *Accept:* Connor grins.

## Working agreements for implementing agents

- Read `VISION.md` before each phase, and its "fixed" list before finishing.
- Never modify `packages/engine` except additive exports the client needs
  (and say so in the commit message).
- Screenshot before you claim. If you didn't look at it, it isn't done.
- Randomness picks which gag, never how a gag looks (taste law).
- Commit straight to `main` per repo convention; keep the phase's harness
  states working at every commit.
- Log forks and inventions in Open Questions / Decisions below — this file is
  the shared memory between agent sessions.

## Completion log

One entry per finished phase or step, appended by the session that did it:
what shipped, deviations from this plan, and what the next phase needs to
know. Phases 3–8 also record here how their output held up next to the phase-2
thesis artifacts, and what they couldn't fix.

- **Phase 0 — Stage** *(Fable, 2026-08-07)*. Shipped `apps/fever`: R3F + zustand
  + ported worker protocol (verbatim from `apps/web/src/engine/`, review method
  included for phase 7). Full games vs Moss verified on both variants through a
  scripted browser (`npm run acceptance`), canvas raycast click included; 120fps
  sampled mid-game headless. The architecture later phases inherit:
  `director/types.ts` is the DirectorFrame contract and `useDirectorStore` the
  read surface every subsystem subscribes to (the debug slider is its only
  writer until phase 1 replaces it); `match/store.ts` owns `moves` (game truth)
  and `landed` (theater progress, lags by one drop) — discs animate off the move
  list, never the click; the turn loop is a plain module (`match/controller.ts`),
  not a React effect, so the preview harness mounts scenes with no bot;
  `stage/layout.ts` is the only source of world geometry (variant → positions,
  camera fit; fuzzed over odd variants like the engine); `StageView` is pure
  props. Drop physics + hard-step squash are pure and unit-tested
  (`match/timing.ts`). Preview harness: `preview.html`, states in
  `src/preview/states.ts`, `?state=id` fullscreen for screenshots;
  `tools/shots.mjs` + `tools/acceptance.mjs` drive system Chrome via
  playwright-core (`npm run shots` / `npm run acceptance` against a running
  dev server). Deviation: a minimal toggleable Bloom is already in (stack-proof
  placeholder; phase 2's Fable step owns the real post stack). What phase 1
  needs: `VoidBackdrop` has a `uDrift` uniform waiting for fever; `--fever` on
  the DOM root is still yours to add; dev hook `window.__fever` exposes both
  stores for scripting. Trap for shader writers: the post chain converts output
  linear→sRGB, so author colors at intended screen values and end with
  `col = pow(col, vec3(2.2))` — first harness run caught the void rendering
  daylight-purple because of exactly this.

- **Phase 1 — The Director** *(Opus, 2026-08-07)*. The pipe is live end to end:
  `director/director.ts` is pure (game truth + `dt` in, `DirectorFrame` out, 19
  unit tests on curve shape and debouncing), `director/runtime.ts` is the only
  impure part and holds the clock, the stores and the DOM. Fever = |advantage| +
  volatility, raised by a disc-count floor derived from `variant.cells`; it
  smooths with a fast rise and a slow fall and snaps only on a win. Every
  constant is in one exported `TUNING` object — phase 9 tunes there, not in the
  code. **What later phases build on:** subscribe via `subscribeEvents()` for
  spikes (a stream — polling `frame.events` will double-fire), `useFeverSource()`
  inside the scene, `useFeverStep()` for DOM chrome (raw `useFever` re-renders
  60×/s and is a trap), `directorFrame()` in a render loop. `--fever` is on the
  root and already drives the wordmark and status glow. The debug panel now pins
  fever for real (with a live readout and a release button, so a forgotten
  slider can't look like a broken Director) and its buttons fire real events
  down the real bus — build your gags against those before a live game.
  **Deviations:** two additive engine exports, `advantageOf` and
  `estimateDepth`, so live fever rides the exact axis the review draws rather
  than a second implementation of it; a second search worker (`analysisClient()`)
  because the eval feed queued behind the Oracle would freeze fever for seconds
  at peak tension; `SpectacleEvent.win.line` is now specified as cells
  (`row * width + col`), which the contract left open. **Traps found:** a comment
  containing backticks inside a template-literal shader ends the string (the
  error surfaces as a Babel syntax error pointing at GLSL); and driving drift as
  `elapsed * speed` teleports the void whenever fever changes — speed is a rate,
  so `runtime.ts` and `VoidBackdrop` both integrate it. Verified with
  `npm run shots` (new `fever-0` / `fever-mid` / `fever-full` states — one board,
  three temperatures, which is the row phase 2's gate should be judged on) and
  `npm run acceptance`, which now asserts the Director moved: two full games gave
  fever 0.00–1.00, 34 move events, threats, tension shifts, wins, 25 positions
  scored, `--fever` peaking at 1, at 117–120fps.

- **Phase 2 — The Thesis** *(Fable, 2026-08-07)*. The four artifacts later
  phases copy, by name:
  **The look** is harness state **`thesis`** (`?state=thesis`, with
  `thesis-entrance` as a second angle): final void shader in
  `stage/VoidBackdrop.tsx` (oil-slick ramp riding the weather; the heat family
  enters here, embers low in the frame, zero at fever 0), the real post stack
  in `stage/Post.tsx` (fever-driven bloom / radial chromatic aberration /
  grain, static vignette), and lacquered-obsidian board + disc materials
  (MeshPhysical, iridescence) lit by `VoidSky` — a hand-built PMREM env of
  five over-bright panels, the sky that isn't there.
  **The prop system** is `props/`: `registry.ts` (named fixed-length acts),
  `PropStage.tsx` (one act at a time, triggers dropped mid-act, never queued),
  `steps.ts` (the 12fps `stepped` clock and the pure `truckPose`, both unit
  tested). The exemplar is the truck lap: **180 audited tris**, one 64px
  nearest canvas texture (`texture.ts`), Lambert flat shading, entrance
  wheelie → launch → **freeze-frame at apex, a beat too long** → slam (fires
  the same `stageFx` flinch a disc landing does) → exit. Live trigger:
  `move`/`brilliant` (phase 3 owns the full mapping).
  **The sound** is `audio/`: semantic names only (`playSpike("spike-truck")`),
  `mangle.ts` (distortion, generated-impulse convolver, reverse, deterministic
  granular chop), `library.ts` (offline-rendered synth placeholders — the
  signature spike is a ruined airhorn), `ambient.ts` (live drone + detune +
  filter that open with fever; a wrong choir above 0.45). Autoplay-safe:
  nothing constructed before first pointerdown; `playSpike` is a no-op until
  then, so the harness never needs audio. Hard mute on the debug panel;
  settings chrome is phase 4/6.
  **The voice** is VISION.md's new "The voice" section (16 strings + the
  rules) and the full **Moss** persona as the template; the outcome dialog,
  status line and title bar in `Hud.tsx` already speak it.
  **Deviations:** `TUNING.floorCurve` 1.6 → 0.85, and later 1.0 with
  `floorMax` 0.45 → 0.75 (Connor's live notes: the escalation was "nothing
  until the end", and then still not the roughly linear climb he wanted; the
  shader work alone didn't fix it because fever itself sat near 0 most of a
  game). `StageModel.fever` became
  `StageModel.pin` (`ScenePin` in `director/scope.tsx`) — the scene-scope
  object phase 1's open question asked for; it pins fever and/or a prop act
  phase. `postprocessing` added as a direct dep (the deploy builds
  `apps/fever` standalone). Verified: 120fps in `npm run acceptance` with the
  full stack on, both variants; `npm test` 120 green; screenshots of every
  state looked at.
  **Traps found:** the void plane was 170x96 but the frustum only ever saw
  the middle fifth, so the shader's whole composition happened off-screen —
  the plane is now sized to the visible frustum (64x34) and the shader
  composes in screen-ish UV. And a flat front face mirrors what's *behind*
  the camera: an env map with nothing there renders lacquer as matte black
  (drei's `Environment` children portal also never fed `scene.environment`
  reliably — `VoidSky` builds the PMREM by hand).

- **Phase 3 — Spectacle, extended** *(Opus, 2026-08-07)*. Both halves in one
  session. **The gag roster** is `props/`, one act per `SpectacleEvent` kind,
  each built by holding it next to the truck: `rocket-fizzle` (blunder — climbs
  beautifully, engine dies, hangs, tips over), `sign-hmm` (dubious — a sign
  says HMM. and waggles), `beacon-drop` (threat — a hazard beacon lowers in and
  strobes on the step clock), `banner-rising` / `banner-collapsing` /
  `banner-draw` (a tow plane, one 64px word tile repeated along the banner, so
  saying it three times costs one texture), `sprinkler` (idle-beat — Moss's
  signature, built to the VISION.md persona), and `win-detonation` (pyro rack +
  debris + a chrome WordArt banner that slams at the lens, holds a beat too
  long, and is thrown back into the void). Audited tri counts live in
  `registry.ts` and print in the harness caption: 24–180 per act, law is 300.
  **What phase 4/5 build on:** `gagFor(event)` in `PropStage.tsx` is the whole
  event→act table and is unit-tested for coverage; `PropAct.spike` is the seam
  for phase 4's one-shots (only `spike-truck` and the new `spike-win` exist —
  every other act is deliberately silent, and that is the shopping list);
  `props/material.ts` (`usePropMaterial` / `usePropTexture`) makes the cheap
  budget structural — Lambert, flat, no env map, disposal handled — and is where
  a new prop should start. Acts that need a text prop are component factories
  (`makeSign`, `makeBanner`), which is how one component becomes three registry
  entries.
  **Deviations / inventions:** a `STAGE_QUIET_MS` gap between acts (1.6s). "One
  act at a time, drop if busy" alone was not enough rate limiting — a real game
  fires a `move` event every couple of seconds and the stage was never empty,
  which turns spikes into scenery. `win`/`draw` preempt a running act; nothing
  else does. **The look** carried across without changes to the thesis frame:
  the fever ladder now exists on Connect 5 too (`fever-0-c5` / `fever-mid-c5` /
  `fever-full-c5`) and reads as the same three moods; every gag has a harness
  state (`gag-*`) pinned at the thesis frame's own fever so the row can be read
  against `thesis` directly. Against the phase-2 artifacts: the roster sits in
  the same world — cheap objects, hard steps, heat only where fever means heat.
  The one that argues with the beautiful half least convincingly is the
  sprinkler, whose eight water quads read as dashes in a still; it works in
  motion and it is the quietest act by design, but it's the first thing to look
  at in phase 9.
  **Connor's live notes, applied:** bot think time is 0.9–1.9s jittered (380ms
  fixed read as a glitch, and a *constant* pause reads as a timer, not as
  thinking); the void drifts ~2.5x faster, breathes at idle, and its low-fever
  amplitude is up — the two constants are pivoted so the value at the thesis
  frame's 0.55 is unchanged; discs are struck coins now (`stage/coin.ts`, a
  lathed profile with a raised rim and a 20-groove reeded edge, one geometry
  shared by every disc on the board).
  **Traps found:** props staged at z > 0 have to be framed against the frustum
  *at that z*, not against the board — the banner sat a comfortable 1.5 units
  above the frame and flew clean over the top of the screen. `emissive`
  defaulting to white bleaches every glowing prop the moment bloom touches it
  (a gold confetti shower came back looking like office paper); it now defaults
  to the prop's own color. And the preview grid outgrew the browser's ~16 WebGL
  contexts, which surfaces as `Cannot read properties of null (reading
  'alpha')` and blank cards — tiles now mount on visibility, the grid page
  scrolls (it never could), and `npm run shots` captures it a screenful at a
  time and takes state ids as arguments.
  **Verified:** `npm test` 54 green in `apps/fever`, typecheck clean,
  `npm run acceptance` played full games on both variants at 120fps with the
  post stack on, and each gag was fired down the real bus in the real app and
  screenshotted (`shots/live-*.png`).

- **Phase 4 — Audio** *(Opus, 2026-08-07)*. The bus phase 2 founded now carries
  **22 named sounds**, every one of them rendered through the phase-2 mangling
  graph. `audio/library.ts` is the whole roster as recipes (`want` + `seconds` +
  `build`), `audio/synth.ts` is the new placeholder workshop (noise, envelopes,
  gates, `sampleVoice`, `loopify`) kept separate from `mangle.ts` on purpose:
  mangling is the sound design and survives real samples, synthesis is
  scaffolding that a recording replaces. **The manifest is live**:
  `public/samples/manifest.json` is the shopping list *and* the loader's input —
  drop a CC0 file in `public/samples/`, name it in the entry, reload, done. No
  rebuild, no code change, no caller learns a filename. Until then every entry
  plays its placeholder, and a recipe uses a sourced sample as the *voice* while
  keeping its own choreography, so the horn still falls a fifth and the plane
  still dopplers. Verified both directions with a real file (swap heard, missing
  file falls back silently).
  **What phase 5/6 build on:** `playSpike(name, level)` — level is per-callsite,
  because the quiet furniture is quiet at the moment, not in the recipe;
  `PropAct.spike` is now required, so a bot act with no sound won't typecheck;
  `settings/store.ts` is the persisted source of truth for mute/volume and the
  audio bus subscribes to it (nothing sets gain directly — the HUD's
  `NOISE`/`SILENCE` toggle and the debug panel are two views of one setting);
  `audio/cues.ts` is the fourth non-React loop, for sounds that belong to the
  flow of a match rather than to a click.
  **Fever reaches audio in four places:** the drone/choir from phase 2, plus a
  new crowd loop that walks closer, a tape loop whose wow deepens (a real
  detune on the loop — the one place the game audibly stops running at the right
  speed), and the spike bus, where everything plays up to 5% sharp and sits in a
  bigger room at full fever. Recipes themselves never read fever: a gag has to
  sound the same every time it fires, and the evening running hot is a property
  of the evening.
  **Deviations:** 22 sounds, not the plan's ~30 — the roster is one per gag, the
  board, the match and the chrome, and padding it would have meant entries
  nothing fires. A per-sound *peak limiter* was added after the check found
  half the gags rendering to 1.2–1.5 full scale (real clipping, the wrong kind
  of broken); it scales down and never up, so the sprinkler stays 30dB under
  the airhorn. `toggle-off` fires *before* mute applies and the mute fade
  runs at 0.08s instead of a cut, so the switch is audible on the way out.
  **Verification:** `npm run audio` (new) renders every recipe in real Chrome,
  writes `shots/audio/*.wav` plus an `all.wav` montage in one order, prints
  length/peak/rms/onset, and fails on silence, a late onset (>0.12s) or a page
  error. It also checks the three things nobody can see: no AudioContext exists
  before the first gesture and it runs after one; both bed loops actually
  started (they're wired into `source.detune` inside an unawaited promise —
  failure there is silent); and the real `NOISE` button takes the master
  0.72 → 0.000 → 0.72. `npm test` 150 green, typecheck clean, `npm run
  acceptance` played both variants at 120fps with audio in the loop.
  **Against the phase-2 artifacts:** the signature spike is still the loudest,
  densest thing under 3 seconds (rms 0.65; nothing else clears 0.6 except the
  win and the error ding, both of which are meant to), and every gag was built
  by writing its shape against the truck's. Honest limit: **an agent cannot
  hear any of this.** The numbers are a proxy for presence, not for taste, so
  the montage is the deliverable Connor has to sit through — that judgment is
  genuinely outstanding, not deferred to phase 9 out of politeness.

- **Phase 6 — Chrome** *(Opus, 2026-08-07)*. Taken **out of order at Connor's
  call**: phase 5 is skipped for now, so this session also took its "bot select
  UI as possessed chrome" bullet — an app shell whose only opponent is Moss has
  nowhere to route. What phase 5 still owns is untouched: the seven personas,
  the per-bot void variations and signature gags. The two places their copy
  will land are marked — the `THINKING` / `DEFEAT` tables in `chrome/copy.ts`,
  which fall back to `${NAME} IS THINKING.` today and hold Moss's written lines.
  **The look is the icon.** Connor's steer mid-session: the ending rematch
  window already had the right vibe, and the menu did not. So the chrome is now
  the home-screen icon at full size — `tools/icon-art.js`'s fire is ported into
  `chrome/fire.ts` (same six-stop palette, same nested-tongue construction) and
  animated at a stepped 12fps behind a banded-chrome wordmark in a sunken
  picture box, inside a real Win95 dialog. **There is exactly one button style
  now**, a beige tile, including the ones floating on the void; `btn--void` is
  gone. The two files' fire has to stay in step by hand.
  **What shipped:** `chrome/store.ts` routes (screen + dialog, no URLs — one
  canvas, never unmounted); `chrome/Window.tsx` is the window everything is made
  of (draggable title bar, working close box) plus `Btn`; `Menu`, `Roster` (a
  period list box + details pane straight off the engine's `blurb` and
  `exactnessNote`, with the ladder as a level meter), `Settings` (sound, volume
  and the post stack, which is now a *player* setting — `debug/store.ts` is
  deleted and the debug panel writes the same switch), `Dialogs` (about, quit,
  error, outcome), `Hud` (a floating beige toolbar, and the status line is a
  sunken status bar because glowing purple text over fire cannot be read), and
  `Trail` (a 12fps cursor trail that only exists above 0.66 fever).
  **Fever reaches the chrome in four places:** the wordmark's heat glow, the
  title-bar gradient (`color-mix` toward the icon's `#ed5705`), the title text's
  four-step sweat above 0.66, and the floor catching fire from 0.25 up.
  **New surface for later phases:** `chrome/copy.ts` is every player-facing
  string in one file — phase 9's copy pass is meant to be a single read of it,
  so new strings go there even when they'd be shorter inline. Preview states
  `chrome-*` render each surface over a real board (`preview/chrome.tsx`
  fixtures; fever is a local custom property because the harness never starts
  the Director).
  **Deviations / inventions:** a `live` flag on the match store, because the
  menu keeps the board as scenery and the turn loop would otherwise go on
  playing it behind the menu — it's part of `newGame` rather than a separate
  setter, since for the instant between two sets a game the human doesn't lead
  is the bot's turn. `retryBotTurn()` un-claims the position a dead worker died
  on, which is the only thing "Try again" can mean. Local win/loss records were
  ported from the old client (same `fourscore.record.v2` key, so an existing
  record survives). `match-start` now only fires when a game is live — the menu
  rebuilds the board on every variant or opponent change.
  **Verified:** `npm test` 155 green (5 new, on the copy table's fallbacks),
  typecheck clean, every `chrome-*` state screenshotted and looked at, and
  `npm run acceptance` — which now enters through the menu's own buttons and
  asserts the bot leaves the board alone while it's scenery — played both
  variants at 120fps. The cursor trail was checked in the live app with a
  scripted pointer (`shots/live-trail.png`).
  **Against the phase-2 artifacts:** the beige-on-void window was already the
  thesis's chrome idea; this session made everything else agree with it. What
  the thesis frame doesn't cover is the fire, which is new to the chrome — it
  comes from the icon rather than from `thesis`, and it is the one thing in this
  phase worth a second opinion.

## Open Questions / Decisions log

- **Decision (phase 0):** engine `red`/`yellow` render as garnet-magenta
  (`#a3164e`) and tarnished gold (`#c8991f`) — both from the iridescence
  family — so the arterial-red/hazard-orange heat family stays reserved for
  fever escalation per the palette law. Phase 2/5 may restyle within that
  constraint.
- **Decision (phase 0):** the board floats in the void (no legs, no floor);
  board + discs levitate as one group so discs stay registered to the holes.
- **Decision (phase 0):** win feedback is a hard square-wave blink (0.35s on /
  0.35s off) of the winning line with everything else dimmed to mud — the
  timing-law reading of "alarm". Phase 3's win detonation builds on top, not
  instead.
- **Decision (phase 1):** the live feed is `estimated` only — one cheap
  heuristic search per ply, never the solver, because an exact answer costs
  seconds and fever has to keep moving. So of everything on the bus, **only
  `win` and `draw` are facts** (they come from the board being finished, not
  from a search). That's the phase-3 gate for PLAN.md's product truth 1: a gag
  on `win` may be flatly declarative, a gag on `move.quality` / `threat` /
  `tension-shift` may be as loud as it likes but must not assert a result. The
  rule is written into `director/types.ts` where gag authors will actually read
  it. No `source` field was added to the events, because in live play it would
  be the constant `"estimated"` and would invite dead proven-only branches.
- **Decision (phase 1):** fever escalates the void by amplitude, blotchiness
  and a tightening well — not by hue. Introducing the heat family (arterial
  red / hazard orange) into the void is a palette decision and sets precedent,
  so it waits for phase 2's Fable step. The escalation curve is `pow(fever, 0.65)`
  because a linear ramp piled the whole visible change into the top third and
  fever 0.5 was indistinguishable from 0 in a still — worth re-checking when the
  real shader lands.
- **Open (phase 1):** `StageModel.fever` pins a scene's fever for the harness
  (the grid renders one board at three temperatures, so a single global would
  show three copies of one of them). It's one prop at the top of the scene, read
  through `FeverProvider` / `useFeverSource`, deliberately not drilled. If phase
  2 or 3 needs to pin *more* than fever per harness state — a frozen clock, a
  forced event — that's a scene-scope object, not another prop, and it should be
  designed once rather than grown.
- **Open (phase 0):** the 60fps budget is only measured on this M-series
  machine (120fps headless). The stated budget is an *integrated-GPU* laptop —
  someone needs to run `npm run acceptance` on one before the post stack gets
  heavy (phase 2 is the natural moment).
- **Decision (phase 2):** the heat family lives in exactly two places — the
  void's ember layer and (implicitly) the win blink, which now reads hot
  pink-red through the env + bloom. That's treated as escalation being
  legible, not a palette leak; if phase 3's win detonation brings real heat
  props, re-check the blink against them.
- **Decision (phase 2):** props never receive `scene.environment` (Lambert
  materials by construction) — cheap things do not reflect the sky that
  isn't there. This is the material-level enforcement of the two budgets.
- **Open (phase 2):** the chromatic aberration ramp (`0.0004 + 0.0035·f²`,
  radially modulated) was judged in stills; whether full-fever smear is
  right *in motion* over minutes of play is a phase-9 feel call.
- **Open (phase 2):** the exemplar's live trigger is only `move`/`brilliant`,
  so in real games the truck is rare. If playtesting wants more traffic
  before phase 3 lands the full gag roster, the debug panel's "brilliant"
  button is the intended preview path, not a looser trigger.
- **Decision (phase 3):** `win` and `draw` preempt a running act; nothing else
  does. A sprinkler quietly finishing its watering while the game is over is
  worse than an interrupted gag, and the detonation is the one act the plan
  calls the biggest thing in the game.
- **Decision (phase 3):** the roster's props are staged in front of the board
  (z 1.6–3.4) rather than around it. The board floats in the void with nothing
  behind it, so an act passing *behind* has no depth cue to read against and
  just looks small; in front it occludes, which is what makes the cheap budget
  collide with the expensive one instead of sitting next to it.
- **Open (phase 3):** at fever 1 the void's central brightening washes the
  board's empty holes to lavender — the dark backdrop the lacquer is composed
  against is largely gone at the top of the range. It reads as the world going
  hot and the discs still separate, so it was left alone: re-tuning the thesis
  frame's own shader by eye in an extension phase is exactly the drift the plan
  warns about. Worth a look in phase 9 next to real play.
- **Open (phase 3):** seven of the nine acts are silent. Phase 4 owns one-shot
  per gag and `PropAct.spike` is where they land — the acts that most want one,
  in order: `beacon-drop` (an alarm with no sound is a lamp), `rocket-fizzle`
  (the fizzle is a sound gag), `sign-hmm`.
- **Open (phase 3):** move-quality gags fire off the Director's grading, and in
  a real game that means the sign and the rocket carry most of the traffic
  while the truck (brilliant) stays rare. Whether that ratio is funny over ten
  games is a phase-9 feel call; `STAGE_QUIET_MS` and the grading thresholds in
  `TUNING` are the two knobs, in that order.
- **Decision (phase 4):** a gag's whole choreography lives in *one* buffer.
  `spike-rocket` contains the ignition, the climb, the sputter, the beat of
  silence and the off-stage landing at 1.98s, because an act is a fixed-length
  piece of theater and its sound is allowed to know that. So `PropAct.spike`
  stayed a single name rather than growing a cue schedule, and the sound-side
  law is instead "a spike may never outlast its act" — asserted in
  `library.test.ts`.
- **Decision (phase 4):** the banner barks are pitched blats with no words —
  rising steps up, collapsing steps down, the draw gets one and no bend. That's
  product truth 1 in sound: `tension-shift` rides the Director's estimate, and
  an announcement with no content cannot overclaim a result. The only
  declarative sounds in the game hang off `win` and `draw`, which are facts.
- **Decision (phase 4):** losing opens the outcome dialog with `error-ding`
  instead of `dialog-open` — the software treats your defeat as a fault
  condition and says so without saying anything. The ding itself is a bell
  rendered and played backwards, which is the reversal tool from phase 2
  earning its place; it reads uncanny rather than horror, but it is the closest
  thing in the game to the tone boundary and worth a second opinion in phase 9.
- **Open (phase 4):** `turn-yours` fires every time control comes back to you —
  roughly twenty times a game. It is quiet (played at 0.7) and it solves a real
  thing (you look away while the bot thinks), but a sound that frequent is the
  first candidate for "annoying" in the phase-9 ten-game pass. The callsite is
  one line in `audio/cues.ts`.
- **Open (phase 4):** the sample manifest ships empty — every sound is its
  placeholder. The placeholders are honest but they are all synthesis, and the
  gap between "a saw pretending to be an airhorn" and an airhorn is the biggest
  single quality jump available to this project. The list is 22 short CC0
  recordings; nothing else in the plan depends on them.
- **Decision (out of band, Connor's ask):** the stage orbits. Dragging anywhere
  on the canvas turns the board (`stage/orbit.ts`), clamped to ±54° of yaw and
  −23°/+40° of pitch, with a throw on release. The player moves the camera
  *around* the authored framing and can't replace it — no zoom, no pan, and the
  view holds where it's left rather than springing back. `fitDistance` now
  refits for the orbit, so a turned board can't clip out of frame; head-on it
  returns exactly what it did before, which is what keeps the thesis frame
  invariant. Three things this broke, all of them invisible head-on and all
  fixed: the per-column hit slabs handed the ray to the *neighbouring* column
  at an angle (now one hit plane at the disc depth, `ColumnInput`); the void
  was a fixed plane whose edge came into shot (now rides the view axis behind
  the board); and the side rails spanned only the slot, leaving a lit dashed
  hairline down the board's seam. Phase 9 owns whether this survives a phone:
  the drag shares its gesture with the tap that drops a disc, separated by a
  5px slop and nothing else.
- **Decision (phase 6):** one button style, everywhere — a beige Win95 tile,
  including on the void. Connor's steer: the chrome is the home-screen icon,
  not a second style that merely rhymes with it. The purple-on-void button is
  deleted rather than kept for "chrome that floats", because two furniture
  styles is how a possessed application starts looking like a themed one.
- **Decision (phase 6):** the fire is drawn at 4x, not 3x. The chunk of the
  pixel is half the style — at 3x the same licks came out as a fine orange
  fringe along the bottom of the box rather than as fire. Any future flame
  surface uses `FLAME_SCALE` and an integer upscale; a fractional one softens
  every edge in it, which is the one thing the cheap budget can't survive.
- **Open (phase 6):** the floor fire starts at 0.25 fever and is full by 1.0
  (`FIRE_FROM` in `chrome/Hud.tsx`). That curve was chosen against pinned
  states, not against real play, and fever spends most of a match in the low
  middle — if ten games feel like the screen is always burning, this constant is
  the knob, before the flame geometry.
- **Open (phase 6):** the chrome's fire comes from the icon, not from the phase-2
  thesis frame, which has no warm pixel art in it at all. It reads as the same
  world to me and it is what Connor asked for, but it is the one place this
  phase extended the look rather than the look extending itself. Worth a look in
  phase 9 next to `thesis`.
- **Open (phase 6):** `THINKING` and `DEFEAT` in `chrome/copy.ts` hold one bot's
  lines (Moss, from VISION.md) and fall back to `${NAME} IS THINKING.` for the
  other seven. That fallback is deliberately plain rather than improvised —
  writing seven voices is phase 5's deliverable and setting personas here would
  be an Opus session setting precedent. Filling the two tables in is most of
  what "bots as characters" means on the chrome side.
- **Open (phase 6):** the roster shows a win/loss record and the ladder as a
  level meter, but nothing about a bot's *appearance* — no creature, no void
  variation. That's phase 5's, and the screen is built so those can land in the
  detail pane without moving anything else.
- **Decision (out of band, Connor's ask):** pinch to zoom. `orbit.zoom` is a
  multiplier on the authored fit distance, clamped to 0.75–1.0: one is the
  framing the layout chose and there is nothing above it, because pulling back
  would *replace* the composition rather than move around inside it — the same
  reason there's still no pan. The near stop is arithmetic, not taste. It's
  where the board fills the frame, given `fitDistance`'s 1.35-unit horizontal
  pad; the first attempt (0.5) put the outer columns off screen and read as a
  layout bug rather than as a zoom. Two fingers suspend the drag and mark the
  gesture `dragged`, so a pinch never also turns the board or drops a disc, and
  the pinch is measured against the span it started from rather than
  accumulated. A trackpad pinch is a ctrl-wheel, so desktop and touch are the
  same gesture; a plain wheel zooms at a gentler rate.
