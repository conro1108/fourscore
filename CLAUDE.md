# CLAUDE.md

Fourscore is Connect 4 — and now Connect 5 — against a ladder of bots, plus one
that solves the position exactly, restaged as a fever dream. TypeScript, npm
workspaces: `packages/engine` is the whole game as pure logic, `apps/fever` is
the client (R3F scene + possessed-90s DOM chrome) and owns only rendering and
the match runtime.

`npm run dev` / `npm test` / `npm run build` / `npm run typecheck`.

Before visual or copy work, read `redesign/VISION.md` (the aesthetic law: the
four pillars, the two budgets, the taste law, the voice) and `redesign/PLAN.md`
(the phase ledger and the completion log — the shared memory between sessions).
The old pixel-art client (`apps/web`) is deleted; it's in git history if a
reference is ever needed.

## Geometry is a value, not a constant

Board size and run length live in a `Variant` object (`board.ts`), and everything
derived from them — masks, move order, shift schedules, centre weights, score
bounds — is computed once per variant and read from there. `CONNECT4` is 7x6
run 4, `CONNECT5` is 9x8 run 5, `CONNECT6` is 11x10 run 6, `CONNECT7` is 13x12
run 7 — all sized to hold line density near Connect 4's 1.64 lines per cell,
odd width, even height — and `makeVariant` takes any width/height/run.

Nothing should reintroduce a module-level `WIDTH`/`HEIGHT`. The Connect 4 aliases
still exported from `board.ts` are a convenience for callers that only ever touch
the default board, not a licence to hardcode geometry. Anything reachable from
the search must read `p.variant`.

## Keep the engine I/O-free

`packages/engine` imports nothing from the DOM, the network or the app. That's
what makes authoritative online play possible later — a server would import the
same module the client does. Game logic that leaks into `apps/fever` breaks
that, so it goes in the engine even when the app is the only caller today.

## The bitboard packing lives in one file

`board.ts` is the only place that knows how a position is packed into `bigint`
masks. The win-detection bit tricks depend on the sentinel row between columns
and on the shift distances derived from the variant; nothing outside that file
should be doing arithmetic on `position`/`mask`. Its fuzz test cross-checks
against a brute-force reference over random games, and that's where the real
coverage is — these tricks pass every hand-written case and then fail quietly on
one edge diagonal. The fuzz runs over four geometries including run-3 and run-6
boards that nothing ships, because "N is a parameter" is only true if something
tests an N nobody chose by hand.

One sentinel row is enough for any run length. A wrapping line has to pass
*through* the sentinel on some intermediate step, and every intermediate step is
one of the ANDed terms, so the chain zeroes. That argument doesn't depend on N,
which is why longer runs didn't need a wider gutter.

`computeAlignmentSpots` is the hottest function in the program. It builds
prefix/suffix chains and reads each gap position off them, which is linear in N
rather than the quadratic cost of testing each gap separately — don't "simplify"
it back into the obvious nested loop.

### The transposition table key is a real constraint

`Position.key()` needs `width * (height + 1)` bits: 49 for Connect 4, 81 for
Connect 5, 121 for Connect 6, 169 for Connect 7. A `Float64Array` only holds 53
bits of integer exactly and **rounds silently** past that, so two different
positions start comparing equal and the exact solver returns wrong scores with
no error. The table stores keys across four 32-bit lanes plus a float64
remainder for that reason — exact to `TT_MAX_KEY_BITS` (181), and the solver
throws rather than rounds on a board past that. The lanes cost ~5% of Connect 4
solve throughput, measured, which is the price of Connect 6 and 7 existing at
all. Collisions are still fine — a wrong hit costs a re-search — but only while
the key comparison itself is exact. Never hash the key down to fit.

## The ladder has to stay a ladder

Bots differ by weight vector as well as depth, and those interact: a deeper
search with worse weights can be weaker. `bots.test.ts` plays each rung against
the one below and requires >65% — it has already caught a rung inverting. If you
retune a bot, run it. Measured win rates between the asserted adjacent rungs are
67-90% on Connect 4 and 71-92% on Connect 5, and slip rate moves them far more
than the eval weights do, so tune strength with `slipRate`/`depth` and treat the
weights as personality.

The two rungs nobody asserts sit lower than that and always have: `quill > vane`
measures ~63% on Connect 4 and `vane > cinder` ~61% on Connect 5, both over 48
and 32 games. Those were measured before and after the 2026 slip retune and did
not move, so treat them as the top of the ladder being genuinely flat rather
than as something a sweep has just broken.

A slip is not a random move: `pick` draws from the non-best moves by rank with
geometric weight, and above tier 1 it will not slip into a move the search has
already proved loses. So a slip rate costs less strength than it looks like it
should, and the schedule is several times higher than it used to be for the same
ladder. Don't read `slipRate` as linear in strength.

Twenty games is not enough to judge a rung. The same `moss > pebble` pairing
read 63% on one twenty-game window and 74% and 79% on two forty-game ones; the
bottom rungs cost milliseconds a game, so measure them long.

A new variant is a retune. `packages/engine/tools/ladder.ts <variant>` sweeps
every adjacent rung and flags soft or inverted ones; run it before trusting a
roster on a board it wasn't tuned for. Adding Connect 5 inverted the top two
rungs on the first sweep — Quill lost to Vane 0-8.

### Depth is not portable; the node budget is why

`searchHeuristic` shares one node budget across all root moves, so a bot that
exhausts it on the first column evaluates every remaining column statically. It
doesn't degrade gracefully, it goes nearly blind — and nothing in the output
says so.

The tree grows as width^depth, so Connect 4's depth 10 costs 332k nodes at 7
wide and would cost ~4.4M at 9 wide. Only Quill was over the fixed 400k budget
on Connect 5, which is the entire reason it lost every game. The weights were
never involved.

So both scale with the board: `depthFor` divides depth by log(width)/log(7), and
`heuristicBudget` scales with cell count and width. Connect 4 is untouched by
construction (width 7 → identity). If you add a bot or a variant and a rung goes
soft, check whether it's clipping the budget *before* touching the weights.

Connect 7's ladder measures soft almost everywhere and is not: the long windows
show the stronger bot winning decisive games 3- or 4-to-1 while most games fill
all 156 cells, so draw mass drags every points rate toward 50% (at the top, 9 of
12 games draw). That's the run length's character, documented in
[feature_ideas.md](feature_ideas.md#dead-end-connect-7s-ladder-is-draw-shaped-not-broken)
— don't chase the 65% bar there with weights.

Connect 6 repeated Connect 5's history on its first sweep: `quill > vane`
inverted outright (38%) until Quill got the same parity-46 override, which
brings it to the same ~59% plateau, and `cinder > bramble` sits at ~60% with
every knob measured and none of them moving it — depth one deeper made it
*worse* (49%), which is the depth-vs-weights interaction doing exactly what
this section says it does. Both are documented in
[feature_ideas.md](feature_ideas.md#dead-end-the-soft-rungs-on-connect-6) and
deliberately unasserted.

`quill > vane` on Connect 5 is known soft (~56%, under the bar) and deliberately
not asserted in `bots.test.ts`. The measurements and the dead ends are in
[feature_ideas.md](feature_ideas.md#dead-end-the-quill--vane-rung-on-connect-5) —
read them before retuning it, and don't add it as a passing test without moving
the number.

## Screenshot before you claim

Unit tests can't see any of the visual work; the harness is the eyes.
`apps/fever/preview.html` renders named scene states (`?state=id` for one
fullscreen), `npm run shots -- <ids>` screenshots them through real Chrome, and
`npm run acceptance` / `npm run bots` / `npm run online` / `npm run review` /
`npm run audio` drive the live app. This repo has repeatedly caught bugs this
way that typechecked and passed tests — a shader composing off-screen, an
invisible review marker, props framed at the wrong z. If you didn't look at it,
it isn't done.

The taste law that replaced the old pixel-buffer rules lives in
`redesign/VISION.md`: props are cheap by law (≤300 tris, 64px nearest, stepped
12fps timing), the void and board are expensive by law (full-res, smooth), and
the collision of the two budgets is the aesthetic. No default ease-in-out
anywhere in the chrome; `steps()` or instant.

Shared outline ink is `#402e3a`, the same as cozy_sprites and battle_clicker.

## Say what the solver actually knows — without saying "solver"

Every ply carries a `source`:

- `proven` — the exact solver. A fact about the game.
- `estimated` — `searchHeuristic`. This engine's read, and a better engine could
  disagree.

The engine must keep these apart. **The UI must not put the distinction in front
of the player.** "Proven vs estimated" is a fact about how a number was obtained,
not about the game, and a player reading a score-over-time chart shouldn't have
to hold it. So: one solid line on the curve, no legend, no `?` badges, no
footnote about the solver's horizon.

What survives is what the distinction is actually for — the review is not
allowed to overclaim:

- An estimated ply may **never** set `turningPoint`. "This move lost the game"
  requires proof.
- The advantage scale keeps proven results in a band above anything an estimate
  can reach, so the two never fight over the same y-value. (One line means a
  visible step where the solver kicks in; that reads as the game going decisive,
  which it did.)
- Copy for an estimated ply stays hedged — "looks like", "looks stronger" —
  while proven copy is flat and declarative. The hedge carries the uncertainty
  without naming the machinery.

If you add analysis, the question isn't "can we prove this" and it isn't "can we
label which kind of claim this is" — it's "does the confidence of the sentence
match the confidence of the number".

The Oracle's own bot copy (`exactnessNote`) is the exception and stays: "plays
the end exactly" is that bot's selling point, not a caveat on a chart.

`exactFrom` is per-variant and **measured, not chosen**:
`packages/engine/tools/measure-solve.ts live <variant>` times the bot's first
exact move, which is a cold `analyze` — one solve per legal column — because
that's the one the player waits through. Take the worst case across games, not
the median.

Measured: Connect 4 crosses over around 10-13 discs of 42. Connect 5 crosses over
at **44 discs of 72**, which is late enough that a game ending in a win is
usually over first — in a five-game sample the Oracle never got to solve at all
in two of them. Connect 6 crosses at **82 discs of 110** (six games, 77-82) and
Connect 7 at **127 discs of 156** (five games, 125-127), so on the big boards
proven play is close to an endgame rumour. That is not a bug to tune away, and
the UI must not paper over it: `exactnessNote` in `bots.ts` generates the claim from the number so a bot
can't go on advertising Connect 4's crossover on a Connect 5 board. If you add a
variant, generate the claim, don't write one.

## Multiplayer is client-authoritative on purpose

`db/schema.sql` is Fourscore's slice of the shared toybox Supabase project (see
the Shared Supabase section of `~/projects/CLAUDE.md`). It is a full rebuild, not
a migration — pushing drops the schema and every in-progress match with it.

There is no server that validates a move. Both clients own the engine and fold
`moves` into a `Position` themselves, so an illegal move surfaces as a replay
mismatch on the opponent's machine, not as a rejected write. That's the right
trade for a game you play with friends, and it's why the engine still has to
stay I/O-free: the day it isn't, the honest server becomes impossible.

What the database *does* enforce is what breaks by accident — turn order, from
`(ply + host_seat) % 2`, and one contiguous ply at a time. Both live in
`db/schema.sql` and both are covered by `npm run db:verify`, which is not part of
`npm test` because it needs the live database. Run it after any schema change:
RLS bugs typecheck fine and unit tests can't see them. A policy on `moves` that
subqueries `moves` is infinite recursion, and Postgres only says so on the first
insert — that one shipped and was caught by `db:verify`, not by review.

Move state is a list of column indices, same as `Match.history`. Never put a
packed bitboard in Postgres; `board.ts` stays the only thing that knows the
packing.

The client lives in `apps/fever/src/online/` (pure `session.ts`, socket-owning
`runtime.ts`) and `chrome/Online.tsx` — your opponent gets a roster identity
chosen by hashing their user id, so a person looks like an opponent instead of
a bare grid, but no persona lines: the software doesn't put words in a real
person's mouth. Discs animate off the *move list*, not off the click, so a move
arriving over the wire drops exactly like one you made; that's why `landed`
lags `moves` by one animation. Realtime is an optimisation, not the transport —
a 4s poll re-reads the row and move list because dropped UPDATEs really happen;
don't remove it because the happy path works. Desyncs surface as an honest
styled error dialog, never as rendered nonsense.
