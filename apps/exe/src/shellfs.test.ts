import { describe, expect, it } from "vitest";
import { gameItemId, makeShellFs, type ShellFs } from "./shellfs.js";

const GAMES = ["mines", "sol", "snake"];

function fakeStorage(seed: Record<string, string> = {}): Storage {
  const m = new Map(Object.entries(seed));
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
    clear: () => m.clear(),
    key: () => null,
    get length() {
      return m.size;
    },
  } as Storage;
}

const fresh = (seed?: Record<string, string>): ShellFs =>
  makeShellFs(fakeStorage(seed), GAMES);

describe("shellfs", () => {
  it("games start home, and moves land where they say", () => {
    const fs = fresh();
    expect(fs.itemsIn("games")).toEqual(GAMES.map(gameItemId));
    expect(fs.move(gameItemId("mines"), "desk", [40, 40])).toBe(true);
    expect(fs.locOf(gameItemId("mines"))).toBe("desk");
    expect(fs.deskPos(gameItemId("mines"))).toEqual([40, 40]);
    expect(fs.itemsIn("games")).not.toContain(gameItemId("mines"));
  });

  it("the games folder only takes games back", () => {
    const fs = fresh();
    const f = fs.createFolder(10, 10);
    expect(fs.move(f, "games")).toBe(false);
    expect(fs.locOf(f)).toBe("desk");
    expect(fs.move(gameItemId("sol"), "bin")).toBe(true);
    expect(fs.move(gameItemId("sol"), "games")).toBe(true);
  });

  it("folders nest but never swallow themselves", () => {
    const fs = fresh();
    const a = fs.createFolder(0, 0);
    const b = fs.createFolder(0, 0);
    expect(fs.move(b, { folder: a })).toBe(true);
    expect(fs.move(a, { folder: b })).toBe(false); // a would be inside itself
    expect(fs.move(a, { folder: a })).toBe(false);
    expect(fs.itemsIn({ folder: a })).toEqual([b]);
  });

  it("new folders take numbered names, and rename sticks", () => {
    const fs = fresh();
    const a = fs.createFolder(0, 0);
    const b = fs.createFolder(0, 0);
    expect(fs.folderName(a)).toBe("New Folder");
    expect(fs.folderName(b)).toBe("New Folder (2)");
    fs.rename(a, "  stuff  ");
    expect(fs.folderName(a)).toBe("stuff");
    fs.rename(a, "   "); // an empty name is refused, not applied
    expect(fs.folderName(a)).toBe("stuff");
  });

  it("migrates the old desk-games list, spots intact", () => {
    const fs = fresh({
      "exe.deskgames": JSON.stringify([{ id: "snake", x: 200, y: 120 }]),
    });
    expect(fs.locOf(gameItemId("snake"))).toBe("desk");
    expect(fs.deskPos(gameItemId("snake"))).toEqual([200, 120]);
  });

  it("a folder in the bin keeps its contents", () => {
    const fs = fresh();
    const a = fs.createFolder(0, 0);
    fs.move(gameItemId("mines"), { folder: a });
    fs.move(a, "bin");
    expect(fs.itemsIn("bin")).toEqual([a]);
    expect(fs.itemsIn({ folder: a })).toEqual([gameItemId("mines")]);
  });
});
