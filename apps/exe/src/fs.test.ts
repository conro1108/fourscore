/** The disk's tests, over a plain-object store — no browser required. */

import { describe, expect, it } from "vitest";
import { makeDisk, type DiskStore } from "./fs.js";
import { SEED_DIRS, SEED_FILES } from "./copy.js";

function memStore(init: Record<string, string> = {}): DiskStore & { data: Record<string, string> } {
  const data = { ...init };
  return {
    data,
    getItem: (k) => (k in data ? data[k]! : null),
    setItem: (k, v) => void (data[k] = v),
    removeItem: (k) => void delete data[k],
  };
}

const sortedSeeds = (): string[] =>
  [...SEED_FILES.map((f) => f.name)].sort((a, b) => a.localeCompare(b));

describe("disk", () => {
  it("a fresh volume arrives seeded, arranged and persisted", () => {
    const store = memStore();
    const disk = makeDisk(store);
    expect(disk.list().map((f) => f.name)).toEqual(sortedSeeds());
    for (const d of SEED_DIRS) expect(disk.isDir(d)).toBe(true);
    // the desk's directory holds what the desk shows
    const desk = disk.listDir("DESKTOP")!;
    expect(desk.dirs.map((d) => d.toLowerCase())).toEqual(["desktop\\games", "desktop\\recycled"]);
    expect(desk.files.some((f) => f.name === "DESKTOP\\readme.txt")).toBe(true);
    expect(store.data["exe.fs"]).toBeDefined();
    // a second boot reads the stored volume, not the seeds
    const again = makeDisk(memStore({ "exe.fs": store.data["exe.fs"]! }));
    expect(again.read("DESKTOP\\readme.txt")).toBe(disk.read("DESKTOP\\readme.txt"));
  });

  it("lookup is DOS-cased on the whole path, names keep their case", () => {
    const disk = makeDisk(memStore());
    disk.write("DOCS\\Notes.TXT", "hi");
    expect(disk.read("docs\\notes.txt")).toBe("hi");
    expect(disk.exists("DOCS\\NOTES.TXT")).toBe(true);
    expect(disk.list().some((f) => f.name === "DOCS\\Notes.TXT")).toBe(true);
    disk.write("docs\\NOTES.txt", "hi2"); // same file, not a second one
    expect(disk.read("DOCS\\Notes.TXT")).toBe("hi2");
  });

  it("an old volume grows seeds it never had, keeps edits, honors moves", () => {
    const store = memStore();
    makeDisk(store); // format a full volume
    const vol = JSON.parse(store.data["exe.fs"]!) as {
      v: 2;
      dirs: string[];
      files: { name: string; text: string }[];
    };
    vol.files = vol.files
      .filter((f) => f.name !== "DOCS\\c.txt") // deleted: comes back
      .map((f) => (f.name === "SRC\\hello.asm" ? { ...f, text: "; mine now" } : f))
      .map((f) => (f.name === "DESKTOP\\rocket.spr" ? { ...f, name: "DOCS\\rocket.spr" } : f));
    const disk = makeDisk(memStore({ "exe.fs": JSON.stringify(vol) }));
    expect(disk.exists("DOCS\\c.txt")).toBe(true); // the manual returned
    expect(disk.read("SRC\\hello.asm")).toBe("; mine now"); // the edit survived
    // the filed-away rocket did not come back as a twin on the desk
    expect(disk.exists("DESKTOP\\rocket.spr")).toBe(false);
    expect(disk.exists("DOCS\\rocket.spr")).toBe(true);
  });
});
