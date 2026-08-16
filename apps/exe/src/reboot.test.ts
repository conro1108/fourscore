import { describe, expect, it } from "vitest";
import { GO_AT, LINE_GAP, POST_AT, cleanUrl } from "./reboot.js";
import { REBOOT, SHUTDOWN } from "./copy.js";

describe("restart", () => {
  it("lands on a clean desktop, not back in the pose it came from", () => {
    // the whole point: a restart out of ?state=win is a desktop, not the win
    expect(cleanUrl("http://localhost:5173/?state=win&beat=6&fever=1")).toBe("/");
    expect(cleanUrl("http://localhost:5173/?ctl=1#anything")).toBe("/");
    expect(cleanUrl("https://example.com/board/?state=saver")).toBe("/board/");
  });

  it("is a beat, not a cutscene", () => {
    // the machine finishes saying its lines before it goes …
    expect(POST_AT + REBOOT.post.length * LINE_GAP).toBeLessThanOrEqual(GO_AT);
    // … and the screen is never black for more than a couple of seconds
    expect(GO_AT).toBeLessThanOrEqual(2000);
  });

  it("offers the period answers, shut down first, amnesia last and explicit", () => {
    expect(SHUTDOWN.options).toHaveLength(3);
    expect(SHUTDOWN.options[0]).toMatch(/^Shut down/);
    expect(SHUTDOWN.options[1]).toMatch(/^Restart/);
    // the hard reset must say what it costs — a wipe hiding behind a plain
    // "Restart" would be the fake data loss DIRECTION.md forbids
    expect(SHUTDOWN.options[2]).toMatch(/^Restart/);
    expect(SHUTDOWN.options[2]).toMatch(/forget/i);
  });
});
