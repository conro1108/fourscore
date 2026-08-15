/** The disk's tests, over a plain-object store — no browser required. */

import { describe, expect, it } from "vitest";
import { makeDisk, type DiskStore } from "./fs.js";
import { SEED_FILES } from "./copy.js";

function memStore(init: Record<string, string> = {}): DiskStore & { data: Record<string, string> } {
  const data = { ...init };
  return {
    data,
    getItem: (k) => (k in data ? data[k]! : null),
    setItem: (k, v) => void (data[k] = v),
    removeItem: (k) => void delete data[k],
  };
}

describe("disk", () => {
  it("a fresh volume arrives seeded and persisted", () => {
    const store = memStore();
    const disk = makeDisk(store);
    expect(disk.list().map((f) => f.name)).toEqual(
      [...SEED_FILES.map((f) => f.name)].sort((a, b) => a.localeCompare(b)),
    );
    expect(store.data["exe.fs"]).toBeDefined();
    // a second boot reads the stored volume, not the seeds
    const again = makeDisk(memStore({ "exe.fs": store.data["exe.fs"]! }));
    expect(again.read("readme.txt")).toBe(disk.read("readme.txt"));
  });

  it("migrates the old untitled.txt buffer once", () => {
    const store = memStore({ "exe.untitled": "old words" });
    const disk = makeDisk(store);
    expect(disk.read("untitled.txt")).toBe("old words");
    expect(store.data["exe.untitled"]).toBeUndefined();
  });

  it("lookup is DOS-cased, names keep their case", () => {
    const disk = makeDisk(memStore());
    disk.write("Notes.TXT", "hi");
    expect(disk.read("notes.txt")).toBe("hi");
    expect(disk.exists("NOTES.TXT")).toBe(true);
    expect(disk.list().some((f) => f.name === "Notes.TXT")).toBe(true);
    disk.write("NOTES.txt", "hi2"); // same file, not a second one
    expect(disk.read("Notes.TXT")).toBe("hi2");
  });

  it("remove and rename behave, and rename refuses a collision", () => {
    const disk = makeDisk(memStore());
    disk.write("a.txt", "a");
    disk.write("b.txt", "b");
    expect(disk.rename("a.txt", "B.TXT")).toBe(false);
    expect(disk.rename("a.txt", "c.txt")).toBe(true);
    expect(disk.read("c.txt")).toBe("a");
    expect(disk.remove("nope")).toBe(false);
    expect(disk.remove("c.txt")).toBe(true);
    expect(disk.exists("c.txt")).toBe(false);
  });

  it("a corrupt volume is an empty volume, not a crash", () => {
    const disk = makeDisk(memStore({ "exe.fs": "{not json" }));
    expect(disk.list()).toEqual([]);
    disk.write("x.txt", "x"); // and it still saves
    expect(disk.read("x.txt")).toBe("x");
  });
});
