/** The disk's tests, over a plain-object store — no browser required. */

import { describe, expect, it } from "vitest";
import { makeDisk, normPath, resolvePath, type DiskChange, type DiskStore } from "./fs.js";
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

describe("paths", () => {
  it("normPath canonicalizes slashes, drive and blank segments", () => {
    expect(normPath("C:\\DESKTOP\\readme.txt")).toBe("DESKTOP\\readme.txt");
    expect(normPath("/DOCS//asm.txt")).toBe("DOCS\\asm.txt");
    expect(normPath("  SRC\\.\\fizz.c ")).toBe("SRC\\fizz.c");
    expect(normPath("c:")).toBe("");
  });

  it("resolvePath is relative to the cwd, absolute on a leading slash", () => {
    expect(resolvePath("DOCS", "asm.txt")).toBe("DOCS\\asm.txt");
    expect(resolvePath("DOCS", "\\SRC\\fizz.c")).toBe("SRC\\fizz.c");
    expect(resolvePath("DOCS", "..")).toBe("");
    expect(resolvePath("DESKTOP\\games", "..\\..\\DOCS")).toBe("DOCS");
    expect(resolvePath("", "..")).toBe(""); // no climbing past C:\
    expect(resolvePath("DOCS", "C:\\DESKTOP")).toBe("DESKTOP");
  });
});

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

  it("a flat-era volume is formatted: files, placement and pins all go", () => {
    const store = memStore({
      "exe.fs": JSON.stringify([{ name: "mine.txt", text: "old" }]),
      "exe.shell": "{}",
      "exe.pins": "{}",
      "exe.deskgames": "[]",
      "exe.untitled": "x",
    });
    const disk = makeDisk(store);
    expect(disk.exists("mine.txt")).toBe(false);
    expect(disk.list().map((f) => f.name)).toEqual(sortedSeeds());
    expect(store.data["exe.shell"]).toBeUndefined();
    expect(store.data["exe.pins"]).toBeUndefined();
    expect(store.data["exe.untitled"]).toBeUndefined();
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

  it("write creates missing parents; a directory's name is not writable", () => {
    const disk = makeDisk(memStore());
    expect(disk.write("a\\b\\c.txt", "deep")).toBe(true);
    expect(disk.isDir("a")).toBe(true);
    expect(disk.isDir("A\\B")).toBe(true);
    expect(disk.write("a\\b", "no")).toBe(false); // a dir owns that name
    expect(disk.mkdir("a\\b\\c.txt")).toBe(false); // and a file owns that one
    // a file can't be a directory: nothing lands underneath one
    expect(disk.write("a\\b\\c.txt\\d.txt", "no")).toBe(false);
    expect(disk.mkdir("a\\b\\c.txt\\sub")).toBe(false);
    expect(disk.rename("a\\b\\c.txt", "a\\b\\c.txt\\self")).toBe(false);
    expect(disk.isDir("a\\b\\c.txt")).toBe(false);
  });

  it("mkdir and rmdir: empty only, and the listing follows", () => {
    const disk = makeDisk(memStore());
    expect(disk.mkdir("stuff")).toBe(true);
    expect(disk.mkdir("STUFF")).toBe(false);
    expect(disk.listDir("")!.dirs.some((d) => d === "stuff")).toBe(true);
    disk.write("stuff\\x.txt", "x");
    expect(disk.rmdir("stuff")).toBe(false); // not empty
    disk.remove("stuff\\x.txt");
    expect(disk.rmdir("stuff")).toBe(true);
    expect(disk.isDir("stuff")).toBe(false);
    expect(disk.listDir("stuff")).toBeNull();
  });

  it("remove and rename behave, and rename refuses a collision", () => {
    const disk = makeDisk(memStore());
    disk.write("a.txt", "a");
    disk.write("b.txt", "b");
    expect(disk.rename("a.txt", "B.TXT")).toBe(false);
    expect(disk.rename("a.txt", "z.txt")).toBe(true);
    expect(disk.read("z.txt")).toBe("a");
    expect(disk.remove("nope")).toBe(false);
    expect(disk.remove("z.txt")).toBe(true);
    expect(disk.exists("z.txt")).toBe(false);
  });

  it("a directory rename carries its children and announces every file", () => {
    const disk = makeDisk(memStore());
    disk.mkdir("old");
    disk.mkdir("old\\sub");
    disk.write("old\\a.txt", "a");
    disk.write("old\\sub\\b.txt", "b");
    const events: DiskChange[] = [];
    disk.onChange((ev) => events.push(ev));
    expect(disk.rename("old", "new")).toBe(true);
    expect(disk.read("new\\a.txt")).toBe("a");
    expect(disk.read("new\\sub\\b.txt")).toBe("b");
    expect(disk.isDir("old")).toBe(false);
    const renames = events.filter((e) => e.kind === "rename");
    expect(renames.some((e) => e.name === "old\\a.txt" && e.to === "new\\a.txt")).toBe(true);
    expect(renames.some((e) => e.name === "old\\sub\\b.txt" && e.to === "new\\sub\\b.txt")).toBe(true);
  });

  it("a directory refuses to move into its own subtree", () => {
    const disk = makeDisk(memStore());
    disk.mkdir("a");
    disk.mkdir("a\\b");
    expect(disk.rename("a", "a\\b\\a")).toBe(false);
    expect(disk.rename("a", "A\\deeper")).toBe(false);
    expect(disk.isDir("a")).toBe(true);
  });

  it("a corrupt volume reloads as a fresh one, not a crash", () => {
    const disk = makeDisk(memStore({ "exe.fs": "{not json" }));
    expect(disk.list().map((f) => f.name)).toEqual(sortedSeeds());
    disk.write("x.txt", "x"); // and it still saves
    expect(disk.read("x.txt")).toBe("x");
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
