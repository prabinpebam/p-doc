import { describe, expect, it } from "vitest";
import { createDocument, defaultStyles, fromHTML, headings, parseDocument, schema, serializeDocument, styleCss, styleKeyOf, toHTML, toMarkdown, tocEntriesOf } from "../src/index.ts";
import { fromDocx, toDocx } from "../src/docx.ts";

const deepHeadings = () => ({
  type: "doc",
  content: [4, 5, 6].map((level) => ({ type: "heading", attrs: { level, id: `level-${level}`, futureLayout: { keep: true } }, content: [{ type: "text", text: `Level ${level}` }] })),
});

describe("styles (8.1)", () => {
  it("keeps all six heading identities and their own CSS, without changing Heading 4", () => {
    const styles = defaultStyles();
    expect(styles.heading4).toMatchObject({ fontSize: 12, color: "#666666", spaceBefore: 14, spaceAfter: 4 });
    styles.heading5.fontSize = 17;
    styles.heading6.fontSize = 13;
    const css = styleCss(styles, ".page");
    expect(css).toContain(".page h4 { font-family:");
    expect(css.match(/\.page h5 \{[^}]+/)?.[0]).toContain("font-size: 17pt");
    expect(css.match(/\.page h6 \{[^}]+/)?.[0]).toContain("font-size: 13pt");
    for (let level = 1; level <= 6; level++) expect(styleKeyOf("heading", { level })).toBe(`heading${level}`);
    for (const level of [0, 7, 1.5, "invalid"]) expect(styleKeyOf("heading", { level })).toBeNull();
  });

  it("fills missing deep styles in old files, keeping defined styles and unknown content attributes", () => {
    const doc = createDocument({ content: deepHeadings() });
    const raw = JSON.parse(serializeDocument(doc));
    delete raw.styles.heading5;
    delete raw.styles.heading6;
    raw.styles.heading4.fontSize = 19;
    const parsed = parseDocument(JSON.stringify(raw));
    expect(parsed.styles.heading4.fontSize).toBe(19);
    expect(parsed.styles.heading5).toEqual(defaultStyles().heading5);
    expect(parsed.styles.heading6).toEqual(defaultStyles().heading6);
    expect(parsed.content).toEqual(doc.content);
    expect(parseDocument(serializeDocument(parsed))).toEqual(parsed);
  });

  it("carries Heading 5/6 into the outline, contents, HTML and Markdown", () => {
    const doc = createDocument({ content: deepHeadings() });
    expect(headings(doc.content).map((h) => h.level)).toEqual([4, 5, 6]);
    expect(tocEntriesOf(schema().nodeFromJSON(doc.content), 6).map((h) => h.level)).toEqual([4, 5, 6]);
    const html = toHTML(doc);
    expect(html).toContain("<h5");
    expect(html).toContain("<h6");
    expect(fromHTML(html).content?.map((n) => n.attrs?.level)).toEqual([4, 5, 6]);
    expect(toMarkdown(doc)).toContain("##### Level 5\n\n###### Level 6");
  });

  it("writes genuine Word Heading 5/6 styles, definitions and bookmarks, and imports their levels", async () => {
    const doc = createDocument({ content: deepHeadings() });
    doc.styles.heading5.fontSize = 17;
    doc.styles.heading6.italic = false;
    const bytes = await toDocx(doc);
    const zip = await (await import("jszip")).default.loadAsync(bytes);
    const xml = await zip.file("word/document.xml")!.async("string");
    const styles = await zip.file("word/styles.xml")!.async("string");
    for (const level of [4, 5, 6]) {
      expect(xml).toContain(`<w:pStyle w:val="Heading${level}"/>`);
      expect(xml).toContain(`w:name="_pd_level_${level}"`);
      expect(styles).toContain(`w:styleId="Heading${level}"`);
    }
    expect(styles.match(/<w:style [^>]*w:styleId="Heading5"[\s\S]*?<\/w:style>/)?.[0]).toContain('<w:sz w:val="34"/>');
    const imported = await fromDocx(bytes);
    expect(imported.content.content?.map((n) => n.attrs?.level)).toEqual([4, 5, 6]);
  });
});
