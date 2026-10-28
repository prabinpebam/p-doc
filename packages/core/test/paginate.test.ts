import { describe, expect, it } from "vitest";
import { contentToHTML, defaultPage, digitsFor, fromHTML, headerFooterText, pageFaces, pageNumberText, paginate, sectionIndexAt, sectionsOf, settlePages, sheetsOf, type BlockBox, type Pagination } from "../src/index.ts";

describe("paginate", () => {
  it("keeps blocks that fit on one page", () => {
    const r = paginate([{ height: 100 }, { height: 100 }], 500);
    expect(r.pages).toBe(1);
    expect(r.pageOf).toEqual([1, 1]);
    expect(r.push.size).toBe(0);
  });

  it("moves a block that doesn't fit to the next page and pushes it by the space left", () => {
    const r = paginate([{ height: 300 }, { height: 150 }, { height: 100 }], 500);
    expect(r.pageOf).toEqual([1, 1, 2]);
    expect(r.starts).toEqual([0, 2]);
    expect(r.push.get(2)).toBe(50);
  });

  it("starts a page after a page break", () => {
    const r = paginate([{ height: 10 }, { height: 0, pageBreak: true }, { height: 10 }], 500);
    expect(r.pageOf).toEqual([1, 1, 2]);
    expect(r.push.get(2)).toBe(490);
  });

  it("lets a block taller than a page overflow into following pages", () => {
    const r = paginate([{ height: 100 }, { height: 1200 }, { height: 100 }], 500);
    expect(r.pageOf).toEqual([1, 2, 4]);
    expect(r.pages).toBe(4);
  });

  it("groups blocks into sheets; a sheet a tall block overflows covers several pages", () => {
    expect(sheetsOf(paginate([{ height: 100 }, { height: 1200 }, { height: 100 }], 500))).toEqual([
      { start: 0, startLine: 0, end: 1, page: 1, span: 1, blank: 0 },
      { start: 1, startLine: 0, end: 3, page: 2, span: 3, blank: 0 },
    ]);
    expect(sheetsOf(paginate([{ height: 300 }, { height: 300 }, { height: 300 }], 500))).toEqual([
      { start: 0, startLine: 0, end: 1, page: 1, span: 1, blank: 0 },
      { start: 1, startLine: 0, end: 2, page: 2, span: 1, blank: 0 },
      { start: 2, startLine: 0, end: 3, page: 3, span: 1, blank: 0 },
    ]);
    expect(sheetsOf(paginate([], 500))).toEqual([{ start: 0, startLine: 0, end: 0, page: 1, span: 1, blank: 0 }]);
  });

  it("lets text run beside a floated image, and ends the page below it (A9)", () => {
    // A 200px float, then two 80px paragraphs beside it: the page's text is 160px, but the float is lower.
    const r = paginate([{ height: 100 }, { height: 0, float: 200 }, { height: 80 }, { height: 80 }, { height: 300 }], 500);
    expect(r.pageOf).toEqual([1, 1, 1, 1, 2]);
    expect(r.push.get(4)).toBe(500 - 300);
  });

  it("moves a floated image that doesn't fit to the next page", () => {
    const r = paginate([{ height: 400 }, { height: 0, float: 200 }, { height: 50 }], 500);
    expect(r.pageOf).toEqual([1, 2, 2]);
    expect(r.push.get(1)).toBe(100);
  });

  it("counts many pages", () => {
    const r = paginate(Array.from({ length: 100 }, () => ({ height: 48 })), 864);
    expect(r.pages).toBe(Math.ceil(100 / 18));
  });

  describe("keep rules (U47)", () => {
    /** A paragraph of `n` 20 px lines. */
    const para = (n: number, extra: Partial<Parameters<typeof paginate>[0][number]> = {}) => ({ height: n * 20, lines: () => Array.from({ length: n - 1 }, (_, k) => (k + 1) * 20), widows: true, ...extra });

    it("starts a page at a paragraph with page break before, unless it already starts one", () => {
      const r = paginate([{ height: 100 }, { height: 50, breakBefore: true }, { height: 50, breakBefore: true }], 500);
      expect(r.pageOf).toEqual([1, 2, 3]);
      const top = paginate([{ height: 50, breakBefore: true }, { height: 50 }], 500);
      expect(top.pageOf).toEqual([1, 1]);
    });

    it("moves a heading kept with next onto the page its paragraph starts on", () => {
      // 430 used; the heading (40) fits, but none of the next paragraph's first two lines do.
      const r = paginate([{ height: 430 }, { height: 40, keepNext: true }, para(10)], 500);
      expect(r.pageOf).toEqual([1, 2, 2]);
      expect(r.starts).toEqual([0, 1]);
      // Without keep with next it stays at the foot of page 1.
      expect(paginate([{ height: 430 }, { height: 40 }, para(10)], 500).pageOf[1]).toBe(1);
    });

    it("keeps a run of blocks with the next one, and breaks a run longer than a page at the page", () => {
      const r = paginate([{ height: 300 }, { height: 60, keepNext: true }, { height: 60, keepNext: true }, { height: 100 }], 500);
      expect(r.pageOf).toEqual([1, 2, 2, 2]);
      const long = paginate([{ height: 300 }, { height: 200, keepNext: true }, { height: 200, keepNext: true }, { height: 200, keepNext: true }, { height: 100 }], 500);
      expect(long.pageOf[1]).toBe(1);
    });

    it("keeps a paragraph's lines together unless it is taller than a page", () => {
      const r = paginate([{ height: 400 }, para(10, { keepLines: true })], 500);
      expect(r.pageOf).toEqual([1, 2]);
      expect(r.startLines).toEqual([0, 0]);
      const tall = paginate([{ height: 400 }, para(40, { keepLines: true })], 500);
      expect(tall.startLines.some((l) => l > 0)).toBe(true);
    });

    it("lets a widow-free paragraph split down to a single line on each side", () => {
      const off = paginate([{ height: 480 }, para(10, { widows: false })], 500);
      expect(off.pageOf).toEqual([1, 1]);
      expect(off.startLines[1]).toBe(1);
      const on = paginate([{ height: 480 }, para(10)], 500);
      expect(on.pageOf).toEqual([1, 2]);
    });
  });

  describe("long tables (U60)", () => {
    // A table of a 30 px header row and n body rows of 40 px: a line per row, the header with the first.
    const table = (n: number, repeat = 30) => ({ height: 30 + n * 40, lines: () => Array.from({ length: n - 1 }, (_, k) => 30 + (k + 1) * 40), widows: false, repeat });

    it("breaks between rows and starts each later page below the repeated header", () => {
      const r = paginate([{ height: 100 }, table(20)], 500);
      // Page 1: 100 + header + 9 rows (390) = 490. Page 2: the header again (30) + the other 11 rows (440) = 470.
      expect(r.startLines).toEqual([0, 9]);
      expect(r.pages).toBe(2);
      expect(r.fills[1]).toBeCloseTo(10);
      const long = paginate([table(40)], 500);
      // 30 + 11 rows on page 1, then 11 rows below the header on each page after.
      expect(long.startLines).toEqual([0, 11, 22, 33]);
      expect(long.fills.slice(1).every((f) => f < 40)).toBe(true);
      // Without a repeated header, 12 rows fit on later pages.
      expect(paginate([table(40, 0)], 500).startLines).toEqual([0, 11, 23, 35]);
    });

    it("never loops when a row is taller than the room under the header: it overflows that page", () => {
      const tall = { height: 30 + 600, lines: () => [30 + 40, 30 + 560], widows: false, repeat: 30 };
      const r = paginate([tall], 500);
      expect(r.startLines).toEqual([0, 1, 2]);
      expect(r.pages).toBeGreaterThanOrEqual(3);
    });
  });

  describe("split paragraphs (A10)", () => {
    // A paragraph of n lines of 20 px each, with 10 px after it: bottoms of each line but the last.
    const para = (n: number, widows = true) => ({ height: n * 20 + 10, lines: () => Array.from({ length: n - 1 }, (_, k) => (k + 1) * 20), widows });

    it("splits a paragraph at the last line that fits and carries the rest to the next page", () => {
      const r = paginate([{ height: 150 }, para(10)], 300);
      // 150 used; 7 lines (140) fit in the 150 left.
      expect(r.pages).toBe(2);
      expect(r.starts).toEqual([0, 1]);
      expect(r.startLines).toEqual([0, 7]);
      expect(r.fills[1]).toBeCloseTo(10);
      expect(r.pageOf).toEqual([1, 1]);
      expect(r.push.size).toBe(0);
      const s = sheetsOf(r);
      expect(s.map((x) => [x.start, x.startLine, x.end, x.page, x.span])).toEqual([
        [0, 0, 2, 1, 1],
        [1, 7, 2, 2, 1],
      ]);
    });

    it("leaves no more than a line's space at the foot of a page", () => {
      const blocks = Array.from({ length: 30 }, () => para(7));
      const r = paginate(blocks, 500);
      for (const f of r.fills.slice(1)) expect(f).toBeLessThan(2 * 20);
    });

    it("keeps two lines together at the foot (orphan) and at the top (widow)", () => {
      // Only one line fits: the whole paragraph moves on.
      const orphan = paginate([{ height: 275 }, para(5)], 300);
      expect(orphan.startLines).toEqual([0, 0]);
      expect(orphan.push.get(1)).toBeCloseTo(25);
      // Four of five lines would fit: three go, so two start the next page.
      const widow = paginate([{ height: 210 }, para(5)], 300);
      expect(widow.startLines).toEqual([0, 3]);
      // Without the rule, four go and one line starts the next page.
      const free = paginate([{ height: 210 }, para(5, false)], 300);
      expect(free.startLines).toEqual([0, 4]);
    });

    it("splits a paragraph longer than a page across as many pages as it needs", () => {
      const r = paginate([para(40)], 300);
      // 15 lines a page: 15, 15, 10.
      expect(r.pages).toBe(3);
      expect(r.starts).toEqual([0, 0, 0]);
      expect(r.startLines).toEqual([0, 15, 30]);
      expect(sheetsOf(r).map((s) => [s.page, s.span, s.end])).toEqual([
        [1, 1, 1],
        [2, 1, 1],
        [3, 1, 1],
      ]);
    });

    it("pages after a split paragraph count on", () => {
      const r = paginate([{ height: 250 }, para(10), { height: 280 }, { height: 10 }], 300);
      expect(r.pageOf).toEqual([1, 1, 3, 3]);
      expect(sheetsOf(r).map((s) => s.page)).toEqual([1, 2, 3]);
    });

    it("asks for lines only from a paragraph that crosses a page end", () => {
      let asked = 0;
      const lazy = (n: number) => ({ height: n * 20 + 10, lines: () => (asked++, Array.from({ length: n - 1 }, (_, k) => (k + 1) * 20)) });
      paginate([lazy(3), lazy(3), lazy(3), lazy(10)], 300);
      expect(asked).toBe(1);
    });
  });
});

describe("page numbers settle (A19, 10.6)", () => {
  // 50 pages of 18 lines; a heading starts each page, and every fifth page refers to a heading 10 pages on.
  const LINE = 48;
  const PAGE = 18 * LINE;
  const WIDTH = 60;
  // Every third title is 58 characters: one line with a 1-digit number after it, two with a 2-digit one.
  const titles = Array.from({ length: 50 }, (_, i) => (i % 3 === 0 ? `Chapter ${i + 1}: `.padEnd(58, "x") : `Chapter ${i + 1}: short`));
  /** Lines a text takes in a WIDTH-character line, with room for a number of `digits` after it. */
  const lines = (text: string, digits: number) => Math.ceil((text.length + 1 + digits) / WIDTH);

  function fixture(reserve: boolean) {
    return (last: Pagination | null): BlockBox[] => {
      // Where each heading was on the last pass: block 0 is the contents, then per chapter heading + body.
      const headingPage = (k: number) => last?.pageOf[1 + k * 3] ?? 0;
      const shown = titles.map((_, k) => headingPage(k)).filter((n) => n > 0);
      const room = (n: number) => (reserve ? digitsFor(shown) : String(Math.max(1, n)).length);
      const contents = titles.reduce((h, t, k) => h + LINE * lines(t, last ? room(headingPage(k)) : 0), LINE);
      const blocks: BlockBox[] = [{ height: contents }];
      titles.forEach((t, k) => {
        const ref = k % 5 === 0 && k + 10 < titles.length ? `See chapter ${k + 11} on page`.padEnd(58, ".") : "";
        blocks.push({ height: LINE, breakBefore: true }, { height: LINE * 14 }, { height: ref ? LINE * lines(ref, last ? room(headingPage(k + 10)) : 0) : 0 });
      });
      return blocks;
    };
  }

  it("with contents and page references, a 50-page document is stable within 2 passes", () => {
    const { pagination, passes } = settlePages(fixture(true), PAGE);
    // The numbers do move the layout (pass 2 differs from pass 1), and pass 2 is the last that does.
    expect(passes).toBe(2);
    expect(pagination.pages).toBeGreaterThanOrEqual(50);
    // Stable: measuring once more with its own numbers gives the same layout.
    expect(paginate(fixture(true)(pagination), PAGE).pageOf).toEqual(pagination.pageOf);
  });

  it("gives up after its passes and keeps the last layout rather than looping", () => {
    let n = 0;
    const flip = () => [{ height: (n++ % 2) * PAGE + 10 }, { height: 10 }];
    const { passes } = settlePages(flip, PAGE, {}, 4);
    expect(passes).toBe(4);
  });

  it("makes room for the widest number", () => {
    expect(digitsFor([])).toBe(1);
    expect(digitsFor([3, 9])).toBe(1);
    expect(digitsFor([3, 12, 104])).toBe(3);
  });
});

describe("sections (U55, 11.1)", () => {
  const brk = (start: "next" | "continuous" | "odd" | "even", height: number): BlockBox => ({ height: 0, section: { start, height } });

  it("starts the next section on a new page with its own room for text", () => {
    // Portrait pages hold 500 px; the landscape section after the break holds 300.
    const r = paginate([{ height: 100 }, brk("next", 300), { height: 200 }, { height: 200 }], 500);
    expect(r.pageOf).toEqual([1, 1, 2, 3]);
    expect(sheetsOf(r).map((s) => [s.start, s.page, s.blank])).toEqual([[0, 1, 0], [2, 2, 0], [3, 3, 0]]);
  });

  it("adds a blank page before an odd-page section that would start on an even page", () => {
    const r = paginate([{ height: 100 }, brk("odd", 500), { height: 100 }], 500);
    expect(r.pageOf).toEqual([1, 1, 3]);
    expect(r.pages).toBe(3);
    const sheets = sheetsOf(r);
    expect(sheets.map((s) => [s.page, s.span, s.blank])).toEqual([[1, 1, 0], [3, 1, 1]]);
  });

  it("adds no blank page when an even-page section lands on an even page, and one when it doesn't", () => {
    expect(paginate([{ height: 100 }, brk("even", 500), { height: 100 }], 500).pageOf).toEqual([1, 1, 2]);
    const r = paginate([{ height: 100 }, { height: 0, pageBreak: true }, { height: 100 }, brk("even", 500), { height: 100 }], 500);
    expect(r.pageOf).toEqual([1, 1, 2, 2, 4]);
    expect(r.blanks).toEqual([0, 0, 1]);
  });

  it("keeps a continuous section on the same page; its room applies from the next page", () => {
    const r = paginate([{ height: 100 }, brk("continuous", 200), { height: 300 }, { height: 150 }, { height: 100 }], 500);
    expect(r.pageOf).toEqual([1, 1, 1, 2, 3]);
  });
});

describe("sectionsOf (U55)", () => {
  it("gives each section the geometry of its break, or the one before", () => {
    const base = defaultPage("en-US");
    const land = { size: "letter", orientation: "landscape", margins: { top: 1, bottom: 1, left: 0.5, right: 0.5 } };
    const doc = {
      type: "doc",
      content: [
        { type: "paragraph" },
        { type: "sectionBreak", attrs: { kind: "next", page: land } },
        { type: "paragraph" },
        { type: "sectionBreak", attrs: { kind: "continuous", page: null } },
        { type: "paragraph" },
        { type: "sectionBreak", attrs: { kind: "bogus", page: { size: "huge" } } },
      ],
    };
    const s = sectionsOf(doc, base);
    expect(s.map((x) => [x.from, x.breakAt, x.start, x.page.orientation, x.page.margins.left])).toEqual([
      [0, null, "next", "portrait", 1],
      [2, 1, "next", "landscape", 0.5],
      [4, 3, "continuous", "landscape", 0.5],
      [6, 5, "next", "landscape", 0.5],
    ]);
    expect([0, 1, 2, 3, 4, 6].map((i) => sectionIndexAt(s, i))).toEqual([0, 0, 1, 1, 2, 3]);
  });

  it("round-trips a section break through HTML", () => {
    const land = { size: "a4", orientation: "landscape", margins: { top: 1, bottom: 1, left: 1, right: 1 } };
    const hf = { header: "H {page}", footer: "F", firstHeader: "", firstFooter: "", evenHeader: "E", evenFooter: "" };
    const numbering = { format: "I", start: 4 };
    const columns = { count: 2, gap: 0.3 };
    const json = { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "A" }] }, { type: "sectionBreak", attrs: { kind: "odd", page: land, hf, numbering, columns } }, { type: "columnBreak" }, { type: "paragraph", content: [{ type: "text", text: "B" }] }] };
    const back = fromHTML(contentToHTML(json));
    expect(back.content?.[1]).toEqual({ type: "sectionBreak", attrs: { kind: "odd", page: land, hf, numbering, columns } });
    expect(back.content?.[2]).toEqual({ type: "columnBreak" });
    expect(sectionsOf(back, defaultPage()).map((s) => s.columns.count)).toEqual([1, 2]);
  });
});

describe("page faces (11.3)", () => {
  it("writes numbers as 1, i, I, a, A", () => {
    expect([1, 4, 9, 14, 2024].map((n) => pageNumberText(n, "i"))).toEqual(["i", "iv", "ix", "xiv", "mmxxiv"]);
    expect(pageNumberText(4, "I")).toBe("IV");
    expect([1, 26, 27, 28].map((n) => pageNumberText(n, "a"))).toEqual(["a", "z", "aa", "bb"]);
    expect(pageNumberText(3, "A")).toBe("C");
    expect(pageNumberText(0, "i")).toBe("0");
  });

  it("gives even pages their own header, the first page its own, and numbers from a start", () => {
    const base = { ...defaultPage(), header: "Odd {page}", evenHeader: "Even {page}", differentOddEven: true, differentFirstPage: true, firstHeader: "Cover", numStart: 5 };
    expect([1, 2, 3].map((n) => headerFooterText(base, "header", n, 3))).toEqual(["Cover", "Even 6", "Odd 7"]);
  });

  it("numbers sections on or from their own start and format; a linked section shows the one before's headers", () => {
    const base = { ...defaultPage(), header: "Main {page} of {pages}", footer: "f" };
    const doc = {
      type: "doc",
      content: [
        { type: "paragraph" },
        { type: "sectionBreak", attrs: { kind: "next", numbering: { format: "i", start: 1 } } },
        { type: "paragraph" },
        { type: "sectionBreak", attrs: { kind: "next", hf: { header: "Annex {page}", footer: "", firstHeader: "", firstFooter: "", evenHeader: "", evenFooter: "" } } },
        { type: "paragraph" },
        { type: "sectionBreak", attrs: { kind: "next", numbering: { format: "1", start: null } } },
        { type: "paragraph" },
      ],
    };
    const secs = sectionsOf(doc, base);
    expect(secs.map((s) => s.ownHf)).toEqual([true, false, true, false]);
    const faces = pageFaces(base, secs, [0, 0, 1, 1, 2, 3]);
    expect(faces.map((f) => f.label)).toEqual(["1", "2", "i", "ii", "iii", "4"]);
    expect(faces.map((f) => f.header)).toEqual(["Main 1 of 6", "Main 2 of 6", "Main i of 6", "Main ii of 6", "Annex iii", "Annex 4"]);
  });
});