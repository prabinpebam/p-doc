import { describe, expect, it } from "vitest";
import { cleanPage, createDocument, defaultPage, defaultPaper, documentPath, FormatError, headerFooterText, parseDocument, schema, serializeDocument, slug } from "../src/index.ts";

describe("format", () => {
  it("round-trips a document through readable, pretty-printed JSON", () => {
    const doc = createDocument({ title: "Plan", content: { type: "doc", content: [{ type: "heading", attrs: { level: 1 }, content: [{ type: "text", text: "Hi" }] }] } });
    const text = serializeDocument(doc);
    expect(text).toContain('\n  "format": "p-doc"');
    expect(text.endsWith("\n")).toBe(true);
    expect(parseDocument(text)).toEqual(doc);
  });

  it("cleans a stored page setup: keeps valid values, replaces bad ones with defaults", () => {
    const d = defaultPage();
    const good = cleanPage({ mode: "pageless", size: "a4", orientation: "landscape", margins: { top: 0.5, bottom: 2, left: 1.25, right: 0 }, color: "#FFF8E1", textWidth: "narrow", header: "{title}", footerAlign: "right", differentFirstPage: true, firstFooter: "x" });
    expect(good).toMatchObject({ mode: "pageless", size: "a4", orientation: "landscape", margins: { top: 0.5, bottom: 2, left: 1.25, right: 0 }, color: "#FFF8E1", textWidth: "narrow", header: "{title}", footerAlign: "right", differentFirstPage: true, firstFooter: "x" });
    const bad = cleanPage({ mode: "scroll", size: "a0", orientation: 1, margins: { top: -1, bottom: 11, left: Number.NaN, right: "1" }, color: "red", textWidth: "huge", header: 5, headerAlign: "justify", differentFirstPage: "yes", footer: "f".repeat(900) });
    expect(bad).toEqual({ ...d, footer: "f".repeat(500) });
    expect(cleanPage(null)).toEqual(d);
    expect(cleanPage("nonsense")).toEqual(d);
  });

  it("keeps a watermark (11.4) and columns (11.2) only when they make sense", () => {
    expect(cleanPage({ watermark: { text: "  Draft  ", color: "#F2B8B5", layout: "flat" } }).watermark).toEqual({ text: "Draft", color: "#f2b8b5", layout: "flat" });
    expect(cleanPage({ watermark: { text: "Draft", color: "red", layout: "sideways" } }).watermark).toEqual({ text: "Draft", color: "#c8c8c8", layout: "diagonal" });
    expect(cleanPage({ watermark: { text: "   " } }).watermark).toBeNull();
    expect(cleanPage({ watermark: { text: "x".repeat(300) } }).watermark?.text).toHaveLength(100);
    expect(cleanPage({ columns: { count: 3, gap: 0.25 } }).columns).toEqual({ count: 3, gap: 0.25 });
    expect(cleanPage({ columns: { count: 7, gap: -1 } }).columns).toEqual({ count: 1, gap: 0.5 });
  });

  it("fills settings an older writer left out", () => {
    const d = parseDocument(JSON.stringify({ format: "p-doc", version: 1, id: "x", content: { type: "doc", content: [] }, page: { size: "a4" } }));
    expect(d.title).toBe("Untitled document");
    expect(d.page.size).toBe("a4");
    expect(d.page.margins.top).toBe(1);
    expect(d.styles.heading1.fontSize).toBe(20);
    expect(d.comments).toEqual([]);
  });

  it("refuses what isn't a P-Doc document", () => {
    expect(() => parseDocument("{")).toThrow(FormatError);
    expect(() => parseDocument('{"format":"x"}')).toThrow(/Not a P-Doc/);
    expect(() => parseDocument('{"format":"p-doc","version":99,"id":"a","content":{"type":"doc"}}')).toThrow(/newer/);
  });

  it("names files by slug and id", () => {
    expect(slug("Ünïcode & Things: A Plan!")).toBe("unicode-things-a-plan");
    expect(slug("")).toBe("untitled");
    expect(documentPath({ id: "12345678-aaaa-bbbb-cccc-dddddddddddd", title: "My Plan" })).toBe("docs/my-plan-12345678.pdoc.json");
  });

  it("chooses Letter in the US and A4 elsewhere", () => {
    expect(defaultPaper("en-US")).toBe("letter");
    expect(defaultPaper("en-GB")).toBe("a4");
    expect(defaultPaper("de-DE")).toBe("a4");
  });

  it("fills page number tokens and honours a different first page", () => {
    const d = createDocument();
    d.page.footer = "Page {page} of {pages}";
    d.page.differentFirstPage = true;
    d.page.firstFooter = "";
    expect(headerFooterText(d.page, "footer", 1, 3)).toBe("");
    expect(headerFooterText(d.page, "footer", 2, 3)).toBe("Page 2 of 3");
  });

  it("loads content with every node and mark P-Doc writes", () => {
    const content = {
      type: "doc",
      content: [
        { type: "paragraph", attrs: { textStyle: "title", lineHeight: "1.5", spaceAfter: 12, indent: 1, textAlign: "center" }, content: [{ type: "text", text: "T", marks: [{ type: "bold" }, { type: "textStyle", attrs: { fontSize: "14pt", color: "#ff0000", fontFamily: "Georgia" } }, { type: "highlight", attrs: { color: "#ffff00" } }] }] },
        { type: "heading", attrs: { level: 4, id: "h-1" }, content: [{ type: "text", text: "H", marks: [{ type: "insertion", attrs: { id: "s1", author: "A", time: "t" } }] }] },
        { type: "pageBreak" },
        { type: "tableOfContents", attrs: { entries: [{ id: "h-1", level: 1, text: "H" }] } },
        { type: "taskList", content: [{ type: "taskItem", attrs: { checked: true }, content: [{ type: "paragraph", content: [{ type: "text", text: "x", marks: [{ type: "comment", attrs: { id: "c1" } }] }] }] }] },
        { type: "table", content: [{ type: "tableRow", content: [{ type: "tableCell", content: [{ type: "paragraph" }] }] }] },
        { type: "image", attrs: { src: "data:image/png;base64,AAAA", alt: "a" } },
        { type: "horizontalRule" },
      ],
    };
    const node = schema().nodeFromJSON(content);
    node.check();
    expect(node.toJSON().content[0].attrs.textStyle).toBe("title");
  });
});
