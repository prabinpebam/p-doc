import { describe, expect, it } from "vitest";
import type { JSONContent } from "@tiptap/core";
import { headings, moveSection, outline, sectionRange, blockLevels, visibleOutline, nodeText } from "../src/index.ts";

const h = (level: number, text: string): JSONContent => ({ type: "heading", attrs: { level }, content: [{ type: "text", text }] });
const p = (text: string): JSONContent => ({ type: "paragraph", content: [{ type: "text", text }] });
const doc = (...content: JSONContent[]): JSONContent => ({ type: "doc", content });
const texts = (d: JSONContent) => (d.content ?? []).map(nodeText);

describe("outline", () => {
  const d = doc(p("intro"), h(1, "A"), p("a1"), h(2, "A.1"), p("a11"), h(2, "A.2"), p("a21"), h(1, "B"), p("b1"));

  it("lists headings with their block index and level", () => {
    expect(headings(d).map((x) => [x.index, x.level, x.text])).toEqual([
      [1, 1, "A"],
      [3, 2, "A.1"],
      [5, 2, "A.2"],
      [7, 1, "B"],
    ]);
  });

  it("finds a section: up to the next heading of the same or higher level", () => {
    const levels = blockLevels(d);
    expect(sectionRange(levels, 1)).toEqual([1, 7]);
    expect(sectionRange(levels, 3)).toEqual([3, 5]);
    expect(sectionRange(levels, 5)).toEqual([5, 7]);
    expect(sectionRange(levels, 7)).toEqual([7, 9]);
  });

  it("moves a Heading 2 above its sibling with its paragraphs", () => {
    expect(texts(moveSection(d, 5, 3))).toEqual(["intro", "A", "a1", "A.2", "a21", "A.1", "a11", "B", "b1"]);
  });

  it("moves a section to the end and down past another section", () => {
    expect(texts(moveSection(d, 1, 9))).toEqual(["intro", "B", "b1", "A", "a1", "A.1", "a11", "A.2", "a21"]);
    expect(texts(moveSection(d, 3, 7))).toEqual(["intro", "A", "a1", "A.2", "a21", "A.1", "a11", "B", "b1"]);
  });

  it("ignores a drop inside the section itself", () => {
    expect(moveSection(d, 1, 4)).toBe(d);
  });

  it("collapses a heading's children", () => {
    const items = outline(d);
    expect(items.map((i) => i.hasChildren)).toEqual([true, false, false, false]);
    expect(visibleOutline(items, new Set([1])).map((i) => i.text)).toEqual(["A", "B"]);
  });
});
