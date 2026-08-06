# CLAUDE.md

Fourscore is Connect 4 — and now Connect 5 — against a ladder of pixel-art bots,
plus one that solves the position exactly. TypeScript, npm workspaces:
`packages/engine` is the whole game as pure logic, `apps/web` is Vite + React and
owns only rendering and the match runtime.

`npm run dev` / `npm test` / `npm run build` / `npm run typecheck`.

## Geometry is a value, not a constant

Board size and run length live in a `Variant` object (`board.ts`), and everything
derived from them — masks, move order, shift schedules, centre weights, score
bounds — is computed once per variant and read from there. `CONNECT4` is 7x6
run 4, `CONNECT5` is 9x8 run 5, and `makeVariant` takes any width/height/run.

Nothing should reintroduce a module-level `WIDTH`/`HEIGHT`. The Connect 4 aliases
still exported from `board.ts` are a convenience for callers that only ever touch
the default board, not a licence to hardcode geometry. Anything reachable from
the search must read `p.variant`.

## Keep the engine I/O-free

`packages/engine` imports nothing from the DOM, the network or the app. That's
what makes authoritative online play possible later — a server would import the
same module the client does. Game logic that leaks into `apps/web` breaks that,
so it goes in the engine even when the app is the only caller today.

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
Connect 5. A `Float64Array` only holds 53 bits of integer exactly and **rounds
silently** past that, so two different positions start comparing equal and the
exact solver returns wrong scores with no error. The table stores keys as a
32-bit low half plus a float64 remainder for that reason. Collisions are still
fine — a wrong hit costs a re-search — but only while the key comparison itself
is exact. Never hash the key down to fit.

## The ladder has to stay a ladder

Bots differ by weight vector as well as depth, and those interact: a deeper
search with worse weights can be weaker. `bots.test.ts` plays each rung against
the one below and requires >65% — it has already caught a rung inverting. If you
retune a bot, run it. Measured win rates between adjacent rungs are 68-83%, and
slip rate moves them far more than the eval weights do, so tune strength with
`slipRate`/`depth` and treat the weights as personality.

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

`quill > vane` on Connect 5 is known soft (~56%, under the bar) and deliberately
not asserted in `bots.test.ts`. The measurements and the dead ends are in
[feature_ideas.md](feature_ideas.md#dead-end-the-quill--vane-rung-on-connect-5) —
read them before retuning it, and don't add it as a passing test without moving
the number.

## Never scale sprite art fractionally

The scene draws to a buffer sized from the variant — 120x152 for Connect 4,
152x184 for Connect 5 — that CSS upscales with `image-rendering: pixelated`. The
buffer growing is fine; a fractional anything is not. Any non-integer scale,
offset or rotation resamples the art off the pixel grid — 1px outlines double or
vanish. The idle bob moves by whole pixels; the creature blits at exactly 2x and
its x-origin is rounded because an odd buffer width would otherwise land it on a
half pixel.

Resizing a canvas resets its 2D context, so `imageSmoothingEnabled` has to be
turned off again after a variant switch.

Unit tests can't catch any of this; check a screenshot. `apps/web/scene-preview.html`
renders every variant side by side against the dev server for exactly that, and
`apps/web/review-preview.html` does the same for the review screen and its eval
curve — both found real bugs that typechecked and passed tests.

The eval curve is SVG, not the pixel buffer. A chart wants display resolution and
smooth diagonals, which is the exact opposite of the sprite rule; keeping it out
of the canvas is what lets both be right.

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
in two of them. That is not a bug to tune away, and the UI must not paper over
it: `exactnessNote` in `bots.ts` generates the claim from the number so a bot
can't go on advertising Connect 4's crossover on a Connect 5 board. If you add a
variant, generate the claim, don't write one.

## Git

This project merges straight to `main` — no feature branches or PRs.

Always commit and push after completing a piece of work, without asking for
confirmation first. Always `git pull` before pushing, in case downstream
changes have landed — this is still single-threaded on `main`, just cheap
insurance.
