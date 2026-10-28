import { describe, expect, it } from "vitest";
import { cleanLayout, compareText, createDocument, fromHTML, indentFromPositions, indentPositions, layoutCss, lineHeightCss, patchLayout, sortOrder, tabTo, toHTML, toMarkdown, toText } from "../src/index.ts";

describe("paragraph layout (U46–U48)", () => {
  it("converts between ruler positions and the stored indent (Word's Left is where the body starts)", () => {
    expect(indentPositions(1, -0.5)).toEqual({ first: 0.5, body: 1 });
    expect(indentPositions(2, 0.25)).toEqual({ first: 1.25, body: 1 });
    expect(indentPositions(undefined, undefined)).toEqual({ first: 0, body: 0 });
    expect(indentFromPositions(0.5, 1)).toEqual({ indent: 1, first: -0.5 });
    expect(indentFromPositions(1.25, 1)).toEqual({ indent: 2, first: 0.25 });
    for (const [i, f] of [[0, 0], [1, -0.5], [3, 0.75], [0.5, -0.25]] as const) {
      const p = indentPositions(i, f);
      expect(indentFromPositions(p.first, p.body)).toEqual({ indent: i, first: f });
    }
  });

  it("keeps known, valid settings and drops the rest", () => {
    expect(cleanLayout(null)).toBeNull();
    expect(cleanLayout({ right: 0, first: 0, widows: true, junk: 1 })).toBeNull();
    expect(
      cleanLayout({
        right: 0.5,
        first: -0.25,
        lineRule: "exact",
        keepNext: true,
        widows: false,
        borders: { top: { width: 1, color: "#FF0000" }, left: { width: 99, color: "#000000" }, bottom: { width: 1, color: "red" } },
        shading: "#EEEEEE",
        dir: "rtl",
        tabs: [{ pos: 3, align: "right", leader: "dots" }, { pos: 1 }, { pos: 1.001, align: "center" }, { pos: -1 }],
      }),
    ).toEqual({
      right: 0.5,
      first: -0.25,
      lineRule: "exact",
      keepNext: true,
      widows: false,
      borders: { top: { width: 1, color: "#ff0000" } },
      shading: "#eeeeee",
      dir: "rtl",
      tabs: [
        { pos: 1, align: "left", leader: "none" },
        { pos: 3, align: "right", leader: "dots" },
      ],
    });
  });

  it("patches a layout, removing settings set to null", () => {
    expect(patchLayout({ keepNext: true }, { keepLines: true })).toEqual({ keepNext: true, keepLines: true });
    expect(patchLayout({ keepNext: true }, { keepNext: null })).toBeNull();
  });

  it("draws indents, borders with Word's spacing, and shading", () => {
    const css = layoutCss({ right: 1, first: -0.5, borders: { top: { width: 1, color: "#000000" }, left: { width: 2, color: "#000000" } }, shading: "#ffff00" });
    expect(css).toContain("margin-inline-end: 1in");
    expect(css).toContain("text-indent: -0.5in");
    expect(css).toContain("border-top: 1pt solid #000000");
    expect(css).toContain("margin-top: var(--pd-sb, 0pt)");
    // A hanging indent of half an inch (36 pt) plus the 4 pt left border gap.
    expect(css).toContain("padding-left: 40pt");
    expect(css).toContain("background-color: #ffff00");
    expect(layoutCss({ first: -0.5, dir: "rtl" })).toContain("padding-right: 36pt");
    expect(layoutCss(null)).toBe("");
  });

  it("reads line spacing as a multiple, or points exactly or at least", () => {
    expect(lineHeightCss(1.5, null)).toBe("line-height: 1.5");
    expect(lineHeightCss(18, { lineRule: "exact" })).toBe("line-height: 18pt");
    expect(lineHeightCss(18, { lineRule: "atLeast" })).toBe("line-height: max(18pt, 1.15em)");
    expect(lineHeightCss(null, null)).toBe("");
  });

  it("round-trips a layout and tabs through HTML, and writes tabs as tabs in text and Markdown", () => {
    const doc = fromHTML('<p data-layout=\'{"keepNext":true,"tabs":[{"pos":3,"align":"right","leader":"dots"}]}\'>Name<span data-type="tab"></span>12</p>');
    const p = doc.content![0]!;
    expect(p.attrs?.layout).toEqual({ keepNext: true, tabs: [{ pos: 3, align: "right", leader: "dots" }] });
    expect(p.content!.map((n) => n.type)).toEqual(["text", "tab", "text"]);
    const again = fromHTML(toHTML(createDocument({ content: doc })));
    expect(again.content![0]!.attrs?.layout).toEqual(p.attrs?.layout);
    expect(toText(doc)).toContain("Name\t12");
    expect(toMarkdown(doc)).toContain("Name\t12");
  });
});

describe("tab stops (U46)", () => {
  const stops = [
    { pos: 1, align: "left", leader: "none" },
    { pos: 3, align: "right", leader: "dots" },
    { pos: 4, align: "center", leader: "none" },
    { pos: 5, align: "decimal", leader: "none" },
  ] as const;

  it("reaches the next stop, aligning the text after it to the stop's side", () => {
    expect(tabTo(0.2, stops, 0.5, 0.5)).toEqual({ stop: stops[0], width: 0.8 });
    const right = tabTo(1.5, stops, 0.5, 0.5);
    expect(right.stop).toBe(stops[1]);
    expect(right.width).toBeCloseTo(1);
    const center = tabTo(3.1, stops, 0.4, 0.4);
    expect(center.stop).toBe(stops[2]);
    expect(center.width).toBeCloseTo(0.7);
    const decimal = tabTo(4.2, stops, 0.6, 0.3);
    expect(decimal.stop).toBe(stops[3]);
    expect(decimal.width).toBeCloseTo(0.5);
  });

  it("passes over a stop the text can't reach, then falls back to the default half-inch stops", () => {
    // Text 1.6 in wide can't right-align at 3 from 1.5: the centre stop at 4 takes it.
    expect(tabTo(1.5, stops, 1.6, 1.6).stop).toBe(stops[2]);
    expect(tabTo(5.2, stops, 0.1, 0.1)).toEqual({ stop: { pos: 5.5, align: "left", leader: "none" }, width: expect.closeTo(0.3) });
    expect(tabTo(0, [], 0, 0).width).toBe(0.5);
    expect(tabTo(0.5, [], 0, 0).stop.pos).toBe(1);
  });
});

describe("sort (U50)", () => {
  it("puts numbers in number order before words, and words as a person reads them", () => {
    expect(["10", "9", "$1,200", "-3", "apple", "Banana", "item 10", "item 2"].sort(compareText)).toEqual(["-3", "9", "10", "$1,200", "apple", "Banana", "item 2", "item 10"]);
  });

  it("keeps ties in their order, ascending or descending", () => {
    expect(sortOrder(["b", "a", "B", "c"])).toEqual([1, 0, 2, 3]);
    expect(sortOrder(["b", "a", "B", "c"], true)).toEqual([3, 0, 2, 1]);
  });
});
