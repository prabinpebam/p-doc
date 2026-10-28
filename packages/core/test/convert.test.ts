import { describe, expect, it } from "vitest";
import type { JSONContent } from "@tiptap/core";
import { createDocument, fromHTML, fromMarkdown, fromText, importKind, nodeText, titleFromFile, toHTML, toMarkdown, toText } from "../src/index.ts";

const sample = (): JSONContent => ({
  type: "doc",
  content: [
    { type: "heading", attrs: { level: 1, id: "h-1" }, content: [{ type: "text", text: "Plan" }] },
    { type: "paragraph", content: [{ type: "text", text: "Some " }, { type: "text", text: "bold", marks: [{ type: "bold" }] }, { type: "text", text: " and " }, { type: "text", text: "link", marks: [{ type: "link", attrs: { href: "https://example.com" } }] }] },
    { type: "bulletList", content: [{ type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "one" }] }] }, { type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "two" }] }] }] },
    { type: "orderedList", attrs: { start: 1 }, content: [{ type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "first" }] }] }] },
    { type: "table", content: [
      { type: "tableRow", content: [{ type: "tableHeader", content: [{ type: "paragraph", content: [{ type: "text", text: "A" }] }] }, { type: "tableHeader", content: [{ type: "paragraph", content: [{ type: "text", text: "B" }] }] }] },
      { type: "tableRow", content: [{ type: "tableCell", content: [{ type: "paragraph", content: [{ type: "text", text: "1" }] }] }, { type: "tableCell", content: [{ type: "paragraph", content: [{ type: "text", text: "2" }] }] }] },
    ] },
    { type: "paragraph", content: [{ type: "text", text: "kept " }, { type: "text", text: "gone", marks: [{ type: "deletion", attrs: { id: "s1", author: "A", time: "" } }] }, { type: "text", text: "added", marks: [{ type: "insertion", attrs: { id: "s2", author: "A", time: "" } }] }] },
  ],
});

describe("export", () => {
  it("writes Markdown with headings, emphasis, links, lists and tables, suggestions applied", () => {
    const md = toMarkdown(createDocument({ content: sample() }));
    expect(md).toContain("# Plan");
    expect(md).toContain("Some **bold** and [link](https://example.com)");
    expect(md).toContain("- one\n- two");
    expect(md).toContain("1. first");
    expect(md).toContain("| A | B |\n| --- | --- |\n| 1 | 2 |");
    expect(md).toContain("kept added");
    expect(md).not.toContain("gone");
  });

  it("writes a standalone web page", () => {
    const html = toHTML(createDocument({ title: "A <b>", content: sample() }));
    expect(html).toMatch(/^<!doctype html>/);
    expect(html).toContain("<title>A &lt;b&gt;</title>");
    expect(html).toContain('<h1 id="h-1">Plan</h1>');
    expect(html).toContain("<strong>bold</strong>");
    expect(html).toContain("<table");
  });

  it("writes plain text", () => {
    const txt = toText(createDocument({ content: sample() }));
    expect(txt).toContain("Plan\nSome bold and link\n• one\n• two\n1. first\nA\tB\n1\t2\nkept added\n");
  });
});

describe("import", () => {
  it("reads Markdown into the same structure", () => {
    const c = fromMarkdown("# Plan\n\nSome **bold** and [link](https://example.com)\n\n- one\n- two\n\n| A | B |\n| --- | --- |\n| 1 | 2 |\n\n- [x] done\n- [ ] todo\n");
    expect(c.content!.map((n) => n.type)).toEqual(["heading", "paragraph", "bulletList", "table", "taskList"]);
    expect(c.content![1]!.content!.find((n) => n.text === "bold")!.marks).toEqual([{ type: "bold" }]);
    expect(c.content![4]!.content![0]!.attrs!.checked).toBe(true);
  });

  it("round-trips Markdown", () => {
    const md = toMarkdown(createDocument({ content: sample() }));
    const back = toMarkdown(createDocument({ content: fromMarkdown(md) }));
    expect(back).toBe(md);
  });

  it("reads HTML and drops scripts and unsafe links", () => {
    const c = fromHTML('<h2>T</h2><script>alert(1)</script><p>x <a href="javascript:alert(1)">bad</a> <a href="https://ok.example">ok</a></p>');
    expect(c.content!.map((n) => n.type)).toEqual(["heading", "paragraph"]);
    expect(JSON.stringify(c)).not.toContain("alert");
    expect(JSON.stringify(c)).toContain("https://ok.example");
  });

  it("reads text line by line", () => {
    const c = fromText("a\r\n\r\nb\n");
    expect(c.content!.map(nodeText)).toEqual(["a", "", "b"]);
  });

  it("knows file kinds and titles", () => {
    expect(importKind("x.DOCX")).toBe("docx");
    expect(importKind("x.pdoc.json")).toBe("pdoc");
    expect(importKind("x.pdf")).toBeNull();
    expect(titleFromFile("C:\\a\\Quarterly_report.docx")).toBe("Quarterly report");
  });
});
