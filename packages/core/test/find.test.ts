import { describe, expect, it } from "vitest";
import { findInText, replaceAll, compile } from "../src/index.ts";

describe("find", () => {
  const text = "The cat sat. Cats catch mice. CAT!";

  it("finds ignoring case by default", () => {
    expect(findInText(text, "cat").matches.map((m) => text.slice(m.from, m.to))).toEqual(["cat", "Cat", "cat", "CAT"]);
  });

  it("matches case", () => {
    expect(findInText(text, "cat", { matchCase: true }).matches.length).toBe(2);
  });

  it("matches whole words only", () => {
    expect(findInText(text, "cat", { wholeWord: true }).matches.map((m) => text.slice(m.from, m.to))).toEqual(["cat", "CAT"]);
    expect(findInText("naïve naïveté", "naïve", { wholeWord: true }).matches.length).toBe(1);
  });

  it("uses regular expressions with groups in the replacement", () => {
    expect(replaceAll("2026-10-28", "(\\d+)-(\\d+)-(\\d+)", "$3/$2/$1", { regex: true }).text).toBe("28/10/2026");
    expect(replaceAll("a.b", ".", "-").text).toBe("a-b");
  });

  it("says when a pattern isn't valid", () => {
    const r = findInText("x", "(", { regex: true });
    expect(r.matches).toEqual([]);
    expect(r.error).toMatch(/isn't valid/);
    expect(typeof compile("", {})).toBe("string");
  });

  it("replaces all and counts", () => {
    expect(replaceAll(text, "cat", "dog", { wholeWord: true })).toEqual({ text: "The dog sat. Cats catch mice. dog!", count: 2 });
  });
});
