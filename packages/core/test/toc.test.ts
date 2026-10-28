import { describe, expect, it } from "vitest";
import { EditorState } from "@tiptap/pm/state";
import { anchorsOf, bookmarkName, schema, syncHeadingsAndToc, tocEntriesOf } from "../src/index.ts";

const make = () =>
  EditorState.create({
    schema: schema(),
    doc: schema().nodeFromJSON({
      type: "doc",
      content: [
        { type: "tableOfContents" },
        { type: "heading", attrs: { level: 1 }, content: [{ type: "text", text: "One" }] },
        { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Two" }] },
        { type: "heading", attrs: { level: 4 }, content: [{ type: "text", text: "Deep" }] },
      ],
    }),
  });

describe("toc", () => {
  it("gives headings unique ids and fills the table of contents with levels 1–3", () => {
    let state = make();
    state = state.apply(syncHeadingsAndToc(state)!);
    const entries = state.doc.firstChild!.attrs.entries;
    expect(entries.map((e: { text: string; level: number }) => [e.level, e.text])).toEqual([
      [1, "One"],
      [2, "Two"],
    ]);
    expect(entries.every((e: { id: string }) => /^h-[0-9a-f]{8}$/.test(e.id))).toBe(true);
    expect(syncHeadingsAndToc(state)).toBeNull();
  });

  it("updates when a heading changes, with no refresh step", () => {
    let state = make();
    state = state.apply(syncHeadingsAndToc(state)!);
    let pos = 0;
    state.doc.forEach((n, off) => {
      if (n.textContent === "Two") pos = off;
    });
    const tr = state.tr.insertText(" renamed", pos + 1 + 3);
    state = state.apply(tr);
    state = state.apply(syncHeadingsAndToc(state)!);
    expect(tocEntriesOf(state.doc).map((e) => e.text)).toEqual(["One", "Two renamed"]);
    expect(state.doc.firstChild!.attrs.entries[1].text).toBe("Two renamed");
  });

  it("renews duplicate ids after a heading is copied", () => {
    let state = make();
    state = state.apply(syncHeadingsAndToc(state)!);
    const first = state.doc.child(1);
    state = state.apply(state.tr.insert(state.doc.content.size, first));
    state = state.apply(syncHeadingsAndToc(state)!);
    const ids = tocEntriesOf(state.doc).map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("gives a pasted bookmark a new id and lists headings and bookmarks in document order (10.2)", () => {
    let state = EditorState.create({
      schema: schema(),
      doc: schema().nodeFromJSON({
        type: "doc",
        content: [
          { type: "heading", attrs: { level: 1, id: "h-a" }, content: [{ type: "text", text: "One" }] },
          { type: "paragraph", content: [{ type: "bookmark", attrs: { id: "bm-1", name: "Here" } }, { type: "text", text: "text" }] },
          { type: "paragraph", content: [{ type: "bookmark", attrs: { id: "bm-1", name: "Here" } }, { type: "text", text: "copy" }] },
        ],
      }),
    });
    state = state.apply(syncHeadingsAndToc(state)!);
    const anchors = anchorsOf(state.doc);
    expect(anchors.map((a) => [a.kind, a.label])).toEqual([["heading", "One"], ["bookmark", "Here"], ["bookmark", "Here"]]);
    expect(anchors[1]!.id).toBe("bm-1");
    expect(anchors[2]!.id).toMatch(/^bm-[0-9a-f]{8}$/);
    expect(syncHeadingsAndToc(state)).toBeNull();
  });

  it("names a bookmark from the next words", () => {
    expect(bookmarkName("The key figure is here.")).toBe("The key figure is");
    expect(bookmarkName("", "ends the paragraph.")).toBe("ends the paragraph");
    expect(bookmarkName("")).toBe("Bookmark");
  });
});
