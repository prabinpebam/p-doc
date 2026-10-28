import { describe, expect, it } from "vitest";
import type { JSONContent } from "@tiptap/core";
import { createDocument, nodeText } from "../src/index.ts";
import { fromDocx, imageSize, toDocx } from "../src/docx.ts";

// A 2×1 red PNG.
const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAYAAAD0In+KAAAAEUlEQVR4nGP4z8DAwMDAAAAPAAH/X7pt6QAAAABJRU5ErkJggg==";

const sample = (): JSONContent => ({
  type: "doc",
  content: [
    { type: "paragraph", attrs: { textStyle: "title" }, content: [{ type: "text", text: "Report" }] },
    { type: "heading", attrs: { level: 1 }, content: [{ type: "text", text: "Intro" }] },
    { type: "paragraph", content: [{ type: "text", text: "Plain " }, { type: "text", text: "bold", marks: [{ type: "bold" }] }, { type: "text", text: " " }, { type: "text", text: "italic", marks: [{ type: "italic" }] }, { type: "text", text: " " }, { type: "text", text: "site", marks: [{ type: "link", attrs: { href: "https://example.com/" } }] }] },
    { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "List" }] },
    { type: "bulletList", content: ["a", "b"].map((x) => ({ type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: x }] }] })) },
    { type: "orderedList", content: ["one", "two"].map((x) => ({ type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: x }] }] })) },
    { type: "table", content: [["H1", "H2"], ["c1", "c2"]].map((r) => ({ type: "tableRow", content: r.map((x) => ({ type: "tableCell", content: [{ type: "paragraph", content: [{ type: "text", text: x }] }] })) })) },
    { type: "image", attrs: { src: PNG, alt: "red" } },
    { type: "paragraph", content: [{ type: "text", text: "old", marks: [{ type: "deletion", attrs: { id: "s1", author: "Ann", time: "2026-10-28T10:00:00.000Z" } }] }, { type: "text", text: "new", marks: [{ type: "insertion", attrs: { id: "s2", author: "Ann", time: "2026-10-28T10:00:00.000Z" } }] }] },
  ],
});

const unzip = async (bytes: Uint8Array, name: string) => {
  // docx is a zip; JSZip ships with the docx package.
  const JSZip = (await import("jszip")).default;
  return (await JSZip.loadAsync(bytes)).file(name)!.async("string");
};

describe("export-docx", () => {
  it("writes paragraph layout: indents, exact spacing, keep rules, borders, shading, direction, tab stops and tabs (U44–U47)", async () => {
    const layout = {
      right: 0.5,
      first: -0.25,
      lineRule: "exact",
      keepNext: true,
      keepLines: true,
      breakBefore: true,
      widows: false,
      borders: { top: { width: 1, color: "#336699" } },
      shading: "#ffff00",
      dir: "rtl",
      tabs: [{ pos: 3, align: "right", leader: "dots" }],
    };
    const content: JSONContent = { type: "doc", content: [{ type: "paragraph", attrs: { indent: 1, lineHeight: 18, layout }, content: [{ type: "text", text: "Name" }, { type: "tab" }, { type: "text", text: "12" }] }] };
    const xml = await unzip(await toDocx(createDocument({ content })), "word/document.xml");
    // Half an inch of indent plus a quarter-inch hang: 0.75 in from the margin, the first line pulled back 0.25 in.
    expect(xml).toMatch(/<w:ind [^>]*w:left="1080"/);
    expect(xml).toMatch(/<w:ind [^>]*w:right="720"/);
    expect(xml).toMatch(/<w:ind [^>]*w:hanging="360"/);
    expect(xml).toMatch(/<w:spacing [^>]*w:line="360"[^>]*w:lineRule="exact"|<w:spacing [^>]*w:lineRule="exact"[^>]*w:line="360"/);
    expect(xml).toContain("<w:keepNext/>");
    expect(xml).toContain("<w:keepLines/>");
    expect(xml).toContain("<w:pageBreakBefore/>");
    expect(xml).toMatch(/<w:widowControl w:val="(false|0)"\/>/);
    expect(xml).toMatch(/<w:top w:val="single" w:color="336699" w:sz="8" w:space="1"\/>|<w:top [^>]*w:sz="8"/);
    expect(xml).toMatch(/<w:shd [^>]*w:fill="FFFF00"/);
    expect(xml).toContain("<w:bidi/>");
    expect(xml).toMatch(/<w:tab w:val="right" w:pos="4320" w:leader="dot"\/>/);
    expect(xml).toMatch(/<w:r>(<w:rPr\/>)?<w:tab\/><\/w:r>/);
  });

  it("writes page size, margins, header/footer page numbers and tracked changes", async () => {
    const doc = createDocument({ title: "Report", content: sample() });
    doc.page.size = "a4";
    doc.page.orientation = "landscape";
    doc.page.margins = { top: 0.5, bottom: 0.5, left: 0.75, right: 0.75 };
    doc.page.footer = "Page {page} of {pages}";
    const bytes = await toDocx(doc);
    const xml = await unzip(bytes, "word/document.xml");
    expect(xml).toMatch(/<w:pgSz w:w="16838" w:h="11906" w:orient="landscape"\/>/);
    expect(xml).toMatch(/w:top="720"/);
    expect(xml).toMatch(/w:left="1080"/);
    expect(xml).toContain("<w:ins ");
    expect(xml).toContain("<w:del ");
    const files = Object.keys((await (await import("jszip")).default.loadAsync(bytes)).files);
    const footer = await unzip(bytes, files.find((f) => /word\/footer\d*\.xml/.test(f))!);
    expect(footer).toContain("PAGE");
    expect(footer).toContain("NUMPAGES");
  });

  it("round-trips: re-import gives the same structure", async () => {
    const { content, warnings } = await fromDocx(await toDocx(createDocument({ content: sample() })));
    const types = content.content!.map((n) => n.type);
    expect(types).toEqual(["paragraph", "heading", "paragraph", "heading", "bulletList", "orderedList", "table", "image", "paragraph"]);
    expect(content.content![0]!.attrs!.textStyle).toBe("title");
    expect(content.content![1]!.attrs!.level).toBe(1);
    const para = content.content![2]!.content!;
    expect(para.find((n) => n.text === "bold")!.marks).toEqual([{ type: "bold" }]);
    expect(para.find((n) => n.text === "italic")!.marks).toEqual([{ type: "italic" }]);
    expect(para.find((n) => n.text === "site")!.marks!.find((m) => m.type === "link")!.attrs!.href).toBe("https://example.com/");
    expect(content.content![5]!.content!.map(nodeText)).toEqual(["one", "two"]);
    expect(content.content![6]!.content!.map((r) => r.content!.map(nodeText))).toEqual([["H1", "H2"], ["c1", "c2"]]);
    expect(JSON.stringify(content.content![7])).toContain("data:image/png;base64,");
    expect(warnings).toEqual([]);
  });
});

const withNotes = (): JSONContent => ({
  type: "doc",
  content: [
    { type: "paragraph", content: [{ type: "text", text: "Claim" }, { type: "noteRef", attrs: { id: "a", kind: "footnote" } }, { type: "text", text: " and more" }, { type: "noteRef", attrs: { id: "b", kind: "endnote" } }] },
    { type: "paragraph", content: [{ type: "text", text: "Second" }, { type: "noteRef", attrs: { id: "c", kind: "footnote" } }] },
    { type: "notes", attrs: { footFormat: "decimal", endFormat: "decimal" }, content: [
      { type: "note", attrs: { id: "a", kind: "footnote" }, content: [{ type: "paragraph", content: [{ type: "text", text: "Source one" }] }] },
      { type: "note", attrs: { id: "c", kind: "footnote" }, content: [{ type: "paragraph", content: [{ type: "text", text: "Source two" }] }] },
      { type: "note", attrs: { id: "b", kind: "endnote" }, content: [{ type: "paragraph", content: [{ type: "text", text: "An endnote" }] }] },
    ] },
  ],
});

const withLinks = (): JSONContent => ({
  type: "doc",
  content: [
    { type: "heading", attrs: { level: 1, id: "h-intro" }, content: [{ type: "text", text: "Intro" }] },
    { type: "paragraph", content: [
      { type: "text", text: "to mark", marks: [{ type: "link", attrs: { href: "#bm-1" } }] },
      { type: "text", text: " and " },
      { type: "text", text: "to intro", marks: [{ type: "link", attrs: { href: "#h-intro" } }] },
    ] },
    { type: "paragraph", content: [{ type: "bookmark", attrs: { id: "bm-1", name: "Key figure" } }, { type: "text", text: "Marked here" }] },
    { type: "paragraph", content: [{ type: "bookmark", attrs: { id: "bm-2", name: "Key figure" } }, { type: "text", text: "Same name" }] },
  ],
});

describe("export-docx bookmarks (10.2)", () => {
  it("writes bookmarks, hidden bookmarks on headings and links to both", async () => {
    const xml = await unzip(await toDocx(createDocument({ content: withLinks() })), "word/document.xml");
    expect(xml).toMatch(/<w:bookmarkStart [^>]*w:name="_pd_h_intro"/);
    expect(xml).toMatch(/<w:bookmarkStart [^>]*w:name="Key_figure"/);
    expect(xml, "names are unique in Word").toMatch(/<w:bookmarkStart [^>]*w:name="Key_figure_2"/);
    expect(xml).toMatch(/<w:hyperlink [^>]*w:anchor="Key_figure"/);
    expect(xml).toMatch(/<w:hyperlink [^>]*w:anchor="_pd_h_intro"/);
    expect(xml.match(/<w:bookmarkStart /g)!.length).toBe(xml.match(/<w:bookmarkEnd /g)!.length);
  });

  it("re-imports bookmarks and links to them, and headings keep the links that go to them", async () => {
    const { content } = await fromDocx(await toDocx(createDocument({ content: withLinks() })));
    const marks: JSONContent[] = [];
    const hrefs: string[] = [];
    const walk = (n: JSONContent) => {
      if (n.type === "bookmark") marks.push(n);
      const l = n.marks?.find((m) => m.type === "link");
      if (l) hrefs.push(String(l.attrs!.href));
      n.content?.forEach(walk);
    };
    walk(content);
    expect(marks.map((m) => m.attrs!.name)).toEqual(["Key figure", "Key figure 2"]);
    const heading = content.content![0]!;
    expect(heading.type).toBe("heading");
    expect(hrefs).toEqual([`#${marks[0]!.attrs!.id}`, `#${heading.attrs!.id}`]);
  });
});

describe("import-docx", () => {
  it("round-trips footnotes and endnotes as Word's own notes (10.1)", async () => {
    const bytes = await toDocx(createDocument({ content: withNotes() }));
    const files = (await (await import("jszip")).default.loadAsync(bytes)).files;
    expect(Object.keys(files)).toEqual(expect.arrayContaining(["word/footnotes.xml", "word/endnotes.xml"]));
    const { content } = await fromDocx(bytes);
    const refs: string[] = [];
    const walk = (n: JSONContent) => {
      if (n.type === "noteRef") refs.push(String(n.attrs?.kind));
      n.content?.forEach(walk);
    };
    content.content!.filter((b) => b.type !== "notes").forEach(walk);
    expect(refs).toEqual(["footnote", "endnote", "footnote"]);
    expect(nodeText(content.content![0]!)).toBe("Claim and more");
    const box = content.content!.at(-1)!;
    expect(box.type).toBe("notes");
    expect(box.content!.map((n) => [n.attrs?.kind, nodeText(n)])).toEqual([
      ["footnote", "Source one"],
      ["footnote", "Source two"],
      ["endnote", "An endnote"],
    ]);
  });

  it("measures images", () => {
    const bytes = Uint8Array.from(Buffer.from(PNG.split(",")[1]!, "base64"));
    expect(imageSize(bytes)).toEqual({ width: 2, height: 1, type: "png" });
  });

  it("keeps headings, emphasis, lists, tables, links and images from a Word file", async () => {
    const { content } = await fromDocx(await toDocx(createDocument({ content: sample() })));
    expect(content.content!.filter((n) => n.type === "heading").map(nodeText)).toEqual(["Intro", "List"]);
    expect(content.content!.some((n) => n.type === "table")).toBe(true);
    expect(content.content!.some((n) => n.type === "bulletList")).toBe(true);
  });
});
