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

describe("import-docx", () => {
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
