/**
 * The editor's typing help, which is a decision before it is a DOM event.
 *
 * The rule that carries the whole thing is the boundary: a pair closes itself
 * against whitespace and the end of a line, and never in front of a word.
 * That is what lets prose and llm.c share one text box.
 */

import { describe, expect, it } from "vitest";
import { padTyping, type PadAction } from "./notepad.js";

/** Type `key` at a caret marked `|` and hand back the box afterwards. */
function type(key: string, marked: string): string {
  const start = marked.indexOf("|");
  const value = marked.replace(/\|/g, "");
  const act: PadAction | null = padTyping(key, { value, start, end: start });
  // no action: the browser does what a text box does
  if (!act)
    return key === "Backspace"
      ? `${value.slice(0, Math.max(0, start - 1))}|${value.slice(start)}`
      : `${value.slice(0, start)}${key}|${value.slice(start)}`;
  if (act.kind === "caret") return `${value.slice(0, act.at)}|${value.slice(act.at)}`;
  if (act.kind === "delete") return `${value.slice(0, act.from)}|${value.slice(act.to)}`;
  const after = value.slice(0, start) + act.text + value.slice(start);
  const caret = start + act.text.length - act.back;
  return `${after.slice(0, caret)}|${after.slice(caret)}`;
}

describe("pairs", () => {
  it("closes a bracket at the end of a line", () => {
    expect(type("(", "printf|")).toBe("printf(|)");
    expect(type("[", "buf|")).toBe("buf[|]");
    expect(type("{", "if (x) |")).toBe("if (x) {|}");
    expect(type('"', "puts(|)")).toBe('puts("|")');
  });

  it("closes against whitespace and closers, not in front of a word", () => {
    expect(type("(", "a| + b")).toBe("a(|) + b");
    expect(type("(", "a|b")).toBe("a(|b");
    expect(type("(", "|word")).toBe("(|word");
    // this is the .txt case the old extension gate existed for
    expect(type('"', "he said |")).toBe('he said "|"');
    expect(type('"', 'he said |"already"')).toBe('he said "|already"');
  });

  it("leaves an inch mark alone", () => {
    expect(type('"', "6|")).toBe('6"|');
  });

  it("steps over a closer instead of typing a second one", () => {
    expect(type(")", "f(x|)")).toBe("f(x)|");
    expect(type('"', 'puts("hi|")')).toBe('puts("hi"|)');
    // ...but a closer that isn't there is just typed
    expect(type(")", "f(x|")).toBe("f(x)|");
  });

  it("takes both halves of an empty pair on Backspace", () => {
    expect(type("Backspace", "f(|)")).toBe("f|");
    expect(type("Backspace", 'x = "|"')).toBe("x = |");
    // a pair with something in it is not a pair any more
    expect(type("Backspace", "f(x|)")).toBe("f(|)");
  });
});

describe("Enter and Tab", () => {
  it("keeps the indent", () => {
    expect(type("Enter", "    int x = 1;|")).toBe("    int x = 1;\n    |");
    expect(type("Enter", "no indent|")).toBe("no indent\n|");
  });

  it("opens a brace like a door", () => {
    expect(type("Enter", "  if (x) {|}")).toBe("  if (x) {\n      |\n  }");
    // an open brace with nothing after it still indents in
    expect(type("Enter", "  if (x) {|")).toBe("  if (x) {\n      |");
  });

  it("types spaces instead of leaving the window", () => {
    expect(type("Tab", "|x")).toBe("    |x");
  });
});

describe("what it keeps its hands off", () => {
  it("passes ordinary typing through", () => {
    expect(padTyping("a", { value: "", start: 0, end: 0 })).toBeNull();
    expect(padTyping("ArrowLeft", { value: "abc", start: 3, end: 3 })).toBeNull();
  });

  it("passes a pair over a selection through — replacing text is the browser's job", () => {
    expect(padTyping("(", { value: "abc", start: 0, end: 3 })).toBeNull();
    expect(padTyping('"', { value: "abc", start: 0, end: 3 })).toBeNull();
  });
});
