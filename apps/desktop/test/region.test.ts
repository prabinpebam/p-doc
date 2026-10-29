import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { Library } from "../src/main/library.ts";
import { paperLocale } from "../src/main/region.ts";

describe("paperLocale", () => {
  it("reads the system locale on Windows, whatever POSIX variables say", () => {
    expect(paperLocale("en-IN", { LC_PAPER: "en_US.UTF-8" }, "win32")).toBe("en-IN");
  });

  it("prefers LC_ALL, then LC_PAPER, on Linux and macOS, but not the C locale", () => {
    expect(paperLocale("en-US", { LC_PAPER: "en_GB.UTF-8" }, "linux")).toBe("en_GB.UTF-8");
    expect(paperLocale("en-US", { LC_ALL: "de_DE.UTF-8", LC_PAPER: "en_US.UTF-8" }, "linux")).toBe("de_DE.UTF-8");
    expect(paperLocale("en-GB", { LC_ALL: "C" }, "darwin")).toBe("en-GB");
    expect(paperLocale("en-GB", { LC_PAPER: "POSIX" }, "linux")).toBe("en-GB");
    expect(paperLocale("en-GB", {}, "darwin")).toBe("en-GB");
  });

  it("lets PDOC_LOCALE override everything", () => {
    expect(paperLocale("en-IN", { PDOC_LOCALE: "en-US", LC_ALL: "de_DE" }, "linux")).toBe("en-US");
  });
});

describe("Library.create paper", () => {
  let dir = "";
  afterEach(() => rmSync(dir, { recursive: true, force: true }));
  const identity = () => ({ name: "Test", email: "test@localhost" });

  it("uses the region's paper for a new document without a page setup, and a given setup as is", async () => {
    dir = mkdtempSync(join(tmpdir(), "pdoc-region-"));
    const india = await Library.open(join(dir, "in"), { identity, git: null, locale: "en-IN" });
    await india.ensure();
    expect((await india.create({ title: "A" })).doc.page.size).toBe("a4");
    const us = await Library.open(join(dir, "us"), { identity, git: null, locale: "en-US" });
    await us.ensure();
    expect((await us.create({ title: "B" })).doc.page.size).toBe("letter");
    const page = (await us.create({ title: "C" })).doc.page;
    expect((await india.create({ title: "D", page: { ...page, size: "legal" } })).doc.page.size).toBe("legal");
  });
});
