import { describe, expect, it } from "vitest";
import { ROSTER } from "@fourscore/engine";
import {
  creatureFor,
  failureText,
  foldMoves,
  joinLink,
  makeCode,
  opponentOf,
  pendingJoin,
  phaseOf,
  playerOfSeat,
  seatOf,
  wireAction,
  type MatchRow,
} from "./session.js";

const row = (over: Partial<MatchRow> = {}): MatchRow => ({
  id: "m1",
  join_code: "ABCD",
  variant: "connect4",
  host: "h",
  guest: null,
  host_seat: 1,
  status: "waiting",
  winner: null,
  ...over,
});

describe("codes", () => {
  it("is four characters with nothing ambiguous read aloud", () => {
    for (let i = 0; i < 200; i++) {
      const code = makeCode();
      expect(code).toHaveLength(4);
      expect(code).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{4}$/);
    }
  });

  it("reads a code out of an invite link, and survives its own link", () => {
    const link = joinLink("https://x.test", "/", "QK7M");
    expect(pendingJoin(new URL(link).search)).toBe("QK7M");
    expect(pendingJoin("?join=qk7m")).toBe("QK7M");
    expect(pendingJoin("")).toBeNull();
  });
});

describe("seats", () => {
  it("gives the host their seat and the guest the other one", () => {
    const r = row({ guest: "g", status: "active", host_seat: 1 });
    expect(seatOf(r, "h")).toBe(1);
    expect(seatOf(r, "g")).toBe(2);
    expect(seatOf(r, "stranger")).toBeNull();
  });

  it("swaps both when the host takes seat 2", () => {
    const r = row({ guest: "g", status: "active", host_seat: 2 });
    expect(seatOf(r, "h")).toBe(2);
    expect(seatOf(r, "g")).toBe(1);
  });

  it("makes seat 1 red, because red moves first", () => {
    expect(playerOfSeat(1)).toBe("red");
    expect(playerOfSeat(2)).toBe("yellow");
  });

  it("knows who the other one is", () => {
    const r = row({ guest: "g" });
    expect(opponentOf(r, "h")).toBe("g");
    expect(opponentOf(r, "g")).toBe("h");
    expect(opponentOf(row(), "h")).toBeNull();
  });
});

describe("creatures", () => {
  it("is stable for a person and never the Oracle", () => {
    const ids = new Set<string>();
    for (let i = 0; i < 500; i++) {
      const id = creatureFor(`user-${i}`);
      expect(creatureFor(`user-${i}`)).toBe(id);
      ids.add(id);
    }
    expect(ids.has("oracle")).toBe(false);
    // The hash spreads: a cast of seven that always answered the same thing
    // would be a bug this test exists to catch.
    expect(ids.size).toBe(ROSTER.filter((b) => !b.perfect).length);
  });

  it("still names somebody when there is nobody", () => {
    expect(ROSTER.some((b) => b.id === creatureFor(null))).toBe(true);
  });
});

describe("moves off the wire", () => {
  it("appends the next ply, repairs a gap, ignores its own echo", () => {
    expect(wireAction(3, 3)).toBe("append");
    expect(wireAction(3, 5)).toBe("refetch");
    expect(wireAction(3, 2)).toBe("ignore");
  });

  it("extends when the database is ahead and agrees", () => {
    expect(foldMoves([3, 3], [3, 3, 4])).toEqual({ kind: "extend", moves: [3, 3, 4] });
  });

  it("says nothing changed when nothing changed", () => {
    expect(foldMoves([3, 3], [3, 3])).toEqual({ kind: "same" });
  });

  it("replaces when the lists actually disagree, or when ours is longer", () => {
    expect(foldMoves([3, 4], [3, 5, 6])).toEqual({ kind: "replace", moves: [3, 5, 6] });
    expect(foldMoves([3, 4, 5], [3, 4])).toEqual({ kind: "replace", moves: [3, 4] });
  });
});

describe("phase", () => {
  it("walks idle → waiting → playing → over", () => {
    expect(phaseOf(null, null, false)).toBe("signed-out");
    expect(phaseOf("h", null, false)).toBe("idle");
    expect(phaseOf("h", row(), false)).toBe("waiting");
    expect(phaseOf("h", row({ status: "active", guest: "g" }), false)).toBe("playing");
    expect(phaseOf("h", row({ status: "active", guest: "g" }), true)).toBe("over");
    expect(phaseOf("h", row({ status: "finished", guest: "g" }), false)).toBe("over");
  });
});

describe("failures", () => {
  it("translates the one a player can act on and passes everything else through", () => {
    expect(failureText(new Error("no open match with that code"))).toMatch(/waiting on that code/);
    expect(failureText(new Error("network is down"))).toBe("network is down");
    expect(failureText("plain string")).toBe("plain string");
  });
});
