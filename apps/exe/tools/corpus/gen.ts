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
 * - **Resume.** Point it at the same `--out` and it counts what's there,
 *   reloads the pool from it, and carries on.
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

/** llama-server's OpenAI-compatible endpoint, so the model's own chat
    template is applied server-side rather than guessed at here. */
export async function complete(msgs: ReturnType<typeof buildMessages>, o: ModelOpts): Promise<string> {
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
  const body = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const text = body.choices?.[0]?.message?.content;
  if (typeof text !== "string") throw new Error("no content in response");
  return text;
}

/**
 * The program out of the reply. Models fence code even when told not to, and
 * some write a sentence first; both are cheap to forgive and expensive to
 * reject, since the program underneath is usually fine.
 */
export function extract(raw: string): string {
  const blocks = [...raw.matchAll(/```(?:[a-zA-Z]*)\n([\s\S]*?)```/g)].map((m) => m[1]!);
  let text = blocks.length ? blocks[blocks.length - 1]! : raw;
  text = text.replace(/<think>[\s\S]*?<\/think>/g, "");
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
}

export async function run(o: RunOpts): Promise<Produced[]> {
  mkdirSync(dirname(o.out), { recursive: true });
  const uses = new Map<string, number>();
  const pool: Candidate[] = [...GOOD];
  let made = 0;

  // Resume: what's already there counts, and what passed rejoins the pool.
  if (existsSync(o.out))
    for (const line of readFileSync(o.out, "utf8").split("\n")) {
      if (!line.trim()) continue;
      const p = JSON.parse(line) as Produced;
      made++;
      if (p.verdict.ok) pool.push({ id: p.id, tier: p.tier, text: p.text, axes: p.axes });
    }
  if (made) console.log(`resuming: ${made} already done, pool is ${pool.length}`);

  const produced: Produced[] = [];
  // Attempts, not rows: a request the model dropped is not a candidate, and
  // bounding attempts is what bounds the night.
  const target = o.n;
  let issued = made;
  let dead = 0;

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
    let text: string;
    try {
      // The header we asked for goes on whatever came back. A document whose
      // header doesn't match its body teaches that the request is a hint.
      text = stampHeader(extract(await complete(msgs, o)), header);
      dead = 0;
    } catch (e) {
      dead++;
      if (dead >= 5) throw new Error(`the model stopped answering: ${String(e)}`);
      return;
    }

    const id = `t${o.tier}/${kind}/${index}`;
    const cand: Candidate = { id, tier: o.tier, text };
    const row: Produced = {
      ...cand,
      source: parent ? "mutate" : "freestyle",
      header,
      edit,
      parent: parent?.id,
      verdict: verify(cand),
      ms: Date.now() - t0,
    };
    appendFileSync(o.out, `${JSON.stringify(row)}\n`);
    if (row.verdict.ok) {
      pool.push(cand);
      if (o.keep) appendFileSync(o.keep, `${JSON.stringify(cand)}\n`);
    }
    produced.push(row);
    if (produced.length % 25 === 0) report(produced);
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

const report = (rows: readonly Produced[]): void => {
  const kept = rows.filter((r) => r.verdict.ok).length;
  const ms = rows.reduce((n, r) => n + r.ms, 0) / Math.max(1, rows.length);
  console.log(`\n${rows.length} produced, ${kept} kept (${((100 * kept) / rows.length).toFixed(0)}%), ${(ms / 1000).toFixed(1)}s each`);
  for (const [key, count] of histogram(rows.map((r) => r.verdict))) console.log(`  ${String(count).padStart(5)}  ${key}`);
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
    timeoutMs: Number(flag("timeout", "300")) * 1000,
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
