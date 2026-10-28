import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { assetsOf, dataImageParts, FORMAT_VERSION, parseDocument, serializeDocument, type PDocFile } from "@p-doc/core";
import type { JSONContent } from "@tiptap/core";
import { Account } from "../src/main/account.ts";
import { git } from "../src/main/git.ts";
import { exportBytes, importInto } from "../src/main/files.ts";
import { Library, NEWER_MESSAGE, TOO_BIG_MESSAGE } from "../src/main/library.ts";
import { runSetup } from "../src/main/setup.ts";
import { Sync } from "../src/main/sync.ts";
import { run } from "../src/cli/cli.ts";
import { DEFAULT_REPOS, type DocRef, type GitHubLink, type Space } from "../src/shared/api.ts";
import { fakeHelperConfig, startFakeGitHub, type FakeGitHub } from "./fakes/fake-github.ts";

// DoD 7.2: real Git in temp folders and a fake GitHub on 127.0.0.1; nothing of the owner's (PD8).
const home = mkdtempSync(join(tmpdir(), "pdoc-assets-"));
const TOKEN = "ghp_assetstoken0123456789abcdefABCDEF012";
const saved = { ...process.env };
let gh: FakeGitHub;
let n = 0;
let work: string;

beforeAll(async () => {
  gh = await startFakeGitHub(join(home, "github"));
  process.env.GIT_CONFIG_NOSYSTEM = "1";
  process.env.PDOC_GITHUB_REMOTE = gh.remote;
});
afterAll(async () => {
  await gh.close();
  for (const k of ["GIT_CONFIG_GLOBAL", "GIT_CONFIG_NOSYSTEM", "PDOC_GITHUB_REMOTE"]) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  rmSync(home, { recursive: true, force: true });
});
beforeEach(async () => {
  work = join(home, `t-${++n}`);
  const gitconfig = join(home, `gitconfig-${n}`);
  writeFileSync(gitconfig, "");
  process.env.GIT_CONFIG_GLOBAL = gitconfig;
  await git(home, ["config", "--file", gitconfig, "credential.helper", fakeHelperConfig(join(home, `vault-${n}.json`))]);
  gh.users.clear();
  gh.users.set(TOKEN, { login: `img${n}`, id: 2000 + n, name: "Test Writer", scopes: "repo" });
});

const identity = () => ({ name: "Test Writer", email: "writer@example.invalid" });

// Three different pictures: a 2×1 PNG, a 1×1 GIF and a 4×3 BMP.
const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAYAAAD0In+KAAAAEUlEQVR4nGP4z8DAwMDAAAAPAAH/X7pt6QAAAABJRU5ErkJggg==";
const GIF = "data:image/gif;base64,R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==";
function bmp(w: number, h: number, seed: number): string {
  const row = Math.ceil((w * 3) / 4) * 4;
  const size = 54 + row * h;
  const b = Buffer.alloc(size);
  b.write("BM", 0, "latin1");
  b.writeUInt32LE(size, 2);
  b.writeUInt32LE(54, 10);
  b.writeUInt32LE(40, 14);
  b.writeInt32LE(w, 18);
  b.writeInt32LE(h, 22);
  b.writeUInt16LE(1, 26);
  b.writeUInt16LE(24, 28);
  for (let i = 54; i < size; i++) b[i] = (i * seed) & 0xff;
  return `data:image/bmp;base64,${b.toString("base64")}`;
}
const BMP = bmp(4, 3, 7);
const PICTURES = [PNG, GIF, BMP];

const para = (text: string): JSONContent => ({ type: "paragraph", content: [{ type: "text", text }] });
const img = (src: string, alt: string): JSONContent => ({ type: "image", attrs: { src, alt } });

/** A document as stage 6 wrote it: format version 1, its pictures inside the file. */
function v1File(title: string): string {
  return `${JSON.stringify(
    {
      format: "p-doc",
      version: 1,
      id: `doc-${title.toLowerCase()}`,
      title,
      created: "2026-10-01T10:00:00.000Z",
      content: { type: "doc", content: [para("Before"), img(PNG, "png"), para("Middle"), img(GIF, "gif"), { type: "table", content: [{ type: "tableRow", content: [{ type: "tableCell", content: [img(BMP, "bmp")] }] }] }] },
    },
    null,
    2,
  )}\n`;
}

const sha256 = async (bytes: Uint8Array) => Buffer.from(await crypto.subtle.digest("SHA-256", new Uint8Array(bytes))).toString("hex");
const bytesOf = (dataUrl: string) => dataImageParts(dataUrl)!.bytes;

/** Every picture of the fixture is in the repository, byte for byte, and the document points at each. */
async function expectAllPictures(lib: Library, space: Space, doc: PDocFile) {
  const srcs = assetsOf(doc.content);
  const want = await Promise.all(PICTURES.map(async (p) => `assets/${await sha256(bytesOf(p))}`));
  for (const w of want) expect(srcs.some((s) => s.startsWith(w))).toBe(true);
  for (const s of srcs) {
    const file = lib.assetFile(space, s);
    expect(existsSync(file)).toBe(true);
    expect(await sha256(readFileSync(file))).toBe(s.slice(7, 71));
  }
  expect(JSON.stringify(doc.content)).not.toContain("data:image");
}

/** Every version of every document in a repository refers only to pictures committed with it, and still on disk. */
async function expectNoVersionLosesAPicture(lib: Library, space: Space) {
  const dir = lib.dir(space);
  const commits = (await git(dir, ["rev-list", "--all"])).stdout.trim().split("\n").filter(Boolean);
  let checked = 0;
  for (const c of commits) {
    const files = (await git(dir, ["ls-tree", "-r", "--name-only", c])).stdout.split("\n").filter(Boolean);
    for (const f of files.filter((x) => x.endsWith(".pdoc.json"))) {
      const doc = parseDocument((await git(dir, ["show", `${c}:${f}`])).stdout, { allowNewer: true });
      for (const s of assetsOf(doc.content)) {
        expect(files, `${c.slice(0, 7)} ${f} ${s}`).toContain(s);
        expect(existsSync(lib.assetFile(space, s))).toBe(true);
        checked++;
      }
    }
  }
  return checked;
}

async function computer(name: string, link: () => GitHubLink | null) {
  const lib = await Library.open(join(work, name), { identity });
  await lib.ensure();
  const acc = new Account({ cwd: home, base: gh.api });
  await acc.signInWithToken(TOKEN);
  return { lib, acc, sync: new Sync({ library: lib, account: acc, link }) };
}

describe("images beside the document (DoD 7.2)", { timeout: 120_000 }, () => {
  it("keeps every picture through migration, versions, deletion, restore, sync, clone, Word, copy, moves and the CLI", async () => {
    const link: GitHubLink = { login: `img${n}`, names: { ...DEFAULT_REPOS }, connected: true, auto: true };
    const a = await computer("a", () => link);
    await runSetup(await a.acc.api(), `img${n}`, DEFAULT_REPOS, [], a.sync);

    // A stage-6 document with three pictures inside it, committed as stage 6 would.
    const ref: DocRef = { space: "private", path: "docs/report-doc-repo.pdoc.json" };
    writeFileSync(a.lib.file(ref), v1File("Report"));
    await a.lib.commit("private", [ref.path], "Create Report");

    // 1. Opening it for editing moves the pictures beside it, with a version.
    const moved = await a.lib.storeImagesOf(ref);
    expect(moved!.doc.version).toBe(FORMAT_VERSION);
    await expectAllPictures(a.lib, "private", moved!.doc);
    expect((await git(a.lib.dir("private"), ["log", "-1", "--format=%s"])).stdout.trim()).toBe("Store images beside Report");
    expect(readFileSync(a.lib.file(ref), "utf8").length).toBeLessThan(8000);
    expect(await a.lib.storeImagesOf(ref)).toBeNull();

    // 2. Five versions, one picture deleted, the oldest version restored.
    for (let i = 1; i <= 5; i++) {
      const d = a.lib.read(ref).doc;
      d.content.content!.push(para(`Edit ${i}`));
      if (i === 3) d.content.content = d.content.content!.filter((x) => !(x.type === "image" && x.attrs?.alt === "gif"));
      a.lib.write(ref, d);
      await a.lib.commitDoc(ref);
    }
    expect(JSON.stringify(a.lib.read(ref).doc.content)).not.toContain('"gif"');
    const history = await a.lib.history(ref);
    expect(history.length).toBeGreaterThanOrEqual(7);
    const oldest = history[history.length - 1]!;
    const restored = await a.lib.restoreVersion(ref, oldest.sha);
    // The oldest version had its pictures inside; restoring stores them beside it in the same way.
    await expectAllPictures(a.lib, "private", restored.doc);

    // 3. Sync to GitHub and a fresh clone on another computer.
    expect((await a.sync.run()).status.state.kind).toBe("synced");
    const files = gh.files(`img${n}`, "p-doc-private");
    for (const s of assetsOf(restored.doc.content)) expect(files).toContain(s);
    expect(gh.files(`img${n}`, "p-doc-public").some((f) => f.startsWith("assets/"))).toBe(false);
    const b = await computer("b", () => link);
    await runSetup(await b.acc.api(), `img${n}`, DEFAULT_REPOS, [], b.sync);
    await expectAllPictures(b.lib, "private", b.lib.read(ref).doc);

    // 4. Word out and back in: the same pictures, stored once.
    const before = assetsOf(restored.doc.content).sort();
    const docx = await exportBytes(restored.doc, "docx", { library: a.lib, space: "private" });
    const back = await importInto(a.lib, "Report.docx", docx);
    expect(assetsOf(back.opened.doc.content).sort()).toEqual(before);

    // 5. A copy points at the same files.
    const copy = await a.lib.copy(ref);
    expect(assetsOf(a.lib.read(copy).doc.content).sort()).toEqual(before);

    // 6. To Public and back: the pictures go with it and are committed there; nothing else is.
    const pub = await a.lib.move(ref, "public");
    await expectAllPictures(a.lib, "public", a.lib.read(pub).doc);
    const tracked = (await git(a.lib.dir("public"), ["ls-files", "assets"])).stdout.trim().split("\n").sort();
    expect(tracked).toEqual(before);
    const priv = await a.lib.move(pub, "private");
    await expectAllPictures(a.lib, "private", a.lib.read(priv).doc);

    // 7. pdoc export and import.
    const env = { PDOC_USER_DATA: join(work, "data"), PDOC_LIBRARY: join(work, "a") };
    const io = { out: () => undefined, err: () => undefined, env, cwd: work, version: "9.9.9" };
    expect(await run(["export", priv.id, "--to", "docx", "--out", "cli.docx"], io)).toBe(0);
    expect(await run(["export", priv.id, "--to", "html", "--out", "cli.html"], io)).toBe(0);
    const html = readFileSync(join(work, "cli.html"), "utf8");
    expect(html.match(/src="data:image\//g)?.length).toBe(before.length);
    expect(await run(["import", "cli.docx"], io)).toBe(0);
    const viaCli = a.lib.list().find((d) => d.title === "cli" && !d.bin)!;
    expect(assetsOf(a.lib.read(viaCli).doc.content).sort()).toEqual(before);

    // 8. No version anywhere refers to a picture that wasn't committed with it or is gone from disk.
    await a.lib.settle();
    expect(await expectNoVersionLosesAPicture(a.lib, "private")).toBeGreaterThan(10);
    expect(await expectNoVersionLosesAPicture(a.lib, "public")).toBeGreaterThan(0);
  });

  it("loses nothing when it stops between writing a picture and writing the document", async () => {
    const lib = await Library.open(join(work, "c"), { identity });
    await lib.ensure();
    const ref: DocRef = { space: "private", path: "docs/crash-doc.pdoc.json" };
    const text = v1File("Crash");
    writeFileSync(lib.file(ref), text);
    // The pictures are written; then the power goes before the document is.
    for (const p of PICTURES) lib.putAsset("private", bytesOf(p));
    expect(readFileSync(lib.file(ref), "utf8")).toBe(text);
    const again = await Library.open(join(work, "c"), { identity });
    const opened = again.read(ref).doc;
    expect(JSON.stringify(opened.content).match(/data:image/g)?.length).toBe(3);
    const moved = await again.storeImagesOf(ref);
    await expectAllPictures(again, "private", moved!.doc);
  });

  it("stores one file for the same picture in two documents, and refuses one over 20 MB", async () => {
    const lib = await Library.open(join(work, "d"), { identity });
    await lib.ensure();
    const one = await lib.create({ title: "One", content: { type: "doc", content: [img(PNG, "x")] } });
    const two = await lib.create({ title: "Two", content: { type: "doc", content: [img(PNG, "y")] } });
    expect(assetsOf(one.doc.content)).toHaveLength(1);
    const [s1] = assetsOf(lib.read(one.summary).doc.content);
    const [s2] = assetsOf(lib.read(two.summary).doc.content);
    expect(s1).toBe(s2);
    expect(lib.putAsset("private", bytesOf(PNG))).toEqual({ src: s1, width: 2, height: 1 });
    const big = new Uint8Array(20 * 1024 * 1024 + 1);
    big.set(bytesOf(PNG));
    expect(() => lib.putAsset("private", big)).toThrow(TOO_BIG_MESSAGE);
  });

  it("leaves a newer P-Doc's file byte for byte as it was, through saves, library operations and sync", async () => {
    const link: GitHubLink = { login: `img${n}`, names: { ...DEFAULT_REPOS }, connected: true, auto: true };
    const a = await computer("a", () => link);
    await runSetup(await a.acc.api(), `img${n}`, DEFAULT_REPOS, [], a.sync);
    const ref: DocRef = { space: "private", path: "docs/future-doc.pdoc.json" };
    const text = `${JSON.stringify({ format: "p-doc", version: FORMAT_VERSION + 1, id: "future", title: "Future", created: "2027-01-01T00:00:00.000Z", content: { type: "doc", content: [para("Hi"), { type: "footnote", attrs: { n: 1 } }] }, sections: [{ columns: 2 }] }, null, 2)}\n`;
    writeFileSync(a.lib.file(ref), text);
    await a.lib.commit("private", [ref.path], "Create Future");

    const listed = a.lib.list().find((d) => d.id === "future")!;
    expect(listed).toMatchObject({ title: "Future", newer: true });
    expect(a.lib.read(ref).summary.newer).toBe(true);
    const doc = a.lib.read(ref).doc;
    expect(() => a.lib.write(ref, doc)).toThrow(NEWER_MESSAGE);
    expect(() => a.lib.write(ref, { ...doc, version: FORMAT_VERSION })).toThrow(NEWER_MESSAGE);
    await expect(a.lib.rename(ref, "Past")).rejects.toThrow(NEWER_MESSAGE);
    await expect(a.lib.copy(ref)).rejects.toThrow(NEWER_MESSAGE);
    await expect(a.lib.move(ref, "public")).rejects.toThrow(NEWER_MESSAGE);
    expect(await a.lib.storeImagesOf(ref)).toBeNull();
    await a.lib.commitDoc(ref);
    expect((await a.sync.run()).status.state.kind).toBe("synced");
    expect(readFileSync(a.lib.file(ref), "utf8")).toBe(text);
    expect(gh.file(`img${n}`, "p-doc-private", ref.path)).toBe(text);
    expect(serializeDocument(doc)).not.toBe(text);
  });
});
