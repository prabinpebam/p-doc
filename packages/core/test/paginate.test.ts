import { describe, expect, it } from "vitest";
import { paginate, sheetsOf } from "../src/index.ts";

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
      { start: 0, startLine: 0, end: 1, page: 1, span: 1 },
      { start: 1, startLine: 0, end: 3, page: 2, span: 3 },
    ]);
    expect(sheetsOf(paginate([{ height: 300 }, { height: 300 }, { height: 300 }], 500))).toEqual([
      { start: 0, startLine: 0, end: 1, page: 1, span: 1 },
      { start: 1, startLine: 0, end: 2, page: 2, span: 1 },
      { start: 2, startLine: 0, end: 3, page: 3, span: 1 },
    ]);
    expect(sheetsOf(paginate([], 500))).toEqual([{ start: 0, startLine: 0, end: 0, page: 1, span: 1 }]);
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
