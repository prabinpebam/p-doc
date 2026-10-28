import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

// A rename that fails a given number of times with a given code, as Windows does while another
// process has the file open; otherwise the real rename.
const fail = { times: 0, code: "EPERM" };
vi.mock("node:fs", async (orig) => {
  const fs = await orig<typeof import("node:fs")>();
  return {
    ...fs,
    renameSync: (a: string, b: string) => {
      if (fail.times > 0) {
        fail.times--;
        throw Object.assign(new Error(`${fail.code}: operation not permitted, rename`), { code: fail.code });
      }
      return fs.renameSync(a, b);
    },
  };
});

const { writeAtomic } = await import("../src/main/library.ts");

const dir = mkdtempSync(join(tmpdir(), "pdoc-atomic-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));
beforeEach(() => {
  fail.times = 0;
  fail.code = "EPERM";
});

describe("writeAtomic", () => {
  it("writes the whole file and leaves no temp file", () => {
    const f = join(dir, "a.pdoc.json");
    writeAtomic(f, "one");
    writeAtomic(f, "two");
    expect(readFileSync(f, "utf8")).toBe("two");
    expect(readdirSync(dir).filter((n) => n.endsWith(".tmp"))).toEqual([]);
  });

  it.each(["EPERM", "EACCES", "EBUSY"])("retries a rename that fails for a moment with %s", (code) => {
    const f = join(dir, `${code}.pdoc.json`);
    fail.times = 5;
    fail.code = code;
    writeAtomic(f, "kept");
    expect(readFileSync(f, "utf8")).toBe("kept");
    expect(fail.times).toBe(0);
  });

  it("gives up after about two seconds, removes its temp file and reports the error", () => {
    const f = join(dir, "stuck.pdoc.json");
    fail.times = 1000;
    const t = Date.now();
    expect(() => writeAtomic(f, "never")).toThrow(/EPERM/);
    expect(Date.now() - t).toBeLessThan(5000);
    expect(readdirSync(dir).filter((n) => n.startsWith("stuck"))).toEqual([]);
  });

  it("doesn't retry other errors", () => {
    const f = join(dir, "other.pdoc.json");
    fail.times = 2;
    fail.code = "ENOSPC";
    expect(() => writeAtomic(f, "x")).toThrow(/ENOSPC/);
    expect(fail.times).toBe(1);
  });
});
