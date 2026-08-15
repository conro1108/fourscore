/**
 * Replay real games and print what the fever curve actually does — the eyes
 * for `director.ts`, which unit tests can only check in the abstract.
 *
 * The eval is computed exactly as `engine/worker.ts` computes it live, and the
 * plies are spaced at real wall-clock rates, so the tier timeline this prints
 * is the one a player gets. `npm run trace` in apps/exe.
 *
 *   TUNE=candidate GAMES=6 npx tsx tools/trace.ts     sweep a shape
 *   VERBOSE=1                                          every ply
 */
import {
  BALANCED_WEIGHTS,
  BotBrain,
  Match,
  Position,
  advantageOf,
  byId,
  estimateDepth,
  searchHeuristic,
  variantById,
} from "@fourscore/engine";
import { makeDirector, tierOf } from "../src/director.js";

const variant = variantById(process.env.VARIANT ?? "connect4");

const mulberry = (seed: number) => () => {
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

function evalOf(history: readonly number[]): { advantage: number; source: "proven" | "estimated" } {
  const m = Match.fromMoves(history, variant);
  if (m.status === "won") return { advantage: m.winner === "red" ? 1 : -1, source: "proven" };
  if (m.status === "draw") return { advantage: 0, source: "proven" };
  const p = Position.fromMoves(history, variant);
  const r = searchHeuristic(p, estimateDepth(history.length), BALANCED_WEIGHTS, 150_000);
  return { advantage: advantageOf(r.best, p.turn === "red", "estimated", variant), source: "estimated" };
}

/** Wall-clock seconds a ply costs live: you think, then the bot performs. */
const HUMAN_PLY_S = Number(process.env.HUMAN ?? 4);
const BOT_PLY_S = Number(process.env.BOT ?? 2.5);
const GAMES = Number(process.env.GAMES ?? 6);
const VERBOSE = !!process.env.VERBOSE;

const botId = process.env.BOT_ID ?? "moss";
const oppId = process.env.OPP_ID ?? "pebble"; // stands in for the human

const totals = { plies: 0, beats: {} as Record<string, number> };
const tierTotals: Record<number, number> = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0 };
const peaks: number[] = [];

for (let game = 0; game < GAMES; game++) {
  const you = new BotBrain(byId(oppId)!, mulberry(1000 + game));
  const them = new BotBrain(byId(botId)!, mulberry(2000 + game));
  const match = new Match(variant);
  const d = makeDirector();
  d.event("newGame");

  const rows: string[] = [];
  let t = 0;
  let peak = 0;
  const tierTime: Record<number, number> = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0 };
  const crossings: string[] = [];
  let lastTier = 0;

  const stepFor = (seconds: number): void => {
    for (let i = 0; i < Math.round(seconds / 0.5); i++) {
      d.step(0.5);
      t += 0.5;
      const s = d.snapshot();
      peak = Math.max(peak, s.fever);
      tierTime[s.tier] = (tierTime[s.tier] ?? 0) + 0.5;
      tierTotals[s.tier] = (tierTotals[s.tier] ?? 0) + 0.5;
      if (s.tier !== lastTier) {
        crossings.push(`${lastTier}->${s.tier}@${t.toFixed(0)}s`);
        lastTier = s.tier;
      }
      for (const b of d.takeBeats?.() ?? []) {
        const key = b.kind === "move" ? `move:${b.grade}` : b.kind === "threat" ? `threat:${b.by}` : `${b.kind}:${b.direction ?? ""}`;
        totals.beats[key] = (totals.beats[key] ?? 0) + 1;
      }
    }
  };

  while (match.status === "playing") {
    const red = match.history.length % 2 === 0;
    const col = (red ? you : them).decide(match.position).col;
    match.play(col);
    totals.plies++;
    const p = match.position;
    const threats = match.status === "playing" ? p.legalMoves().filter((c) => p.isWinningMove(c)).length : 0;
    d.feedPly?.({ mover: red ? "you" : "bot", threats });
    const { advantage, source } = evalOf(match.history);
    d.feedEval(advantage, match.history.length, variant.cells, source);
    stepFor(red ? HUMAN_PLY_S : BOT_PLY_S);
    const s = d.snapshot();
    rows.push(
      `  ply ${String(match.history.length).padStart(2)} t=${String(t.toFixed(0)).padStart(3)}s  adv=${advantage.toFixed(3).padStart(6)}  thr=${threats}  fever=${s.fever.toFixed(3)}  tier ${s.tier}`,
    );
  }

  peaks.push(peak);
  console.log(
    `=== game ${game}: ${match.status}${match.status === "won" ? ` (${match.winner})` : ""}, ${match.history.length} plies, ${t.toFixed(0)}s`,
  );
  if (VERBOSE) for (const r of rows) console.log(r);
  console.log(
    `  peak ${peak.toFixed(2)} (t${tierOf(peak)}) | per tier: ` +
      [0, 1, 2, 3, 4].map((n) => `t${n}=${(tierTime[n] ?? 0).toFixed(0)}s`).join(" ") +
      ` | ${crossings.join(" ") || "no crossings"}`,
  );
}

const totalTime = Object.values(tierTotals).reduce((a, b) => a + b, 0);
console.log(`\n---- over ${GAMES} games, ${totals.plies} plies ----`);
console.log(
  "tier share: " +
    [0, 1, 2, 3, 4]
      .map((n) => `t${n}=${((100 * (tierTotals[n] ?? 0)) / totalTime).toFixed(0)}%`)
      .join(" "),
);
console.log(`mean peak ${(peaks.reduce((a, b) => a + b, 0) / peaks.length).toFixed(2)}`);
const beatKeys = Object.keys(totals.beats).sort();
if (beatKeys.length)
  console.log(
    "beats/ply: " +
      beatKeys.map((k) => `${k}=${((100 * totals.beats[k]!) / totals.plies).toFixed(1)}%`).join(" "),
  );
