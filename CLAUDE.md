# CLAUDE.md

Fourscore is Connect 4 against a ladder of pixel-art bots, plus one that solves
the position exactly. TypeScript, npm workspaces: `packages/engine` is the whole
game as pure logic, `apps/web` is Vite + React and owns only rendering and the
match runtime.

`npm run dev` / `npm test` / `npm run build` / `npm run typecheck`.

## Keep the engine I/O-free

`packages/engine` imports nothing from the DOM, the network or the app. That's
what makes authoritative online play possible later — a server would import the
same module the client does. Game logic that leaks into `apps/web` breaks that,
so it goes in the engine even when the app is the only caller today.

## The bitboard packing lives in one file

`board.ts` is the only place that knows how a position is packed into `bigint`
masks. The win-detection bit tricks depend on the sentinel row between columns
and on the specific shift distances; nothing outside that file should be doing
arithmetic on `position`/`mask`. Its fuzz test cross-checks against a
brute-force reference over random games, and that's where the real coverage is —
these tricks pass every hand-written case and then fail quietly on one edge
diagonal.

## The ladder has to stay a ladder

Bots differ by weight vector as well as depth, and those interact: a deeper
search with worse weights can be weaker. `bots.test.ts` plays each rung against
the one below and requires >65% — it has already caught a rung inverting. If you
retune a bot, run it. Measured win rates between adjacent rungs are 68-83%, and
slip rate moves them far more than the eval weights do, so tune strength with
`slipRate`/`depth` and treat the weights as personality.

## Never scale sprite art fractionally

The scene draws to a fixed 120x152 buffer that CSS upscales with
`image-rendering: pixelated`. Any non-integer scale, offset or rotation
resamples the art off the pixel grid — 1px outlines double or vanish. The idle
bob moves by whole pixels; the creature blits at exactly 2x. Unit tests can't
catch this; check a screenshot.

Shared outline ink is `#402e3a`, the same as cozy_sprites and battle_clicker.

## Say what the solver actually knows

Exact play is only affordable from ~10 discs on; the opening is out of reach
without a precomputed book. Anywhere the UI reports analysis it must distinguish
proven from unproven rather than presenting a guess as a result — see the
`unknown` grade in `match.ts` and the review headline that says a game was
decided before the solver could see it.

## Git

This project merges straight to `main` — no feature branches or PRs.

Always commit and push after completing a piece of work, without asking for
confirmation first. Always `git pull` before pushing, in case downstream
changes have landed — this is still single-threaded on `main`, just cheap
insurance.
