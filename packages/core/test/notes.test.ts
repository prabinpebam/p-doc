import { describe, expect, it } from "vitest";
import { EditorState, TextSelection } from "@tiptap/pm/state";
import { fixNotes, formatNumber, noteLabels, noteLabelsOf, notesOf, paginate, refsOf, schema, sheetsOf, type BlockBox } from "../src/index.ts";

const text = (t: string) => ({ type: "text", text: t });
const ref = (id: string, kind = "footnote") => ({ type: "noteRef", attrs: { id, kind } });
const note = (id: string, t: string, kind = "footnote") => ({ type: "note", attrs: { id, kind }, content: [{ type: "paragraph", content: [text(t)] }] });

function make(content: unknown[]): EditorState {
  return EditorState.create({ schema: schema(), doc: schema().nodeFromJSON({ type: "doc", content }) });
}
const settle = (s: EditorState) => {
  const tr = fixNotes(s);
  return tr ? s.apply(tr) : s;
};
const bodies = (s: EditorState) => {
  const box = notesOf(s.doc);
  const out: string[] = [];
  box?.node.forEach((n) => void out.push(`${n.attrs.kind[0]}:${n.textContent}`));
  return out;
};
const labels = (s: EditorState) => refsOf(s.doc).map((r) => noteLabels(s.doc).get(r.id));

describe("notes", () => {
  it("formats numbers as Word does", () => {
    expect([1, 2, 3, 4, 9].map((n) => formatNumber(n, "i"))).toEqual(["i", "ii", "iii", "iv", "ix"]);
    expect([1, 26, 27].map((n) => formatNumber(n, "a"))).toEqual(["a", "z", "aa"]);
    expect([1, 2, 5].map((n) => formatNumber(n, "*"))).toEqual(["*", "†", "**"]);
    expect(formatNumber(14, "I")).toBe("XIV");
  });

  it("gives a new reference a note, numbers footnotes 1, 2 and endnotes i, ii, footnotes first", () => {
    let s = make([{ type: "paragraph", content: [text("A"), ref("x"), text(" B"), ref("y", "endnote"), text(" C"), ref("z")] }]);
    s = settle(s);
    expect(bodies(s)).toEqual(["f:", "f:", "e:"]);
    expect(labels(s)).toEqual(["1", "i", "2"]);
    expect(fixNotes(s)).toBeNull();
  });

  it("deleting a reference deletes its note and renumbers; pasting it back brings the note", () => {
    let s = make([{ type: "paragraph", content: [text("A"), ref("x"), text(" B"), ref("y")] }, { type: "notes", content: [note("x", "first"), note("y", "second")] }]);
    expect(fixNotes(s)).toBeNull();
    const at = refsOf(s.doc)[0]!.pos;
    const cut = s.doc.slice(at, at + 1);
    s = settle(s.apply(s.tr.delete(at, at + 1)));
    expect(bodies(s)).toEqual(["f:second"]);
    expect(labels(s)).toEqual(["1"]);
    s = settle(s.apply(s.tr.replace(2, 2, cut)));
    expect(bodies(s)).toEqual(["f:first", "f:second"]);
    expect(labels(s)).toEqual(["1", "2"]);
  });

  it("removes the notes container with the last reference, and keeps a paragraph before the notes", () => {
    let s = make([{ type: "paragraph", content: [text("A"), ref("x")] }, { type: "horizontalRule" }, { type: "notes", content: [note("x", "only")] }]);
    s = settle(s);
    expect(s.doc.child(s.doc.childCount - 2).type.name).toBe("paragraph");
    const at = refsOf(s.doc)[0]!.pos;
    s = settle(s.apply(s.tr.delete(at, at + 1)));
    expect(notesOf(s.doc)).toBeNull();
  });

  it("a copied reference gets a copy of the note", () => {
    let s = make([{ type: "paragraph", content: [text("A"), ref("x")] }, { type: "notes", content: [note("x", "body")] }]);
    const at = refsOf(s.doc)[0]!.pos;
    s = settle(s.apply(s.tr.replace(1, 1, s.doc.slice(at, at + 1))));
    const ids = refsOf(s.doc).map((r) => r.id);
    expect(new Set(ids).size).toBe(2);
    expect(bodies(s)).toEqual(["f:body", "f:body"]);
  });

  it("converting a reference moves its note to the endnotes and keeps a caret in it", () => {
    let s = make([{ type: "paragraph", content: [text("A"), ref("x"), ref("y")] }, { type: "notes", content: [note("x", "one"), note("y", "two")] }]);
    const box = notesOf(s.doc)!;
    const inX = box.pos + 1 + 1 + 1 + 2; // container, note, paragraph, two characters in
    s = s.apply(s.tr.setSelection(TextSelection.create(s.doc, inX)));
    const r = refsOf(s.doc)[0]!;
    s = settle(s.apply(s.tr.setNodeMarkup(r.pos, undefined, { id: "x", kind: "endnote" })));
    expect(bodies(s)).toEqual(["f:two", "e:one"]);
    const $h = s.selection.$head;
    expect($h.parent.textContent).toBe("one");
    expect($h.parentOffset).toBe(2);
  });

  it("labels stored content the same way (exports)", () => {
    const content = { type: "doc", content: [{ type: "paragraph", content: [ref("a"), ref("b", "endnote"), ref("c")] }, { type: "notes", attrs: { footFormat: "a", endFormat: "1" }, content: [note("a", "1"), note("c", "2"), note("b", "3", "endnote")] }] };
    expect([...noteLabelsOf(content).entries()]).toEqual([
      ["a", "a"],
      ["b", "1"],
      ["c", "b"],
    ]);
  });
});

describe("paginate with footnotes (A8)", () => {
  const H = 1000;
  const SEP = 20;

  it("shrinks the page's text area by its notes and moves a block whose note doesn't fit", () => {
    const blocks: BlockBox[] = [{ height: 600 }, { height: 200, notes: [{ height: 100 }] }, { height: 150, notes: [{ height: 60 }] }];
    const r = paginate(blocks, H, { noteSep: SEP });
    // 600 + 200 + 20 + 100 = 920 fits; adding 150 + 60 does not.
    expect(r.pageOf).toEqual([1, 1, 2]);
    expect(r.notes).toEqual([{ page: 1 }, { page: 2 }]);
  });

  it("the separator is counted once per page", () => {
    const blocks: BlockBox[] = Array.from({ length: 4 }, () => ({ height: 100, notes: [{ height: 100 }] }));
    const r = paginate(blocks, H, { noteSep: SEP });
    // 4 × 200 + 20 = 820.
    expect(r.pages).toBe(1);
  });

  it("puts a split paragraph's note on the page its reference line is on", () => {
    const ls = Array.from({ length: 39 }, (_, k) => (k + 1) * 20); // 40 lines of 20 px
    const blocks: BlockBox[] = [{ height: 700 }, { height: 800, lines: () => ls, widows: true, notes: [{ height: 40, line: () => 3 }, { height: 40, line: () => 30 }] }];
    const r = paginate(blocks, H, { noteSep: SEP });
    expect(r.notes.map((n) => n.page)).toEqual([1, 2]);
    // Page 1: 700 + lines up to the room left after the note (1000 - 700 - 20 - 40 = 240 → 12 lines).
    expect(r.startLines[1]).toBe(12);
  });

  it("a long last note continues on the next page, above that page's notes", () => {
    const noteLines = Array.from({ length: 29 }, (_, k) => (k + 1) * 20); // 30 lines, 600 px
    const blocks: BlockBox[] = [{ height: 500 }, { height: 100, notes: [{ height: 600, lines: () => noteLines }] }, { height: 900 }];
    const r = paginate(blocks, H, { noteSep: SEP });
    // Room for the note on page 1: 1000 - 600 - 20 = 380 → 19 lines (380 px).
    expect(r.notes).toEqual([{ page: 1, cut: 380 }]);
    // Page 2 keeps 20 + 220 for the rest of the note: the 900 px block doesn't fit with it, so it moves on to page 3.
    expect(r.pageOf).toEqual([1, 1, 3]);
    expect(sheetsOf(r).map((x) => [x.start, x.end, x.page, x.span])).toEqual([
      [0, 2, 1, 1],
      [2, 2, 2, 1],
      [2, 3, 3, 1],
    ]);
  });

  it("without line breaks a long note moves with its line (A10 fallback)", () => {
    const blocks: BlockBox[] = [{ height: 500 }, { height: 100, notes: [{ height: 600 }] }];
    const r = paginate(blocks, H, { noteSep: SEP });
    expect(r.pageOf).toEqual([1, 2]);
    expect(r.notes).toEqual([{ page: 2 }]);
  });
});
