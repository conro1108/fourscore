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
  look, the creative direction documents, and the taste gates. Fable's
  deliverable is usually small and vertical — one exemplar built to final
  quality that defines the bar.
- **Opus** does the work where *precedent gets extended*: breadth, mechanics,
  ports, and every additional instance of a thing that already has an
  exemplar. This is most of the codebase by volume.

The boundary in one sentence: **Opus has full agency within established
precedent and the freedoms VISION.md grants; anything that would set new
precedent for the whole game — a new palette family, the first prop, a
subsystem's founding structure — waits for a Fable step.** An Opus session
that finds itself about to set precedent should log it as an Open Question
and route around it, not improvise it.

Phases marked ⚑ are taste-critical and end with a **taste gate**: a short
Fable session reviews the phase's harness-state screenshots against
VISION.md's fixed list (the two budgets and the timing rule especially) and
either signs off in the completion log or leaves a punch list. The ledger
line doesn't flip to `done` until the gate passes.

### Phase ledger

- [x] 0 — Stage *(Fable)*
- [ ] 1 — The Director *(Opus)*
- [ ] 2 — The void and the board look ⚑ *(Fable step → Opus step)*
- [ ] 3 — Props and spikes ⚑ *(Fable step → Opus step)*
- [ ] 4 — Audio ⚑ *(Fable step → Opus step)*
- [ ] 5 — Bots as characters ⚑ *(Fable direction → Opus build)*
- [ ] 6 — Chrome ⚑ *(Opus, Fable copy pass)*
- [ ] 7 — Review, reimagined *(Opus)*
- [ ] 8 — Online *(Opus)*
- [ ] 9 — The polish lap *(Fable, with Connor)*

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
roughly one focused agent-session each; 3 and 5 may be two.

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

**2 — The void and the board look ⚑.** Gradient/iridescence shaders, bloom
and post stack, board material, fever-driven escalation of all of it. This is
the "genuinely beautiful" pillar. *Fable step:* establish the look — the void
shader, the iridescence ramp, the post stack — on one harness state at
mid-fever, built to final quality. That frame is the game's visual thesis.
*Opus step:* extend it across the fever range, the board material, and both
variants, holding the thesis frame invariant. *Accept:* harness states
idle/mid/full fever look like three moods of one world; 60fps held; gate
passed.

**3 — Props and spikes ⚑.** Prop system (budgeted geometry, stepped
animation, spawn/despawn choreography) + the event gags: move quality
reactions, threat alarms, the win detonation. Proven-only gags gated per
Product Truths. *Fable step:* the prop system's founding structure plus **one
exemplar gag end-to-end** — say, the monster truck lap — nailing the taste
law: budgeted geometry, stepped timing, choreographed entrance and exit. This
is the reference every other gag is judged against. *Opus step:* the rest of
the gag roster, each one held to the exemplar. *Accept:* each
`SpectacleEvent` kind has ≥1 gag; win moment is the biggest thing in the
game; budgets audited (tri counts logged in the harness); gate passed.

**4 — Audio ⚑.** WebAudio bus, manifest + placeholder synth samples,
mangling graph, fever-driven ambient bed + event one-shots, mute/volume in
settings. Produce the sample shopping list. *Fable step:* the bus and
mangling-graph architecture, plus the game's **signature sound** — the
ambient bed's fever escalation and one spike, tuned by ear until they're
right. *Opus step:* the full manifest, remaining one-shots, settings wiring,
and the shopping list. *Accept:* full game with sound feels escalating and
spike-y; hard mute works; no autoplay-policy violations; gate passed.

**5 — Bots as characters ⚑.** The eight rungs (Acorn → The Oracle)
reinvented in the new aesthetic — same names, same gameplay souls, new visual
identities and stage presence (each bot gets a variation of the void + a
signature prop or gag). Bot select UI as possessed chrome. `exactnessNote`
surfaced per Product Truths. *Fable step:* a **persona bible** appended to
`VISION.md` — a few sentences per bot: who they are in this world, their void
variation, their signature gag, their voice — reviewed by Connor before any
code. Plus one bot built end-to-end as the exemplar. *Opus step:* the other
seven, to the bible and the exemplar. *Accept:* harness state per bot; a
stranger could tell rungs apart with the eval hidden; gate passed.

**6 — Chrome ⚑.** Menus, HUD, dialogs, settings in the possessed-90s-software
style; app shell, routing, variant switch. Opus builds it; the gate here is a
**Fable copy pass** — possessed-software humor lives or dies in the writing,
so every player-facing string gets read and punched up in one sitting, for
tone-boundary compliance and for being actually funny. *Accept:* no unstyled
surface left; copy pass done; every dialog in the game passes the tone
boundary.

**7 — Review, reimagined.** The score-over-time curve and ply-by-ply copy in
the new world. All confidence rules apply exactly as in the old client — port
the copy logic, restyle the presentation. *Accept:* review of a decisive game
reads correctly hedged/flat; turningPoint only on proof; curve is one line.

**8 — Online.** Port `src/online/` state flow into the new client; opponent
gets a persona by hashing their user id (as today, but from the new roster
identities); desync message styled but honest. *Accept:* two browsers play a
full game; `npm run db:verify` green; wire moves land identically to local.

**9 — The polish lap.** *(Fable, with Connor playing.)* Play ten full games.
Fix what's flat, cut what's annoying, tune the fever curve against real play,
mobile/touch pass, perf audit. This phase is pure taste judgment against a
real artifact, which is exactly what shouldn't be delegated. *Accept:* Connor
grins.

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
know. Taste gates sign off here too.

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
- **Open (phase 0):** the 60fps budget is only measured on this M-series
  machine (120fps headless). The stated budget is an *integrated-GPU* laptop —
  someone needs to run `npm run acceptance` on one before the post stack gets
  heavy (phase 2 is the natural moment).
