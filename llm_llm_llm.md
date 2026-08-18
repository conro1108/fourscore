# llm_llm_llm.md — a language model on the 16-bit CPU

The plan for making BOARD.EXE's simulated processor run an actual language
model, and eventually having that model write `PONG.C`, which CC compiles and
the same CPU runs. The recursion is the point: a frontier model taught the
author to run a 27B locally; the local model helps build a fake computer; a
~5M-param model gets distilled onto the fake computer; the fake computer
writes the video game. Each layer down, the model shrinks three orders of
magnitude and the hardware gets one notch more fictional.

This doc is the shared memory for that project. Phases 1 and 2 are built:
the machine has a screen and a drive, and there is a language model on the
drive that its own processor runs.

## The machine as it stands

From `vm.ts` / `cc.ts` / `terminal.ts`, the parts that matter:

- 16-bit CPU, **4096 words of memory total** (8KB). MMIO page at 0x0F00
  (CON/NUM/KEY/RND, then VPOS/VCHR/VSYNC, then DPOS/DBNK/DSK), data stack at
  0x0E00 down, so ~3.5K words are really usable. Integer-only ALU; MUL/DIV
  are 16-bit and MUL gives only the low word, which is why every product in
  the model is a byte times a byte; flags include a real carry.
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
   a disk controller in the MMIO page, and weights (and the KV cache — the
   sneakier wall) page through it. Period-authentic: this is EMS/overlay
   paging, which is what a real 8KB-working-set machine did. A port read
   costs the same as any instruction. ✅ Built: DPOS/DBNK/DSK, and the whole
   361KB image is laid out in *stream order* so the machine seeks about 250
   times a token and reads the rest sequentially.
2. **No float.** ✅ Built, and closer to free than expected: int8 weights,
   32-bit accumulation as two words off the carry flag, exp via a 256-entry
   LUT, RMSNorm's root bit-by-bit rather than by Newton. Every scale is a
   power of two, so putting a number back where it belongs is a shift and
   never a multiply — which matters because MUL only gives the low word.
   The one thing worth knowing that the plan did not: **bias both operands by
   128.** Every product is then unsigned and fits, which removes the sign
   extension from the inner loop and takes it from eleven instructions to
   eight — a quarter of the whole runtime.
3. **Speed.** ✅ Measured: 8 instructions per MAC, 301K MACs a token, 2.95M
   instructions a token, **1.7 seconds a token** at the period clock. That
   stutter is the demo, not the bug, and no coprocessor was needed — the
   empty socket next to the 486SX stays empty, which is the better joke.

Ceiling: TinyStories-class (≤~10M params). A 100M model is ~10 min/token
pure-CPU; nothing that *knows things* will ever run here, and that's fine —
the ISA being different is irrelevant, inference is just arithmetic.

## Why a tiny model can write pong at all

"A small C program is easy LLM output" is calibrated on billion-param models.
A 5M model freestyling C produces plausible garbage. Three things close the
gap, together:

- **Narrow distribution.** TinyStories proved 1–10M models are coherent when
  the distribution is small enough to hold. Ours is far smaller than
  children's English: one dialect, fifteen builtins, a 40×24 screen, and pong is
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
fake 1995 machine reading a model off a disc it could never have produced is
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

**Phase 1 — Give the machine a screen.** ✅ **Done (2026-08-17).** Three ports
in `vm.ts`'s MMIO page: `VPOS` (0x0F04, the cell cursor), `VCHR` (0x0F05,
write-and-advance, readable), `VSYNC` (0x0F06 — a read ends the CPU's turn
for that frame, which is how a program rests; the terminal meters frames to
~60/sec by wall-clock so the game speed doesn't follow the monitor's refresh
rate). CC wears them as `vpos()`/`vput()`/`vsync()`; asm.txt and c.txt
document them; the terminal swaps its scrollback for the 40×24 grid while a
program has the screen lit (the prompt line is clipped, not `display:none` —
a hidden input drops focus and takes the keyboard with it). *Exit met:
`SRC\pong.c` is seeded on every disk — human-written, compiled by CC, playable
in the terminal (W/S, first to seven), and `cc.test.ts` plays it headless: the
court goes up, the paddle answers keys, a rally resolves and the score moves.*
It is the reference implementation the corpus gets graded against.

**Phase 2 — Inference substrate, no model of ours yet.** ✅ **Done
(2026-08-17).** Three more ports in `vm.ts`'s MMIO page — `DPOS` (0x0F07),
`DBNK` (0x0F08) and `DSK` (0x0F09), a byte-addressed drive with an
auto-incrementing head — and `SRC\llm.c`, which runs Karpathy's stories260K
on the 16-bit processor. *Exit met: `cd /src; cc llm.c; run llm` babbles
TinyStories in the terminal at **1.7 seconds a token**, ~2.95M instructions
each, and `llm.test.ts` checks its tokens against an integer oracle that
reads the same drive image.* What it actually says, out of the machine:
"Once upon a time, there was a little girl named Lily. She had an idea."

The parts that were decided rather than planned:

- **The drive is a device, not a file.** The plan wanted `C:\WEIGHTS.BIN` on
  the volume. The volume is one localStorage key that is re-serialised on
  every write, and 361KB of base64 in it would put a 400KB `JSON.stringify`
  in front of every Notepad save. So the media is fetched from the origin at
  boot (`drive.ts`) and `mount()` hands each program its own copy. Phase 3's
  model will be bigger, not smaller, so this is the right way round; the `ls`
  touch has to find another home.
- **No coprocessor, and no float anywhere.** int8 weights with a per-row
  power-of-two exponent, int8 activations, and both operands stored biased by
  128 so every product is unsigned and 16 bits — that is what makes the inner
  loop eight instructions instead of eleven. The bias comes back out once per
  row from sums the packer wrote down. Softmax and sigmoid are one 256-entry
  exp table; sampling is Gumbel-max, which is exact and needs nowhere to put
  512 logits. Against the float model: **94% top-1 agreement, 0.06 nats KL**.
  `tools/llm/grade.ts` is what that claim is made of; measure before retuning.
- **The compiler had to get better, and everything got smaller.** llm.c first
  compiled to 9,697 words for a 3,840-word machine. Constant folding,
  branching straight off a comparison, immediates in the instruction rather
  than through the stack, static frames for functions that cannot recurse,
  and *not emitting string literals nothing points at* (every `asm("...")` is
  one, so a program that used the escape hatch carried a copy of its own
  assembly) took it to 3,261. pong.c fell 42% on the way past. This was the
  single largest piece of work in the phase and none of it was foreseen.
- **A program this size only just fits, and that is a real finding.** 3,261
  words of program plus 428 of heap against 3,840, with the arithmetic
  helpers, RMSNorm, softmax and the sampler already in `asm("...")`. Anything
  much larger than a transformer is not writing itself in this dialect. Note
  that the heap runs past `DATA_STACK_TOP`, which is safe only because
  nothing in llm.c recurses — `llm.test.ts` asserts that rather than the
  consequence. The MMIO page has 246 unused words in it if a future phase
  gets desperate.

**Phase 3 — Distill a model that only knows this machine.** No corpus exists
for the dialect, so manufacture one: tens of thousands of small dialect-C
programs, most of them synthesised combinatorially and varied in *structure*
by the local model rather than written by it; every one is verified (CC
compiles, VM runs clean, game-shaped ones survive N frames against the Phase 1
hardware). The curriculum — expression soup → guess-the-number family →
teletype toys → pong variants — is one mixed pool weighted by token share,
not four trainings. Train 1–2.5M params (what `llm.c`'s heap allows, not the
10M the ceiling above would permit), quantize int8, export `C:\WEIGHTS.BIN` —
a file the player can `ls`, which is the right touch. The plan, the measured
dialect fence and the shape of the data pool are in
[llm_training.md](llm_training.md).

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

Phase 1 small and certain; Phase 2 fiddly, no unknowns — which was true of
the numerics and wrong about everything else: the work was code size, and the
compiler, not the arithmetic. Phase 3 corpus quality is where the outcome is
decided; Phase 4's pong success rate is the only genuine research risk, and
guess-the-number sits in front of it as the checkpoint. One thing Phase 2
learned that Phase 4 should believe: **write the oracle first.** The
TypeScript integer reference in `tools/llm/intref.ts` caught a K-cache stride
bug that had been producing plausible English for an hour. Ship configuration: coprocessor/cranked clock for the playable
loop, then run the pure-CPU mode once overnight so the boast — *the 16-bit
CPU wrote this* — is literally, instruction-by-instruction true.
