import { describe, expect, it } from "vitest";
import type { JSONContent } from "@tiptap/core";
import { acceptAll, compareDocuments, comparisonTitle, listChanges, rejectAll, resolveJSON, schema } from "../src/index.ts";

const p = (...content: JSONContent[]): JSONContent => ({ type: "paragraph", content });
const pa = (attrs: Record<string, unknown>, ...content: JSONContent[]): JSONContent => ({ type: "paragraph", attrs, content });
const h = (level: number, text: string): JSONContent => ({ type: "heading", attrs: { level }, content: [t(text)] });
const t = (text: string, marks?: JSONContent["marks"]): JSONContent => ({ type: "text", text, ...(marks ? { marks } : {}) });
const doc = (...content: JSONContent[]): JSONContent => ({ type: "doc", content });
const cell = (text: string): JSONContent => ({ type: "tableCell", content: [p(t(text))] });
const row = (...cells: string[]): JSONContent => ({ type: "tableRow", content: cells.map(cell) });
const table = (...rows: JSONContent[]): JSONContent => ({ type: "table", content: rows });
const list = (...items: string[]): JSONContent => ({ type: "bulletList", content: items.map((i) => ({ type: "listItem", content: [p(t(i))] })) });
const img = (src: string): JSONContent => ({ type: "image", attrs: { src, alt: src } });
const math = (latex: string): JSONContent => ({ type: "mathInline", attrs: { latex } });

const normal = (d: JSONContent) => schema().nodeFromJSON(d).toJSON() as JSONContent;
let n = 0;
const opts = { author: "Comparison", time: "2026-01-01T00:00:00.000Z", id: () => `s-${++n}` };

/** Compares, checks the result is valid, and that accept all and reject all give each side exactly. */
function roundTrip(a: JSONContent, b: JSONContent): JSONContent {
  const c = compareDocuments(a, b, opts);
  schema().nodeFromJSON(c).check();
  expect(acceptAll(c)).toEqual(normal(b));
  expect(rejectAll(c)).toEqual(normal(a));
  return c;
}

const cases: [string, JSONContent, JSONContent][] = [
  ["the same text", doc(p(t("Same"))), doc(p(t("Same")))],
  ["changed words", doc(p(t("The quick brown fox"))), doc(p(t("The slow brown fox jumps")))],
  ["a word made bold", doc(p(t("Make this bold now"))), doc(p(t("Make this "), t("bold", [{ type: "bold" }]), t(" now")))],
  ["the first paragraph removed", doc(p(t("First")), p(t("Second"))), doc(p(t("Second")))],
  ["a paragraph added first", doc(p(t("Second"))), doc(p(t("First")), p(t("Second")))],
  ["a paragraph added at the end", doc(p(t("One"))), doc(p(t("One")), p(t("Two")))],
  ["a paragraph split", doc(p(t("One two"))), doc(p(t("One")), p(t("two")))],
  ["paragraphs joined", doc(p(t("One")), p(t("two"))), doc(p(t("One two")))],
  ["a heading level", doc(h(1, "Title"), p(t("x"))), doc(h(2, "Title"), p(t("x")))],
  ["a paragraph made a heading", doc(p(t("Intro")), p(t("Body"))), doc(h(1, "Intro"), p(t("Body")))],
  ["alignment", doc(p(t("Centre me"))), doc(pa({ textAlign: "center" }, t("Centre me")))],
  ["alignment and words", doc(pa({ indent: 1 }, t("Old words"))), doc(pa({ textAlign: "right" }, t("New words")))],
  ["a table cell", doc(table(row("a", "b"), row("c", "d"))), doc(table(row("a", "B!"), row("c", "d")))],
  ["a table row added", doc(table(row("a", "b"))), doc(table(row("a", "b"), row("c", "d")))],
  ["a table column added", doc(table(row("a", "b"))), doc(table(row("a", "b", "c")))],
  ["a table replaced by text", doc(p(t("x")), table(row("a"))), doc(p(t("x")), p(t("no table")))],
  ["a list item", doc(list("one", "two", "three")), doc(list("one", "three", "four"))],
  ["a list made paragraphs", doc(list("one", "two")), doc(p(t("one")), p(t("two")))],
  ["an image swapped", doc(img("a.png"), p(t("x"))), doc(img("b.png"), p(t("x")))],
  ["an equation in text", doc(p(t("Area "), math("x^2"), t(" here"))), doc(p(t("Area "), math("\\pi r^2"), t(" here")))],
  ["a code block", doc({ type: "codeBlock", content: [t("let a = 1")] }), doc({ type: "codeBlock", content: [t("let a = 2")] })],
  ["everything", doc(h(1, "Old"), p(t("a")), list("x")), doc(table(row("new")))],
  ["empty to text", doc(p()), doc(p(t("Now there is text")))],
  ["a paragraph made a heading with an anchor, one removed", doc(p(t("The quick fox")), p(t("This goes")), p(t("Last line"))), doc(p(t("The slow fox")), { type: "heading", attrs: { level: 1, id: "h-last" }, content: [t("Last line")] }, p(t("A new ending")))],
  ["a heading's anchor changed", doc({ type: "heading", attrs: { level: 2, id: "a" }, content: [t("Same")] }), doc({ type: "heading", attrs: { level: 2, id: "b" }, content: [t("Same")] })],
];

describe("compare", () => {
  for (const [name, a, b] of cases) it(`accept all gives the revised and reject all the original: ${name}`, () => void roundTrip(a, b));

  it("pairs alike paragraphs and removes unlike ones whole", () => {
    const c = compareDocuments(doc(p(t("The quick fox")), p(t("This goes")), p(t("Last line"))), doc(p(t("The slow fox")), h(1, "Last line"), p(t("A new ending"))), opts);
    expect(listChanges(c).map((x) => `${x.kind}:${x.text}`)).toEqual(["deletion:quick", "insertion:slow", "deletion:This goes", expect.stringMatching(/^format:/), "insertion:A new ending"]);
  });

  it("finds no changes in the same text", () => {
    expect(listChanges(roundTrip(doc(p(t("Same"))), doc(p(t("Same")))))).toEqual([]);
  });

  it("lists word changes, block changes and formatting by the comparison's author", () => {
    const c = roundTrip(doc(p(t("Keep this")), p(t("Drop me")), p(t("Plain"))), doc(p(t("Keep that")), pa({ textAlign: "center" }, t("Plain")), p(t("Added"))));
    const changes = listChanges(c);
    expect(changes.every((x) => x.author === "Comparison")).toBe(true);
    expect(changes.map((x) => `${x.kind}:${x.text}`)).toEqual(expect.arrayContaining(["deletion:this", "insertion:that", "deletion:Drop me", "insertion:Added"]));
    expect(changes.some((x) => x.kind === "format" && x.format === "Align centre")).toBe(true);
  });

  it("accepts one change and leaves the rest", () => {
    const c = compareDocuments(doc(p(t("One")), p(t("Two"))), doc(p(t("Two")), p(t("Three"))), opts);
    const removed = listChanges(c).find((x) => x.text === "One")!;
    const after = resolveJSON(c, new Set([removed.id]), "accept");
    expect(listChanges(after).map((x) => x.text)).toEqual(["Three"]);
    expect(rejectAll(after)).toEqual(normal(doc(p(t("Two")))));
  });

  it("reads each document with its own suggestions accepted", () => {
    const sug = { id: "s-x", author: "Ann", time: "" };
    const a = doc(p(t("Hello "), t("there", [{ type: "insertion", attrs: sug }])));
    const c = compareDocuments(a, doc(p(t("Hello there"))), opts);
    expect(listChanges(c)).toEqual([]);
  });

  it("keeps the revised document's comments and drops the original's from removed text", () => {
    const cm = (id: string) => [{ type: "comment", attrs: { id } }];
    const c = compareDocuments(doc(p(t("old", cm("c1")), t(" same"))), doc(p(t("new", cm("c2")), t(" same"))), opts);
    expect(JSON.stringify(c)).toContain('"c2"');
    expect(JSON.stringify(c)).not.toContain('"c1"');
  });

  it("names the result after both documents", () => {
    expect(comparisonTitle("Draft", "Final")).toBe("Comparison of Draft and Final");
    expect(comparisonTitle("", "Final")).toBe("Comparison of Untitled and Final");
  });
});
