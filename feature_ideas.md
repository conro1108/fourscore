# Feature ideas

Things we decided were good but deliberately deferred, and things we tried that
didn't work. Not a backlog to burn down — just enough detail that picking one up
later doesn't start from scratch.

## Dead end: Connect 7's ladder is draw-shaped, not broken

The first sweep read three middle rungs soft and the top inverted, and long
windows with a win/loss/draw split showed why — completing seven in a row
against any competent defence is hard enough that games fill the board:

| rung | points | decisive split |
| --- | --- | --- |
| `moss > pebble`, 48 games | 60% | **13W 3L** 32D |
| `bramble > moss`, 40 games | 64% | **14W 3L** 23D |
| `cinder > bramble`, 40 games | 63% | **15W 5L** 20D |
| `quill > vane`, 12 games (parity override on) | 46% | 1W 2L 9D |

The ladder is ordered — the stronger bot wins the decisive games 3- or 4-to-1 —
but draw mass drags every points rate toward 50%, and at the very top there are
barely any decisive games at all. That's the board's character: half a point
for a draw is the scoring being honest about a game that neither side lost.
Don't tune weights to chase the 65% bar here; the fix, if one is ever wanted,
is a bigger board — which today means raising `TT_MAX_KEY_BITS`, since 13x12's
169-bit keys already sit near the 181-bit lane limit. Only `pebble > acorn`
(92%) is asserted in `bots.test.ts`.

## Dead end: the soft rungs on Connect 6

Two rungs sit under the 65% bar on Connect 6 and stay there under every knob,
so they are documented rather than asserted — same policy as `quill > vane` on
Connect 5 below.

**`cinder > bramble`, ~60%.** Measured 63% over 16 games (seed 1) and 60% over
40 (seed 101), so it's the rate, not noise. Everything tried, all over 40 games
with the same seed:

| change | rate |
| --- | --- |
| base weights, derived depth 6 | **60% (shipped)** |
| `depthByVariant` 7 — one ply past the derived rounding | 49% |
| parity 12 → 24 | 60% |
| aggression mirror, threat 30 / immediate 46 | 59% |
| positional, parity 18 / center 14 | 46% |

Extra depth actively hurting is the same "deeper with worse weights is weaker"
effect the Connect 5 table below shows for Quill. No budget clipping involved:
Cinder peaks at 51k nodes of a 1.6M budget.

**`quill > vane`, ~59%.** Inverted outright (38%) with Connect 4 weights; the
same parity 34 → 46 override that ships on Connect 5 brings it to 59% over 16
games, which is the same plateau. The cause reads identical: parity dominates
harder the taller the board, and Quill's separator — solving the endgame —
fires even less on Connect 6, where the crossover is 82 discs of 110. The
override ships on Connect 6 and Connect 7 both; nobody has swept Connect 7's
top rung levers beyond that, so start there if it reads worse than ~55%.

## Dead end: the `quill > vane` rung on Connect 5

Quill wins about 56% over 8 games, under the 65% bar the ladder holds itself to.
Everything below was measured with `npm run measure:ladder connect5 8 quill`, so
nobody repeats it:

| change | rate |
| --- | --- |
| Connect 4 settings (depth 10, over the node budget) | 0% |
| derived depth 9, scaled budget | 38% |
| depth 10 forced, Connect 4 weights | 25% |
| **Connect 5 weights, parity 34 → 46** (shipped) | **56%** |
| parity 52 | 56% — plateau |
| earlier crossover, `exactFrom` 50 → 44 | 50% |
| depth 10 + parity 46 | 19% |

The cause looks structural rather than like a tuning accident. Vane's
parity-heavy vector is close to optimal on a taller board with longer runs, and
Quill's separator on Connect 4 — solving the endgame outright — barely fires on
Connect 5, because the crossover lands at ply 44 of 72 and most decisive games
end first. Extra depth actively hurts, which is the "deeper with worse weights is
weaker" effect showing up cleanly.

The untried lever is a per-variant `slipRate` on Vane. It would work, but it
fixes the rung by weakening Vane rather than strengthening Quill, and it costs
Vane its near-flawless character on that board. Worth doing only if Connect 5
becomes a headline mode rather than a second option.

## Roguelike ladder run

Turn the bot ladder into a run instead of a menu. You climb the tiers in
sequence; losing ends the run.

Between matches you pick one of three **boons**, drafted at random:

- **Undo** — take back one move, once per match.
- **Peek** — for one turn, see the bot's top-ranked move before you commit.
- **Bomb disc** — one disc that destroys the disc it lands on instead of
  stacking (see chaos discs below; this is the tame single-use version).
- **Second wind** — survive one loss per run.
- **Home advantage** — you move first in every remaining match.

Why it's worth building: the ladder alone is a difficulty menu, and menus don't
create stakes. A run makes the tier-6 bot matter because you arrive at it with
whatever you've scraped together.

Design note: boons that alter the *rules* (bomb) need the bot's search to know
about them or the bot plays into them stupidly, which reads as the bot being
broken rather than you being clever. Boons that alter *information* (peek) or
give *retries* (undo, second wind) are free — search doesn't need to change.
Draft mostly from the second category.

## Chaos mode discs

A separate mode, clearly walled off from the ranked ladder.

- **Bomb** — destroys the disc it lands on; everything above falls one row.
- **Anvil** — clears the entire column it's dropped into.
- **Gravity flip** — the whole board falls the other way; discs re-stack.
- **Wildcard** — counts as either colour for line-detection purposes.

Why it's walled off: every one of these breaks the assumptions the solver is
built on (discs are permanent, the board only fills upward, a cell has one
owner). Supporting them in the real search means a different move generator and
a much bigger state space, and the perfect bot stops being perfect.

The right shape is a separate mode with its own shallow heuristic bot that
handles the new move types honestly, rather than retrofitting the ladder. Keep
`packages/engine`'s core untouched and add a `chaos/` namespace beside it, the
way battle_clicker keeps `solo.*` namespaced instead of flattened into the
match economy.

## Opening book

Would make the Oracle perfect from move 1 rather than from ~ply 10.

The blocker is generation cost, not runtime cost. The solver runs at ~1.3M
nodes/sec (bigint bitboards in JS), and cold solve times measured on this
machine are:

| discs | nodes | time |
| ----- | ----- | ---- |
| 16 | 58k | 0.05s |
| 12 | 1.3M | 1.0s |
| 8 | 13M | 10s |
| 6 | 40M | 30s |
| 4 | >40M | — |

There are 91,295 distinct mirror-reduced positions at ply 8, and solving all of
them is very close to solving the entire game — tens of hours in JS. Generating
deepest-ply-first with a shared transposition table is the right trick (each
solve leaves its subtree proved for the next), but it doesn't change the order
of magnitude, because the union of those subtrees is still the whole tree.

Two ways in, if it ever seems worth it:

1. **Generate offline, once.** Run it for a day on a spare machine and commit
   the JSON. ~100k entries is roughly 3MB raw, well under 1MB gzipped. This is
   the boring answer and probably the right one.
2. **Make the solver ~10x faster first** by replacing bigint bitboards with a
   pair of 32-bit halves or a typed-array board. Worth measuring before
   committing to it — `board.ts` is the only file that knows the packing, so
   the swap is local, but the win-detection bit tricks all have to be redone
   against the split representation and that's where the bugs would live.

A partial book still helps, and helps in the right direction: the shallow plies
are the ones the solver can't do live, and they're also the cheapest to store.

## Smaller things

- **Board variants** — ~~5x4 tiny, 8x7 wide~~, Pop Out rules, boards with holes.
  Board size and run length are now real parameters (`makeVariant` in
  `board.ts`), so new rectangular boards are a config change — Connect 5 on 9x8
  ships. Two things that looked cheap and weren't: the transposition table's
  float64 key store silently loses precision past 7x6, and a roster tuned on one
  board has to be re-swept on another (`tools/ladder.ts`). Pop Out and holes are
  still real work, because both break "the board only fills upward".
- **A bot that trash-talks based on its own eval** — not scripted lines, lines
  selected by how won/lost it actually thinks it is.
- **Daily puzzle** — a real position from a real game, "you're to move, there's
  a forced win in 5, find it."
