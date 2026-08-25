# CLAUDE.md

Connect 4/5/6/7 against a ladder of bots plus an exact solver, played inside a
possessed Win95 (BOARD.EXE). TypeScript, npm workspaces: `packages/engine` is
pure game logic, `apps/exe` is the client and owns only rendering and the match
runtime. The desktop also contains a real 16-bit CPU, a C compiler for it, and
a language model the CPU runs.

`npm run dev` / `npm test` (~3s, the whole gate) / `npm run check` (typecheck +
test) / `npm run build`. Measurement scripts live under `tools/` and run by hand.

Docs, and what each governs:
- `apps/exe/DIRECTION.md` — the law for everything visual, audible and copy in the app. Read before building there.
- `llm_llm_llm.md` — the CPU / compiler / on-drive LLM: plan and decisions. Read before touching vm/cc/llmc.
- `llm_training.md`, `corpus_howto.md` — training a model to write C for the machine (tools/corpus).
- `feature_ideas.md` — backlog plus documented dead ends (ladder measurements live here).
- Approved art: `apps/exe/reference/`, `apps/exe/proposals/`; original pitches `redesign/proposals/`. Deleted clients `apps/web`, `apps/fever` are in git history only.

## Map

Comments in source are terse by design: header = what the file owns + its
constraints. Use this map to go straight to the file instead of grepping.

`packages/engine/src/` — pure, I/O-free
- `board.ts` — `Variant` geometry, bitboard `Position`, win detection. Only file that knows the bit packing.
- `evaluate.ts` — heuristic eval, `searchHeuristic`, weight vectors.
- `solver.ts` — exact negamax + transposition table (`analyze`, `solve`).
- `bots.ts` — the ladder roster: depth, weights, `slipRate`, `exactFrom`, `exactnessNote`.
- `match.ts` — `Match` state and the post-game review (per-ply scoring, `turningPoint`).
- `index.ts` — public exports.
- `tools/ladder.ts` (rung sweep), `measure-solve.ts` (exact-solve crossover), `bench-solve.ts`.

`apps/exe/src/` — the desktop
- `main.ts` — boot, wiring, `?state=`/`?fever=`/`?beat=`/`?demo=`/`?chips=` deep links.
- `wm.ts` window manager · `dom.ts` two DOM helpers · `chrome.css` period chrome · `icons.ts` pixel icons.
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

`apps/exe/tools/` — live harnesses (real Chrome): `shots.mjs`, `timeline.mjs`, `fever.mjs`, `audio.mjs`, `mobile.mjs`, `paint.mjs`, `files.mjs`, `live.mjs`, `llm.mjs`, `trace.ts` (fever curve replay), `appicon.mjs`.
- `llm/` — `pack.ts` float checkpoint → drive image, `checkpoint.ts` reader, `intref.ts` fixed-point oracle, `compare.ts` machine vs oracle, `grade.ts` quantised vs float, `build.ts`, `reference.ts`.
- `corpus/` — `synth.ts`, `gen.ts`, `prompt.ts`, `graders.ts`, `verify.ts`, `mutants.ts`, `farm.ts`, `bench.ts`.

## Rules

**Engine stays I/O-free.** `packages/engine` imports nothing from DOM, network
or app. Game logic goes in the engine even when the app is the only caller.

**Geometry is a value.** Board size and run length live in a `Variant`; masks,
move order, shifts, centre weights and score bounds are derived once per
variant. No module-level `WIDTH`/`HEIGHT`; anything reachable from search reads
`p.variant`. Shipped: C4 7x6/4, C5 9x8/5, C6 11x10/6, C7 13x12/7 — odd width,
even height, line density ≈1.6/cell. `makeVariant` takes anything.

**Bit packing lives only in `board.ts`.** Nothing else does arithmetic on
`position`/`mask`. Coverage is the fuzz test vs brute force over three
geometries (C4, C7, unshipped 5x4 run-3). One sentinel row suffices for any N
(a wrapping line must cross it on an ANDed intermediate step).
`computeAlignmentSpots` is the hottest function — its prefix/suffix chains are
linear in N; don't "simplify" to the nested loop.

**TT keys are exact, never hashed down.** `Position.key()` needs
`width*(height+1)` bits (49/81/121/169); Float64 rounds silently past 53, so
keys are stored in four 32-bit lanes + remainder, exact to `TT_MAX_KEY_BITS`
(181), and the solver throws beyond. Costs ~5% C4 throughput, measured.

**The ladder has to stay a ladder.** Depth and weights interact (deeper with
worse weights can be weaker). `tools/ladder.ts <variant>` flags rungs under
65%; run it after any retune. Tune strength with `slipRate`/`depth`; weights
are personality. A slip draws non-best moves geometrically by rank and above
tier 1 never picks a proven loss, so `slipRate` is far from linear in strength.
`searchHeuristic` shares one node budget across root moves and goes nearly
blind when it clips, silently — `depthFor` and `heuristicBudget` scale with the
board (C4 is identity). If a rung goes soft, check budget clipping before
weights. Known plateaus that are not bugs: C4 `quill > vane` ~63%, C5 ~56%,
C6 ~59%, C6 `cinder > bramble` ~60%, and C7 reads soft everywhere because most
games fill the board — see the dead ends in `feature_ideas.md` before retuning.

**Proven vs estimated.** Every ply carries `source: proven | estimated`. Engine
keeps them apart; UI never shows the distinction (one line, no legend, no
badges). Estimated plies never set `turningPoint`; the advantage scale keeps
proven results in a band above any estimate; estimated copy is hedged
("looks like"), proven copy is flat. `exactFrom` is measured per variant with
`measure-solve.ts live <variant>` (worst case of a cold `analyze`): C4 ~10-13
of 42, C5 44/72, C6 82/110, C7 127/156. `exactnessNote` generates the bot's
claim from the number — never hand-write it.

**The machine inside the machine.** `cd /src; cc llm.c; run llm` — ~1.7s a
word. Program space is 3840 words; llm.c uses 3261 + 428 heap, and
`llm.test.ts` asserts the fit — any CC change moves it. `tools/llm/intref.ts`
is the oracle: same fixed-point pipeline over the same image; run `compare.ts`
after any numerics or compiler change (each side has caught the other before).
Argue numerics changes against `grade.ts` (currently 94% top-1, 0.06 nats).
Rebuilding weights needs `.cache/stories260K.bin` + `tok512.bin` from
huggingface.co/karpathy/tinyllamas; the built `WEIGHTS.BIN` is committed.

**Screenshot before you claim.** Tests can't see visual work. `npm run shots`
photographs every named state; `timeline` for anything that moves over
seconds; `npm run llm` photographs the LLM every 5s (slow vs stuck). If you
didn't look at it, it isn't done.
