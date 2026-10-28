import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { parseDocument } from "@p-doc/core";
import { git } from "../src/main/git.ts";
import { Library, LibraryError } from "../src/main/library.ts";

// Real Git in a temp folder, with none of the machine's or the owner's Git settings (PD8).
const home = mkdtempSync(join(tmpdir(), "pdoc-lib-"));
const saved = { global: process.env.GIT_CONFIG_GLOBAL, nosystem: process.env.GIT_CONFIG_NOSYSTEM };
beforeAll(() => {
  writeFileSync(join(home, "gitconfig"), "");
  process.env.GIT_CONFIG_GLOBAL = join(home, "gitconfig");
  process.env.GIT_CONFIG_NOSYSTEM = "1";
});
afterAll(() => {
  if (saved.global === undefined) delete process.env.GIT_CONFIG_GLOBAL;
  else process.env.GIT_CONFIG_GLOBAL = saved.global;
  if (saved.nosystem === undefined) delete process.env.GIT_CONFIG_NOSYSTEM;
  else process.env.GIT_CONFIG_NOSYSTEM = saved.nosystem;
  rmSync(home, { recursive: true, force: true });
});

const identity = () => ({ name: "Test Writer", email: "writer@example.invalid" });
const log = async (dir: string) => (await git(dir, ["log", "--format=%s|%an <%ae>"])).stdout.trim().split("\n").filter(Boolean);

let n = 0;
let root: string;
let lib: Library;
beforeEach(async () => {
  root = join(home, `lib-${++n}`);
  lib = await Library.open(root, { identity });
  await lib.ensure();
});

describe("library", () => {
  it("makes a private and a public repository, once", async () => {
    expect(lib.versioned).toBe(true);
    expect(lib.ready).toBe(true);
    for (const s of ["private", "public"] as const) {
      expect(existsSync(join(root, s, ".git"))).toBe(true);
      expect(readFileSync(join(root, s, "README.md"), "utf8")).toMatch(s === "private" ? /only you can read it/ : /made public on purpose/);
      expect(await log(lib.dir(s))).toEqual(["Start P-Doc library|Test Writer <writer@example.invalid>"]);
    }
    await lib.ensure();
    expect(await log(lib.dir("private"))).toHaveLength(1);
  });

  it("creates a private document by default, as readable JSON, with a version", async () => {
    const { doc, summary } = await lib.create({ title: "Trip notes" });
    expect(summary.space).toBe("private");
    expect(summary.path).toMatch(new RegExp(`^docs/trip-notes-${doc.id.slice(0, 8)}\\.pdoc\\.json$`));
    expect(parseDocument(readFileSync(lib.file(summary), "utf8")).title).toBe("Trip notes");
    expect((await log(lib.dir("private")))[0]).toMatch(/^Create Trip notes\|/);
    expect(lib.list().map((d) => d.title)).toEqual(["Trip notes"]);
  });

  it("saves without making a version; versions come from the cadence or on close", async () => {
    const { doc, summary } = await lib.create({ title: "Draft" });
    const before = await log(lib.dir("private"));
    lib.write(summary, { ...doc, content: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Hello" }] }] } });
    expect(readFileSync(lib.file(summary), "utf8")).toContain("Hello");
    expect(await log(lib.dir("private"))).toEqual(before);
    expect(await lib.commit("private", [summary.path], "Edit Draft")).toMatch(/^[0-9a-f]{40}$/);
    expect(await lib.commit("private", [summary.path], "Edit Draft")).toBeNull();
  });

  it("renames in the file (not the file name), and only versions a real change", async () => {
    const { summary } = await lib.create({ title: "Old" });
    const s = await lib.rename(summary, "  New  ");
    expect(s.path).toBe(summary.path);
    expect(s.title).toBe("New");
    expect((await log(lib.dir("private")))[0]).toMatch(/^Rename Old to New\|/);
    await lib.rename(summary, "New");
    expect((await log(lib.dir("private")))[0]).toMatch(/^Rename Old to New\|/);
    expect((await lib.rename(summary, "   ")).title).toBe("Untitled document");
  });

  it("copies with a new id and file", async () => {
    const { doc, summary } = await lib.create({ title: "Plan" });
    const c = await lib.copy(summary);
    expect(c.title).toBe("Copy of Plan");
    expect(c.id).not.toBe(doc.id);
    expect(c.path).not.toBe(summary.path);
    expect(lib.list()).toHaveLength(2);
  });

  it("deletes to the Bin and restores, even when the name is taken again", async () => {
    const { summary } = await lib.create({ title: "Gone" });
    const binned = await lib.remove(summary);
    expect(binned.bin).toBe(true);
    expect(binned.path).toBe(`.bin/${summary.path.slice(5)}`);
    expect(existsSync(lib.file(summary))).toBe(false);
    await expect(lib.remove(binned)).rejects.toThrow(LibraryError);
    expect((await log(lib.dir("private")))[0]).toMatch(/^Delete Gone\|/);

    const back = await lib.restore(binned);
    expect(back).toMatchObject({ path: summary.path, bin: false });
    await expect(lib.restore(back)).rejects.toThrow(LibraryError);

    // A document now has the restored one's name: the next restore takes a free name.
    const again = await lib.remove(back);
    writeFileSync(lib.file(summary), readFileSync(lib.file(again)));
    const free = await lib.restore(again);
    expect(free.path).not.toBe(summary.path);
    expect(free.path).toMatch(/-2\.pdoc\.json$/);
  });

  it("moves between Private and Public, versioning both sides", async () => {
    const { summary } = await lib.create({ title: "Essay" });
    const pub = await lib.move(summary, "public");
    expect(pub.space).toBe("public");
    expect(existsSync(lib.file(summary))).toBe(false);
    expect(existsSync(lib.file(pub))).toBe(true);
    expect((await log(lib.dir("public")))[0]).toMatch(/^Move Essay to Public\|/);
    expect((await log(lib.dir("private")))[0]).toMatch(/^Move Essay to Public\|/);
    expect(await lib.move(pub, "public")).toMatchObject({ space: "public", path: pub.path });
  });

  it("refuses anything that isn't a document in the library", () => {
    for (const path of ["../outside.pdoc.json", "docs/../../x.pdoc.json", "docs/a.txt", ".git/config", "docs/A.pdoc.json"]) {
      expect(() => lib.file({ space: "private", path })).toThrow(LibraryError);
    }
    expect(() => lib.file({ space: "shared" as never, path: "docs/a.pdoc.json" })).toThrow(LibraryError);
  });

  it("skips files that aren't P-Doc documents when listing", async () => {
    await lib.create({ title: "Real" });
    writeFileSync(join(root, "private", "docs", "broken.pdoc.json"), "{ not json");
    writeFileSync(join(root, "private", "docs", "notes.txt"), "hi");
    expect(lib.list().map((d) => d.title)).toEqual(["Real"]);
  });

  it("makes versions one at a time per repository", async () => {
    const docs = await Promise.all([1, 2, 3, 4].map((i) => lib.create({ title: `Doc ${i}` })));
    await lib.settle();
    const subjects = (await log(lib.dir("private"))).map((l) => l.split("|")[0]);
    expect(subjects).toHaveLength(5);
    expect(new Set(subjects)).toEqual(new Set(["Start P-Doc library", ...docs.map((d) => `Create ${d.doc.title}`)]));
  });

  it("works without Git: documents are saved, no versions are made", async () => {
    const plain = await Library.open(join(home, `plain-${n}`), { identity, git: null });
    await plain.ensure();
    expect(plain.versioned).toBe(false);
    expect(existsSync(join(plain.dir("private"), ".git"))).toBe(false);
    const { summary } = await plain.create({ title: "Offline" });
    expect(existsSync(plain.file(summary))).toBe(true);
    expect(await plain.commit("private", [summary.path], "x")).toBeNull();
  });
});

const para = (text: string) => ({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text }] }] });
const textOf = (d: { content: unknown }) => JSON.stringify(d.content).match(/"text":"([^"]*)"/)?.[1];

describe("versions", () => {
  async function drafted() {
    const { doc, summary } = await lib.create({ title: "Essay", content: para("one") });
    lib.write(summary, { ...doc, content: para("two") });
    const second = await lib.commitDoc(summary);
    lib.write(summary, { ...doc, content: para("three") });
    const third = await lib.commitDoc(summary);
    return { doc, ref: summary, second: second!, third: third! };
  }

  it("makes a version of the saved state, and none when nothing changed", async () => {
    const { ref, second, third } = await drafted();
    expect(second).toMatch(/^[0-9a-f]{40}$/);
    expect(third).not.toBe(second);
    expect(await lib.commitDoc(ref)).toBeNull();
    expect((await log(lib.dir("private")))[0]).toMatch(/^Edit Essay\|Test Writer/);
  });

  it("lists a document's versions newest first, with author and time, and nothing else's", async () => {
    const { ref, second, third } = await drafted();
    await lib.create({ title: "Other" });
    const h = await lib.history(ref);
    expect(h.map((v) => v.message)).toEqual(["Edit Essay", "Edit Essay", "Create Essay"]);
    expect(h[0]).toMatchObject({ sha: third, author: "Test Writer", name: null, path: ref.path });
    expect(h[1]!.sha).toBe(second);
    expect(Number.isNaN(Date.parse(h[0]!.time))).toBe(false);
  });

  it("reads the document as it was in a version, and refuses other commits", async () => {
    const { ref, second } = await drafted();
    expect(textOf(await lib.versionAt(ref, second))).toBe("two");
    const other = await lib.create({ title: "Other" });
    const otherSha = (await lib.history(other.summary))[0]!.sha;
    await expect(lib.versionAt(ref, otherSha)).rejects.toThrow(LibraryError);
    await expect(lib.versionAt(ref, "HEAD")).rejects.toThrow(LibraryError);
    await expect(lib.versionAt(ref, "--output=x" as never)).rejects.toThrow(LibraryError);
  });

  it("names a version with a tag, renames it, and removes the name", async () => {
    const { ref, second } = await drafted();
    await lib.nameVersion(ref, second, "  First   draft ");
    expect((await lib.history(ref)).find((v) => v.sha === second)!.name).toBe("First draft");
    await lib.nameVersion(ref, second, "Sent to editor");
    expect((await lib.history(ref)).filter((v) => v.name).map((v) => v.name)).toEqual(["Sent to editor"]);
    expect((await git(lib.dir("private"), ["tag"])).stdout.trim().split("\n")).toHaveLength(1);
    await lib.nameVersion(ref, second, "");
    expect((await lib.history(ref)).some((v) => v.name)).toBe(false);
  });

  it("restores an old version as a new version and keeps the ones in between", async () => {
    const { doc, ref, second } = await drafted();
    lib.write(ref, { ...doc, content: para("four, not yet a version") });
    const back = await lib.restoreVersion(ref, second);
    expect(textOf(back.doc)).toBe("two");
    expect(back.doc.id).toBe(doc.id);
    expect(textOf(lib.read(ref).doc)).toBe("two");
    const h = await lib.history(ref);
    expect(h[0]!.message).toMatch(/^Restore \d{4}-\d\d-\d\d \d\d:\d\d$/);
    expect(h).toHaveLength(5);
    expect(textOf(await lib.versionAt(ref, h[1]!.sha))).toBe("four, not yet a version");
  });

  it("makes a new document from an old version", async () => {
    const { ref, second } = await drafted();
    const copy = await lib.copyVersion(ref, second);
    expect(copy.title).toBe("Copy of Essay");
    expect(copy.path).not.toBe(ref.path);
    const opened = lib.read(copy);
    expect(textOf(opened.doc)).toBe("two");
    expect(opened.doc.id).not.toBe(lib.read(ref).doc.id);
    expect(textOf(lib.read(ref).doc)).toBe("three");
    expect((await lib.history(copy))[0]!.message).toMatch(/^Copy Essay from /);
  });

  it("follows a document through the Bin and back", async () => {
    const { ref, second } = await drafted();
    const binned = await lib.remove(ref);
    const back = await lib.restore(binned);
    const h = await lib.history(back);
    expect(h.map((v) => v.message).slice(0, 2)).toEqual(["Restore Essay from the Bin", "Delete Essay"]);
    expect(textOf(await lib.versionAt(back, second))).toBe("two");
  });

  it("finds documents saved but never made a version, and nothing else", async () => {
    const { doc, ref } = await drafted();
    expect(await lib.unversioned()).toEqual([]);
    lib.write(ref, { ...doc, content: para("left by a crash") });
    writeFileSync(join(lib.dir("public"), "docs", "notes.txt"), "not a document");
    const other = await lib.create({ title: "Other", space: "public" });
    lib.write(other.summary, { ...other.doc, content: para("also left") });
    const mine = { space: ref.space, path: ref.path };
    const theirs = { space: "public", path: other.summary.path };
    expect(await lib.unversioned()).toEqual([mine, theirs]);
    await lib.commitDoc(ref);
    expect(await lib.unversioned()).toEqual([theirs]);
  });

  it("has no versions without Git", async () => {
    const plain = await Library.open(join(home, `plain-v-${n}`), { identity, git: null });
    await plain.ensure();
    const { summary } = await plain.create({ title: "Offline" });
    expect(await plain.history(summary)).toEqual([]);
    expect(await plain.commitDoc(summary)).toBeNull();
  });
});
