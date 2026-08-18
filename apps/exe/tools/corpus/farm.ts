/**
 * The verify farm: the same graders, across every core.
 *
 *   npx vite-node apps/exe/tools/corpus/farm.ts                     self-test
 *   npx vite-node apps/exe/tools/corpus/farm.ts in.jsonl out.jsonl  a batch
 *
 * One candidate costs a few milliseconds — a whole game of pong is about
 * twenty — so the farm is not here because verification is slow. It is here
 * because generation is the bottleneck and verification should never become
 * one: at a hundred thousand candidates a batch, single-file is most of an
 * hour and this is a few minutes.
 *
 * JSONL in, JSONL out, one `Candidate` and one `Verdict` per line, so the
 * contract holds whatever ends up producing candidates. Rejects are written
 * too. **The histogram is the output that matters** — it is the only signal
 * steering the next batch's prompts, since nothing in this pipeline trains.
 *
 * The self-test is not a nicety. llm_training.md's day-one warning is that a
 * grader which rejects nothing is the failure mode, so the farm can prove
 * itself against `mutants.ts` before a batch runs, and says so out loud.
 */

import { spawn } from "node:child_process";
import { createWriteStream, readFileSync } from "node:fs";
import { availableParallelism } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import "./graders.js";
import { GOOD, MUTANTS } from "./mutants.js";
import { histogram, verify, type Candidate, type Verdict } from "./verify.js";

const HERE = fileURLToPath(import.meta.url);
const ROOT = resolve(dirname(HERE), "../../../..");
/** Deep enough to keep a worker busy, shallow enough that a hundred thousand
    candidates don't all sit in a pipe buffer. */
const DEPTH = 16;

/* ---- worker: JSONL on stdin, JSONL on stdout ---- */

function worker(): void {
  let buf = "";
  process.stdin.setEncoding("utf8");
  process.stdin.on("data", (chunk) => {
    buf += chunk;
    let nl: number;
    while ((nl = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!line) continue;
      const c = JSON.parse(line) as Candidate;
      let v: Verdict;
      try {
        v = verify(c);
      } catch (e) {
        // A grader that throws is a bug, but one candidate must not take the
        // batch down with it — the histogram will say how often it happened.
        v = { id: c.id, tier: c.tier, ok: false, fail: "farm:threw", detail: String(e), chars: c.text.length };
      }
      process.stdout.write(`${JSON.stringify(v)}\n`);
    }
  });
}

/* ---- parent: hand out work, collect verdicts ---- */

async function run(inPath: string, outPath: string, workers: number): Promise<Verdict[]> {
  const queue = readFileSync(inPath, "utf8")
    .split("\n")
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l) as Candidate);
  const total = queue.length;
  const out = createWriteStream(outPath);
  const verdicts: Verdict[] = [];
  let done = 0;

  await Promise.all(
    Array.from({ length: Math.min(workers, total) }, () => {
      const child = spawn(resolve(ROOT, "node_modules/.bin/vite-node"), [HERE, "--worker"], {
        cwd: ROOT,
        stdio: ["pipe", "pipe", "inherit"],
      });
      let inflight = 0;
      let buf = "";
      const feed = (): void => {
        while (inflight < DEPTH && queue.length) {
          child.stdin.write(`${JSON.stringify(queue.shift())}\n`);
          inflight++;
        }
        if (!queue.length && inflight === 0) child.stdin.end();
      };
      child.stdout.setEncoding("utf8");
      child.stdout.on("data", (chunk: string) => {
        buf += chunk;
        let nl: number;
        while ((nl = buf.indexOf("\n")) >= 0) {
          const line = buf.slice(0, nl).trim();
          buf = buf.slice(nl + 1);
          if (!line) continue;
          const v = JSON.parse(line) as Verdict;
          verdicts.push(v);
          out.write(`${line}\n`);
          inflight--;
          done++;
          if (done % 500 === 0) process.stderr.write(`  ${done}/${total}\n`);
        }
        feed();
      });
      feed();
      return new Promise<void>((ok) => child.on("close", () => ok()));
    }),
  );
  out.end();
  return verdicts;
}

/* ---- the self-test: prove the graders before trusting a batch ---- */

function selftest(): number {
  let bad = 0;
  console.log("known good — every one of these has to pass:");
  for (const c of GOOD) {
    const v = verify(c);
    if (!v.ok) bad++;
    console.log(
      `  ${v.ok ? "pass" : "FAIL"}  ${c.id.padEnd(14)} t${c.tier} ${String(v.words ?? "-").padStart(5)}w  ` +
        `${v.fail ?? JSON.stringify(v.notes ?? {})}`,
    );
  }
  console.log("\nmutants — every one has to fail, with the key it was built to earn:");
  for (const m of MUTANTS) {
    const v = verify(m);
    const right = !v.ok && v.fail === m.expectFail;
    if (!right) bad++;
    console.log(
      `  ${right ? "ok  " : "MISS"}  ${m.id.padEnd(14)} want ${m.expectFail.padEnd(18)} got ${String(v.fail).padEnd(18)} ${m.why}`,
    );
  }
  console.log(bad === 0 ? "\nthe graders can tell the difference." : `\n${bad} wrong.`);
  return bad;
}

const argv = process.argv.slice(2);
if (argv.includes("--worker")) {
  worker();
} else if (argv.filter((a) => !a.startsWith("-")).length >= 2) {
  const [inPath, outPath] = argv.filter((a) => !a.startsWith("-"));
  const n = Number(argv.find((a) => a.startsWith("--workers="))?.slice(10)) || Math.max(1, availableParallelism() - 2);
  const t0 = Date.now();
  const vs = await run(inPath!, outPath!, n);
  const passed = vs.filter((v) => v.ok).length;
  console.log(`\n${vs.length} candidates, ${passed} kept (${((100 * passed) / vs.length).toFixed(1)}%), ${((Date.now() - t0) / 1000).toFixed(1)}s on ${n} workers`);
  console.log("\nhistogram:");
  for (const [key, count] of histogram(vs)) console.log(`  ${String(count).padStart(6)}  ${key}`);
} else {
  process.exit(selftest() === 0 ? 0 : 1);
}
