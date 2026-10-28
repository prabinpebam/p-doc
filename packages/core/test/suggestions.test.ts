import { describe, expect, it } from "vitest";
import type { JSONContent } from "@tiptap/core";
import { EditorState, TextSelection } from "@tiptap/pm/state";
import { history, undo } from "@tiptap/pm/history";
import { acceptAll, changesOf, listChanges, rejectAll, resolveJSON, schema, suggestPlugin, nodeText } from "../src/index.ts";

const p = (text: string): JSONContent => ({ type: "paragraph", content: text ? [{ type: "text", text }] : [] });
const start = (...paras: string[]) => EditorState.create({ schema: schema(), doc: schema().nodeFromJSON({ type: "doc", content: paras.map(p) }), plugins: [suggestPlugin("Ann", true), history()] });

/** Position of a text offset inside the n-th paragraph. */
const at = (s: EditorState, para: number, offset: number) => {
  let pos = 0;
  s.doc.forEach((_n, off, i) => {
    if (i === para) pos = off + 1 + offset;
  });
  return pos;
};
const texts = (c: JSONContent) => (c.content ?? []).map(nodeText);
const type = (s: EditorState, pos: number, text: string) => {
  for (const ch of text) {
    s = s.apply(s.tr.setSelection(TextSelection.create(s.doc, pos)).insertText(ch));
    pos++;
  }
  return s;
};
/** Like the editor: the caret is placed first, then Backspace deletes before it (joining at a paragraph start). */
const backspace = (s: EditorState, pos: number, times: number) => {
  s = s.apply(s.tr.setSelection(TextSelection.create(s.doc, pos)));
  for (let i = 0; i < times; i++) {
    const from = s.selection.from;
    const atStart = s.selection.$from.parentOffset === 0;
    s = s.apply(s.tr.delete(atStart ? from - 2 : from - 1, from));
  }
  return s;
};

describe("suggestions", () => {
  it("records typed text as one insertion with author and time", () => {
    let s = start("Hello world");
    s = type(s, at(s, 0, 5), " big");
    const changes = changesOf(s.doc);
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({ kind: "insertion", author: "Ann", text: " big" });
    expect(changes[0]!.time).toMatch(/^\d{4}-/);
    expect(nodeText(s.doc.toJSON().content[0])).toBe("Hello big world");
  });

  it("keeps deleted text visible as a deletion; backspacing continues leftwards", () => {
    let s = start("Hello world");
    s = backspace(s, at(s, 0, 11), 5);
    expect(nodeText(s.doc.toJSON().content[0])).toBe("Hello world");
    const changes = changesOf(s.doc);
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({ kind: "deletion", text: "world" });
    expect(s.selection.from).toBe(at(s, 0, 6));
  });

  it("removes your own suggestion when you delete it", () => {
    let s = start("Hi");
    s = type(s, at(s, 0, 2), " there");
    s = backspace(s, at(s, 0, 8), 6);
    expect(changesOf(s.doc)).toHaveLength(0);
    expect(nodeText(s.doc.toJSON().content[0])).toBe("Hi");
  });

  it("replacing a selection makes a deletion and an insertion", () => {
    let s = start("The cat sat");
    s = s.apply(s.tr.setSelection(TextSelection.create(s.doc, at(s, 0, 4), at(s, 0, 7))).insertText("dog"));
    const kinds = changesOf(s.doc).map((c) => `${c.kind}:${c.text}`);
    expect(kinds.sort()).toEqual(["deletion:cat", "insertion:dog"]);
  });

  it("accept-all gives the suggested text and reject-all the original, exactly (PD5)", () => {
    const original = start("First line here", "Second line");
    let s = original;
    s = type(s, at(s, 0, 5), " new");
    s = backspace(s, at(s, 1, 6), 6);
    s = type(s, at(s, 1, 0), "2nd");
    // Enter in the middle of the first paragraph.
    s = s.apply(s.tr.setSelection(TextSelection.create(s.doc, at(s, 0, 9))).split(at(s, 0, 9)));
    const json = s.doc.toJSON() as JSONContent;
    expect(texts(acceptAll(json))).toEqual(["First new", " line here", "2nd line"]);
    expect(rejectAll(json)).toEqual(original.doc.toJSON());
  });

  it("deleting a paragraph boundary is a suggestion too", () => {
    const original = start("One", "Two");
    let s = backspace(original, at(original, 1, 0), 1);
    expect(s.doc.childCount).toBe(2);
    const json = s.doc.toJSON() as JSONContent;
    expect(listChanges(json).map((c) => c.text)).toEqual(["¶"]);
    expect(texts(acceptAll(json))).toEqual(["OneTwo"]);
    expect(rejectAll(json)).toEqual(original.doc.toJSON());
  });

  it("accepts or rejects one change by id", () => {
    let s = start("a b");
    s = type(s, at(s, 0, 3), " c");
    s = backspace(s, at(s, 0, 1), 1);
    const json = s.doc.toJSON() as JSONContent;
    const ins = listChanges(json).find((c) => c.kind === "insertion")!;
    const out = resolveJSON(json, new Set([ins.id]), "accept");
    expect(listChanges(out).map((c) => c.kind)).toEqual(["deletion"]);
    expect(nodeText(out.content![0])).toBe("a b c");
  });

  it("does nothing when Suggesting is off, and undo works", () => {
    let s = EditorState.create({ schema: schema(), doc: schema().nodeFromJSON({ type: "doc", content: [p("x")] }), plugins: [suggestPlugin("Ann", false), history()] });
    s = s.apply(s.tr.insertText("y", 2));
    expect(changesOf(s.doc)).toHaveLength(0);
    let s2 = start("x");
    s2 = type(s2, 2, "y");
    let undone: EditorState | null = null;
    undo(s2, (tr) => (undone = s2.apply(tr)));
    expect(nodeText((undone as unknown as EditorState).doc.toJSON().content[0])).toBe("x");
  });
});
