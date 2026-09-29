/**
 * How often, and how fast, can `prove` call a stuck hand dead? Plays random
 * deals with a greedy random policy until nothing but draws remains for a
 * full pass, then asks. Usage: npx vite-node tools/soldead.ts [deals]
 */
import { deal, drawFromStock, canFoundation, canStackTableau, cloneState, type SolState } from "../src/games/solstate.js";
import { prove } from "../src/games/solreview.js";

const seeded = (seed: number) => {
  let v = seed;
  return (): number => ((v = (v * 48271) % 2147483647) / 2147483647);
};

/** One random productive-ish move, or null. Never undoes itself. */
function randomMove(s: SolState, rnd: () => number): boolean {
  const opts: (() => void)[] = [];
  const w = s.waste[s.waste.length - 1];
  if (w) {
    if (canFoundation(w, s.found[w.suit]!)) opts.push(() => s.found[w.suit]!.push(s.waste.pop()!));
    s.tab.forEach((t, i) => {
      const top = t.up[t.up.length - 1] ?? null;
      if ((top || !t.down.length) && canStackTableau(w, top)) opts.push(() => s.tab[i]!.up.push(s.waste.pop()!));
    });
  }
  s.tab.forEach((t, i) => {
    const top = t.up[t.up.length - 1];
    if (!top) return;
    const flip = () => { if (!t.up.length && t.down.length) t.up.push(t.down.pop()!); };
    if (canFoundation(top, s.found[top.suit]!)) opts.push(() => { s.found[top.suit]!.push(t.up.pop()!); flip(); });
    // whole run only, and only off face-down cards (a shuffle for its own sake loops)
    if (t.down.length) {
      const head = t.up[0]!;
      s.tab.forEach((u, k) => {
        if (k === i) return;
        const ut = u.up[u.up.length - 1] ?? null;
        if ((ut || !u.down.length) && canStackTableau(head, ut))
          opts.push(() => { u.up.push(...t.up.splice(0)); flip(); });
      });
    }
  });
  if (!opts.length) return false;
  opts[(rnd() * opts.length) | 0]!();
  return true;
}

function playToStuck(s: SolState, rnd: () => number): SolState {
  for (let guard = 0; guard < 2000; guard++) {
    if (randomMove(s, rnd)) continue;
    // draw through a whole pass looking for a move
    const n = s.stock.length + s.waste.length;
    let found = false;
    for (let d = 0; d <= n && !found; d++) {
      drawFromStock(s);
      found = randomMove(s, rnd);
    }
    if (!found) return s;
  }
  return s;
}

const N = Number(process.argv[2] ?? 60);
const tally: Record<string, number[]> = { won: [], lost: [], unknown: [] };
for (let i = 1; i <= N; i++) {
  const rnd = seeded(i * 7919 + 13);
  const s = playToStuck(deal(rnd), rnd);
  const homed = s.found.reduce((a, p) => a + p.length, 0);
  const r = prove(cloneState(s), { nodes: 400_000, ms: 4000 });
  tally[r.verdict]!.push(r.ms);
  console.log(`deal ${i}: ${homed} home, ${r.verdict} in ${r.nodes} nodes / ${r.ms}ms`);
}
for (const [v, ms] of Object.entries(tally))
  if (ms.length) console.log(`${v}: ${ms.length}  median ${ms.sort((a, b) => a - b)[ms.length >> 1]}ms  max ${ms[ms.length - 1]}ms`);
