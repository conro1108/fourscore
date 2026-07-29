# Fourscore

Connect 4 against a ladder of pixel-art opponents, for people who have run out
of friends willing to play them.

Seven bots of increasing strength, each with a distinct way of playing rather
than just a deeper search, and then one that solves the position exactly and
does not make mistakes. After a loss it will tell you which move actually lost
it — usually about eight plies before the position looked bad.

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

It is exact from **ten discs onward**, not from move one. That's an honest
limit, not a hedge: Connect 4's opening needs a precomputed book to play
perfectly, and generating one is tens of hours of compute (the measurements and
the two ways in are in [feature_ideas.md](feature_ideas.md)). Before ten discs
it estimates like everyone else, so the opening is the only place you exist.
After it, nothing you do changes a result it has already read — and it says
"solving exactly" on screen when it crosses over.

Its first exact search of a game takes a few seconds. That one is genuine
thinking, not a spinner.

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
  - `board.ts` — bitboard. 7x6 packed into `bigint` masks with a sentinel row
    per column, which is what lets win detection be twelve branch-free
    operations instead of a scan over directions.
  - `solver.ts` — negamax with alpha-beta, a transposition table, and a
    null-window binary search over the score range. ~1.3M nodes/sec.
  - `evaluate.ts` — the heuristic and the depth-limited search over it.
  - `bots.ts` — the roster.
  - `match.ts` — match state and the post-game review.
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
an offscreen canvas. The scene buffer is a fixed 120x152 that CSS upscales with
`image-rendering: pixelated`.

**Never draw sprite art at a non-integer scale or offset.** At this buffer size
that resamples the art off the pixel grid — 1px outlines double or vanish and
eyes come out uneven. The idle bob moves by whole pixels or not at all, and the
creature blits at exactly 2x. This is the same rule cozy_sprites enforces, and
the shared outline ink (`#402e3a`) is why the board, the discs and the creatures
look like they came out of one box of crayons.
