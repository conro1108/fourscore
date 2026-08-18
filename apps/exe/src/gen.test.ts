/**
 * The generator's test — Phase 3, station 1 (llm_training.md).
 *
 * There is no 27B in here. What's testable without one is everything between
 * the model and the corpus: what gets asked, what gets salvaged from a reply,
 * what lands on disk, and what happens when the server misbehaves. A stub
 * that speaks llama-server's endpoint covers the whole loop, and the parts a
 * real model would exercise differently — whether it writes good C — are the
 * one thing a test could never assert anyway.
 */

import { createServer, type Server } from "node:http";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { SEED_FILES } from "./copy.js";
import { extract, run } from "../tools/corpus/gen.js";
import { buildMessages, HEADERS, pickShots, stampHeader } from "../tools/corpus/prompt.js";
import { GOOD } from "../tools/corpus/mutants.js";

const pong = SEED_FILES.find((f) => f.name.endsWith("pong.c"))!.text;

describe("what it salvages from a reply", () => {
  it("takes the program out of a fenced block", () => {
    expect(extract("Here you go:\n\n```c\n/* a.c */\nint main() {}\n```\n")).toBe("/* a.c */\nint main() {}\n");
  });

  it("drops a preamble that isn't the program", () => {
    expect(extract("Sure! This uses vsync.\n/* a.c */\nint main() {}")).toBe("/* a.c */\nint main() {}\n");
  });

  it("drops a reasoning model's thinking", () => {
    expect(extract("<think>hmm, 40x24</think>\n/* a.c */\nint main() {}")).toBe("/* a.c */\nint main() {}\n");
  });

  it("leaves a bare program alone", () => {
    expect(extract("/* a.c */\nint main() {}\n")).toBe("/* a.c */\nint main() {}\n");
  });
});

describe("the header is the conditioning channel, so it has to match", () => {
  it("replaces a program's own header with the one that was asked for", () => {
    const out = stampHeader(pong, "/* pong.c — two paddles, one ball. */");
    expect(out.split("\n")[0]).toBe("/* pong.c — two paddles, one ball. */");
    expect(out).toContain("int py = 10;");
    // pong.c's six-line header, including the line about W and S, is gone.
    expect(out).not.toContain("cd /src; cc pong.c");
  });

  it("takes off // comments too", () => {
    expect(stampHeader("// old\n// older\nint main() {}", "/* a.c */")).toBe("/* a.c */\n\nint main() {}");
  });

  it("shows few-shots asked for the way the answer must arrive", () => {
    const msgs = buildMessages({
      tier: 4,
      kind: "freestyle",
      header: HEADERS[4][0]!,
      shots: [GOOD.find((c) => c.id === "good/pong")!],
    });
    const [ask, answer] = [msgs[1]!, msgs[2]!];
    const header = ask.content.split("\n").at(-1)!;
    expect(header.startsWith("/*") && header.endsWith("*/")).toBe(true);
    expect(answer.content.split("\n")[0]).toBe(header);
  });

  it("does not show the parent twice", () => {
    const parent = GOOD.find((c) => c.id === "good/pong")!;
    const shots = pickShots(GOOD, 4, 2, () => 0.5, new Map(), 40, parent.id);
    expect(shots.map((s) => s.id)).not.toContain(parent.id);
  });

  it("tells the model the things the graders will fail it for", () => {
    const sys = buildMessages({ tier: 4, kind: "freestyle", header: HEADERS[4][0]!, shots: [] })[0]!.content;
    expect(sys).toContain("switch");
    expect(sys).toContain("vsync()");
    expect(sys).toContain("3,840 words");
    const user = buildMessages({ tier: 4, kind: "freestyle", header: HEADERS[4][0]!, shots: [] })[1]!.content;
    expect(user).toContain("glyph of its own");
  });
});

describe("a run, end to end, against a stub that speaks llama-server", () => {
  const servers: Server[] = [];
  afterAll(() => servers.forEach((s) => s.close()));

  /** Answers every request with `reply`, or with a 500 when it's null. */
  const serve = async (reply: (n: number) => string | null): Promise<string> => {
    let n = 0;
    const server = createServer((_req, res) => {
      const body = reply(n++);
      if (body === null) {
        res.writeHead(500).end("nope");
        return;
      }
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ choices: [{ message: { content: body } }] }));
    });
    servers.push(server);
    await new Promise<void>((ok) => server.listen(0, "127.0.0.1", ok));
    const addr = server.address();
    return `http://127.0.0.1:${typeof addr === "object" && addr ? addr.port : 0}`;
  };

  const opts = (url: string, dir: string) => ({
    tier: 4 as const,
    n: 4,
    kind: "freestyle" as const,
    slots: 2,
    shots: 1,
    seed: 7,
    out: join(dir, "raw.jsonl"),
    keep: join(dir, "keep.jsonl"),
    url,
    model: "stub",
    maxTokens: 1400,
    timeoutMs: 5_000,
    temperature: 0.8,
    think: false,
  });

  it("grades what came back and writes both files", async () => {
    const dir = mkdtempSync(join(tmpdir(), "gen-"));
    const url = await serve(() => "```c\n" + pong + "\n```");
    const rows = await run(opts(url, dir));

    expect(rows).toHaveLength(4);
    expect(rows.every((r) => r.verdict.ok)).toBe(true);
    // The verdict is the real graders, not a stub of them.
    expect(rows[0]!.verdict.notes).toMatchObject({ ball: "O", paddle: "|" });
    // Every row is on disk, and only the passes are in the kept file.
    expect(readFileSync(opts(url, dir).out, "utf8").trim().split("\n")).toHaveLength(4);
    expect(readFileSync(opts(url, dir).keep!, "utf8").trim().split("\n")).toHaveLength(4);
    // And what was kept carries the header it was conditioned on.
    const kept = JSON.parse(readFileSync(opts(url, dir).keep!, "utf8").split("\n")[0]!) as { text: string };
    expect(kept.text.split("\n")[0]).toBe(rows[0]!.header);
  });

  it("keeps the rejects, because the histogram is the point", async () => {
    const dir = mkdtempSync(join(tmpdir(), "gen-"));
    const url = await serve((n) => (n % 2 ? "/* pong.c */\nint main() { switch (1) {} }" : pong));
    const rows = await run(opts(url, dir));
    expect(rows.filter((r) => r.verdict.ok)).toHaveLength(2);
    expect(rows.filter((r) => r.verdict.fail === "v0:absent:switch")).toHaveLength(2);
    expect(readFileSync(opts(url, dir).out, "utf8").trim().split("\n")).toHaveLength(4);
  });

  it("resumes from what is already on disk", async () => {
    const dir = mkdtempSync(join(tmpdir(), "gen-"));
    const url = await serve(() => pong);
    await run({ ...opts(url, dir), n: 2 });
    const second = await run({ ...opts(url, dir), n: 2 });
    expect(second).toHaveLength(2);
    // Six rows, and the second run's ids carry on from the first's.
    expect(readFileSync(opts(url, dir).out, "utf8").trim().split("\n")).toHaveLength(4);
    expect(second[0]!.id).not.toBe("t4/freestyle/0");
  });

  it("stops rather than filling the night with the same error", async () => {
    const dir = mkdtempSync(join(tmpdir(), "gen-"));
    const url = await serve(() => null);
    await expect(run({ ...opts(url, dir), n: 100, slots: 1 })).rejects.toThrow(/stopped answering/);
  });
});
