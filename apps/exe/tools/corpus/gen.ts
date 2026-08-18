/**
 * The generator: llama.cpp on one side, the graders on the other, running
 * unattended. Phase 3, station 1 (llm_training.md).
 *
 *   npx vite-node apps/exe/tools/corpus/gen.ts --tier 4 --dry
 *   npx vite-node apps/exe/tools/corpus/gen.ts --tier 4 --n 200
 *   npx vite-node apps/exe/tools/corpus/gen.ts --tier 4 --n 4000 --slots 8
 *
 * Verification is inline rather than a second pass through `farm.ts`,
 * because the two costs aren't comparable: a candidate takes the model
 * fifteen seconds and the graders five milliseconds. Shelling out to the
 * farm during generation would buy parallelism nothing needs. The farm is
 * for re-grading a pool after a grader changes; this is for making one.
 *
 * What "unattended" actually demands, all of it learned the boring way:
 *
 * - **Append and flush per candidate.** A crash at 3am costs one program,
 *   not the night. The raw log holds rejects too — the histogram is the
 *   only thing steering the next batch.
 * - **A hard token cap.** A model that runs away producing eight thousand
 *   tokens for one program eats hours. `--max-tokens` is a budget, not a
 *   limit on ambition.
 * - **Thinking off by default.** A reasoning model will happily spend two
 *   thousand tokens deciding how to write pong, every time, all night.
 * - **Give up on a dead server.** Five consecutive failures stops the run,
 *   rather than writing four thousand `gen:unreachable` rows by morning.
 * - **Resume.** Point it at the same `--out` and it reloads the pool and the
 *   shot ration from it and carries on. `--n` is *how many more to attempt*,
 *   not a total to top up to: it bounds the model time this invocation is
 *   allowed to spend, which is the thing you actually schedule.
 */

import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";
import "./graders.js";
import { GOOD } from "./mutants.js";
import { buildMessages, EDITS, HEADERS, pickShots, renderMessages, stampHeader } from "./prompt.js";
import { histogram, verify, type Candidate, type Tier, type Verdict } from "./verify.js";

/** One row of the raw log: the candidate, how it was asked for, and what the
    machine made of it. */
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
  /** "length" means the token cap cut it off mid-program. Dropping this on
      the floor is how a batch reports `v0:syntax` all night when the actual
      cause was `--max-tokens` — and the V0 histogram is exactly the number
      that decides whether to build a host-side grammar. */
  finish: string;
  tokens: number;
}

/**
 * Is the server alive, or merely slow?
 *
 * This exists because the slots do not fail independently. `-np 8` decodes
 * all eight streams in one batch, so requests issued together finish
 * together and get slower together — one uniformly slow batch crosses the
 * timeout in all eight slots within seconds, and a counter of *consecutive*
 * failures reads that single event as eight. Without this, a busy server
 * ends the night; with it, only a server that has stopped answering does.
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

/** llama-server's OpenAI-compatible endpoint, so the model's own chat
    template is applied server-side rather than guessed at here. */
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

/**
 * The program out of the reply. Models fence code even when told not to, and
 * some write a sentence first; both are cheap to forgive and expensive to
 * reject, since the program underneath is usually fine.
 */
export function extract(raw: string): string {
  // Thinking comes off first: a reasoning model that drafts code inside
  // <think> and then answers unfenced would otherwise hand over the draft.
  const clean = raw.replace(/<think>[\s\S]*?<\/think>/g, "");
  const blocks = [...clean.matchAll(/```(?:[a-zA-Z]*)\n([\s\S]*?)```/g)].map((m) => m[1]!);
  // Not the last block — the common shape is the program and then a second
  // fence holding "sample output" or a note. The longest one holding a
  // main() is the program.
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
  /** How long to wait after a timeout the server survived. Real value is
      seconds; the test wants milliseconds. */
  backoffMs?: number;
}

export async function run(o: RunOpts): Promise<Produced[]> {
  mkdirSync(dirname(o.out), { recursive: true });
  if (o.keep) mkdirSync(dirname(o.keep), { recursive: true });
  const uses = new Map<string, number>();
  const pool: Candidate[] = [...GOOD];
  let made = 0;

  // Resume: what's already there counts, what passed rejoins the pool, and
  // the shot ration carries over rather than restarting. Ids come off the
  // highest index on disk and not the row count — a request the model
  // dropped consumes an index without writing a row, so counting rows would
  // re-issue ids that already exist, and the id is the provenance key.
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
  // Attempts, not rows: a request the model dropped is not a candidate, and
  // bounding attempts is what bounds the night.
  const target = o.n;
  let issued = highest + 1;
  /** Consecutive replies the server failed to give at all. */
  let dead = 0;
  /** Consecutive replies the token cap cut off. A different failure with a
      different fix, so a different counter and a different message — being
      told "the model stopped answering" when it answered eight times and
      was cut off eight times sends you to the wrong knob. */
  let clipped = 0;
  /** Timeouts against a server that answered /health. Not fatal, but the
      number belongs in the morning's report. */
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
        // Slow, not gone. Backing off matters here: undici drops the socket
        // when the deadline fires, and whether llama-server frees that slot
        // promptly is a property of the build — re-issuing instantly can
        // queue the next request behind the leftover and time out again.
        slow++;
        await new Promise((ok) => setTimeout(ok, o.backoffMs ?? 5_000));
        return;
      }
      dead++;
      if (dead >= 5)
        throw new Error(`the model stopped answering (${timedOut(e) ? "timeout" : "connection"}): ${String(e)}`);
      return;
    }

    // The header we asked for goes on whatever came back. A document whose
    // header doesn't match its body teaches that the request is a hint.
    const text = stampHeader(extract(reply.text), header);
    const id = `t${o.tier}/${kind}/${index}`;
    const cand: Candidate = { id, tier: o.tier, text };
    const base = { ...cand, source: (parent ? "mutate" : "freestyle") as Produced["source"], header, edit, parent: parent?.id };
    const chars = text.length;

    // Two failures that are the harness's and not the program's, kept out of
    // the V0/V1/V2 buckets so they can't be mistaken for bad C. Truncation
    // would read as `v0:syntax`, which is the number that decides whether to
    // build a grammar; emptiness would read as `v0:other` four thousand
    // times over, which is what a model whose whole budget went into
    // `reasoning_content` produces, silently, all night.
    const harness =
      reply.finish === "length"
        ? "gen:truncated"
        : !text.includes("main(") || chars < 60
          ? "gen:empty"
          : null;
    // A reply that arrived empty is as useless as one that never arrived, so
    // it shares `dead`. Truncation gets its own counter: the server is
    // answering and the knob is --max-tokens.
    if (harness === "gen:empty") {
      dead++;
      if (dead >= 5) throw new Error("the model answered five times with nothing");
    } else dead = 0;
    if (harness === "gen:truncated") {
      clipped++;
      // Lower than it looks like it should be, because the false-positive
      // rate is zero: a truncated reply buys no candidate by construction,
      // so eight in a row is eight requests that bought nothing, and there
      // is no healthy run where that is acceptable.
      if (clipped >= 8) throw new Error("eight replies in a row were cut off — raise --max-tokens");
    } else clipped = 0;

    let verdict: Verdict;
    if (harness) verdict = { id, tier: o.tier, ok: false, fail: harness, chars, detail: reply.finish };
    else
      try {
        verdict = verify(cand);
      } catch (e) {
        // farm.ts made this call already: a grader that throws is a bug, but
        // one candidate must not take the night down with it.
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

  // Reserve before working, not after. Checking `produced.length` at the top
  // of the loop lets every slot pass the check at target-1 and overshoot by
  // one apiece, which is harmless at four and untidy at four thousand.
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
  // The streak counter catches "truncates always" and is blind to
  // "truncates a third of the time" — which is the likelier state and the
  // one that looks fine in the morning, because there *is* a corpus, just a
  // smaller one than the throughput bought. The rate is free, so say it
  // loudly rather than leaving it to be inferred from a missing third.
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

// vite-node hands the script its flags but puts its own binary in argv[1],
// so the usual "am I the entry" check can't work. The only importer that must
// not run the CLI is the test, and it announces itself.
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
