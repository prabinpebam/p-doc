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
      { start: 0, end: 1, page: 1, span: 1 },
      { start: 1, end: 3, page: 2, span: 3 },
    ]);
    expect(sheetsOf(paginate([{ height: 300 }, { height: 300 }, { height: 300 }], 500))).toEqual([
      { start: 0, end: 1, page: 1, span: 1 },
      { start: 1, end: 2, page: 2, span: 1 },
      { start: 2, end: 3, page: 3, span: 1 },
    ]);
    expect(sheetsOf(paginate([], 500))).toEqual([{ start: 0, end: 0, page: 1, span: 1 }]);
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
});
