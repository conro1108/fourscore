import { describe, expect, it } from "vitest";
import { fileItemId, gameItemId, makeShellFs, type ShellFs } from "./shellfs.js";

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
    const f = fs.createFolder(10, 10)!;
    expect(fs.move(f, "games")).toBe(false);
    expect(fs.locOf(f)).toBe("desk");
    expect(fs.move(gameItemId("sol"), "bin")).toBe(true);
    expect(fs.move(gameItemId("sol"), "games")).toBe(true);
  });

  it("folders nest but never swallow themselves", () => {
    const fs = fresh();
    const a = fs.createFolder(0, 0)!;
    const b = fs.createFolder(0, 0)!;
    expect(fs.move(b, { folder: a })).toBe(true);
    expect(fs.move(a, { folder: b })).toBe(false); // a would be inside itself
    expect(fs.move(a, { folder: a })).toBe(false);
    expect(fs.itemsIn({ folder: a })).toEqual([b]);
  });

  it("new folders take numbered names, and rename sticks", () => {
    const fs = fresh();
    const a = fs.createFolder(0, 0)!;
    const b = fs.createFolder(0, 0)!;
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

  it("disk files appear on the desk, move like anything, and vanish with the disk", () => {
    const files: string[] = ["readme.txt"];
    const fs = makeShellFs(fakeStorage(), GAMES, () => files);
    const id = fileItemId("readme.txt");
    expect(fs.itemsIn("desk")).toContain(id);
    const f = fs.createFolder(0, 0);
    expect(f).not.toBeNull();
    expect(fs.move(id, { folder: f! })).toBe(true);
    expect(fs.itemsIn({ folder: f! })).toEqual([id]);
    expect(fs.move(id, "games")).toBe(false); // the games folder takes games only
    files.length = 0; // rm in the terminal
    expect(fs.itemsIn({ folder: f! })).toEqual([]);
    files.push("later.txt"); // a new file lands on the desk, not in old spots
    expect(fs.itemsIn("desk")).toContain(fileItemId("later.txt"));
  });

  it("migrate carries a renamed file's placement over", () => {
    const files = ["a.txt"];
    const fs = makeShellFs(fakeStorage(), GAMES, () => files);
    const folder = fs.createFolder(0, 0)!;
    fs.move(fileItemId("a.txt"), { folder });
    files[0] = "b.txt";
    fs.migrate(fileItemId("a.txt"), fileItemId("b.txt"));
    expect(fs.itemsIn({ folder })).toEqual([fileItemId("b.txt")]);
  });

  it("a named folder must be free; the terminal hears no on a clash", () => {
    const fs = fresh();
    expect(fs.createFolder(0, 0, "stuff")).not.toBeNull();
    expect(fs.createFolder(0, 0, "STUFF")).toBeNull();
    expect(fs.createFolder(0, 0, "   ")).toBeNull();
  });

  it("a folder in the bin keeps its contents", () => {
    const fs = fresh();
    const a = fs.createFolder(0, 0)!;
    fs.move(gameItemId("mines"), { folder: a });
    fs.move(a, "bin");
    expect(fs.itemsIn("bin")).toEqual([a]);
    expect(fs.itemsIn({ folder: a })).toEqual([gameItemId("mines")]);
  });
});
