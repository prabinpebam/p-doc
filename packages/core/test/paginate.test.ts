import { describe, expect, it } from "vitest";
import { paginate } from "../src/index.ts";

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

  it("counts many pages", () => {
    const r = paginate(Array.from({ length: 100 }, () => ({ height: 48 })), 864);
    expect(r.pages).toBe(Math.ceil(100 / 18));
  });
});
