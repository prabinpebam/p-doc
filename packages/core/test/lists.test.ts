import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import type { JSONContent } from "@tiptap/core";
import { cleanListFormat, cleanStart, createDocument, defaultListFormat, fromHTML, listCss, listMarker, parseDocument, serializeDocument, styleCss, toHTML, wordLevel } from "../src/index.ts";
import { toDocx } from "../src/docx.ts";

const item = (text: string, nested?: JSONContent): JSONContent => ({ type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text }] }, ...(nested ? [nested] : [])] });

describe("list formats, start numbers and levels (8.3, U43)", () => {
  it("knows each format's marker, Word level and default by level", () => {
    expect([1, 2, 3, 4].map((n) => listMarker("lower-roman", n))).toEqual(["i.", "ii.", "iii.", "iv."]);
    expect(listMarker("upper-alpha", 28)).toBe("AB.");
    expect(listMarker("decimal-leading-zero", 7)).toBe("07.");
    expect(listMarker("dash", 3)).toBe("–");
    expect([0, 1, 2, 3].map((l) => defaultListFormat("orderedList", l))).toEqual(["decimal", "lower-alpha", "lower-roman", "decimal"]);
    expect(defaultListFormat("bulletList", 4)).toBe("circle");
    expect(wordLevel("upper-roman", 2)).toEqual({ format: "upperRoman", text: "%3." });
    expect(wordLevel("square", 0).format).toBe("bullet");
  });

  it("refuses formats of the other kind and start numbers out of range", () => {
    expect(cleanListFormat("orderedList", "lower-alpha")).toBe("lower-alpha");
    expect(cleanListFormat("orderedList", "disc")).toBeNull();
    expect(cleanListFormat("bulletList", "check")).toBe("check");
    expect(cleanListFormat("bulletList", "url(x)")).toBeNull();
    expect([5, 0, -1, 1.5, 40000, "x"].map(cleanStart)).toEqual([5, 0, 1, 1, 1, 1]);
  });

  it("numbers nested levels 1, a, i on the page, in print and in HTML, nine deep", () => {
    const css = listCss(".page");
    expect(css).toContain(".page ol, .page ol ol ol ol, .page ol ol ol ol ol ol ol { list-style-type: decimal }");
    expect(css).toContain(".page ol ol, .page ol ol ol ol ol, .page ol ol ol ol ol ol ol ol { list-style-type: lower-alpha }");
    expect(styleCss(createDocument().styles, ".page")).toContain("list-style-type: lower-roman");
  });

  it("keeps a list's format and start through a save, HTML and pasted HTML", () => {
    const doc = createDocument({ title: "Lists" });
    doc.content = { type: "doc", content: [
      { type: "orderedList", attrs: { start: 4, listFormat: "upper-roman" }, content: [item("Four"), item("Five")] },
      { type: "bulletList", attrs: { listFormat: "dash" }, content: [item("Dash")] },
    ] };
    const back = parseDocument(serializeDocument(doc));
    expect(back.content.content?.[0]?.attrs).toMatchObject({ start: 4, listFormat: "upper-roman" });
    const html = toHTML(back);
    expect(html).toMatch(/<ol[^>]*start="4"[^>]*data-format="upper-roman"[^>]*style="list-style-type: upper-roman"|<ol[^>]*data-format="upper-roman"[^>]*start="4"/);
    expect(html).toContain(`list-style-type: &quot;–  &quot;`);
    const pasted = fromHTML(`<ol type="a" start="3"><li><p>c</p></li></ol>`);
    expect(pasted.content?.[0]?.attrs).toMatchObject({ start: 3, listFormat: "lower-alpha" });
    const unsafe = fromHTML(`<ul data-format="evil;background:url(x)"><li><p>x</p></li></ul>`);
    expect(unsafe.content?.[0]?.attrs?.listFormat).toBeNull();
  });

  it("writes each format and start as Word numbering, each numbered list counting on its own", async () => {
    const doc = createDocument({ title: "Word lists" });
    doc.content = { type: "doc", content: [
      { type: "orderedList", attrs: { start: 1 }, content: [item("One", { type: "orderedList", attrs: { start: 1 }, content: [item("Sub a")] })] },
      { type: "paragraph", content: [{ type: "text", text: "Between" }] },
      { type: "orderedList", attrs: { start: 5, listFormat: "lower-roman" }, content: [item("Five")] },
      { type: "bulletList", attrs: { listFormat: "square" }, content: [item("Square")] },
    ] };
    const zip = await JSZip.loadAsync(await toDocx(doc));
    const numbering = await zip.file("word/numbering.xml")!.async("string");
    expect(numbering).toContain(`<w:numFmt w:val="lowerRoman"/>`);
    expect(numbering).toContain(`<w:numFmt w:val="lowerLetter"/>`);
    expect(numbering).toContain(`<w:start w:val="5"/>`);
    expect(numbering).toContain(`<w:lvlText w:val="▪"/>`);
    const xml = await zip.file("word/document.xml")!.async("string");
    expect(xml.match(/<w:numPr>/g)?.length).toBe(4);
    // The nested list is one level in.
    expect(xml).toMatch(/<w:ilvl w:val="1"\/>[\s\S]*Sub a/);
  });
});
