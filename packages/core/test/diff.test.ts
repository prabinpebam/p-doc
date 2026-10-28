import { describe, expect, it } from "vitest";
import type { JSONContent } from "@tiptap/core";
import { diffContent, diffStats, nodeText } from "../src/index.ts";

const p = (...content: JSONContent[]): JSONContent => ({ type: "paragraph", content });
const t = (text: string, marks?: JSONContent["marks"]): JSONContent => ({ type: "text", text, ...(marks ? { marks } : {}) });
const doc = (...content: JSONContent[]): JSONContent => ({ type: "doc", content });

const marked = (d: JSONContent, kind: string) => {
  const out: string[] = [];
  const walk = (n: JSONContent) => {
    if (n.type === "text" && n.marks?.some((m) => m.type === kind)) out.push(n.text!);
    n.content?.forEach(walk);
  };
  walk(d);
  return out;
};

describe("diff", () => {
  it("marks changed words within a paragraph", () => {
    const d = diffContent(doc(p(t("The quick brown fox"))), doc(p(t("The slow brown fox jumps"))));
    expect(marked(d, "deletion")).toEqual(["quick"]);
    expect(marked(d, "insertion").join("")).toBe("slow jumps");
    expect(diffStats(d)).toEqual({ added: 2, removed: 1 });
  });

  it("keeps formatting of unchanged words", () => {
    const d = diffContent(doc(p(t("Hello "), t("bold", [{ type: "bold" }]))), doc(p(t("Hi "), t("bold", [{ type: "bold" }]))));
    const bold = d.content![0]!.content!.find((n) => n.text === "bold")!;
    expect(bold.marks).toEqual([{ type: "bold" }]);
  });

  it("marks added and removed paragraphs", () => {
    const d = diffContent(doc(p(t("one")), p(t("two")), p(t("three"))), doc(p(t("one")), p(t("three")), p(t("four"))));
    expect(d.content!.map(nodeText)).toEqual(["one", "two", "three", "four"]);
    expect(marked(d, "deletion")).toEqual(["two"]);
    expect(marked(d, "insertion")).toEqual(["four"]);
  });

  it("finds no changes in identical documents", () => {
    const a = doc(p(t("same")), { type: "bulletList", content: [{ type: "listItem", content: [p(t("x"))] }] });
    expect(diffStats(diffContent(a, a))).toEqual({ added: 0, removed: 0 });
  });

  it("diffs inside lists", () => {
    const li = (s: string) => ({ type: "listItem", content: [p(t(s))] });
    const d = diffContent(doc({ type: "bulletList", content: [li("apples"), li("pears")] }), doc({ type: "bulletList", content: [li("apples"), li("plums")] }));
    expect(marked(d, "deletion")).toEqual(["pears"]);
    expect(marked(d, "insertion")).toEqual(["plums"]);
  });
});
