import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DocRef } from "../src/shared/api.ts";
import { Versions } from "../src/main/versions.ts";

const a: DocRef = { space: "private", path: "docs/a-00000001.pdoc.json" };
const b: DocRef = { space: "public", path: "docs/b-00000002.pdoc.json" };

let made: DocRef[];
let v: Versions;
beforeEach(() => {
  vi.useFakeTimers();
  made = [];
  v = new Versions({ pauseMs: 1000, maxMs: 5000, now: () => Date.now(), commit: async (r) => (made.push(r), `sha${made.length}`) });
});
afterEach(() => vi.useRealTimers());

describe("version scheduling", () => {
  it("makes a version after a pause in writing, not while writing", async () => {
    v.changed(a);
    await vi.advanceTimersByTimeAsync(900);
    v.changed(a);
    await vi.advanceTimersByTimeAsync(900);
    expect(made).toEqual([]);
    await vi.advanceTimersByTimeAsync(100);
    expect(made).toEqual([a]);
    expect(v.waiting).toEqual([]);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(made).toHaveLength(1);
  });

  it("makes a version at least every so often while writing goes on", async () => {
    v.changed(a);
    for (let t = 0; t < 4900; t += 700) {
      await vi.advanceTimersByTimeAsync(700);
      v.changed(a);
    }
    expect(made).toEqual([]);
    await vi.advanceTimersByTimeAsync(200);
    expect(made).toEqual([a]);
  });

  it("versions the other documents at once when the person switches", async () => {
    v.changed(a);
    v.changed(b);
    await v.commitExcept(b);
    expect(made).toEqual([a]);
    expect(v.waiting).toEqual([b]);
    await v.commitAll();
    expect(made).toEqual([a, b]);
  });

  it("reports versions made and failures, and forgets dropped documents", async () => {
    const committed = vi.fn();
    const failed = vi.fn();
    const w = new Versions({ pauseMs: 1000, commit: async (r) => (r.space === "public" ? Promise.reject(new Error("disk")) : "abc"), committed, failed });
    w.changed(a);
    w.changed(b);
    await w.commitAll();
    expect(committed).toHaveBeenCalledWith(a, "abc");
    expect(failed).toHaveBeenCalledOnce();
    w.changed(a);
    w.drop(a);
    await vi.advanceTimersByTimeAsync(5000);
    expect(committed).toHaveBeenCalledOnce();
  });

  it("versions a document on request only when it has changes waiting", async () => {
    expect(await v.commitIfWaiting(a)).toBeNull();
    expect(made).toEqual([]);
    v.changed(a);
    expect(await v.commitIfWaiting(a)).toBe("sha1");
    expect(v.waiting).toEqual([]);
    await vi.advanceTimersByTimeAsync(5000);
    expect(made).toEqual([a]);
  });
});
