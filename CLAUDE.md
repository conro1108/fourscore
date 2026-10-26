# CLAUDE.md

A possessed Win95 desktop full of games: SOL.EXE, CHESS, CHECKERS, MINES,
SNAKE, PAINT, a shell. BOARD.EXE is the original: Connect 4/5/6/7 against a
ladder of bots plus an exact solver. The deep end is a real 16-bit CPU, a C
compiler for it, and a language model the CPU runs off the drive. TypeScript,
npm workspaces: `packages/engine` is pure game logic, `apps/exe` is the desktop.

`npm run dev` / `npm test` (~3s, the whole gate) / `npm run check` (typecheck +
test) / `npm run build`. Measurement scripts live under `tools/` and run by hand.

Docs:
- `apps/exe/DIRECTION.md` — the visual, audio and copy reference; read it before working in the app.
- `llm_llm_llm.md` — the CPU / compiler / on-drive LLM: plan, decisions, measured numbers.
- `llm_training.md`, `corpus_howto.md` — training a model to write C for the machine (tools/corpus).
- `feature_ideas.md` — backlog plus documented dead ends, including the ladder measurements.
- Approved art: `apps/exe/reference/`, `apps/exe/proposals/`.

## Map

Each file's header says what it owns; this points at it.

`packages/engine/` — pure, I/O-free
- `src/board.ts` — `Variant` geometry, bitboard `Position`, win detection. Only file that knows the bit packing.
- `src/evaluate.ts` — heuristic eval, `searchHeuristic`, weight vectors.
- `src/solver.ts` — exact negamax + transposition table (`analyze`, `solve`).
- `src/bots.ts` — the ladder roster: depth, weights, `slipRate`, `exactFrom`, `exactnessNote`.
- `src/match.ts` — `Match` state and the post-game review (per-ply scoring, `turningPoint`).
- `src/index.ts` — public exports.
- `tools/ladder.ts` (rung sweep), `measure-solve.ts` (exact-solve crossover), `bench-solve.ts`.

`apps/exe/src/` — the desktop
- `main.ts` — boot, wiring, `?state=`/`?fever=`/`?beat=`/`?demo=`/`?chips=` deep links.
- `wm.ts` window manager, phone-desk `fit` · `dom.ts` two DOM helpers · `chrome.css` period chrome · `icons.ts` pixel icons.
- `desktop.ts` icons/taskbar/Start/clock · `deskpos.ts` icon positions · `containers.ts` folder + drive windows.
- `board.ts` — BOARD.EXE window and match loop · `boardfit.ts` its geometry per variant · `chips.ts` pieces.ctl.
- `engine/` — `worker.ts` search off-thread, `client.ts` promise wrapper, `protocol.ts` messages.
- `director.ts` — fever (continuous, tiered) + beats (discrete), pure · `beats.ts` which act answers a beat.
- `effects.ts` — every visible fever effect; reads the director, never writes state.
- `endgame.ts` win/loss/draw furniture · `review.ts` REVIEW.EXE · `reboot.ts` Shut Down/restart.
- `copy.ts` — every string the OS says, plus the seed disk contents. `notepad.ts` — moves.txt + Notepad + file picker.
- `audio/` — `index.ts` the bus (only public surface), `library.ts` sound scheme, `synth.ts` primitives, `bed.ts` room tone. `sounds.ts` sounds.ctl + tray speaker.
- `fs.ts` — the disk (C:\ real directories, persisted) · `drive.ts` WEIGHTS.BIN fetch · `terminal.ts` shell.
- `vm.ts` 16-bit CPU + assembler · `cc.ts` C compiler · `llmc.ts` llm.c source · `games_c.ts` maze/tetris/c4 in C.
- `sprite.ts` .spr format · `paint.ts` PAINT.EXE · `pins.ts` pinned pictures · `fire.ts` flames.scr automaton.
- `games/` — `folder.ts` roster; `sol.ts`/`solstate.ts`/`solreview.ts`/`solworker.ts` Klondike; `chess.ts`, `checkers.ts`, `mines.ts`, `snake.ts`; `ui.ts` shared game chrome.

`apps/exe/tools/` — live harnesses (real Chrome): `shots.mjs`, `timeline.mjs`, `mobile.mjs`, `fever.mjs`, `audio.mjs`, `paint.mjs`, `files.mjs`, `live.mjs`, `llm.mjs`, `trace.ts` (fever curve replay), `appicon.mjs`, `soldead.ts` (SOL dead-hand proof rate).
- `llm/` — `pack.ts` float checkpoint → drive image, `checkpoint.ts` reader, `intref.ts` fixed-point oracle, `compare.ts` machine vs oracle, `grade.ts` quantised vs float, `build.ts`, `reference.ts`.
- `corpus/` — `synth.ts`, `gen.ts`, `prompt.ts`, `graders.ts`, `verify.ts`, `mutants.ts`, `farm.ts`, `bench.ts`.

## Gotchas

- **Look at it**: tests can't see visual work. `npm run shots` (every named state),
  `timeline` (motion), `mobile` (a phone, touch), `npm run llm` (slow vs stuck).
- **Engine stays I/O-free**, so search runs in the worker and tools in node.
  Game logic goes there even when the app is the only caller.
- **Geometry is a `Variant` value.** Anything reachable from search reads
  `p.variant`; a module-level `WIDTH` breaks every board but one.
- **Bit packing only in `board.ts`**, whose fuzz test vs brute force is the only
  coverage. `computeAlignmentSpots` is the hottest function: its prefix/suffix
  chains are linear in N; don't "simplify" them back to the nested loop.
- **TT keys are exact.** Float64 rounds silently past 53 bits and the solver
  returns wrong scores, so keys are split into lanes (`solver.ts`), not hashed.
- **The ladder has to stay a ladder.** Deeper with worse weights can be weaker,
  so run `tools/ladder.ts <variant>` after any retune; known soft rungs are in
  `feature_ideas.md`. `searchHeuristic` goes blind, silently, when it clips its
  node budget: check that before weights. Strength is `slipRate`/`depth`.
- **Proven vs estimated stay apart.** Every ply carries `source`; estimated plies
  never set `turningPoint` and their copy is hedged ("looks like"); the UI never
  shows the distinction. `exactFrom` comes from `measure-solve.ts live <variant>`
  and `exactnessNote` generates the bot's claim from it, so they can't drift.
- **The machine inside the machine** (`cd /src; cc llm.c; run llm`). llm.c barely
  fits program space and any CC change moves it (`llm.test.ts` asserts the fit).
  After numerics or compiler changes run `tools/llm/compare.ts` (machine vs
  `intref.ts`; each has caught the other) and argue with `grade.ts`.

### Touch

- **Whole pixels.** The stage scale is fractional on a phone. Canvas
  rotate/scale at fractional values drops and doubles pixel rows, and iOS
  leaves 1px slivers behind anything moved by `left`/`top`: pre-flip bitmaps,
  scale by whole multiples, move drag ghosts by `transform`.
- **`chrome.css`: coarse-pointer block last**, or same-specificity base rules win
  and phones get desktop-sized buttons; grow hit areas there, not the geometry
  the layout math reads (titlebar 22, taskbar 36). A drag surface goes in the
  `touch-action:none` list at the top, or the browser scrolls and zooms instead.
- **One gesture, one action.** `dblclick` also fires after a touch double-tap,
  so a pointerup path that already answered acts twice. A pan or pinch must
  consume the press, or the lift taps. A tap that only focused a window
  (the WM raises on pointerdown) mustn't also move.
- **A tap that waits for a second tap lags by that window**: 170ms too tight,
  280 sluggish, SOL's `TABLE_TAP_MS` is 240.
- **Tap-anywhere controls misfire.** SNAKE's tap-to-turn read stray taps as
  turns; it has buttons now. Touch drags need a bigger slop (8px vs 3).
- **Game windows take `fit`** in their `wm` spec, or open at desktop size on a
  phone. Text inputs turn off autocapitalize/autocorrect, or iOS "fixes" commands.
