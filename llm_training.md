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
  thousand candidates — with quality still enforced by the machine. Use it if
  the discard rate is annoying, skip it otherwise.
- *Binding:* the tokenizer. Phase 4's masker operates on the tiny model's
  token vocabulary, and that vocabulary is designed and trained **here**. A
  token that spans a lexeme boundary (`) {` as one token, say) makes the
  masker's job — "could this byte string extend the parse?" — much fiddlier.
  This is the one Phase 3 decision that exists *because* of Phase 4.

## The pipeline

Five stations, all on the Mac. The VM only ever infers.

1. **Generate.** The local 27B, unattended, off prompt templates per
   curriculum tier. Templates vary the surface deliberately — names,
   constants, geometry, court glyphs — because a small model trained on near
   duplicates memorizes one program instead of learning the family.
2. **Verify.** Node workers compiling and running every candidate headless
   (the machinery is already in `cc.test.ts`, which plays pong on the real VM
   with no browser). Three levels: **V0** CC compiles — which enforces the
   3,840-word ceiling for free; **V1** runs N frames with randomized input,
   no fault, and either terminates or keeps yielding via `vsync`; **V2**
   family-specific behavior — screen lights up, paddle answers keys, score
   moves, graded against the Phase 1 reference `pong.c`. Log failures by
   category: the failure histogram is what steers the next generation batch.
3. **Assemble.** Exact and near-duplicate dedup (near = high n-gram overlap).
   Normalize formatting to roughly one house style — whitespace variance is
   capacity a 1M-param model can't spare.
4. **Tokenize.** Train a small BPE vocabulary (~512) on the corpus. BPE:
   start from bytes, repeatedly merge the most frequent adjacent pair into a
   new token, stop at the target size — frequent fragments like `vsync();`
   become one token, cutting sequence length 3–4× versus characters. Export
   in the llama2.c tokenizer format so `loadTokenizer` in `checkpoint.ts`
   reads it unchanged. Design rule from Phase 4: prefer merges that stay
   inside lexeme boundaries, and make keywords and the builtins single
   tokens.
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
- **Sequence length costs three ways.** The attention buffer is MAXSEQ words
  of RAM (today it hides inside HIDDEN's 172), the KV cache on the drive
  grows linearly, and seconds-per-token grows linearly with position. Pong
  is ~4–6K chars ≈ 1.5–2K BPE tokens, and a 2,048-word buffer cannot fit in
  this machine. Either the dialect style plus BPE gets pong under ~1K tokens
  and MAXSEQ stays squeezable, or `llm.c` learns streaming attention
  (two passes over the K cache instead of a stored score row — more drive
  reads, no big buffer). **Don't decide from estimates: measure the token
  length of real verified pongs once the corpus exists, then choose.**
- **Vocab costs drive space and classifier time**, linear in VOCAB. 512 was
  right for stories260K; keep it unless measurement argues.

## Curriculum

Four tiers, each with its own prompt templates and its own V2 grader; each
tier's exit is a verified sub-corpus.

1. **Expression soup** — arithmetic and control-flow micro-programs that
   print. Teaches the syntax and the flavor of 16-bit wrap.
2. **Guess-the-number family** — loops, `getc`/`putn`/`rand`, terminal I/O.
3. **Teletype and screen toys** — `vpos`/`vput`/`vsync`/`key`; animation and
   input handling.
4. **Pong variants** — hundreds: paddle sizes, ball speeds, win scores,
   court glyphs, one- and two-player. Graded by the headless harness.

Weight the final training mix toward tiers 3–4 by token count; small models
forget early data, and pong is the exam. Memorization of the pong family is
accepted (the main doc says so) — the variation axes above are what turn
"memorized one pong" into "interpolates the family."

## How you ask it for pong

A model trained on bare programs can only continue text; Phase 5 needs to
*request* a program. Conditioning: every training document starts with the
stylized header comment the disk already uses (`/* pong.c — ... */`), one
document per program with begin/end markers, and at inference you prompt with
the header and let it write the rest. Keep the task lines to a small
controlled vocabulary of phrasings so the eventual Phase 5 prompt is
guaranteed to be something the model has seen many times.

## Order of work — oracle first

Phase 2's lesson, believed: build the graders before the thing they grade.

1. Verify farm + V0/V1/V2 graders. Prove them on the five known-good `/src`
   programs *and* on deliberately broken mutants — a grader that rejects
   nothing is the failure mode to catch on day one.
2. Generation pilot, a few hundred candidates. Measure yield and the failure
   histogram; tune prompts. Decide here whether host-side grammar
   constraint is worth wiring up.
3. Scale generation unattended. Assemble, dedup, train the tokenizer.
   Measure real pong token lengths → settle MAXSEQ vs streaming attention.
4. **Dry run at toy scale**: train a stories260K-sized model on the corpus
   and push it through pack → grade → oracle → machine end-to-end. Every
   integration surprise gets found on a model that trained in minutes.
5. Real run. Grade, ship `WEIGHTS.BIN`, update `llm.c`'s defines, and
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
