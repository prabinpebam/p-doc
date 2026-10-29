import { describe, expect, it } from "vitest";
import { cleanStyles, createDocument, defaultStyles, followingStyle, fromHTML, headings, parseDocument, schema, serializeDocument, STYLE_KEYS, STYLE_SETS, styleCss, styleKeyOf, styleKeys, styleLabel, stylesForSet, toHTML, tocEntriesOf, toMarkdown } from "../src/index.ts";
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

describe("own styles, defaults and style sets (8.1, 8.2)", () => {
  const custom = () => {
    const styles = defaultStyles();
    styles["custom-callout"] = { ...defaultStyles().normal, name: "Callout", fontSize: 14, bold: true, indent: 1, next: "custom-callout" };
    styles.heading2 = { ...styles.heading2, next: "custom-callout" };
    return styles;
  };
  const callout = { type: "doc", content: [{ type: "paragraph", attrs: { textStyle: "custom-callout" }, content: [{ type: "text", text: "Mind the gap" }] }] };

  it("keeps an own style through save and reopen, with its name, label and following style", () => {
    const doc = createDocument({ content: callout, styles: custom() });
    const back = parseDocument(serializeDocument(doc));
    expect(back.styles["custom-callout"]).toMatchObject({ name: "Callout", fontSize: 14, bold: true, next: "custom-callout" });
    expect(styleKeys(back.styles)).toEqual([...STYLE_KEYS, "custom-callout"]);
    expect(styleLabel("custom-callout", back.styles)).toBe("Callout");
    expect(followingStyle("heading2", back.styles)).toBe("custom-callout");
    expect(followingStyle("heading1", back.styles)).toBe("normal");
    expect(styleKeyOf("paragraph", { textStyle: "custom-callout" })).toBe("custom-callout");
  });

  it("cleans settings input: unknown keys dropped, unsafe CSS values replaced, numbers bounded", () => {
    const s = cleanStyles({
      "custom-ok": { name: "  Mine  ", fontFamily: "Arial; } body { display:none", fontSize: 9999, color: "red;x", next: "nope" },
      "evil key": { fontSize: 12 },
      heading1: { bold: true, lineHeight: "2" },
    });
    expect(Object.keys(s)).not.toContain("evil key");
    expect(s["custom-ok"]).toMatchObject({ name: "Mine", fontFamily: defaultStyles().normal.fontFamily, fontSize: defaultStyles().normal.fontSize, color: defaultStyles().normal.color });
    expect(s["custom-ok"]!.next).toBeUndefined();
    expect(followingStyle("custom-ok", s)).toBe("custom-ok");
    expect(s.heading1.bold).toBe(true);
    expect(s.heading1.lineHeight).toBe(defaultStyles().heading1.lineHeight);
  });

  it("writes own styles to CSS (screen, print, HTML) and Word, with their following style", async () => {
    const styles = custom();
    const css = styleCss(styles, ".page");
    expect(css.match(/\.page p\[data-style="custom-callout"\] \{[^}]+/)?.[0]).toMatch(/font-size: 14pt.*font-weight: 700.*margin-inline-start: 0.5in/);
    const doc = createDocument({ content: callout, styles });
    expect(toHTML(doc)).toContain('data-style="custom-callout"');
    const zip = await (await import("jszip")).default.loadAsync(await toDocx(doc));
    const xml = await zip.file("word/document.xml")!.async("string");
    const word = await zip.file("word/styles.xml")!.async("string");
    expect(xml).toContain('<w:pStyle w:val="PDcustom-callout"/>');
    const def = word.match(/<w:style [^>]*w:styleId="PDcustom-callout"[\s\S]*?<\/w:style>/)?.[0] ?? "";
    expect(def).toContain('w:val="Callout"');
    expect(def).toContain('<w:sz w:val="28"/>');
    expect(word.match(/<w:style [^>]*w:styleId="Heading2"[\s\S]*?<\/w:style>/)?.[0]).toContain('<w:next w:val="PDcustom-callout"/>');
  });

  it("each style set restyles built-in styles and leaves own styles alone", () => {
    const styles = custom();
    const classic = stylesForSet("Classic", styles);
    expect(classic.normal.fontFamily).toContain("Times New Roman");
    expect(classic.heading1.smallCaps).toBe(true);
    expect(classic.code.fontFamily).toContain("Consolas");
    expect(stylesForSet("Modern", styles).heading3.color).toBe("#174ea6");
    const compact = stylesForSet("Compact", styles);
    expect(compact.normal.lineHeight).toBe(1);
    expect(compact.heading1.spaceBefore).toBe(defaultStyles().heading1.spaceBefore / 2);
    expect(stylesForSet("Default", styles).heading1).toEqual(defaultStyles().heading1);
    for (const set of STYLE_SETS) expect(stylesForSet(set, styles)["custom-callout"]).toEqual(styles["custom-callout"]);
  });
});
