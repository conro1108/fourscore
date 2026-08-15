import { configDefaults, defineConfig } from "vitest/config";

/**
 * The two tests that play real games. Together they are 111 of the suite's 113
 * seconds — `bots.test.ts` plays every adjacent ladder rung against the one
 * below, and `match.test.ts` solves whole games to grade them.
 *
 * `FAST=1` drops them, which is what `npm run check` does. That is sound and
 * not a corner cut: both of them test `packages/engine` and nothing else, and
 * an app can't break a test that never imports it. Touch the engine and you
 * owe the full run — `npm test`, or `/verify`, which knows the rest of the
 * ladder too.
 */
const PLAYS_REAL_GAMES = ["packages/engine/src/bots.test.ts", "packages/engine/src/match.test.ts"];

export default defineConfig({
  test: {
    include: ["packages/**/*.test.ts", "apps/**/*.test.ts"],
    exclude: [...configDefaults.exclude, ...(process.env.FAST ? PLAYS_REAL_GAMES : [])],
  },
});
