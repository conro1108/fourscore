/**
 * Grade a directory of hand-delivered `.c` files: the stand-in for gen.ts
 * when the "model" is an agent writing files rather than llama-server.
 *   npx vite-node apps/exe/tools/corpus/dir.ts <dir> --tier N [--source mutate|freestyle] [--model name]
 * Prints a verdict per file and the histogram; writes <dir>/raw.jsonl (every
 * file, with its verdict) and <dir>/verified.jsonl (the keepers), both in
 * gen.ts's row shape so they pool with its output. Re-running regrades all.
 */

import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import "./graders.js";
import { histogram, verify, type Tier, type Verdict } from "./verify.js";

const argv = process.argv.slice(2);
const flag = (name: string, fallback: string): string => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] ? argv[i + 1]! : fallback;
};
const dir = argv.find((a, i) => !a.startsWith("--") && !argv[i - 1]?.startsWith("--"));
if (!dir) throw new Error("usage: dir.ts <dir> --tier N");
const tier = Number(flag("tier", "4")) as Tier;
const source = flag("source", "freestyle");
const model = flag("model", "unknown");

const files = readdirSync(dir).filter((f) => f.endsWith(".c")).sort();
const rows = files.map((f) => {
  const text = readFileSync(join(dir, f), "utf8");
  const id = `t${tier}/${basename(dir)}/${f.replace(/\.c$/, "")}`;
  let verdict: Verdict;
  try {
    verdict = verify({ id, tier, text });
  } catch (e) {
    verdict = { id, tier, ok: false, fail: "farm:threw", detail: String(e), chars: text.length };
  }
  const header = text.split("\n")[0]!;
  console.log(`  ${verdict.ok ? "keep" : "REJ "}  ${f.padEnd(24)} ${verdict.fail ?? ""} ${verdict.ok ? "" : (verdict.detail ?? "").slice(0, 120)}`);
  return { id, tier, text, source, header, model, verdict };
});

const kept = rows.filter((r) => r.verdict.ok);
writeFileSync(join(dir, "raw.jsonl"), rows.map((r) => JSON.stringify(r)).join("\n") + (rows.length ? "\n" : ""));
writeFileSync(join(dir, "verified.jsonl"), kept.map((r) => JSON.stringify(r)).join("\n") + (kept.length ? "\n" : ""));
console.log(`\n${rows.length} files, ${kept.length} kept`);
for (const [key, n] of histogram(rows.map((r) => r.verdict))) console.log(`  ${String(n).padStart(4)}  ${key}`);
