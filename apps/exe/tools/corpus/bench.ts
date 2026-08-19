/**
 * Measure llama-server before trusting it with a night. Phase 3, station 3's
 * first pre-flight (llm_training.md): single-stream decode is known (6–9
 * tok/s on the Q6), aggregate across slots is not, and every number in the
 * generation budget rests on the aggregate.
 *
 *   llama-server -m ~/ai/models/gguf/Qwen3.8-27B-UD-Q6_K_XL.gguf -np 8 -c 49152
 *   npx vite-node apps/exe/tools/corpus/bench.ts --requests 16 --concurrency 8
 *
 * It sends the real tier-4 mutate prompt — c.txt, the fence, a parent pong,
 * the shots — because throughput against "hi" measures nothing: prompt
 * processing and KV pressure are most of what changes when eight slots run
 * at once. It also does the n_ctx arithmetic the plan warns about
 * (per-slot context is n_ctx / slots, and a tier-4 prompt plus generation
 * wants ~5.5K of it), since that misconfiguration fails the night at
 * request one and costs nothing to catch here.
 */

import "./graders.js";
import { GOOD } from "./mutants.js";
import { buildMessages, EDITS, HEADERS, pickShots } from "./prompt.js";
import type { Tier } from "./verify.js";

const flag = (name: string, fallback: string): string => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1]! : fallback;
};

const url = flag("url", "http://127.0.0.1:8080");
const requests = Number(flag("requests", "16"));
const concurrency = Number(flag("concurrency", "8"));
const maxTokens = Number(flag("max-tokens", "1400"));
const timeoutMs = Number(flag("timeout", "900")) * 1000;

// The steady-state prompt: a tier-4 mutation with two shots. Seeded from
// GOOD the way a fresh run is; by 4am the parents are model-written and
// longer, so treat the measurement as a floor, not a promise.
const tier: Tier = 4;
const rr = ((): (() => number) => {
  let s = 42;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) % 1_000_003) / 1_000_003;
  };
})();
const parent = GOOD.find((c) => c.tier === tier)!;
const msgs = buildMessages({
  tier,
  kind: "mutate",
  header: HEADERS[tier][0]!,
  shots: pickShots(GOOD, tier, 2, rr, new Map(), 40, parent.id),
  parent,
  edit: EDITS[tier][0],
});

interface Usage {
  prompt_tokens?: number;
  completion_tokens?: number;
}

async function one(): Promise<{ ms: number; usage: Usage }> {
  const t0 = Date.now();
  const res = await fetch(`${url}/v1/chat/completions`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      model: "local",
      messages: msgs.map((m, i) => (i === 0 ? { ...m, content: `${m.content}\n\n/no_think` } : m)),
      temperature: 0.8,
      max_tokens: maxTokens,
      stream: false,
    }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`${res.status} ${await res.text().catch(() => "")}`.slice(0, 200));
  const body = (await res.json()) as { usage?: Usage };
  return { ms: Date.now() - t0, usage: body.usage ?? {} };
}

const health = await fetch(`${url}/health`, { signal: AbortSignal.timeout(5_000) }).catch(() => null);
if (!health?.ok) {
  console.error(`no llama-server at ${url} — start it first:\n` +
    `  llama-server -m ~/ai/models/gguf/Qwen3.8-27B-UD-Q6_K_XL.gguf -np 8 -c 49152`);
  process.exit(1);
}

console.log(`${requests} requests, ${concurrency} at a time, cap ${maxTokens} tokens, against ${url}\n`);

const results: { ms: number; usage: Usage }[] = [];
const t0 = Date.now();
let issued = 0;
await Promise.all(
  Array.from({ length: concurrency }, async () => {
    while (issued < requests) {
      issued++;
      const n = issued;
      const r = await one();
      results.push(r);
      console.log(
        `  ${String(n).padStart(3)}: ${(r.ms / 1000).toFixed(1)}s, ` +
          `${r.usage.prompt_tokens ?? "?"} prompt + ${r.usage.completion_tokens ?? "?"} out`,
      );
    }
  }),
);
const wall = (Date.now() - t0) / 1000;

const outTok = results.reduce((n, r) => n + (r.usage.completion_tokens ?? 0), 0);
const promptTok = results[0]?.usage.prompt_tokens ?? 0;
const perReq = outTok / results.length;
const aggregate = outTok / wall;
const perNight = Math.floor((aggregate * 8 * 3600) / Math.max(perReq, 1));

console.log(`\n${results.length} replies in ${wall.toFixed(0)}s`);
console.log(`aggregate ${aggregate.toFixed(1)} tok/s across ${concurrency} streams (${(aggregate / concurrency).toFixed(1)} per stream)`);
console.log(`~${perReq.toFixed(0)} tokens a candidate → ~${perNight} candidates in an 8-hour night, before rejects`);
console.log(`\nthe context arithmetic: this prompt is ${promptTok} tokens, plus ${maxTokens} generated,`);
console.log(`so ${concurrency} slots want n_ctx ≥ ${(promptTok + maxTokens) * concurrency} — and the steady-state`);
console.log(`prompt grows as model-written parents replace the seeds, so leave headroom.`);
