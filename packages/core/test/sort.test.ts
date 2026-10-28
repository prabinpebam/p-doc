import { describe, expect, it } from "vitest";
import type { JSONContent } from "@tiptap/core";
import { schema, sortCount, sortTarget, sortTransform } from "../src/index.ts";

const p = (text: string): JSONContent => ({ type: "paragraph", content: [{ type: "text", text }] });
const doc = (...content: JSONContent[]) => schema().nodeFromJSON({ type: "doc", content });
const texts = (n: { forEach: (f: (c: { textContent: string }) => void) => void }) => {
  const out: string[] = [];
  n.forEach((c) => out.push(c.textContent));
  return out;
};
/** The position inside the text of the top-level block `i`. */
const inBlock = (d: ReturnType<typeof doc>, i: number) => {
  let pos = 0;
  for (let k = 0; k < i; k++) pos += d.child(k).nodeSize;
  return pos + 1;
};

describe("sort (U50)", () => {
  it("sorts the paragraphs a selection covers, numbers in number order, as one step", () => {
    const d = doc(p("keep"), p("10"), p("pear"), p("9"), p("Apple"), p("last"));
    const t = sortTarget(d, inBlock(d, 1), inBlock(d, 4))!;
    expect(t).toEqual({ kind: "blocks", first: 1, last: 4 });
    expect(sortCount(d, t)).toBe(4);
    const { tr } = sortTransform(d, t);
    expect(tr.steps).toHaveLength(1);
    expect(texts(tr.doc)).toEqual(["keep", "9", "10", "Apple", "pear", "last"]);
    expect(texts(sortTransform(d, t, { descending: true }).tr.doc)).toEqual(["keep", "pear", "Apple", "10", "9", "last"]);
    // Undo is the step's inverse.
    expect(texts(tr.steps[0]!.invert(d).apply(tr.doc).doc!)).toEqual(texts(d));
  });

  it("does nothing for one paragraph, or when already in order", () => {
    const d = doc(p("b"), p("a"));
    expect(sortTarget(d, 1, 1)).toBeNull();
    const sorted = doc(p("a"), p("b"));
    expect(sortTransform(sorted, sortTarget(sorted, 1, inBlock(sorted, 1))!).tr.steps).toHaveLength(0);
  });

  it("sorts every item of the list the cursor is in, or just the selected items", () => {
    const item = (t: string) => ({ type: "listItem", content: [p(t)] });
    const d = doc(p("before"), { type: "bulletList", content: ["c", "a", "d", "b"].map(item) });
    const list = inBlock(d, 1);
    const cursor = list + 2; // in the first item's paragraph
    const all = sortTarget(d, cursor, cursor)!;
    expect(all).toMatchObject({ kind: "items", first: 0, last: 3 });
    expect(texts(sortTransform(d, all).tr.doc.child(1))).toEqual(["a", "b", "c", "d"]);
    // From the second item into the third: only those two.
    const second = list + d.child(1).child(0).nodeSize + 2;
    const third = second + d.child(1).child(1).nodeSize;
    const some = sortTarget(d, second, third)!;
    expect(some).toMatchObject({ kind: "items", first: 1, last: 2 });
    expect(texts(sortTransform(d, some, { descending: true }).tr.doc.child(1))).toEqual(["c", "d", "a", "b"]);
  });

  it("sorts a table's rows by a column, keeping a header row first", () => {
    const cell = (type: string) => (t: string) => ({ type, content: [p(t)] });
    const row = (type: string, ...cells: string[]) => ({ type: "tableRow", content: cells.map(cell(type)) });
    const d = doc({ type: "table", content: [row("tableHeader", "Name", "Score"), row("tableCell", "Bo", "12"), row("tableCell", "Al", "9"), row("tableCell", "Cy", "100")] });
    const t = sortTarget(d, 5, 5)!;
    expect(t).toEqual({ kind: "rows", pos: 0, columns: ["Name", "Score"], header: true });
    expect(sortCount(d, t)).toBe(3);
    const byScore = sortTransform(d, t, { column: 1 }).tr.doc.child(0);
    expect(texts(byScore)).toEqual(["NameScore", "Al9", "Bo12", "Cy100"]);
    const byName = sortTransform(d, t, { column: 0, descending: true }).tr.doc.child(0);
    expect(texts(byName)).toEqual(["NameScore", "Cy100", "Bo12", "Al9"]);
    // Without the header row it sorts with the rest.
    expect(texts(sortTransform(d, t, { column: 0, header: false }).tr.doc.child(0))[0]).toBe("Al9");
  });
});
