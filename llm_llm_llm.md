# llm_llm_llm.md — a language model on the 16-bit CPU

The plan for making BOARD.EXE's simulated processor run an actual language
model, and eventually having that model write `PONG.C`, which CC compiles and
the same CPU runs. The recursion is the point: a frontier model taught the
author to run a 27B locally; the local model helps build a fake computer; a
~5M-param model gets distilled onto the fake computer; the fake computer
writes the video game. Each layer down, the model shrinks three orders of
magnitude and the hardware gets one notch more fictional.

This doc is the shared memory for that project. Nothing here is built yet
except the machine itself.

## The machine as it stands

From `vm.ts` / `cc.ts` / `terminal.ts`, the parts that matter:

- 16-bit CPU, **4096 words of memory total** (8KB). MMIO page at 0x0F00
  (CON/NUM/KEY/RND), data stack at 0x0E00 down, so ~3.5K words are really
  usable. Integer-only ALU; MUL/DIV are 16-bit; flags include a real carry.
- `assemble()` in `vm.ts` turns assembly text into machine words; CC turns a
  small C dialect into that assembly. The toolchain C → asm → words → run is
  complete and shipping today.
- `STEPS_PER_FRAME = 30_000` in `terminal.ts` ⇒ **~1.8M instructions/sec**.
  This is an artistic constant, not physics — the JS interpreter loop can do
  tens of millions of steps/sec if asked.
- The console is a **teletype**: append-only, control codes dropped, no cursor
  addressing. Guess-the-number is playable today; pong is not, by anyone.

## Why it's possible (the three walls, and their doors)

1. **Memory.** The smallest transformer that speaks coherently (TinyStories,
   ~260K params) is 260KB at int8 — 34× the entire address space. But
   inference is a stream: a matvec touches each weight once per token. So:
   one new MMIO port, a disk controller backed by a file in `fs.ts`, and
   weights (and the KV cache — the sneakier wall; even dim-32×2-layer×64-ctx
   wants ~8K words) page through it. Period-authentic: this is EMS/overlay
   paging, which is what a real 8KB-working-set machine did. The "disk" is a
   JS Map, so a port read costs the same as any instruction.
2. **No float.** int8 weights (127×127 fits a 16-bit product), 32-bit
   accumulation as two words off the carry flag, exp via a 256-entry LUT,
   RMSNorm's sqrt via Newton. The hot MAC loop is hand assembly through CC's
   `asm("...")` escape hatch — the two-stack calling convention would triple
   its cost otherwise.
3. **Speed.** ~12–15 instructions per MAC hand-tuned ⇒ ~140K MACs/sec at the
   period clock. A 260K-param model ≈ one pass over weights per token ⇒
   **seconds per token**. That stutter is the demo, not the bug. For
   development iteration: crank the clock, or add a math-coprocessor MMIO
   port that does dot-products host-side (the empty socket next to a 486SX).
   Where that line sits is a fiction call, not an engineering one.

Ceiling: TinyStories-class (≤~10M params). A 100M model is ~10 min/token
pure-CPU; nothing that *knows things* will ever run here, and that's fine —
the ISA being different is irrelevant, inference is just arithmetic.

## Why a tiny model can write pong at all

"A small C program is easy LLM output" is calibrated on billion-param models.
A 5M model freestyling C produces plausible garbage. Three things close the
gap, together:

- **Narrow distribution.** TinyStories proved 1–10M models are coherent when
  the distribution is small enough to hold. Ours is far smaller than
  children's English: one dialect, four builtins, a 40×24 screen, and pong is
  ~150 lines with a few hundred meaningful decisions.
- **Grammar-constrained decoding.** We own the compiler, so mask any token
  that can't extend a valid parse prefix of the CC grammar. Syntax errors
  become impossible by construction; what remains is semantics.
- **Compile-run-verify loop.** The machine runs CC on its own output and
  feeds errors back as retry context, capped. 30% per-attempt success is a
  shipping product when the machine checks its own work.

Honest failure mode: the model partially memorizes and emits interpolations
of pongs it trained on. Acceptable — arguably the right thing to be honest
about. The demo's integrity is that the weights genuinely run on the 16-bit
CPU, not that the model is general. Nobody promised Doom.

Engineering pinch point: sequence length. 150 lines ≈ 4–6K chars; char-level
means thousands of tokens of context and KV paging cost grows with it. A
small BPE vocab (~512) cuts sequence length 3–4×. Decide before training.

## Where compute lives

**Training happens on the Mac. The VM only ever infers.** Factory and
appliance — models are made in datacenters and run on small devices, and the
fake 1995 machine importing `C:\WEIGHTS.BIN` it could never have produced is
exactly how an appliance works. On-VM training is off the table three ways:

- Compute: ~6 × params × tokens. 5M params × ~100M tokens ≈ 3×10¹⁵ ops; at
  140K MACs/sec that is **centuries**. The Mac does it in an afternoon.
  (Inference is ~2 × params per token — ten orders of magnitude less total.)
- Precision: gradients die in int8; float-in-software on a 16-bit integer
  CPU is research, not a port.
- State: weights + gradients + Adam moments ≈ 4× model size, read *and*
  written every step through the paging port.

Division of labor on the host, for a machine whose CPU is usually bored
(decode at batch 1 is bandwidth-bound; training and verification are
compute-bound):

- **Local 27B (qwen, ~6–9 tok/s)**: corpus generation, unattended. Slow is
  fine; quality is enforced by the machine, not the model — every candidate
  program must compile under CC and run on the VM without faulting.
- **Verification farm**: 8–12 Node workers compiling/running tens of
  thousands of candidates, thousands of frames each with randomized input.
  Pure CPU, embarrassingly parallel, pegs every core. This is the CPU-heavy
  part most ML projects don't have.
- **PyTorch training**: 5M params trains in hours; CPU training via
  Accelerate is genuinely viable at this scale if heating the CPU is a goal,
  MPS if it isn't.

## Roadmap

**Phase 1 — Give the machine a screen.** New hardware in `vm.ts`'s MMIO page,
in the style of the existing ports: a 40×24 character framebuffer and a VSYNC
port a program reads to pace itself (today a program just burns its step
budget flat-out). `key()` already covers input. *Exit: a human-written
`PONG.C`, compiled by CC, playable in the terminal.* Not a warm-up — it's the
reference implementation the corpus is graded against, and the critical path:
the pong slice of training data is blocked on it. ~a day.

**Phase 2 — Inference substrate, no model of ours yet.** Disk/paging port;
int8 matvec kernel in `asm("...")` with carry-chain 32-bit accumulate; exp
LUT; tokenizer; KV cache paged through the same port. *Exit: TinyStories-260K
babbling in the terminal at seconds per token.* Proves the runtime end to end
with someone else's checkpoint. Zero research risk; only takes time. **This
milestone is publishable by itself** — "the 16-bit computer inside this fake
Windows 95 is running a language model, watch the terminal" is the whole
story, and the URL is the demo. Don't gate it on Phase 4.

**Phase 3 — Distill a model that only knows this machine.** No corpus exists
for the dialect, so manufacture one: host LLMs generate tens of thousands of
small dialect-C programs; every one is verified (CC compiles, VM runs clean,
game-shaped ones survive N frames against the Phase 1 hardware). Curriculum:
expression soup → guess-the-number family → teletype toys → hundreds of pong
variants. Train 1–10M params, quantize int8, export `C:\WEIGHTS.BIN` — a file
the player can `ls`, which is the right touch.

**Phase 4 — Constrained decoding + repair loop, on the machine.** Grammar
masking against CC's grammar; the compile-error-retry loop; capped attempts.
*De-risk on guess-the-number first* — it should work almost immediately —
then pong. Pong first-shot reliability is the one number nobody can promise
in advance; the corpus gets tuned against whatever the residual bugs are
(ball tunnels through paddle, score never increments).

**Phase 5 — Citizenship.** Don't draw an AI — run one. A program on the disk
that visibly writes `PONG.C` into the filesystem, compiles it, and hands over
the prompt, with the possessed machine's usual editorial confidence.

## Risk ranking

Phase 1 small and certain; Phase 2 fiddly, no unknowns; Phase 3 corpus
quality is where the outcome is decided; Phase 4's pong success rate is the
only genuine research risk, and guess-the-number sits in front of it as the
checkpoint. Ship configuration: coprocessor/cranked clock for the playable
loop, then run the pure-CPU mode once overnight so the boast — *the 16-bit
CPU wrote this* — is literally, instruction-by-instruction true.
