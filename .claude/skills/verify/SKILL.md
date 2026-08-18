---
name: verify
description: Run the heavy verification ladder for fourscore — the full test suite plus the live browser harnesses (shots, timeline, audio, ladder sweeps) scoped to what actually changed, then look at the output and report honestly. Use when the user asks for "full verification", "verify everything", "the full check", or before shipping something big. For ordinary iterative changes use `npm run check` instead (3s) and don't invoke this.
argument-hint: [what changed, if it isn't obvious from the diff]
---

# Full verification

The expensive pass. Everything here takes minutes, which is the whole reason
it's a separate thing you have to ask for.

**Scope it first.** Run `git status` / `git diff --stat` and work out which of
the two areas changed: `packages/engine`, `apps/exe`. Then run only the rungs
that area owns. Sweeping the ladder because a sound changed in `apps/exe` is a
waste of minutes and teaches nobody anything.

## Always

```
npm test          # ~80s. The two engine files that play real games are the 80s.
npm run typecheck # ~10s, both projects
```

`npm test` is the full suite — do not substitute `npm run check` here, that's
the other tier.

## packages/engine changed

The ladder is the thing that breaks silently, and unit tests can't see it.

```
npm run measure:ladder -- connect4      # ~mins; sweeps every adjacent rung
npm run measure:ladder -- connect5      # a new variant is a retune
npm run measure:solve -- live connect4  # only if the solver or exactFrom moved
npm run measure:bench                   # only if you touched the hot path
```

Read `apps/exe/../../CLAUDE.md`'s ladder section before reacting to a soft
rung — several are known-soft and documented in `feature_ideas.md`. A rung
that *inverted* is a real failure; a rung at 60% may be the top of the ladder
being flat.

## apps/exe changed

```
cd apps/exe
npm run shots                  # ~2min, all 40 states. Scope it: npm run shots -- sounds midgame
npm run audio                  # ~60s. Renders every recipe, checks the autoplay laws
npm run trace                  # tier timeline over real games (no browser)
npm run fever                  # plays a real game in a browser, reports what the desktop did
node tools/live.mjs            # click-drives a real game
npm run paint                  # draws, saves, pins and reloads a .spr through PAINT.EXE
npm run llm                    # ~1min. Types cc llm.c and run llm into the real
                               # terminal and photographs the story arriving.
                               # Owed by anything that touches vm.ts, cc.ts,
                               # llmc.ts, drive.ts or the drive image
npm run timeline -- "?state=win" 3 8 14 18 40   # for anything that unfolds over seconds
```

`npm run shots` always looks at 1800ms, so it is blind to anything slower than
that — `timeline` is the one that can see the fever rise and let go, and
`llm` is the one that can tell a machine thinking from a machine stuck, since
a word takes it about two seconds.

## How to run it

Launch the slow ones in the background and in parallel — `npm test` and a shots
pass don't need each other. Don't sit in a poll loop waiting; start them, do
something useful, read the output when it lands.

## Then look

Screenshot before you claim. A harness exiting 0 is not the check — this repo
has repeatedly shipped things that typechecked, passed, and were invisible or
composited off-screen. So actually `Read` the PNGs that matter to the change,
and for audio work say plainly that the wavs in `shots/audio/` are for the
user's ears, not yours.

## Then report

Say what ran, what it showed, and — explicitly — what you did **not** run and
why. "Everything passes" without that list is the failure mode this whole skill
exists to prevent.
