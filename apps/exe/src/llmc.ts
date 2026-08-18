/**
 * SRC\llm.c — the seed the whole of llm_llm_llm Phase 2 exists to put on the
 * disk. It is kept here rather than inline in copy.ts because it is 300 lines
 * of another language and copy.ts is prose; `String.raw` so the backslashes
 * in it are the C's and not TypeScript's.
 *
 * It must agree with three other things or it prints nonsense: the ports in
 * vm.ts, the builtins in cc.ts, and the drive image that
 * apps/exe/tools/llm/pack.ts writes. `cc.test.ts` compiles it, runs it on the
 * real processor against a real image, and checks the tokens against the
 * integer oracle in tools/llm/intref.ts, which is what keeps the four honest.
 */

export const LLM_C = String.raw`/* llm.c — a language model, on this machine's own processor.

   cd /src; cc llm.c; run llm.  ESC stops it.

   The weights are on the drive: 260,032 of them, one byte each, and the
   processor reads every one of them for every word it says. That is why it
   is slow. It is not pretending to be slow.

   Nothing here is a trick. The three ports at the top of memory are a drive
   controller — DPOS and DBNK aim the head, DSK hands over a byte and moves
   on — and everything below is sixteen-bit integer arithmetic, because this
   machine has no other kind. A weight is one byte. So is an activation. The
   scale of each is a power of two, kept as an exponent, so putting a number
   back on its proper scale is a shift and never a multiply.

   The one thing worth knowing before you read it: every byte, weight and
   activation alike, is stored with 128 added. That makes every product
   positive and sixteen bits wide, which is what lets the loop in mvrow be
   eight instructions instead of eleven. The 128s come back out once per row:

       sum(w'a') = sum(wa) + 128*sum(a) + 128*sum(w')

   and the two sums it needs are on the drive in front of the row and worked
   out once per matrix.  */

/* The model's shape. It is this model's, not any model's — the header on
   the drive is checked against every one of these before a word is said. */
#define DIM     64
#define HIDDEN  172
#define LAYERS  5
#define HEADS   8
#define KVHEADS 4
#define HEADSZ  8
#define KVDIM   32
#define KVMUL   2
#define VOCAB   512
#define MAXSEQ  128

/* ROWHDR: a row's exponent, then its byte sum. KROW and VROW are that plus
   what the K and V caches keep in a row. SCOREB: scores and logits are kept
   in 32nds, ATTB: attention weights in 256ths. (A #define here is a name and
   a number, nothing else — no arithmetic, and no comment after it. But sums
   of constants are worked out while compiling. See /docs/c.txt.) */
#define ROWHDR  3
#define KROW    11
#define VROW    131
#define SCOREB  5
#define ATTB    8
#define MAGIC   0x4D4C

/* ---- what the machine is thinking about ----

   These live on the heap rather than in the program, because the program is
   what has to fit: 556 blank words in the image are 556 words the code does
   not get, and malloc hands out the space past the end of it, which is
   otherwise nothing but the gap in front of the stack. */

int *xres;                      /* the residual stream, sixteen bits a word */
int *xq;                        /* it, quantised and biased, for the matvecs */
int *hq;                        /* the feed-forward's hidden units, likewise */
                                /* att shares hq's words: see getroom */
int *qv;                        /* the queries */
int *kk;                        /* this position's keys */
int *vv;                        /* and values */
int *att;                       /* scores, then exponentials, then weights */

void getroom() {
    xres = malloc(DIM);
    xq   = malloc(DIM);
    hq   = malloc(HIDDEN);
    qv   = malloc(DIM);
    kk   = malloc(KVDIM);
    vv   = malloc(KVDIM);
    /* the attention weights and the hidden units are never both alive: a
       layer is done with the first before it has any of the second, and
       HIDDEN is the larger. 128 words is not nothing here. */
    att  = hq;
}

/* ---- what the drive says about itself ---- */

int hLut; int hRope; int hGum; int hExps; int hText; int hK; int hV;
int hEmbHi; int hEmbLo; int hLayHi; int hLayLo; int hStride;
int hFinHi; int hFinLo; int hClsHi; int hClsLo; int ares; int warm;
int klayer; int vlayer; int offQkv; int offWo; int offFfn; int offW13; int offW2;
int eq[LAYERS]; int ek[LAYERS]; int ev[LAYERS]; int eo[LAYERS];
int ez[LAYERS]; int e3[LAYERS]; int eh[LAYERS];

/* ---- the head, and a thirty-two bit address to aim it with ---- */

int ahi; int alo;
int lbHi; int lbLo;             /* this layer's weights */

void ago() { dbank(ahi); dpos(alo); }

/* Carrying by hand: the processor compares signed, so an unsigned compare is
   the same compare with both sign bits flipped. */
void aadd(int n) {
    int t;
    t = alo + n;
    if ((t ^ 0x8000) < (alo ^ 0x8000)) ahi = ahi + 1;
    alo = t;
}

/* Everything the program writes lives in the first bank, where the low word
   of the address is the whole address. */
void seek0(int off) { dbank(0); dpos(off); }

int rd16() { int lo; lo = dget(); return lo | (dget() << 8); }

void gotolayer(int off) { ahi = lbHi; alo = lbLo; aadd(off); ago(); }

/* ---- arithmetic the processor does not come with ----

   Small enough to write out, and written out because the compiler spends
   sixty to a hundred and forty words on each of them and the program has
   about three thousand to live in. $name in an asm line is where the
   compiler put that name — a global, or, in a function that cannot be
   re-entered, one of its own arguments. See /docs/c.txt. */

/* Arithmetic shift right; a negative count is a shift the other way, which
   the exponents ask for often enough to be worth having. */
int ash(int v, int n) {
    asm("ld r0, [$v]");
    asm("ld r1, [$n]");
    asm("and r1, 0x8000");      /* n < 0: go the other way and be done */
    asm("jz ashr");
    asm("mov r1, 0");
    asm("ld r2, [$n]");
    asm("sub r1, r2");
    asm("shl r0, r1");
    asm("jmp ashd");
    asm("ashr:");
    asm("ld r1, [$n]");
    asm("cmp r1, 16");          /* everything but the sign falls off */
    asm("jc ashs");
    asm("mov r1, 15");
    asm("ashs:");
    asm("mov r2, r0");
    asm("shr r0, r1");
    asm("and r2, 0x8000");      /* put the sign back on the top */
    asm("jz ashd");
    asm("mov r2, 0xffff");
    asm("mov r3, 16");
    asm("sub r3, r1");
    asm("shl r2, r3");
    asm("or r0, r2");
    asm("ashd:");
    asm("st r0, [$v]");
    return v;
}

/* The same, rounded. Dropping bits always downward is a bias and not a
   rounding error; on eight-bit numbers it is a visible one. */
int rsh(int v, int n) {
    if (n < 1) return ash(v, n);
    return ash(v + (1 << (n - 1)), n);
}

int clip8(int v) {
    asm("ld r0, [$v]");
    asm("xor r0, 0x8000");      /* compare signed, the usual way */
    asm("cmp r0, 0x807f");
    asm("jc c8lo");
    asm("mov r0, 127");
    asm("jmp c8d");
    asm("c8lo:");
    asm("cmp r0, 0x7f81");
    asm("jnc c8hi");
    asm("mov r0, 0xff81");
    asm("jmp c8d");
    asm("c8hi:");
    asm("xor r0, 0x8000");
    asm("c8d:");
    asm("st r0, [$v]");
    return v;
}

/* Adding into the residual stream, which is the one place a word can fill
   up. Overflow is the operands agreeing about their sign and the answer not
   agreeing with them. */
int sadd(int a, int b) {
    asm("ld r0, [$a]");
    asm("ld r1, [$b]");
    asm("mov r2, r0");
    asm("add r0, r1");
    asm("xor r2, r0");
    asm("xor r1, r0");
    asm("and r1, r2");
    asm("and r1, 0x8000");
    asm("jz sad");
    asm("mov r0, 0x7fff");
    asm("ld r1, [$a]");
    asm("and r1, 0x8000");
    asm("jz sad");
    asm("mov r0, 0x8001");      /* not 0x8000: negating a word must be safe */
    asm("sad:");
    asm("st r0, [$a]");
    return a;
}

/* The other half of undoing the bias: what the activations add up to, before
   the 128s went on. */
int usum(int *a, int n) {
    asm("ld r6, [$a]");
    asm("ld r3, [$n]");
    asm("mov r0, 0");
    asm("usl:");
    asm("ld r1, [r6]");
    asm("add r0, r1");
    asm("add r6, 1");
    asm("sub r3, 1");
    asm("jnz usl");
    asm("ld r1, [$n]");
    asm("shl r1, 7");
    asm("sub r0, r1");
    asm("st r0, [$n]");
    return n;
}

/* ---- the row: this program, four hundred thousand times ---- */

int mv_a;                       /* the words to multiply the row by */
int mv_n;
int mv_klo; int mv_khi;         /* 128 * sum(a), thirty-two bits of it */
int mv_base;                    /* the part of the shift the row does not know */
int mv_r;                       /* the answer */

void mvset(int a, int n, int sa, int base) {
    mv_a = a;
    mv_n = n;
    mv_base = base;
    mv_klo = sa << 7;
    mv_khi = ash(sa, 9);
}

/* One row off the drive, multiplied into mv_n words at mv_a, un-biased, put
   on the scale mv_base asks for and squeezed back into one word.

   Hand assembly, because this is the program. Eight instructions from mvl to
   mvc and there are three hundred thousand of them in every word the machine
   says; the compiler's two stacks would make it twenty. $name is the address
   of the global of that name — see /docs/c.txt. R5 and R7 belong to the
   compiler and are not touched; everything else is fair game. */
void mvrow() {
    asm("ld r0, [dsk]");        /* the row's exponent, with 64 added */
    asm("sub r0, 64");
    asm("ld r3, [$mv_base]");
    asm("add r0, r3");          /* the whole shift, which may be negative */
    asm("push r0");
    asm("ld r0, [dsk]");        /* sum(w'), low byte */
    asm("ld r1, [dsk]");        /* and high */
    asm("shl r1, 8");
    asm("or r0, r1");
    asm("mov r1, r0");
    asm("shr r1, 9");           /* 128*sum(w'), high half */
    asm("shl r0, 7");           /* and low */
    asm("push r1");
    asm("push r0");

    asm("mov r1, 0");           /* the running total, high */
    asm("mov r2, 0");           /* and low */
    asm("ld r6, [$mv_a]");
    asm("ld r3, [$mv_n]");
    asm("mvl:");
    asm("ld r0, [dsk]");        /* the weight */
    asm("ld r4, [r6]");         /* the activation */
    asm("add r6, 1");
    asm("mul r0, r4");          /* both are 0..255, so this cannot overflow */
    asm("add r2, r0");
    asm("jnc mvc");
    asm("add r1, 1");
    asm("mvc:");
    asm("sub r3, 1");
    asm("jnz mvl");

    asm("pop r4");              /* take 128*sum(w') back out */
    asm("pop r3");
    asm("sub r2, r4");
    asm("jnc mvb1");
    asm("sub r1, 1");
    asm("mvb1:");
    asm("sub r1, r3");
    asm("ld r4, [$mv_klo]");    /* and 128*sum(a) */
    asm("ld r3, [$mv_khi]");
    asm("sub r2, r4");
    asm("jnc mvb2");
    asm("sub r1, 1");
    asm("mvb2:");
    asm("sub r1, r3");
    asm("pop r3");              /* the shift */

    /* stories260K only ever asks for -4 to 14 of these, so the whole-word
       loop below and the rounding above 16 are here for a model that is not
       this one. They are checked by reading, not by running. */
    asm("mov r0, r3");          /* a negative shift goes the other way */
    asm("and r0, 0x8000");
    asm("jz mvr");
    asm("mov r0, 0");
    asm("sub r0, r3");
    asm("mov r3, r0");
    asm("mvlp:");
    asm("cmp r3, 0");
    asm("jz mvsat");
    asm("mov r0, r2");
    asm("shr r0, 15");
    asm("shl r1, 1");
    asm("or r1, r0");
    asm("shl r2, 1");
    asm("sub r3, 1");
    asm("jmp mvlp");

    asm("mvr:");                /* round: half a step on before the bits go */
    asm("cmp r3, 0");
    asm("jz mv16");
    asm("mov r0, r3");
    asm("sub r0, 1");
    asm("mov r4, 1");
    asm("cmp r0, 16");
    asm("jc mvrlo");
    asm("sub r0, 16");
    asm("shl r4, r0");
    asm("add r1, r4");
    asm("jmp mv16");
    asm("mvrlo:");
    asm("shl r4, r0");
    asm("add r2, r4");
    asm("jnc mv16");
    asm("add r1, 1");

    asm("mv16:");               /* whole words first, sign following along */
    asm("cmp r3, 16");
    asm("jc mvfin");
    asm("mov r2, r1");
    asm("mov r1, 0");
    asm("mov r0, r2");
    asm("and r0, 0x8000");
    asm("jz mv16z");
    asm("mov r1, 0xffff");
    asm("mv16z:");
    asm("sub r3, 16");
    asm("jmp mv16");

    asm("mvfin:");              /* then the rest of the way */
    asm("cmp r3, 0");
    asm("jz mvsat");
    asm("mov r0, r2");
    asm("shr r0, r3");
    asm("mov r4, 16");
    asm("sub r4, r3");
    asm("mov r6, r1");
    asm("shl r6, r4");
    asm("or r0, r6");
    asm("mov r2, r0");
    asm("mov r0, r1");
    asm("shr r0, r3");
    asm("mov r6, r1");
    asm("and r6, 0x8000");
    asm("jz mvfz");
    asm("mov r6, 0xffff");
    asm("shl r6, r4");
    asm("or r0, r6");
    asm("mvfz:");
    asm("mov r1, r0");

    asm("mvsat:");              /* the low word will do if the high word is
                                   only its sign; otherwise go to the end */
    asm("mov r0, r2");
    asm("and r0, 0x8000");
    asm("jz mvsp");
    asm("cmp r1, 0xffff");
    asm("jz mvdone");
    asm("jmp mvclip");
    asm("mvsp:");
    asm("cmp r1, 0");
    asm("jz mvdone");
    asm("mvclip:");
    asm("mov r2, 0x7fff");
    asm("mov r0, r1");
    asm("and r0, 0x8000");
    asm("jz mvdone");
    asm("mov r2, 0x8001");   /* -32767, so that negating a word is always safe */
    asm("mvdone:");
    asm("st r2, [$mv_r]");
}

/* n rows into n words, each squeezed back to eight bits. */
void mvfill(int *dst, int n) {
    int j;
    for (j = 0; j < n; j++) { mvrow(); dst[j] = clip8(mv_r); }
}

/* DIM rows straight into the residual stream, which is where both of the
   projections that finish a layer put their answer. */
void mvadd() {
    int j;
    for (j = 0; j < DIM; j++) { mvrow(); xres[j] = sadd(xres[j], mv_r); }
}

/* One pair of a vector turned by (cos, sin) in 128ths. A query and a key
   turn exactly alike, which is the only reason RoPE is four lines. */
void rot(int *p, int cr, int ci) {
    int a0; int a1;
    a0 = p[0];
    a1 = p[1];
    p[0] = clip8(rsh(a0 * cr - a1 * ci, 7));
    p[1] = clip8(rsh(a0 * ci + a1 * cr, 7));
}

/* ---- RMSNorm, and the quantising after it, which are one pass ----

   Scale free, so the residual stream's own exponent never comes into it: x
   goes down to seven bits first — any wider and t*t leaves the low half of a
   multiply — and dividing by the root of the mean square puts the scale
   back. The output's exponent is measured here rather than being written
   down in advance, which costs two more passes over sixty-four words and is
   worth it.

   Five passes, each of them short, and every one works in the output, so one
   pointer is ever live and the six registers go round. The head must already
   be aimed at this norm's weight vector. Returns the exponent of what it
   wrote. Sixty-four below is DIM; the header check in loadhdr is what makes
   writing it as a number safe. */

int nqag;

int normq(int *out) {
    /* one: the biggest word in the residual stream */
    asm("ld r6, [$xres]");
    asm("mov r3, 64");
    asm("mov r2, 0");
    asm("nqa:");
    asm("ld r0, [r6]");
    asm("add r6, 1");
    asm("mov r1, r0");
    asm("and r1, 0x8000");
    asm("jz nqa1");
    asm("mov r1, 0");
    asm("sub r1, r0");
    asm("mov r0, r1");
    asm("nqa1:");
    asm("cmp r2, r0");
    asm("jnc nqa2");
    asm("mov r2, r0");
    asm("nqa2:");
    asm("sub r3, 1");
    asm("jnz nqa");

    /* how far it has to come down to leave seven bits */
    asm("mov r4, 0");
    asm("nqb:");
    asm("cmp r2, 128");
    asm("jc nqb1");
    asm("shr r2, 1");
    asm("add r4, 1");
    asm("jmp nqb");
    asm("nqb1:");

    /* two: bring it down. Adding half a word first turns the arithmetic
       shift the sign needs into the logical one the processor has, and
       taking the same half back out afterwards is exact. */
    asm("mov r2, 0x8000");
    asm("shr r2, r4");
    asm("ld r6, [$xres]");
    asm("ld r1, [$out]");
    asm("mov r3, 64");
    asm("nqc:");
    asm("ld r0, [r6]");
    asm("add r6, 1");
    asm("add r0, 0x8000");
    asm("shr r0, r4");
    asm("sub r0, r2");
    asm("st r0, [r1]");
    asm("add r1, 1");
    asm("sub r3, 1");
    asm("jnz nqc");

    /* three: the mean of the squares, accumulated already divided, so that
       sixty-four terms stay inside one word and no carry chain is needed */
    asm("ld r6, [$out]");
    asm("mov r3, 64");
    asm("mov r2, 0");
    asm("nqd:");
    asm("ld r0, [r6]");
    asm("add r6, 1");
    asm("mul r0, r0");
    asm("shr r0, 6");
    asm("add r2, r0");
    asm("sub r3, 1");
    asm("jnz nqd");

    /* its root, two bits at a time */
    asm("mov r1, r2");
    asm("mov r2, 0");
    asm("mov r3, 0x4000");
    asm("nqe:");
    asm("mov r4, r2");
    asm("add r4, r3");
    asm("shr r2, 1");
    asm("cmp r1, r4");
    asm("jc nqe1");
    asm("sub r1, r4");
    asm("add r2, r3");
    asm("nqe1:");
    asm("shr r3, 2");
    asm("jnz nqe");
    asm("cmp r2, 1");
    asm("jnc nqe2");
    asm("mov r2, 1");
    asm("nqe2:");

    /* four: times the norm's own weights, divided by that root, rounded,
       and how big the biggest of them came out */
    asm("mov r4, r2");
    asm("ld r6, [$out]");
    asm("mov r3, 64");
    asm("mov r2, 0");
    asm("ld r0, [dsk]");
    asm("sub r0, 64");
    asm("st r0, [$nqag]");
    asm("nqf:");
    asm("ld r0, [dsk]");
    asm("sub r0, 128");
    asm("ld r1, [r6]");
    asm("mul r0, r1");
    asm("mov r1, r4");
    asm("shr r1, 1");
    asm("cmp r0, 0");
    asm("jn nqf1");
    asm("add r0, r1");
    asm("div r0, r4");
    asm("jmp nqf2");
    asm("nqf1:");
    asm("sub r1, r0");
    asm("div r1, r4");
    asm("mov r0, 0");
    asm("sub r0, r1");
    asm("nqf2:");
    asm("st r0, [r6]");
    asm("add r6, 1");
    asm("mov r1, r0");
    asm("and r1, 0x8000");
    asm("jz nqf3");
    asm("mov r1, 0");
    asm("sub r1, r0");
    asm("jmp nqf4");
    asm("nqf3:");
    asm("mov r1, r0");
    asm("nqf4:");
    asm("cmp r2, r1");
    asm("jnc nqf5");
    asm("mov r2, r1");
    asm("nqf5:");
    asm("sub r3, 1");
    asm("jnz nqf");

    /* how far those have to come down in turn, which is the exponent */
    asm("mov r4, 0");
    asm("nqg:");
    asm("cmp r2, 128");
    asm("jc nqg1");
    asm("shr r2, 1");
    asm("add r4, 1");
    asm("jmp nqg");
    asm("nqg1:");
    asm("ld r0, [$nqag]");
    asm("sub r0, r4");
    asm("st r0, [$nqag]");

    /* five: down they come, rounded, and biased by 128 for the row loop.
       The half-a-word trick again, with the rounding folded into it. */
    asm("mov r2, 1");
    asm("shl r2, r4");
    asm("shr r2, 1");
    asm("add r2, 0x8000");
    asm("mov r1, 0x8000");
    asm("shr r1, r4");
    asm("mov r0, 128");
    asm("sub r0, r1");
    asm("mov r1, r0");
    asm("ld r6, [$out]");
    asm("mov r3, 64");
    asm("nqh:");
    asm("ld r0, [r6]");
    asm("add r0, r2");
    asm("shr r0, r4");
    asm("add r0, r1");
    /* sn was picked so that dropping sn bits leaves seven, but rounding can
       carry one past that — 255 rounds to 128, which is 256 once biased and
       no longer a byte. The bottom cannot do the same: the same choice of sn
       bounds the most negative value at -128, which biases to 0. */
    asm("cmp r0, 256");
    asm("jc nqh1");
    asm("mov r0, 255");
    asm("nqh1:");
    asm("st r0, [r6]");
    asm("add r6, 1");
    asm("sub r3, 1");
    asm("jnz nqh");
    return nqag;
}

/* 1/(1+e^-z) in 128ths, out of the same table softmax uses: above zero it is
   one over (1 + u/one), and below it is the same the other way up. */
int sigm(int z, int az) {
    asm("ld r0, [$z]");
    asm("mov r1, r0");
    asm("and r1, 0x8000");      /* which side of zero, kept for the end */
    asm("push r1");
    asm("cmp r0, 0");
    asm("jnn sg1");
    asm("mov r1, 0");
    asm("sub r1, r0");
    asm("mov r0, r1");
    asm("sg1:");
    asm("ld r1, [$az]");        /* |z| into the table's 32nds */
    asm("sub r1, 5");
    asm("mov r2, r1");
    asm("and r2, 0x8000");
    asm("jz sg2");
    asm("mov r2, 0");
    asm("sub r2, r1");
    asm("shl r0, r2");
    asm("jmp sg3");
    asm("sg2:");
    asm("shr r0, r1");
    asm("sg3:");
    asm("cmp r0, 256");
    asm("jc sg4");
    asm("pop r1");              /* off the end of the table: all or nothing */
    asm("mov r0, 128");
    asm("cmp r1, 0");
    asm("jz sgd");
    asm("mov r0, 0");
    asm("jmp sgd");
    asm("sg4:");
    asm("ld r1, [$hLut]");
    asm("add r0, r1");
    asm("mov r1, 0");
    asm("st r1, [dbnk]");
    asm("st r0, [dpos]");
    asm("ld r0, [dsk]");        /* u = one * e^-|z| */
    asm("mov r1, r0");
    asm("add r1, 127");
    asm("pop r2");
    asm("cmp r2, 0");
    asm("jz sg5");
    asm("shl r0, 7");           /* below zero: u/(one+u) */
    asm("div r0, r1");
    asm("jmp sgd");
    asm("sg5:");
    asm("mov r0, 16256");       /* above: one/(one+u), in 128ths */
    asm("div r0, r1");
    asm("sgd:");
    asm("st r0, [$z]");
    return z;
}

/* Everything one head's scores become once they are all in: the table turns
   each into e^(score - biggest), and then each of those into its share of
   the total, in 256ths. Returns what the shares add up to, which is what
   undoes the bias in the weighted sum that follows. */
int smax(int n, int mx) {
    asm("ld r6, [$att]");
    asm("ld r3, [$n]");
    asm("ld r4, [$mx]");
    asm("mov r2, 0");           /* the total */
    asm("sml:");
    asm("ld r0, [r6]");
    asm("mov r1, r4");
    asm("sub r1, r0");          /* how far below the biggest, in 32nds */
    asm("cmp r1, 256");
    asm("jnc smz");             /* past the end of the table is zero */
    asm("mov r0, 0");
    asm("st r0, [dbnk]");
    asm("ld r0, [$hLut]");
    asm("add r0, r1");
    asm("st r0, [dpos]");
    asm("ld r0, [dsk]");
    asm("add r2, r0");
    asm("jmp smw");
    asm("smz:");
    asm("mov r0, 0");
    asm("smw:");
    asm("st r0, [r6]");
    asm("add r6, 1");
    asm("sub r3, 1");
    asm("jnz sml");

    asm("cmp r2, 1");
    asm("jnc smn");
    asm("mov r2, 1");
    asm("smn:");
    asm("ld r6, [$att]");
    asm("ld r3, [$n]");
    asm("mov r4, 0");           /* what the shares add up to */
    asm("smp:");
    asm("ld r0, [r6]");
    asm("shl r0, 8");
    asm("div r0, r2");
    asm("st r0, [r6]");
    asm("add r6, 1");
    asm("add r4, r0");
    asm("sub r3, 1");
    asm("jnz smp");
    asm("st r4, [$n]");
    return n;
}

/* The vocabulary and the draw, in one pass. mvset and the head are already
   where they need to be. */
int pkbest; int pkbv; int pkt;

int pick() {
    asm("mov r0, 0");
    asm("st r0, [$pkbest]");
    asm("st r0, [$pkt]");
    asm("mov r0, 0x8001");
    asm("st r0, [$pkbv]");
    asm("pkl:");
    asm("ld r0, [$ahi]");       /* aim at this row */
    asm("st r0, [dbnk]");
    asm("ld r0, [$alo]");
    asm("st r0, [dpos]");
    asm("call $mvrow");
    asm("ld r0, [$alo]");       /* and on to the next, carrying by hand */
    asm("add r0, 67");
    asm("jnc pk1");
    asm("ld r1, [$ahi]");
    asm("add r1, 1");
    asm("st r1, [$ahi]");
    asm("pk1:");
    asm("st r0, [$alo]");
    asm("ld r0, [rnd]");        /* a quantile of the Gumbel */
    asm("and r0, 511");
    asm("shl r0, 1");
    asm("ld r1, [$hGum]");
    asm("add r0, r1");
    asm("mov r1, 0");
    asm("st r1, [dbnk]");
    asm("st r0, [dpos]");
    asm("ld r0, [dsk]");
    asm("ld r1, [dsk]");
    asm("shl r1, 8");
    asm("or r0, r1");
    asm("ld r1, [$mv_r]");
    asm("add r0, r1");          /* the logit, and its noise */
    asm("ld r1, [$pkbv]");
    asm("xor r0, 0x8000");
    asm("xor r1, 0x8000");
    asm("cmp r1, r0");
    asm("jnc pk2");
    asm("xor r0, 0x8000");
    asm("st r0, [$pkbv]");
    asm("ld r0, [$pkt]");
    asm("st r0, [$pkbest]");
    asm("pk2:");
    asm("ld r0, [$pkt]");
    asm("add r0, 1");
    asm("st r0, [$pkt]");
    asm("cmp r0, 512");
    asm("jc pkl");
    return pkbest;
}

/* ---- the drive's own table of contents ---- */

int loadhdr() {
    int i;
    seek0(0);
    if (rd16() != MAGIC) return 0;
    rd16();
    /* the geometry is this program's as much as the drive's, so it is
       checked rather than believed */
    if (rd16() != DIM) return 0;
    if (rd16() != HIDDEN) return 0;
    if (rd16() != LAYERS) return 0;
    if (rd16() != HEADS) return 0;
    if (rd16() != KVHEADS) return 0;
    if (rd16() != VOCAB) return 0;
    if (rd16() != MAXSEQ) return 0;
    ares = rd16() - 64;
    hLut = rd16(); rd16();
    hRope = rd16(); rd16();
    hGum = rd16(); rd16();
    hExps = rd16(); rd16();
    hText = rd16(); rd16();
    hK = rd16(); rd16();
    hV = rd16(); rd16();
    hEmbLo = rd16(); hEmbHi = rd16();
    hLayLo = rd16(); hLayHi = rd16();
    hStride = rd16(); rd16();
    hFinLo = rd16(); hFinHi = rd16();
    hClsLo = rd16(); hClsHi = rd16();
    warm = rd16();

    klayer = KVHEADS * MAXSEQ * KROW;
    vlayer = KVHEADS * HEADSZ * VROW;
    offQkv = 1 + DIM;
    offWo  = offQkv + (DIM + KVDIM + KVDIM) * (ROWHDR + DIM);
    offFfn = offQkv + (DIM + DIM + KVDIM + KVDIM) * (ROWHDR + DIM);
    offW13 = offFfn + 1 + DIM;
    offW2  = offW13 + HIDDEN * 2 * (ROWHDR + DIM);

    seek0(hExps);
    for (i = 0; i < LAYERS; i++) {
        eq[i] = dget() - 64;
        ek[i] = dget() - 64;
        ev[i] = dget() - 64;
        eo[i] = dget() - 64;
        ez[i] = dget() - 64;
        e3[i] = dget() - 64;
        eh[i] = dget() - 64;
        dget();
    }
    return 1;
}

/* ---- one token in, the next token out ---- */

int step(int tok, int pos) {
    int l; int i; int j; int h; int g; int t; int o;
    int an; int sa; int s; int mx; int z; int t3;
    int cr; int ci; int whi; int wlo;
    int Eq; int Ek; int Ev; int Eo; int Ez; int E3; int Eh;
    int kbase; int vbase; int ssh; int vsh; int zsh; int va;

    /* the embedding row is the residual stream's first value */
    ahi = hEmbHi; alo = hEmbLo;
    aadd(tok * (1 + DIM));
    ago();
    an = dget() - 64 - ares;
    for (i = 0; i < DIM; i++) xres[i] = rsh(dget() - 128, an);

    lbHi = hLayHi; lbLo = hLayLo;
    for (l = 0; l < LAYERS; l++) {
        /* everything this layer's loops would otherwise work out again and
           again: its exponents, its slice of the cache, its three shifts */
        Eq = eq[l]; Ek = ek[l]; Ev = ev[l]; Eo = eo[l];
        Ez = ez[l]; E3 = e3[l]; Eh = eh[l];
        kbase = hK + l * klayer;
        vbase = hV + l * vlayer;
        ssh = Eq + Ek - SCOREB;
        vsh = ATTB + Ev - Eo;
        zsh = Ez + E3 - Eh;

        gotolayer(0);
        an = normq(xq);
        sa = usum(xq, DIM);

        /* the queries, keys and values come off one stream, in that order */
        mvset(xq, DIM, sa, an - Eq);
        gotolayer(offQkv);
        mvfill(qv, DIM);
        mv_base = an - Ek;
        mvfill(kk, KVDIM);
        mv_base = an - Ev;
        mvfill(vv, KVDIM);

        /* the rotation that tells the machine where in the sentence it is */
        seek0(hRope + pos * HEADSZ);
        for (j = 0; j < HEADSZ; j = j + 2) {
            cr = dget() - 128;
            ci = dget() - 128;
            for (o = j; o < DIM; o = o + HEADSZ) {
                rot(qv + o, cr, ci);
                if (o < KVDIM) rot(kk + o, cr, ci);
            }
        }

        /* into the cache, each in the shape it will be read back in: a key as
           a row of its own, sum in front, so that the score loop is the row
           loop; a value spread down its own component's run, so that the
           weighted sum is too */
        for (g = 0; g < KVHEADS; g++) {
            o = g * HEADSZ;
            s = 0;
            for (i = 0; i < HEADSZ; i++) s = s + kk[o + i] + 128;
            seek0(kbase + (g * MAXSEQ + pos) * KROW + 1);
            dput(s);
            dput(s >> 8);
            for (i = 0; i < HEADSZ; i++) dput(kk[o + i] + 128);
            va = vbase + o * VROW + ROWHDR + pos;
            for (i = 0; i < HEADSZ; i++) {
                seek0(va);
                dput(vv[o + i] + 128);
                va = va + VROW;
            }
        }

        for (h = 0; h < HEADS; h++) {
            o = h * HEADSZ;
            g = h / KVMUL;
            for (i = 0; i < HEADSZ; i++) qv[o + i] = qv[o + i] + 128;
            mvset(qv + o, HEADSZ, usum(qv + o, HEADSZ), ssh);
            seek0(kbase + g * MAXSEQ * KROW);
            mx = 0 - 32768;
            for (t = 0; t <= pos; t++) {
                mvrow();
                att[t] = mv_r;
                if (mv_r > mx) mx = mv_r;
            }
            mvset(att, pos + 1, smax(pos + 1, mx), vsh);
            va = vbase + g * HEADSZ * VROW;
            for (i = 0; i < HEADSZ; i++) {
                seek0(va);
                mvrow();
                xq[o + i] = clip8(mv_r) + 128;
                va = va + VROW;
            }
        }

        /* the out projection, straight into the residual stream */
        mvset(xq, DIM, usum(xq, DIM), Eo - ares);
        gotolayer(offWo);
        mvadd();

        /* the feed-forward half. Its two matrices alternate a row at a time
           down one stream, so a hidden unit is finished — gated, multiplied
           and put back into eight bits — before the next one starts, and 172
           words of scratch never have to exist. The gate reads the table,
           which moves the head, so the stream keeps its own bookmark. */
        gotolayer(offFfn);
        an = normq(xq);
        mvset(xq, DIM, usum(xq, DIM), 0);
        ahi = lbHi; alo = lbLo; aadd(offW13);
        whi = ahi; wlo = alo;
        for (i = 0; i < HIDDEN; i++) {
            ahi = whi; alo = wlo; ago();
            mv_base = an - Ez;
            mvrow();
            z = clip8(mv_r);
            mv_base = an - E3;
            mvrow();
            t3 = clip8(mv_r);
            ahi = whi; alo = wlo; aadd((ROWHDR + DIM) * 2);
            whi = ahi; wlo = alo;
            z = rsh(z * sigm(z, Ez), 7);
            hq[i] = clip8(rsh(z * t3, zsh)) + 128;
        }
        mvset(hq, HIDDEN, usum(hq, HIDDEN), Eh - ares);
        gotolayer(offW2);
        mvadd();

        ahi = lbHi; alo = lbLo; aadd(hStride);
        lbHi = ahi; lbLo = alo;
    }

    /* the last norm, then the vocabulary — and the draw happens in the same
       pass, because adding a Gumbel to every logit and keeping the largest is
       a draw from the softmax, and the machine has nowhere to put 512 logits */
    ahi = hFinHi; alo = hFinLo; ago();
    an = normq(xq);
    /* One shift less to begin with, which is one temperature looser. This
       model knows how a story starts far too well — it is 98.8% sure of the
       word after "a little" — so the first few tokens are picked loosely
       and everything after them is picked the usual way. The machine chooses
       what the story is about, then tells it straight. */
    mvset(xq, DIM, usum(xq, DIM), an - SCOREB + (pos < warm));
    ahi = hClsHi; alo = hClsLo;
    return pick();
}

/* ---- what a token prints ---- */

void say(int t) {
    int n; int i;
    seek0(hText + (t << 3));
    n = dget();
    for (i = 0; i < n; i++) putc(dget());
}

int main() {
    int pos; int tok; int nxt;
    getroom();
    if (!loadhdr()) {
        puts("DRIVE NOT READY.\n");
        return 1;
    }
    puts("STORIES-260K: 260,032 WEIGHTS, ONE BYTE\n");
    puts("EACH, ALL OF THEM READ FOR EVERY WORD.\n\n");
    tok = 1;
    for (pos = 0; pos < MAXSEQ; pos++) {
        nxt = step(tok, pos);
        if (nxt < 3) break;
        say(nxt);
        tok = nxt;
    }
    puts("\n\n");
    return 0;
}
`;
