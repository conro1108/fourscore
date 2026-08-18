# llm_training.md — Phase 3: manufacture the corpus, train the model

The plan for Phase 3 of [llm_llm_llm.md](llm_llm_llm.md): no corpus exists for
the CC dialect, so generate one with a big host model, let the machine itself
filter it, and train a small model on what survives. The deliverable is a new
`WEIGHTS.BIN` — a model that only knows this machine — running through the
same `llm.c` / `intref.ts` / `grade.ts` toolchain Phase 2 built. Written for a
reader who knows software; the ML is glossed where it appears.

## Where grammar masking lives (and where it doesn't)

Three candidate homes. It lives in the third.

**Not in the training loop.** Training is next-token prediction: show the
model millions of tokens of valid programs, and at every position the loss is
"how much probability did you put on the token that actually came next."
That's the whole loop. You *could* zero out grammar-illegal tokens in the
loss, but a corpus of only-valid programs already never rewards an illegal
token, so it teaches nothing new — it just distorts the probabilities the
model does learn. Plain cross-entropy on clean data is the move.

**Not the corpus cleaner.** The corpus is cleaned by something much stronger
than a grammar: the machine. Every candidate must compile under CC, fit in
the 3,840 words, and run on the VM without faulting — and game-shaped ones
must survive frames of play. A grammar only knows "this parses"; the verify
farm knows "the paddle answers keys." Masking would be a strictly weaker
duplicate of a filter we already have. And note this is *filtering*, not
reinforcement: nothing feeds back into any model's weights. The host model
generates, the machine discards, and the host never gets better at the
dialect — it doesn't need to, because candidates are cheap and we can afford
to throw most of them away (the ML term is rejection sampling).

**It's Phase 4, at decode time.** When the *trained tiny model* writes a
program token by token, the sampler consults the CC grammar at each step and
masks (sets to zero probability) every token that cannot extend a valid parse
prefix, then renormalizes and samples from what's left. Syntax errors become
impossible by construction; the model's learned judgment picks among the
legal continuations. It's steering of output, applied at inference, to a
model whose weights are already frozen.

Two places it touches Phase 3 anyway:

- *Optional:* the host model's runtime (llama.cpp-family) can enforce a
  grammar during generation too. Pure yield efficiency — fewer discards per
  thousand candidates — with quality still enforced by the machine. The
  decision rule is measured, not guessed: build it only if the V0 failure
  histogram turns out to be syntax-dominated. If the rejects are semantic, a
  GBNF buys nothing and duplicates Phase 4's work in the wrong formalism.
- *Binding:* the tokenizer. Phase 4's masker operates on the tiny model's
  token vocabulary, and that vocabulary is designed and trained **here**. A
  token that spans a lexeme boundary (`) {` as one token, say) makes the
  masker's job — "could this byte string extend the parse?" — much fiddlier.
  This is the one Phase 3 decision that exists *because* of Phase 4.

## The fence the generator writes inside

CC is narrower than C, and narrower than a host model's reflexes. Measured by
putting 54 constructs through `compileC`: 34 compile.

**Rejected**, and a 20B model reaches for every one of these unprompted:
`switch`, `typedef`, `enum`, `static`, `const`, `unsigned`/`long`/`float`,
`#include`, function prototypes (`int f(int);`), a declaration inside
`for(...)`, 2D arrays, arrays of structs, function pointers, `goto`, the
comma operator, `char *msgs[] = {"a","b"}`, and `#define N (2+3)` — a define
takes a bare number. Constant folding works in expressions (`putn(N*2+1)`)
but **not** in array bounds: `int a[N+2]` does not compile.

**Accepted, and worth leaning on:** `int a, b;` on one line, mid-block
declarations, initialisers at declaration (local and global), calling a
function defined further down the file, recursion, struct-by-value arguments
and struct assignment — both correct at runtime, not merely parsed — `?:`,
`op=`, `++`/`--`, short-circuit `&&`/`||`, `do/while`, `sizeof`, `&x`,
pointer arithmetic, `//` comments, `int a[] = {1,2,3}`.

Fifteen builtins and no more: `putc putn puts getc key rand vpos vput vsync
dpos dbank dget dput malloc free`.

That rejected list goes verbatim into every generation prompt with `c.txt`
above it. It is the cheapest artifact in the phase and it moves yield further
than model size does.

Sizes, for calibration: `fizz.c` is 429 chars and compiles to 194 words,
`list.c` 896/237, `map.c` 1262/526, and `pong.c` **3,143 chars, 116 lines,
1,108 words** — 2,700 words of headroom under the 3,840 ceiling. Program size
is not what binds tier 4. Sequence length is.

## The pipeline

Five stations, all on the Mac. The VM only ever infers.

1. **Generate — and the local model is the minority source.** Three sources,
   and the ratio between them is the whole trick.

   - **Combinatorial synthesis (~70% of documents).** A TypeScript generator
     emitting dialect C from parameterised skeletons: valid by construction,
     uniform over the variation axes, and — the part that is easy to miss —
     it *knows the expected output*, so tiers 1 and 2 get an exact-stdout
     grader for free. Millions of tokens a minute, no model involved.
   - **Model mutation of verified programs (~25%).** Hand the local model a
     program that already passed and an edit instruction: restructure the
     ball update into two helpers, rename everything in another house style,
     add a second player. Yield is far above freestyle because the model
     copies the dialect out of its context instead of recalling it, and this
     is where *structural* variety comes from — synthesis only varies
     constants.
   - **Freestyle from spec (~5%).** `c.txt`, the rejected-construct list, two
     or three few-shots drawn from the verified pool, and a header line.
     Lowest yield, but it is what stops the corpus from being a closed set of
     the mutation operators. Cap how often any one program is used as a
     few-shot or the pool inbreeds.

   The multiplier that makes this affordable: **don't ask the model for
   10,000 pongs.** Ask for ~1,500 structurally varied ones and let synthesis
   permute each into six or eight — re-rolled axes, new names, new glyphs —
   every permutation independently re-verified. A pong is ~900 host tokens,
   so 1,500 of them is 1.35M tokens: a night unattended at plausible batched
   throughput. Asking the model for all 10,000 is 9M tokens and most of a
   week, for variety synthesis produces in seconds.

   The model is Qwen3.8-27B in `~/ai/models/gguf`, run through llama.cpp
   directly — `UD-Q6_K_XL` (24GB) or `UD-Q8_K_XL` (29GB). Generate with Q6:
   24GB against 48GB of unified memory leaves room for the KV cache across
   `llama-server -np 8` slots, and Q8 does not. Single-stream decode measures
   6–9 tok/s and batching across slots should multiply that several times,
   but **measure the aggregate in the pilot** — it is the only number in this
   doc that the generation budget depends on.

2. **Verify.** Node workers compiling and running every candidate headless
   (the machinery is already in `cc.test.ts`, which plays pong on the real VM
   with no browser). Three levels: **V0** CC compiles — which enforces the
   3,840-word ceiling for free; **V1** runs N frames with randomized input,
   no fault, and either terminates or keeps yielding via `vsync`; **V2**
   family-specific behavior — screen lights up, paddle answers keys, score
   moves, graded against the Phase 1 reference `pong.c`.

   The liveness test falls out of the VM rather than needing invention:
   `run(30_000)` returns the steps it actually ran and a VSYNC read ends the
   call early, so **yielded ⟺ returned < 30,000, not halted, not faulted**. A
   frame that burns the whole budget without yielding is hung. Tier 1 and 2
   programs never yield and must halt inside a step budget; tiers 3 and 4
   must yield every frame.

   V2 has to grade **invariants, not positions**, or it passes only programs
   identical to the reference — `cc.test.ts`'s pong assertions hardcode
   `rows[0].slice(18, 21)` for the score and would reject most legitimate
   variants. For tier 4: exactly one ball glyph on screen, it occupies more
   than one cell over 60 frames, W/S moves a contiguous vertical run in a
   column below 5, some digit on screen increments within 3,000 frames, and
   the program halts under long random input.

   Verification is free — compile, assemble and 600 frames is about 30ms, so
   twelve workers on fourteen cores clear ~400 candidates a second. Generation
   is the only bottleneck. So grade everything and **keep the rejects**: the
   failure histogram is what steers the next batch, and it is the only thing
   that answers whether host-side grammar constraint is worth building.

3. **Assemble.** Normalize formatting to roughly one house style — whitespace
   variance is capacity a 1M-param model can't spare.

   Dedup is a **sampling problem, not a threshold.** Two pongs differing only
   in `WIN 7` versus `WIN 5` are 99% identical, and an n-gram filter would
   delete exactly the family coverage tier 4 exists to buy. So cap documents
   per skeleton, require two axes to differ within a skeleton, and reserve
   n-gram dedup (0.8 Jaccard on 5-grams) for model output, which has no
   skeleton id. Tier 1 gets it aggressively; tier 4 barely at all.

   Hold out **axis cells, not random documents** — every pong with paddle 5
   and the `+` glyph set, say. A random split leaks near-duplicates across it
   and the validation loss lies. Holding out cells measures interpolation to
   unseen combinations, which is the capability Phase 4 actually needs.

4. **Tokenize.** Train a small BPE vocabulary (~512) on the corpus. BPE:
   start from bytes, repeatedly merge the most frequent adjacent pair into a
   new token, stop at the target size — frequent fragments like `vsync();`
   become one token, cutting sequence length 3–4× versus characters. Export
   in the llama2.c tokenizer format so `loadTokenizer` in `checkpoint.ts`
   reads it unchanged. Design rule from Phase 4: prefer merges that stay
   inside lexeme boundaries, and make keywords and the builtins single
   tokens. Measure real program token lengths the moment a provisional
   vocabulary exists — that number settles MAXSEQ, below.

5. **Train, quantize, ship.** A tiny llama-architecture model in PyTorch
   (llama2.c's training script is the template), exported in the llama2.c
   checkpoint format. That format choice is load-bearing: it means the entire
   Phase 2 toolchain is reused as-is — `checkpoint.ts` reads it, `pack.ts`
   calibrates and quantizes it, `intref.ts` oracles it, `grade.ts` grades it,
   and `llm.c` runs it with only its `#define`d dimensions changed. Keep the
   architecture identical to stories260K; change only the numbers.

## The machine bounds the model's shape

This fell out of reading `llm.c` and it constrains training more than any ML
consideration does.

- **Width costs working memory.** The activation buffers `llm.c` keeps in
  heap are `3·DIM + HIDDEN + 2·KVDIM` words — 428 today at DIM 64, against
  ~150 words of slack in the 3,840. Depth costs *nothing* in RAM (layers
  stream from the drive one at a time), so a bigger model grows **down, not
  out**. Depth-only at DIM 64 tops out around ~1M params (≈45K/layer).
  Reaching 2–2.5M needs DIM 128 — heap ≈ 856 words — which only fits by
  spending the 246 unused MMIO-page words and/or shrinking code. 5–10M is
  not reachable without restructuring `llm.c`; don't plan on it. The good
  news: TinyStories showed 260K params speaks passable English, our
  distribution is far narrower than English, and the grammar mask absorbs
  syntax entirely. 1–2.5M is the honest target band.
- **Sequence length costs three ways**, and it is the wall. The attention
  buffer is MAXSEQ words of RAM (today it hides inside HIDDEN's 172), the KV
  cache on the drive grows linearly, and seconds-per-token grows linearly
  with position. `pong.c` measures 3,143 chars, so at ~4.5 chars/token with
  an in-domain 512 BPE a pong is **~700 tokens against a MAXSEQ of 128** —
  and there is no version of that which fits by squeezing, because the heap
  has ~150 words of slack. So treat streaming attention in `llm.c` (two
  passes over the K cache instead of a stored score row) as near-certain,
  budget ~340KB more drive for the larger cache, and expect a token near the
  end of a program to cost roughly three times one at the start — a pong is
  then most of an hour of machine time, which is the overnight boast the main
  doc already plans for. **Confirm with the real BPE on real verified pongs
  before writing the code.** It is the first measurement of the phase, not
  the last.
- **Vocab costs drive space and classifier time**, linear in VOCAB. 512 was
  right for stories260K; keep it unless measurement argues.

## Curriculum — which is to say, the dataset

Four tiers. They are not four trainings: they are one pool with four
sub-corpora, mixed by token share, and "curriculum" here means composition
rather than phases. Each tier has its own prompt templates, its own variation
axes and its own V2 grader; each tier's exit is a verified sub-corpus.

| | what it is | what varies | chars | count | ~tokens |
|---|---|---|---|---|---|
| **T1** expression soup | arithmetic, control flow, 16-bit wrap, printing | operators, constants, loop shape, wrap cases | 200–500 | 40k | 3M |
| **T2** console family | guess-the-number and kin: `getc`/`key`/`rand`/`putn` | range, tries, prompts, win/lose copy, input protocol | 400–1200 | 20k | 3.5M |
| **T3** screen toys | `vpos`/`vput`/`vsync`/`key` — bouncing char, marquee, starfield, clock | geometry, glyphs, speed, control keys, borders | 800–2000 | 20k | 6M |
| **T4** pong variants | the exam | paddle height 3–6, court glyphs, win score 3–9, ball divisor 2–5, AI divisor 3–6, serve rule, 1P/2P, wall english | 2500–4500 | 10k | 7.5M |

~20M unique tokens, 3–5 epochs, 60–100M tokens seen against 1–2.5M params.
Final mix by token share **T1 10 / T2 15 / T3 30 / T4 45**, then anneal the
last ~10% of steps on tiers 3 and 4 only: small models forget early data, and
pong is the exam. Memorization of the pong family is accepted (the main doc
says so) — the axes above are what turn "memorized one pong" into
"interpolates the family."

Tier 4's axes multiply out to ~43,000 skeleton combinations before naming and
structure, so 10,000 distinct pongs is easy combinatorially. The risk is the
opposite one: that they are all the same program with different constants,
which is what source B in station 1 exists to break.

## How you ask it for pong

A model trained on bare programs can only continue text; Phase 5 needs to
*request* a program. The stylized header comment the disk already uses is the
entire conditioning channel — there is no instruction/response split:

```
<BOS>/* pong.c — the television game, on this machine's own screen. */
int py = 10;            /* your paddle's top row */
...
<EOS>
```

One document per program, BOS/EOS delimited. Each tier gets a controlled set
of six to twelve header phrasings — they live in `prompt.ts`'s `HEADERS`, and
the filename inside is the family key while the phrase after it is the
variation the model learns to see past. At inference you emit BOS plus a
header and let it write the rest, which is why the eventual Phase 5 prompt is
guaranteed to be something the model has seen thousands of times.

**The header is exactly one line, and that is a decision.** The hand-written
`pong.c` opens with six — a title, how to run it, which keys — and the corpus
throws that away: `stampHeader` puts the asked-for line on and takes whatever
the model wrote off. A header must never mismatch its body or the model
learns the request is a hint, and one line is the only shape that can be
guaranteed identical across twenty thousand documents. The reference program
on the disk keeps its six lines. Changing this changes the corpus format, so
change it before generating, not after.

## What the pool looks like when it's done

```
data/corpus/
  raw/         every candidate as produced, rejects included — the histogram lives here
  verified/    t1.jsonl t2.jsonl t3.jsonl t4.jsonl
  pool/        train.txt  val.txt  mix.json
  tok/         tok512.bin      ← llama2.c format, loadTokenizer() reads it unchanged
  bin/         train.bin  val.bin   ← uint16 ids, what the trainer mmaps
```

One verified record carries enough to re-grade it, re-derive the split and
trace where it came from:

```json
{"id":"t4/pong-1p-tall/17","tier":4,"source":"mutate","skeleton":"pong-1p-tall",
 "axes":{"paddle":4,"win":7,"glyph":"=|O","ballDiv":3,"aiDiv":4},
 "header":"/* pong.c — the television game, on this machine's own screen. */",
 "text":"...","chars":3143,"words":1108,
 "v1":{"frames":600,"yielded":600,"fault":null},
 "v2":{"oneBall":true,"ballMoved":true,"paddleAnswers":true,"scoreMoved":true},
 "parents":["t4/seed-pong"]}
```

The tooling goes in `apps/exe/tools/corpus/` — `synth.ts`, `gen.ts` (the
llama-server driver), `verify.ts` (the worker pool), `assemble.ts`,
`tokenize.ts` — importing `compileC` and `makeVm` directly, the way
`cc.test.ts` already does.

## Order of work — oracle first

Phase 2's lesson, believed: build the graders before the thing they grade.

1. **Verify farm + V0/V1/V2 graders.** ✅ **Done (2026-08-17).**
   `apps/exe/tools/corpus/`: `verify.ts` is the probe, V0, V1 and the
   taxonomy; `graders.ts` is a V2 per tier; `mutants.ts` is seven known-good
   programs and eighteen broken ones, each a single edit from passing;
   `farm.ts` is the pool — JSONL in, JSONL out, histogram at the end, and a
   self-test that runs the mutants before a batch does. `corpus.test.ts` is
   28 tests in 0.8s, and 500 candidates clear in 1.4s on twelve workers.

   *What it measured that this plan did not know:* holding a key down hangs
   pong.c — the `while (k) { k = key(); }` drain loop never sees a 0, so it
   burns all 30,000 steps a frame forever and never scores — so probes type
   sparsely, and any variant with that loop shape inherits the property. And
   a frame costs about nine instructions, so V2 grades whole games rather
   than sampling them. Two mutants turned out to be wrong rather than the
   graders, which is where `v1:no-vsync` and `v1:starved` came from.

   The tier-2 and tier-3 references (`GUESS_C`, `BOUNCE_C` in `mutants.ts`)
   had to be written because the disk carries none — `guess.asm` is assembly
   and there is no screen toy smaller than pong. They are also the first
   few-shot examples those tiers will be generated from, so they are worth
   looking at hard before twenty thousand programs imitate them.

2. **The synthesiser, and the axes it rolls.** Source A is 70% of the corpus
   and everything downstream inherits its shape, so it comes before any model
   is asked for anything: a skeleton per family, the axis list each skeleton
   rolls, and — for tiers 1 and 2 — the predicted output and winning key
   script that hand V2 its exact grade for free.

   Choose the axes deliberately rather than discovering them. They are the
   whole difference between a corpus that teaches the pong *family* and one
   that teaches a single pong with the constants filed off, and an axis
   nobody rolls is a variation the model can never interpolate to. Two the
   graders already constrain: the ball needs its own glyph, or there is no
   singleton to find, and the up/down keys are declared in `axes` so a
   variant can move them.

   *Exit: `synth.ts` emits candidates the farm keeps at close to 100%* — a
   generator that produces rejects is a generator with a bug, since it builds
   from the fence rather than guessing at it — *and tier 4's axes multiply
   out to more skeletons than any batch will use.*

3. **Generation pilot**, a few hundred candidates. *The machinery is built
   (2026-08-17):* `prompt.ts` assembles what the model is told — `c.txt` off
   the disk and the fence built from `verify.ts`'s own `ABSENT`, so the thing
   forbidden and the thing counted cannot drift — and `gen.ts` drives
   llama-server's OpenAI endpoint, grades inline, appends raw and verified
   JSONL, and resumes. `--dry` prints the whole prompt without a server, which
   is how the prompt gets tuned. `gen.test.ts` runs the loop against a stub
   that speaks the same endpoint.

   *What is not built is the part that decides the outcome.* Three things go
   in front of a night, in this order:

   - **Measure `llama-server -np 8` aggregate throughput on the Q6.**
     Single-stream is 6–9 tok/s and nobody has measured batched. At ~900
     tokens a pong the difference between 30 and 60 tok/s aggregate is 1,500
     programs a night or 700, and every number in this doc's generation
     budget rests on it.
   - **Read `--dry` output and argue with it.** `HEADERS` and `EDITS` are
     decisions somebody made, not measurements, and they are what the corpus
     will be made of.
   - **Then two or three pilots of 200–300**, reading the histogram between
     them. Committing a night to an unmeasured prompt is how you wake up to
     nine thousand rejects sharing three failure keys.

   Two things about `llama-server` that fail the night rather than the
   request. **Per-slot context is `n_ctx / slots`**, and a tier-4 mutate
   prompt is `c.txt` plus the fence plus a parent program plus shots — call
   it 4K tokens, plus 1,400 generated, so eight slots want `n_ctx` ≥ 44K or
   every request 413s. That one fails loudly at request one, which is why it
   costs nothing to check first. **And the pilot understates the steady-state
   prompt**: while the pool is only the hand-written seeds, parents and shots
   are the 3,143-char `pong.c`, but by 4am they are model-written programs up
   to `--max-tokens` long. Whatever you tune the timeout against on a seeded
   pool is not what a request looks like at the end, and the drift is all one
   way.

   Decide here whether host-side grammar constraint is worth wiring up: only
   if the V0 rejects turn out to be syntax-dominated. Train a provisional BPE
   on the pilot plus the seeds and measure pong's token length — that is
   enough to settle MAXSEQ versus streaming attention, and it should not wait
   for the full corpus.
4. Scale generation unattended. Assemble, dedup, train the real tokenizer.
5. **Dry run at toy scale**: train a stories260K-sized model on the corpus
   and push it through pack → grade → oracle → machine end-to-end. Every
   integration surprise gets found on a model that trained in minutes.
6. Real run. Grade, ship `WEIGHTS.BIN`, update `llm.c`'s defines, and
   `llm.test.ts` stays green.

## Exit criteria

- **The number that predicts Phase 4: unconstrained compile rate.** Sample
  the trained model with no grammar mask at the shipping temperature; what
  fraction compiles under CC? If it's near zero, the mask can force syntax
  but the semantics underneath are noise — fix the corpus or the model
  before touching Phase 4.
- V1/V2 pass rates per curriculum family, sampled the same way.
- `grade.ts` against the new float model — establish a fresh top-1/KL
  baseline (Phase 2's 94% / 0.06 nats belongs to stories260K, don't inherit
  it).
- `llm.test.ts` green: fits in 3,840 words, machine matches oracle token for
  token.
- The `ls`-able `C:\WEIGHTS.BIN` touch stays displaced (the drive is a
  device fetched at boot, not a file in the volume — Phase 2's decision) and
  finds its home in Phase 5.

## Explicitly not Phase 3

The grammar masker itself, the compile-error repair loop, and capped-retry
orchestration are Phase 4. The disk-writing citizen program is Phase 5.
Phase 3 hands them a model, a tokenizer designed with the masker in mind,
and the compile-rate number that says whether they'll work.

One tempting thing to leave alone: you could train on error→fix pairs to make
Phase 4's repair loop learned rather than mechanical. Don't, here. A 1–2.5M
model has no capacity to spare, and grammar-mask-plus-resample is a stronger
repair than anything it would learn. Keep only the final clean program from a
generation retry; the tiny model should learn to write correct programs, not
to argue with a compiler.
