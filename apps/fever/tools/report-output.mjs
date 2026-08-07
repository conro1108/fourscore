/**
 * Print where the build actually wrote its output.
 *
 * Deploy failures of the form "No Output Directory named X found" don't say
 * what the build produced or where it stood when it produced it, and the error
 * prints only the basename of the path it wanted — so `apps/fever/dist` and
 * `dist` fail identically. Three lines in the build log settle it without
 * another round of guessing at settings from a screenshot.
 */
import { readdirSync } from "node:fs";
import { resolve } from "node:path";

const out = resolve("dist");
console.log(`[build] ran in       ${process.cwd()}`);
console.log(`[build] wrote output ${out}`);
console.log(`[build] contents     ${readdirSync(out).join(", ")}`);
