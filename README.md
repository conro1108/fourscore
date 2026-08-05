# Fourscore

Connect 4 against a ladder of pixel-art opponents, for people who have run out
of friends willing to play them. Also Connect 5, on a bigger board, where almost
everything is harder — including for the solver.

Seven bots of increasing strength, each with a distinct way of playing rather
than just a deeper search, and then one that solves the position exactly and
does not make mistakes. After a loss it will tell you which move actually lost
it — usually about eight plies before the position looked bad.

## The two games

|  | board | to win | cells | lines per cell |
|---|---|---|---|---|
| **Connect 4** | 7x6 | 4 in a row | 42 | 1.64 |
| **Connect 5** | 9x8 | 5 in a row | 72 | 1.61 |

The Connect 5 board is 9x8 rather than something smaller because line density is
what makes a gravity game feel alive. Five in a row on the standard 7x6 board has
27 winning lines over 42 cells and plays like a draw generator; 9x8 lands within
a couple of percent of Connect 4's texture. Even height matters too — the parity
idea the good bots run on (first player wants odd rows, second player even) is a
theorem about alternating play on an even number of rows, and an odd-height board
would quietly make Vane's whole personality wrong.

The engine takes any width, height and run length — `makeVariant` in `board.ts` —
so Connect N is a config change rather than a rewrite. The two above are just the
ones with art and a tuned roster.

## Run it

```bash
npm install
npm run dev        # dev server
npm test           # unit tests (Vitest)
npm run build      # typecheck + production build
npm run typecheck  # types only
```

## The opponents

| | | |
|---|---|---|
| **Acorn** | tier 1 | Has just learned the rules. Will miss a win that is sitting there. |
| **Pebble** | tier 2 | Takes a win it can see, blocks a loss it can see, and nothing else. |
| **Moss** | tier 3 | Wants the centre columns more than it wants to win. |
| **Bramble** | tier 4 | Builds threats compulsively and cashes about half of them. |
| **Cinder** | tier 5 | Plays for positions where every reply loses. |
| **Vane** | tier 6 | Plays the quiet positional game. Its face lies about how it's going. |
| **Quill** | tier 7 | Strong opening, then solves the endgame outright. |
| **The Oracle** | — | Exact from ten discs on. Not strong play; proven play. |

On Connect 5 the ladder holds from Acorn up to Vane (measured 75-94% per rung),
but **Quill and Vane are effectively level there** — Quill wins about 56%, under
the 65% bar the project holds itself to. The reason is in
[CLAUDE.md](CLAUDE.md#known-soft-quill--vane-on-connect-5) along with everything
that was tried: Vane's patient parity game is close to ideal on a taller board,
and Quill's edge — solving the endgame outright — mostly doesn't get to happen
when the crossover is at ply 44 of 72. It's written down rather than papered
over.

Each bot is a weight vector as well as a search depth, and the weights are what
you feel across the table. Bramble scores threats highly and parity at zero, so
it attacks constantly and folds when made to defend; Vane weights parity above
everything, so it plays the slow game that actually wins Connect 4 between good
players. `packages/engine/src/bots.test.ts` plays each rung against the one
below it and fails if the ladder stops being a ladder — which it caught during
development, when Moss's love of the centre made it lose to the tier beneath it.

### Tells

Bots emote from their own evaluation, not from a script. The eyes go wide when
you set up a double threat, the smirk appears when a forced win has been found,
and the shoulders drop when the position is gone. Vane is the exception: it
shows its honest face about two thirds of the time and overplays its hand the
rest, so reading it is worth something but not everything.

### The Oracle, precisely

On Connect 4 it is exact from **ten discs onward**, not from move one. That's an
honest limit, not a hedge: the opening needs a precomputed book to play
perfectly, and generating one is tens of hours of compute (the measurements and
the two ways in are in [feature_ideas.md](feature_ideas.md)). Before ten discs
it estimates like everyone else, so the opening is the only place you exist.
After it, nothing you do changes a result it has already read — and it says
"solving exactly" on screen when it crosses over.

Its first exact search of a game takes a few seconds. That one is genuine
thinking, not a spinner.

**On Connect 5 the crossover is 44 discs of 72, and most games never reach it.**
That number is measured, not chosen — `tools/measure-solve.ts live connect5`
times the bot's first exact move on real positions. A 9x8 board with five in a
row is a vastly bigger search than 7x6 with four, and a game that ends in a win
usually ends before there are only 28 empty cells left. In a five-game sample the
Oracle got to solve exactly in three of them.

So on Connect 5 the Oracle is mostly just a very strong estimator, and the app
says so rather than selling perfection it can't deliver: the blurb on the select
screen is generated from the crossover number, so it can't drift away from what
the solver actually does. Long, grinding games are where it turns into the thing
it is on Connect 4.

## Post-game review

Ask "where did it go wrong?" and every ply gets scored against what was
available instead, with the single move that turned a won or drawn game into a
lost one called out by name.

The review walks backwards from the final position. That warms the transposition
table for the earlier plies and gives a natural place to stop: positions get
monotonically harder toward the opening, so the first one that blows its node
budget is the last one worth attempting. Plies it can't prove are labelled
**unproven** rather than guessed at, and if you lost with the opening unproven
it says the game was decided before the solver could see rather than claiming
you played fine.

## Layout

- **`packages/engine`** — the whole game as pure TypeScript with zero I/O.
  - `board.ts` — bitboard and the `Variant` geometry object. A board is packed
    into `bigint` masks with a sentinel row per column, which is what lets win
    detection be a short branch-free chain instead of a scan over directions.
    One sentinel row suffices for any run length: a wrapping line has to pass
    through it on an intermediate step, and every step is in the AND chain.
  - `solver.ts` — negamax with alpha-beta, a transposition table, and a
    null-window binary search over the score range. ~1.13M nodes/sec (it was
    ~1.21M before geometry became a runtime parameter; the generic path searches
    a bit-for-bit identical tree, just ~6% slower).
  - `evaluate.ts` — the heuristic and the depth-limited search over it.
  - `bots.ts` — the roster.
  - `match.ts` — match state and the post-game review.
  - `tools/` — measurement scripts, run with `npx vite-node`. `measure-solve.ts`
    finds where exact play becomes affordable on a board, `ladder.ts` sweeps
    every adjacent rung to check the roster is still ordered, `bench-solve.ts`
    is raw solver throughput. The numbers in this README come from these.
- **`apps/web`** — Vite + React. Owns rendering and the match runtime; no game
  logic.
  - `render/` — the pixel-art layer. Art is authored as char grids (`art.ts`),
    painted once into cached canvases (`pixel.ts`), and blitted onto a 120x152
    buffer that CSS scales up crisply (`boardScene.ts`).
  - `engine/` — the search worker and its client. All search runs off the main
    thread, because the thinking animation is exactly the thing that must not
    freeze while the bot is thinking.

The engine is I/O-free and framework-free on purpose. That's the part that makes
authoritative online play possible later: a server can import exactly the same
module the client does, so optimistic prediction and server truth can't drift.
React is there for the screens around the game, not for the game.

## Rendering rules

Art is authored as rows of single-character palette keys and painted once into
an offscreen canvas. The scene buffer is sized from the variant — 120x152 for
Connect 4, 152x184 for Connect 5 — and CSS upscales it with
`image-rendering: pixelated`. `apps/web/scene-preview.html` draws every variant
side by side against the dev server, because this is the one class of bug a unit
test cannot see.

**Never draw sprite art at a non-integer scale or offset.** At this buffer size
that resamples the art off the pixel grid — 1px outlines double or vanish and
eyes come out uneven. The idle bob moves by whole pixels or not at all, and the
creature blits at exactly 2x. This is the same rule cozy_sprites enforces, and
the shared outline ink (`#402e3a`) is why the board, the discs and the creatures
look like they came out of one box of crayons.
