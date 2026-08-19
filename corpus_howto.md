# corpus_howto.md — running Phase 3 by hand

Companion to [llm_training.md](llm_training.md). That doc is the plan; this
one is the control panel. It describes what is now built, why it is shaped
that way, and the exact commands to take corpus generation from "nothing has
run" to "a night ran unattended" — deliberately step by step, because each
step produces a number you are supposed to read before taking the next one.

## The machine you are operating

Five stations were planned. Three are built; the last two are not yet needed:

```
 synth.ts ──┐                      ┌── raw/*.jsonl      (everything, rejects too)
            ├──▶ verify ──▶ keep ──┤
 gen.ts ────┘   (farm.ts /         └── verified/*.jsonl (the corpus-to-be)
                 inline)
                                       assemble.ts, tokenize.ts — not built yet
```

- **`apps/exe/tools/corpus/verify.ts` + `graders.ts` + `farm.ts`** — the
  graders. V0 "it compiles and fits", V1 "it runs without faulting or
  hanging", V2 "it does what its tier is for", graded on the real compiler
  and the real VM. `mutants.ts` is their test set: seven known-good programs
  and eighteen broken ones, each one edit from passing. The farm runs the
  graders across every core; JSONL in, JSONL out, histogram at the end.
- **`synth.ts`** — source A, new. Emits dialect C from parameterised
  skeletons: six tier-1 families, three tier-2, four tier-3, and a pong.
  Valid by construction — ~2,000 candidates across all tiers graded at 100%
  keep when it was built, and `synth.test.ts` holds a sample to exactly that.
- **`prompt.ts` + `gen.ts`** — sources B and C. `prompt.ts` assembles what
  the 27B is told (the manual off the disk, the fence built from the
  graders' own `ABSENT` list, few-shots rationed from the verified pool);
  `gen.ts` drives llama-server, grades inline, appends every row, resumes.
- **`bench.ts`** — new. Measures the one number the whole generation budget
  rests on: aggregate tok/s across batched slots, using the real tier-4
  prompt. Also does the n_ctx arithmetic that otherwise fails a night at
  request one.

Everything lands under `data/corpus/`, which is gitignored — the corpus is
reproducible from this tooling, and rejects are data, not garbage.

Two ideas carry the whole phase, and they are worth having before touching
anything:

1. **Nothing trains here.** The host model never improves; the machine
   discards what it doesn't like (the ML term is *rejection sampling*), and
   the only feedback loop is you, reading the failure histogram and editing
   the prompt. That histogram is the steering wheel.
2. **The synthesiser knows the answer; the model does not.** A synthesised
   program carries `expect` (its exact stdout) and, for tier 2, `keys` (a
   script that finishes it) — the emitter simulates its own program in
   16-bit arithmetic, drawing from the same `rand()` stream the grading
   probe will use, so V2 can demand the transcript to the byte. A
   model-written program has no ground truth, so it gets invariants
   instead: "one ball glyph, alone, moving; the paddle answers keys; some
   digit goes up."

## The runbook

### 0. Prove the graders (30 seconds, do it every time you touch them)

```
npm run corpus:selftest
```

Every known-good program must pass; every mutant must fail with the exact
key it was built to earn. A grader that rejects nothing is the failure mode
this phase is designed around, so this runs before any batch is trusted.
`npm run check` covers the same ground as tests.

### 1. Synthesise source A (minutes, no model, no server)

```
npm run corpus:synth -- --tier 1 --n 500 --seed 1
npm run corpus:farm -- data/corpus/raw/t1-synth-1.jsonl data/corpus/verified/t1-synth-1-verdicts.jsonl
```

Repeat per tier. `--check` on synth grades inline (fine for a few hundred);
the farm is the same graders on twelve cores and clears ~400/s. The keep
rate should be 100% — synth builds from the fence, so a reject is a bug in
`synth.ts`, and the right response is to fix it, not to shrug.

Numbers for scale, from the curriculum table: tier 1 wants ~40k documents,
tier 2 ~20k, tier 3 ~20k, tier 4 ~10k, with synthesis providing ~70% of
each. Synthesis is effectively free, so make it wide rather than deep:
several seeds, and note that a batch may come up slightly short of `--n` —
when the axis space near a family is exhausted it declines to repeat itself
rather than emit a duplicate.

What to look at while it runs: open a few candidates. `jq -r .text
data/corpus/raw/t4-synth.jsonl | head -80` shows you what the model will
later be shown as few-shots — if it reads wrong to you now, it will read
wrong ten thousand times later.

### 2. Start the model server

```
llama-server -m ~/ai/models/gguf/Qwen3.8-27B-UD-Q6_K_XL.gguf -np 8 -c 49152
```

Q6, not Q8: 24GB against 48GB of unified memory leaves room for the KV
cache across eight slots; Q8 does not. The `-c` number is the arithmetic
the plan warns about: **per-slot context is `n_ctx / slots`**, a tier-4
mutate prompt is ~4–5K tokens, generation adds up to 1,400 more, so eight
slots want roughly `8 × 6K ≈ 48K`. Get this wrong and every request either
truncates or waits; it fails loudly at request one, which is why bench runs
next.

### 3. Measure before budgeting (ten minutes)

```
npm run corpus:bench
```

This fires sixteen real tier-4 prompts, eight at a time, and reports
aggregate tok/s, tokens per candidate, and a candidates-per-night estimate.
Single-stream decode measures 6–9 tok/s; batching should multiply that
several times, but *should* is not a number. At ~900 tokens a pong, the
difference between 30 and 60 tok/s aggregate is 700 programs a night or
1,500 — this measurement is what turns "a night" from a hope into a budget.
Treat it as a floor: the steady-state prompt grows as model-written parents
replace the hand-written seeds, and the drift is all one way.

### 4. Read what the model will be told (free, and it steers everything)

```
npm run corpus:gen -- --tier 4 --dry
npm run corpus:gen -- --tier 2 --dry --freestyle
```

`--dry` prints the entire prompt — system fence, few-shots as worked turns,
the mutation request — without needing a server. `HEADERS` and `EDITS` in
`prompt.ts` are decisions, not measurements: the header line is the *only*
conditioning channel the trained model will have (Phase 5's "write me pong"
is literally one of these strings), and the edit instructions are where all
structural variety comes from. Argue with them now; changing them after a
corpus exists means regenerating it.

### 5. Pilot, read, adjust — two or three rounds of 200–300

```
npm run corpus:gen -- --tier 4 --n 250 --slots 8
```

Each run appends to `data/corpus/raw/t4.jsonl` (rejects included) and
`data/corpus/verified/t4.jsonl` (the keepers), prints a histogram every 25
candidates, and resumes if killed — `--n` is how many more attempts, not a
total. Between pilots, read the histogram. How to read it:

- **`v0:absent:*` dominates** — the model is reaching for constructs the
  dialect refuses despite the fence. Strengthen the fence wording or add a
  shot that demonstrates the workaround.
- **`v0:syntax` dominates** — this is the number that decides whether
  host-side grammar constraint (a GBNF for llama.cpp) is worth building.
  The plan's rule: build it only if rejects are syntax-shaped; if they are
  semantic, a grammar buys nothing.
- **`v2:*` dominates** — the programs are legal but wrong for their tier;
  the tier notes in `prompt.ts` are what say those constraints out loud.
- **`gen:truncated`** — not the model's fault; raise `--max-tokens`. The
  run separates harness failures from program failures precisely so a
  truncation epidemic can't masquerade as bad C.
- **Yield (the keep %) is a cost, not a verdict.** 30% keep at high
  throughput is a fine night; what matters is that the failures are boring.

Also per the plan: once a pilot exists, this is the moment to train a
provisional BPE on pilot + seeds and measure a real pong's token length —
it settles MAXSEQ versus streaming attention in `llm.c` and should not wait
for the full corpus. (Tokenizer tooling is station 4, not yet built.)

### 6. The night

```
npm run corpus:gen -- --tier 4 --n 4000 --slots 8
```

Tier by tier, mutation-heavy (`--kind mix` is the default: 75% mutate, 25%
freestyle — mutation copies the dialect out of its own context, so its
yield is far higher, and freestyle is what keeps the pool from becoming a
closed set of the mutation operators). The morning report prints keep rate,
tokens per candidate, tok/s, and the histogram; the raw log holds
everything needed to re-grade or trace any candidate later.

### 7. What comes after (not built, deliberately)

Station 3 (`assemble.ts`: normalise formatting, dedup by skeleton caps and
axis cells, hold out cells rather than random documents) and station 4
(`tokenize.ts`: the ~512-token BPE in llama2.c format) are next, and the
plan's sections on them are precise about the traps — n-gram dedup would
delete exactly the family coverage tier 4 exists to buy, and a random
holdout split leaks near-duplicates so the validation loss lies. Then the
toy-scale dry run through pack → grade → oracle → machine, then the real
training run.

## Decisions made while building this, so you don't re-derive them

- **Synth's pong is one-player only.** A two-player court with nobody at
  the far paddle can, for some axis rolls, send the ball into a cycle that
  never scores — and synth is not allowed to emit rejects. The 2P variant
  stays in `EDITS` where the model attempts it and each attempt is verified
  individually; a rare reject there is yield, not a bug.
- **Pong's `win × ballDiv ≤ 28`.** The grader plays the whole game and
  allows 6,000 frames; that product is what stretches a game, and the cap
  keeps the slowest legal combination comfortably inside.
- **The ball glyph avoids the letter O everywhere else on the court**,
  including the bottom-line copy. The grader finds the ball by being the
  screen's one moving singleton; a court whose caption contains the ball's
  glyph has no singleton to find.
- **Tier-2 transcripts are predicted through `verify.ts`'s own `makeRng`**,
  seeded 1 the way every grading probe seeds it. One rng, imported, not a
  second implementation — the same rule as the LLM oracle.
- **A losing guess-game always echoes the typed number.** Two different
  losing scripts otherwise produce the same transcript, and the grader's
  input-inert check (same output for two different scripts) would rightly
  reject the program.
