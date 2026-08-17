/** Desk placement memory — small on purpose; the disk owns everything else. */

import { describe, expect, it } from "vitest";
import { makeDeskPos } from "./deskpos.js";
import { programTokenOf, SEED_FILES } from "./copy.js";

function memStorage(init: Record<string, string> = {}): Pick<Storage, "getItem" | "setItem"> & {
  data: Record<string, string>;
} {
  const data = { ...init };
  return {
    data,
    getItem: (k) => (k in data ? data[k]! : null),
    setItem: (k, v) => void (data[k] = v),
  };
}

describe("deskpos", () => {
  it("remembers a seat case-blind, and persists it", () => {
    const store = memStorage();
    const pos = makeDeskPos(store);
    pos.set("DESKTOP\\Readme.txt", [40, 60]);
    expect(pos.get("desktop\\readme.txt")).toEqual([40, 60]);
    const again = makeDeskPos(memStorage({ "exe.desk": store.data["exe.desk"]! }));
    expect(again.get("desktop\\readme.txt")).toEqual([40, 60]);
  });

  it("a rename keeps the spot; a removal forgets it", () => {
    const pos = makeDeskPos(memStorage());
    pos.set("desktop\\a.txt", [10, 20]);
    pos.migrate("desktop\\a.txt", "desktop\\b.txt");
    expect(pos.get("desktop\\a.txt")).toBeUndefined();
    expect(pos.get("desktop\\b.txt")).toEqual([10, 20]);
    pos.drop("DESKTOP\\B.TXT");
    expect(pos.get("desktop\\b.txt")).toBeUndefined();
  });

  it("corrupt placement is a re-staged desk, not a crash", () => {
    const pos = makeDeskPos(memStorage({ "exe.desk": "]junk" }));
    expect(pos.get("anything")).toBeUndefined();
  });
});

describe("program files", () => {
  it("the MZ line names the program; prose does not", () => {
    expect(programTokenOf("MZ board\ngarbage")).toBe("board");
    expect(programTokenOf("MZ mines")).toBe("mines");
    expect(programTokenOf("README\nMZ board")).toBeNull();
    expect(programTokenOf("MZ Not A Token")).toBeNull();
  });

  it("every shipped program file carries a token — and COPY would keep it", () => {
    const tokens = SEED_FILES
      .filter((f) => /\.(exe|scr|com)$/i.test(f.name))
      .map((f) => programTokenOf(f.text));
    expect(tokens).toContain("board");
    expect(tokens).toContain("mines");
    expect(tokens.every((t) => t !== null)).toBe(true);
  });
});
