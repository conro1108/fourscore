# Feature ideas

Things we decided were good but deliberately deferred. Not a backlog to burn
down — just enough detail that picking one up later doesn't start from scratch.

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

- **Board variants** — 5x4 tiny, 8x7 wide, Pop Out rules, boards with holes.
  Cheap: the engine is already parameterized on width/height.
- **A bot that trash-talks based on its own eval** — not scripted lines, lines
  selected by how won/lost it actually thinks it is.
- **Daily puzzle** — a real position from a real game, "you're to move, there's
  a forced win in 5, find it."
