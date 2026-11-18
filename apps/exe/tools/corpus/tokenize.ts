/**
 * Station 4: the BPE vocabulary, written in llama2.c's tokenizer format so
 * `loadTokenizer` in tools/llm/checkpoint.ts reads it unchanged.
 *   npx vite-node apps/exe/tools/corpus/tokenize.ts <docs.jsonl...> [--vocab 512] [--max-len 7]
 *     [--mode strict|ws|free] [--hold <id-prefix>] [--out data/corpus/tok/tok512.bin]
 * Ids: 0 <unk>, 1 <s>, 2 </s>, then the machine's 96 characters (\n, 32..126),
 * then merges. No byte-fallback block: the machine prints nothing else, so
 * 256 byte tokens would be half the vocabulary spent on nothing.
 * No token holds more than one C lexeme (Phase 4's masker asks "can this
 * extend the parse?" of one lexeme at a time); see `UNITS`. Merges cap at
 * `--max-len` because pack.ts stores 7 characters of text per token
 * (TEXT_STRIDE). Training is weighted to the plan's token share by tier;
 * `--hold` docs are left out of training and measured as unseen.
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { loadTokenizer, pieceText } from "../llm/checkpoint.js";

/* ---- the alphabet ---- */

export const SPECIALS = ["<unk>", "\n<s>\n", "\n</s>\n"];
export const BOS = 1;
export const EOS = 2;
const CHARS = ["\n", ...Array.from({ length: 95 }, (_, i) => String.fromCharCode(32 + i))];
/** Off-machine characters the corpus actually contains (the headers' dash). */
const NORMALIZE: Record<string, string> = { "—": "-" };
export const normalize = (s: string): string => s.replace(/[^\n\x20-\x7e]/g, (c) => NORMALIZE[c] ?? "?");

/* ---- pre-tokenisation: the units a merge may not cross ---- */

const LEX = String.raw`[A-Za-z_][A-Za-z0-9_]*|0[xX][0-9A-Fa-f]+|[0-9]+|'(?:\\.|[^'\\\n])'|<<=|>>=|==|!=|<=|>=|&&|\|\||\+\+|--|[-+*/%&|^]=|<<|>>|->|\/\*|\*\/|\/\/|[^\n ]`;
const WS = String.raw`\n[ ]*|[ ]+`;
/** The unit a merge may not cross, per mode:
    strict — one C lexeme, or one whitespace run (newline + indent is one run);
    ws     — one lexeme with the whitespace before it (still one lexeme a token);
    free   — as ws, but a run of punctuation is one unit, to price the rule. */
export type Mode = "strict" | "ws" | "free";
const UNITS: Record<Mode, RegExp> = {
  strict: new RegExp(`${LEX}|${WS}`, "g"),
  ws: new RegExp(`(?:${WS})?(?:${LEX})|${WS}`, "g"),
  free: new RegExp(`(?:${WS})?(?:[A-Za-z_][A-Za-z0-9_]*|[0-9]+|'(?:\\\\.|[^'\\\\\\n])'|[^A-Za-z0-9_'\\n ]+|')|${WS}`, "g"),
};

/**
 * Whitespace joins a lexeme only whole: a piece carrying whitespace may take
 * a non-blank right half only if that half ends the unit. Without this, BPE
 * learns "\n    se" and every `send` is cut in two. Training and encoding
 * must agree on it, or encode reaches pieces training never made.
 */
const blank = (p: string): boolean => /^[\n ]+$/.test(p);
const mergeable = (left: string, right: string, last: boolean): boolean =>
  last || blank(right) || !/[\n ]/.test(left);

/* ---- training ---- */

export interface Vocab {
  pieces: string[];
  /** "a\0b" → merge rank (0 merges first). */
  ranks: Map<string, number>;
  id: Map<string, number>;
  mode: Mode;
}

export function train(docs: { text: string; weight: number }[], size: number, maxLen: number, mode: Mode): Vocab {
  const pieces = [...SPECIALS, ...CHARS];
  const id = new Map(pieces.map((p, i) => [p, i]));
  const ranks = new Map<string, number>();

  const counts = new Map<string, number>();
  for (const d of docs)
    for (const w of normalize(d.text).match(UNITS[mode]) ?? []) counts.set(w, (counts.get(w) ?? 0) + d.weight);
  const words = [...counts].map(([w, n]) => ({ ids: [...w].map((c) => id.get(c)!), n }));

  while (pieces.length < size) {
    const pairs = new Map<string, number>();
    for (const { ids, n } of words)
      for (let i = 0; i + 1 < ids.length; i++) {
        const l = pieces[ids[i]!]!;
        const r = pieces[ids[i + 1]!]!;
        if (l.length + r.length > maxLen || !mergeable(l, r, i + 2 === ids.length)) continue;
        const k = `${ids[i]}\0${ids[i + 1]}`;
        pairs.set(k, (pairs.get(k) ?? 0) + n);
      }
    let best = "";
    let bestN = 0;
    for (const [k, n] of pairs) if (n > bestN || (n === bestN && k < best)) [best, bestN] = [k, n];
    if (!best) break; // nothing left to merge under the cap
    const [a, b] = best.split("\0").map(Number) as [number, number];
    const next = pieces.length;
    pieces.push(pieces[a]! + pieces[b]!);
    ranks.set(`${pieces[a]}\0${pieces[b]}`, ranks.size);
    for (const w of words) {
      const out: number[] = [];
      for (let i = 0; i < w.ids.length; i++)
        if (w.ids[i] === a && w.ids[i + 1] === b) out.push(next), i++;
        else out.push(w.ids[i]!);
      w.ids = out;
    }
  }
  return { pieces, ranks, id: new Map(pieces.map((p, i) => [p, i])), mode };
}

/* ---- encoding (host side: the corpus and Phase 5's prompt) ---- */

export function encode(v: Vocab, text: string, cache = new Map<string, number[]>()): number[] {
  const out: number[] = [];
  for (const w of normalize(text).match(UNITS[v.mode]) ?? []) {
    let toks = cache.get(w);
    if (!toks) {
      let parts = [...w];
      for (;;) {
        let at = -1;
        let rank = Infinity;
        for (let i = 0; i + 1 < parts.length; i++) {
          const r = v.ranks.get(`${parts[i]}\0${parts[i + 1]}`);
          if (r !== undefined && r < rank && mergeable(parts[i]!, parts[i + 1]!, i + 2 === parts.length)) [at, rank] = [i, r];
        }
        if (at < 0) break;
        parts = [...parts.slice(0, at), parts[at]! + parts[at + 1]!, ...parts.slice(at + 2)];
      }
      toks = parts.map((p) => v.id.get(p)!);
      cache.set(w, toks);
    }
    out.push(...toks);
  }
  return out;
}

/** llama2.c tokenizer.bin: max piece length, then (score f32, len i32, bytes). */
export function serialize(v: Vocab): Buffer {
  const enc = v.pieces.map((p) => Buffer.from(p, "utf8"));
  const buf = Buffer.alloc(4 + enc.reduce((s, b) => s + 8 + b.length, 0));
  buf.writeInt32LE(Math.max(...enc.map((b) => b.length)), 0);
  let at = 4;
  for (const [i, b] of enc.entries()) {
    // run.c merges the highest-scoring pair first: earlier merges score higher.
    const merged = i - SPECIALS.length - CHARS.length;
    buf.writeFloatLE(merged < 0 ? 0 : -1 - merged, at);
    buf.writeInt32LE(b.length, at + 4);
    b.copy(buf, at + 8);
    at += 8 + b.length;
  }
  return buf;
}

/* ---- cli: train, check the round trip, measure ---- */

/** Plan's final mix by token share (llm_training.md, curriculum). */
const SHARE: Record<number, number> = { 1: 0.1, 2: 0.15, 3: 0.3, 4: 0.45 };
const KEYWORDS = ["int", "char", "struct", "if", "else", "while", "for", "do", "return", "break", "continue", "sizeof", "define"];
const BUILTINS = ["putc", "putn", "puts", "getc", "key", "rand", "vpos", "vput", "vsync", "dpos", "dbank", "dget", "dput", "malloc", "free"];

if (!process.env.VITEST) {
  const argv = process.argv.slice(2);
  const flag = (name: string, fallback: string): string => {
    const i = argv.indexOf(`--${name}`);
    return i >= 0 && argv[i + 1] ? argv[i + 1]! : fallback;
  };
  const files = argv.filter((a, i) => a.endsWith(".jsonl") && !argv[i - 1]?.startsWith("--"));
  const size = Number(flag("vocab", "512"));
  const maxLen = Number(flag("max-len", "7"));
  const mode = flag("mode", "ws") as Mode;
  const hold = flag("hold", "");
  const out = flag("out", `data/corpus/tok/tok${size}.bin`);

  const all = files.flatMap((f) =>
    readFileSync(f, "utf8").trim().split("\n").map((l) => JSON.parse(l) as { id: string; tier: number; text: string }),
  );
  const isHeld = (d: { id: string }) => hold !== "" && d.id.startsWith(hold);
  const held = all.filter(isHeld);
  const pool = all.filter((d) => !isHeld(d));
  const tierChars = new Map<number, number>();
  for (const d of pool) tierChars.set(d.tier, (tierChars.get(d.tier) ?? 0) + d.text.length);
  const docs = pool.map((d) => ({ text: d.text, weight: (1e6 * SHARE[d.tier]!) / tierChars.get(d.tier)! }));

  const t0 = Date.now();
  const v = train(docs, size, maxLen, mode);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, serialize(v));
  console.log(`${v.pieces.length} pieces from ${pool.length} docs in ${((Date.now() - t0) / 1000).toFixed(1)}s → ${out}`);
  if (v.pieces.length < size) console.log(`  *** SHORT: ran out of merges under --max-len; llm.c wants VOCAB = ${size} ***`);
  const odd = new Map<string, number>();
  for (const d of all) for (const c of d.text.match(/[^\n\x20-\x7e]/g) ?? []) odd.set(c, (odd.get(c) ?? 0) + 1);
  if (odd.size)
    console.log(`  off-machine characters mapped: ${[...odd].map(([c, n]) => `${c}→${NORMALIZE[c] ?? "?"} ×${n}`).join(", ")}`);

  // Round trip through the reader the machine's toolchain actually uses.
  const back = loadTokenizer(out, v.pieces.length);
  const cache = new Map<string, number[]>();
  let bad = 0;
  for (const d of all) {
    const ids = encode(v, d.text, cache);
    if (ids.map((t) => pieceText(back.pieces[t]!)).join("") !== normalize(d.text)) bad++;
  }
  console.log(bad ? `ROUND TRIP FAILED on ${bad} docs` : `round trip exact on all ${all.length} docs`);

  const report = (label: string, ds: typeof all) => {
    if (!ds.length) return;
    const ns = ds.map((d) => encode(v, d.text, cache).length + 2).sort((a, b) => a - b);
    const q = (p: number) => ns[Math.min(ns.length - 1, Math.floor(p * ns.length))]!;
    const cpt = ds.reduce((s, d) => s + d.text.length, 0) / ns.reduce((s, n) => s + n - 2, 0);
    console.log(`  ${label.padEnd(26)} n=${String(ns.length).padStart(4)}  ${cpt.toFixed(2)} ch/tok  min ${q(0)}  median ${q(0.5)}  p90 ${q(0.9)}  max ${ns.at(-1)}`);
  };
  console.log(`\nprogram length in tokens, BOS and EOS included:`);
  for (const t of [1, 2, 3, 4]) report(`t${t} pool`, pool.filter((d) => d.tier === t));
  report(`t4 pool, model-written`, pool.filter((d) => d.tier === 4 && !d.id.includes("/synth/")));
  report(`held out, unseen (${hold})`, held);

  // Whole in every context: whatever whitespace leads in, the word is never cut.
  const whole = (w: string) =>
    ["", " ", "\n    ", "\n        "].every((ctx) => {
      const ids = encode(v, ctx + w);
      return v.pieces[ids.at(-1)!]!.endsWith(w);
    });
  const split = [...KEYWORDS, ...BUILTINS].filter((w) => !whole(w));
  console.log(`\nkeywords/builtins cut across tokens: ${split.length ? split.join(" ") : "none"}`);
  console.log(`longest pieces: ${v.pieces.slice(99).sort((a, b) => b.length - a.length).slice(0, 12).map((p) => JSON.stringify(p)).join(" ")}`);
}
