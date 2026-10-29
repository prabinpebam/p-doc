import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import type { JSONContent } from "@tiptap/core";
import { BULLET_FORMATS, NUMBER_FORMATS, cleanListFormat, cleanStart, createDocument, defaultListFormat, fromHTML, fromMarkdown, listCss, listMarker, parseDocument, serializeDocument, styleCss, toHTML, toMarkdown, toText, wordLevel } from "../src/index.ts";
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

  it("keeps every format and start in Markdown and text without changing the source", () => {
    for (const format of [...NUMBER_FORMATS, ...BULLET_FORMATS]) {
      const kind = NUMBER_FORMATS.some((f) => f === format) ? "orderedList" : "bulletList";
      const doc = createDocument({ content: { type: "doc", content: [
        { type: kind, attrs: { start: 4, listFormat: format }, content: [item("First"), item("Second")] },
      ] } });
      const before = serializeDocument(doc);
      const md = toMarkdown(doc);
      if (format === "decimal") expect(md).toBe("4. First\n5. Second\n");
      else if (format === "disc") expect(md).toBe("- First\n- Second\n");
      else expect(md).toContain(`data-format="${format}"`);
      const back = fromMarkdown(md).content![0]!;
      expect(back.type).toBe(kind);
      if (kind === "orderedList") expect(back.attrs?.start).toBe(4);
      if (format !== "decimal" && format !== "disc") expect(back.attrs?.listFormat).toBe(format);
      expect(toText(doc)).toBe(`${listMarker(format, 4)} First\n${listMarker(format, 5)} Second\n`);
      expect(serializeDocument(doc)).toBe(before);
    }
  });

  it("keeps zero, multi-digit starts and adjacent restarts as separate Markdown lists", () => {
    const doc = { type: "doc", content: [0, 27, 1].map((start) => ({
      type: "orderedList", attrs: { start }, content: [item("First"), item("Second")],
    })) };
    const md = toMarkdown(doc);
    expect(md).toBe("0. First\n1. Second\n\n<!-- -->\n\n27. First\n28. Second\n\n<!-- -->\n\n1. First\n2. Second\n");
    expect(fromMarkdown(md).content?.map((n) => n.attrs?.start)).toEqual([0, 27, 1]);
  });

  it("makes all nine default levels explicit in Markdown and uses their markers in text", () => {
    for (const kind of ["orderedList", "bulletList"] as const) {
      let nested: JSONContent | undefined;
      for (let depth = 8; depth >= 0; depth--) nested = { type: kind, content: [item(`Level ${depth + 1}`, nested)] };
      const doc = { type: "doc", content: [nested!] };
      const back = fromMarkdown(toMarkdown(doc));
      let list = back.content![0]!;
      for (let depth = 0; depth < 9; depth++) {
        expect(list.attrs?.listFormat).toBe(defaultListFormat(kind, depth));
        list = list.content![0]!.content![1]!;
      }
      const lines = toText(doc).trimEnd().split("\n");
      expect(lines).toHaveLength(9);
      lines.forEach((line, depth) => expect(line.trim()).toBe(`${listMarker(defaultListFormat(kind, depth), 1)} Level ${depth + 1}`));
    }
  });

  it("keeps rich content and mixed nesting inside the HTML list fallback", () => {
    const doc = { type: "doc", content: [{
      type: "orderedList", attrs: { start: 3, listFormat: "upper-roman" }, content: [{
        type: "listItem", content: [
          { type: "paragraph", content: [{ type: "text", text: "<First>", marks: [{ type: "bold" }] }] },
          { type: "bulletList", attrs: { listFormat: "check" }, content: [item("Done")] },
          { type: "codeBlock", attrs: { language: "js" }, content: [{ type: "text", text: "const n = 1;\n\nlog(n);" }] },
        ],
      }],
    }] };
    const md = toMarkdown(doc);
    expect(md).toContain("<strong>&lt;First&gt;</strong>");
    const back = fromMarkdown(md).content![0]!;
    expect(back.attrs).toMatchObject({ start: 3, listFormat: "upper-roman" });
    expect(back.content![0]!.content![0]!.content![0]).toMatchObject({ text: "<First>", marks: [{ type: "bold" }] });
    expect(back.content![0]!.content![1]!.attrs?.listFormat).toBe("check");
    expect(back.content![0]!.content![2]!.content![0]!.text).toBe("const n = 1;\n\nlog(n);");
  });

  it("keeps checkboxes when their nested lists require HTML", () => {
    const doc = { type: "doc", content: [{
      type: "taskList", content: [{
        type: "taskItem", attrs: { checked: true }, content: [
          { type: "paragraph", content: [{ type: "text", text: "Task" }] },
          { type: "orderedList", attrs: { start: 5, listFormat: "lower-roman" }, content: [item("Nested")] },
        ],
      }],
    }] };
    const back = fromMarkdown(toMarkdown(doc)).content![0]!;
    expect(back.type).toBe("taskList");
    expect(back.content![0]!.attrs?.checked).toBe(true);
    expect(back.content![0]!.content![1]!.attrs).toMatchObject({ start: 5, listFormat: "lower-roman" });
    expect(toText(doc)).toBe("[x] Task\n   v. Nested\n");
  });

  it("keeps adjacent nested decimal lists separate rather than merging their restarts", () => {
    const doc = { type: "doc", content: [{
      type: "bulletList", content: [{
        type: "listItem", content: [
          { type: "paragraph", content: [{ type: "text", text: "Parent" }] },
          ...[4, 1].map((start) => ({ type: "orderedList", attrs: { start, listFormat: "decimal" }, content: [item("Child")] })),
        ],
      }],
    }] };
    const back = fromMarkdown(toMarkdown(doc)).content![0]!.content![0]!.content!;
    expect(back).toHaveLength(3);
    expect(back.slice(1).map((list) => list.attrs?.start)).toEqual([4, 1]);
  });
});
