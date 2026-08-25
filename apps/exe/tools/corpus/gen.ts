/**
 * The unattended generator: llama-server on one side, the graders inline on
 * the other (verification is ms, generation is seconds). See corpus_howto.md.
 *   npx vite-node apps/exe/tools/corpus/gen.ts --tier 4 --dry | --n 200 | --n 4000 --slots 8
 * Appends and flushes per candidate (rejects too); thinking is off by default;
 * five consecutive dead replies stop the run. Re-running with the same --out
 * resumes: `--n` is how many more to *attempt*, not a total.
 */

import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";
import "./graders.js";
import { GOOD } from "./mutants.js";
import { buildMessages, EDITS, HEADERS, pickShots, renderMessages, stampHeader } from "./prompt.js";
import { histogram, verify, type Candidate, type Tier, type Verdict } from "./verify.js";

/** One row of the raw log. */
export interface Produced extends Candidate {
  source: "freestyle" | "mutate";
  header: string;
  edit?: string;
  parent?: string;
  verdict: Verdict;
  ms: number;
  tokens: number;
}

/* ---- the model ---- */

export interface ModelOpts {
  url: string;
  model: string;
  maxTokens: number;
  timeoutMs: number;
  temperature: number;
  think: boolean;
}

export interface Reply {
  text: string;
  /** "length" = token cap cut it off. Must not be dropped, or truncation
      reads as `v0:syntax` all night. */
  finish: string;
  tokens: number;
}

/**
 * Alive, or merely slow? Slots don't fail independently: `-np 8` decodes all
 * streams in one batch, so one slow batch times out in all eight slots at
 * once and would read as eight consecutive failures.
 */
async function alive(url: string): Promise<boolean> {
  try {
    const res = await fetch(`${url}/health`, { signal: AbortSignal.timeout(5_000) });
    return res.ok;
  } catch {
    return false;
  }
}

const timedOut = (e: unknown): boolean =>
  e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError");

/** llama-server's OpenAI-compatible endpoint (chat template applied server-side). */
export async function complete(msgs: ReturnType<typeof buildMessages>, o: ModelOpts): Promise<Reply> {
  const messages = o.think
    ? msgs
    : msgs.map((m, i) => (i === 0 ? { ...m, content: `${m.content}\n\n/no_think` } : m));
  const res = await fetch(`${o.url}/v1/chat/completions`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      model: o.model,
      messages,
      temperature: o.temperature,
      max_tokens: o.maxTokens,
      stream: false,
    }),
    signal: AbortSignal.timeout(o.timeoutMs),
  });
  if (!res.ok) throw new Error(`${res.status} ${await res.text().catch(() => "")}`.slice(0, 200));
  const body = (await res.json()) as {
    choices?: { message?: { content?: string }; finish_reason?: string }[];
    usage?: { completion_tokens?: number };
  };
  const text = body.choices?.[0]?.message?.content;
  if (typeof text !== "string") throw new Error("no content in response");
  return {
    text,
    finish: body.choices?.[0]?.finish_reason ?? "stop",
    tokens: body.usage?.completion_tokens ?? 0,
  };
}

/** The program out of the reply: forgives fences and a leading sentence. */
export function extract(raw: string): string {
  // Strip <think> first, or an unfenced answer hands over the draft inside it.
  const clean = raw.replace(/<think>[\s\S]*?<\/think>/g, "");
  const blocks = [...clean.matchAll(/```(?:[a-zA-Z]*)\n([\s\S]*?)```/g)].map((m) => m[1]!);
  // Not the last block (often "sample output"): longest block with main().
  const withMain = blocks.filter((b) => b.includes("main("));
  let text = [...(withMain.length ? withMain : blocks)].sort((a, b) => b.length - a.length)[0] ?? clean;
  const start = text.indexOf("/*");
  if (start > 0) text = text.slice(start);
  return `${text.trim()}\n`;
}

/* ---- the run ---- */

const rng = (seed: number): (() => number) => {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) % 1_000_003) / 1_000_003;
  };
};

const pickOf = <T,>(xs: readonly T[], r: () => number): T => xs[Math.floor(r() * xs.length)]!;

export interface RunOpts extends ModelOpts {
  tier: Tier;
  n: number;
  kind: "freestyle" | "mutate" | "mix";
  slots: number;
  shots: number;
  seed: number;
  out: string;
  keep?: string;
  /** Wait after a timeout the server survived (seconds for real; ms in tests). */
  backoffMs?: number;
}

export async function run(o: RunOpts): Promise<Produced[]> {
  mkdirSync(dirname(o.out), { recursive: true });
  if (o.keep) mkdirSync(dirname(o.keep), { recursive: true });
  const uses = new Map<string, number>();
  const pool: Candidate[] = [...GOOD];
  let made = 0;

  // Resume. Ids come off the highest index on disk, not the row count: a
  // dropped request consumes an index without a row, and the id is the
  // provenance key.
  let highest = -1;
  if (existsSync(o.out))
    for (const line of readFileSync(o.out, "utf8").split("\n")) {
      if (!line.trim()) continue;
      const p = JSON.parse(line) as Produced;
      made++;
      highest = Math.max(highest, Number(p.id.split("/").at(-1)) || 0);
      if (p.verdict.ok) pool.push({ id: p.id, tier: p.tier, text: p.text, axes: p.axes });
      for (const shown of [p.parent].filter(Boolean) as string[])
        uses.set(shown, (uses.get(shown) ?? 0) + 1);
    }
  if (made) console.log(`resuming: ${made} already done, pool is ${pool.length}`);

  const produced: Produced[] = [];
  // Attempts, not rows: bounding attempts is what bounds the night.
  const target = o.n;
  let issued = highest + 1;
  /** Consecutive replies the server failed to give at all. */
  let dead = 0;
  /** Consecutive replies the token cap cut off — a different knob than `dead`. */
  let clipped = 0;
  /** Timeouts against a server that answered /health. Not fatal; reported. */
  let slow = 0;

  const one = async (index: number): Promise<void> => {
    const r = rng(o.seed * 1_000_003 + index);
    const kind = o.kind === "mix" ? (r() < 0.75 ? "mutate" : "freestyle") : o.kind;
    const header = pickOf(HEADERS[o.tier], r);
    const sameTier = pool.filter((c) => c.tier === o.tier);
    const parent = kind === "mutate" && sameTier.length ? pickOf(sameTier, r) : undefined;
    const edit = parent ? pickOf(EDITS[o.tier], r) : undefined;
    const shots = pickShots(pool, o.tier, o.shots, r, uses, 40, parent?.id);
    const msgs = buildMessages({ tier: o.tier, kind: parent ? "mutate" : "freestyle", header, shots, parent, edit });

    const t0 = Date.now();
    let reply: Reply;
    try {
      reply = await complete(msgs, o);
    } catch (e) {
      if (timedOut(e) && (await alive(o.url))) {
        // Slow, not gone. Back off: undici drops the socket on timeout and
        // llama-server may not free the slot promptly; re-issuing instantly
        // can queue behind the leftover and time out again.
        slow++;
        await new Promise((ok) => setTimeout(ok, o.backoffMs ?? 5_000));
        return;
      }
      dead++;
      if (dead >= 5)
        throw new Error(`the model stopped answering (${timedOut(e) ? "timeout" : "connection"}): ${String(e)}`);
      return;
    }

    // Stamp the requested header: header/body mismatch teaches the request is a hint.
    const text = stampHeader(extract(reply.text), header);
    const id = `t${o.tier}/${kind}/${index}`;
    const cand: Candidate = { id, tier: o.tier, text };
    const base = { ...cand, source: (parent ? "mutate" : "freestyle") as Produced["source"], header, edit, parent: parent?.id };
    const chars = text.length;

    // Harness failures, kept out of the V0/V1/V2 buckets: truncation would
    // read as `v0:syntax`, emptiness (budget spent in reasoning_content) as `v0:other`.
    const harness =
      reply.finish === "length"
        ? "gen:truncated"
        : !text.includes("main(") || chars < 60
          ? "gen:empty"
          : null;
    // Empty shares `dead`; truncation has its own counter (knob is --max-tokens).
    if (harness === "gen:empty") {
      dead++;
      if (dead >= 5) throw new Error("the model answered five times with nothing");
    } else dead = 0;
    if (harness === "gen:truncated") {
      clipped++;
      // Eight is enough: a truncated reply buys no candidate by construction.
      if (clipped >= 8) throw new Error("eight replies in a row were cut off — raise --max-tokens");
    } else clipped = 0;

    let verdict: Verdict;
    if (harness) verdict = { id, tier: o.tier, ok: false, fail: harness, chars, detail: reply.finish };
    else
      try {
        verdict = verify(cand);
      } catch (e) {
        // A throwing grader is a bug, but must not take the night down.
        verdict = { id, tier: o.tier, ok: false, fail: "gen:threw", detail: String(e), chars };
      }

    const row: Produced = { ...base, verdict, ms: Date.now() - t0, tokens: reply.tokens };
    appendFileSync(o.out, `${JSON.stringify(row)}\n`);
    if (row.verdict.ok) {
      pool.push(cand);
      if (o.keep) appendFileSync(o.keep, `${JSON.stringify(cand)}\n`);
    }
    produced.push(row);
    if (produced.length % 25 === 0) report(produced, slow);
  };

  // Reserve before working, or every slot passes the check at target-1 and overshoots.
  let taken = 0;
  const worker = async (): Promise<void> => {
    while (taken < target) {
      taken++;
      await one(issued++);
    }
  };
  await Promise.all(Array.from({ length: o.slots }, worker));
  return produced;
}

const report = (rows: readonly Produced[], slow = 0): void => {
  if (!rows.length) return void console.log("\nnothing produced");
  const kept = rows.filter((r) => r.verdict.ok).length;
  const ms = rows.reduce((n, r) => n + r.ms, 0) / rows.length;
  const tok = rows.reduce((n, r) => n + r.tokens, 0);
  const rate = tok / (rows.reduce((n, r) => n + r.ms, 0) / 1000);
  console.log(
    `\n${rows.length} produced, ${kept} kept (${((100 * kept) / rows.length).toFixed(0)}%), ` +
      `${(ms / 1000).toFixed(1)}s each` +
      (tok ? `, ${(tok / rows.length).toFixed(0)} tokens each at ${rate.toFixed(1)} tok/s per slot` : ""),
  );
  for (const [key, count] of histogram(rows.map((r) => r.verdict))) console.log(`  ${String(count).padStart(5)}  ${key}`);
  if (slow) console.log(`  ${String(slow).padStart(5)}  timed out against a server that was still answering /health`);
  // The streak counter is blind to "truncates a third of the time"; the rate isn't.
  const recent = rows.slice(-100);
  const cut = recent.filter((r) => r.verdict.fail === "gen:truncated").length;
  if (cut / recent.length > 0.2)
    console.log(`\n  *** ${((100 * cut) / recent.length).toFixed(0)}% of the last ${recent.length} were cut off. RAISE --max-tokens. ***`);
};

/* ---- cli ---- */

const flag = (name: string, fallback: string): string => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1]! : fallback;
};
const has = (name: string): boolean => process.argv.includes(`--${name}`);

// vite-node puts its own binary in argv[1], so the "am I the entry" check
// can't work; the test is the only importer and announces itself.
if (!process.env.VITEST) {
  const tier = Number(flag("tier", "4")) as Tier;
  const opts: RunOpts = {
    tier,
    n: Number(flag("n", "50")),
    kind: flag("kind", "mix") as RunOpts["kind"],
    slots: Number(flag("slots", "4")),
    shots: Number(flag("shots", "2")),
    seed: Number(flag("seed", "1")),
    out: flag("out", `data/corpus/raw/t${tier}.jsonl`),
    keep: flag("keep", `data/corpus/verified/t${tier}.jsonl`),
    url: flag("url", "http://127.0.0.1:8080"),
    model: flag("model", "local"),
    maxTokens: Number(flag("max-tokens", "1400")),
    timeoutMs: Number(flag("timeout", "900")) * 1000,
    temperature: Number(flag("temperature", "0.8")),
    think: has("think"),
  };

  if (has("dry")) {
    const r = rng(opts.seed);
    const parent = has("freestyle") ? undefined : GOOD.find((c) => c.tier === tier);
    console.log(
      renderMessages(
        buildMessages({
          tier,
          kind: parent ? "mutate" : "freestyle",
          header: HEADERS[tier][0]!,
          shots: pickShots(GOOD, tier, opts.shots, r, new Map(), 40, parent?.id),
          parent,
          edit: parent ? EDITS[tier][0] : undefined,
        }),
      ),
    );
  } else {
    mkdirSync(dirname(opts.keep!), { recursive: true });
    const t0 = Date.now();
    const rows = await run(opts);
    report(rows);
    console.log(`\n${((Date.now() - t0) / 60_000).toFixed(1)} minutes on ${opts.slots} slots → ${opts.out}`);
  }
}
