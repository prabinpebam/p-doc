import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createDocument, serializeDocument } from "@p-doc/core";
import { toDocx } from "@p-doc/core/docx";
import { EXIT, findDoc, run } from "../src/cli/cli.ts";
import { Library } from "../src/main/library.ts";

// Real Git in temp folders, with none of the machine's or the owner's Git settings or app data (PD8).
const home = mkdtempSync(join(tmpdir(), "pdoc-cli-"));
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

let n = 0;
let dir: string;
let env: NodeJS.ProcessEnv;
beforeEach(() => {
  dir = join(home, `case-${++n}`);
  mkdirSync(dir, { recursive: true });
  env = { PDOC_USER_DATA: join(dir, "data"), PDOC_LIBRARY: join(dir, "lib"), PDOC_LOCALE: "en-US" };
});

async function pdoc(...argv: string[]) {
  let out = "";
  let err = "";
  const code = await run(argv, { out: (s) => (out += s), err: (s) => (err += s), env, cwd: dir, version: "9.9.9" });
  const json = argv.includes("--json") ? JSON.parse(out) : undefined;
  return { code, out, err, json };
}

describe("pdoc CLI (U38)", () => {
  it("prints help and its version, and rejects unknown commands and options as usage errors", async () => {
    expect((await pdoc("help")).out).toMatch(/pdoc setup --offline/);
    expect((await pdoc()).code).toBe(EXIT.usage);
    expect((await pdoc("--version", "--json")).json).toEqual({ version: "9.9.9" });
    const bad = await pdoc("frobnicate", "--json");
    expect(bad.code).toBe(EXIT.usage);
    expect(bad.json).toMatchObject({ code: 1, error: expect.stringMatching(/Unknown command/) });
    expect((await pdoc("list", "--colour")).code).toBe(EXIT.usage);
  });

  it("setup without --offline asks for a person, and --offline makes the library", async () => {
    const gh = await pdoc("setup", "--json");
    expect(gh.code).toBe(EXIT.needsPerson);
    expect(gh.json).toMatchObject({ needs: "sign-in", code: 3 });
    expect(existsSync(join(dir, "lib"))).toBe(false);

    const ok = await pdoc("setup", "--offline", "--json");
    expect(ok.code).toBe(EXIT.ok);
    expect(ok.json).toMatchObject({ library: join(dir, "lib"), versions: true });
    expect(existsSync(join(dir, "lib", "private", ".git"))).toBe(true);
    expect(existsSync(join(dir, "lib", "public", ".git"))).toBe(true);
    expect(JSON.parse(readFileSync(join(dir, "data", "settings.json"), "utf8")).firstRun).toBe("done");
  });

  it("setup --library records the folder so later commands (and the app) use it", async () => {
    delete env.PDOC_LIBRARY;
    const r = await pdoc("setup", "--offline", "--library", "elsewhere", "--json");
    expect(r.code).toBe(EXIT.ok);
    expect(r.json.library).toBe(join(dir, "elsewhere"));
    expect(JSON.parse(readFileSync(join(dir, "data", "settings.json"), "utf8")).library).toBe(join(dir, "elsewhere"));
    await pdoc("new", "Kept elsewhere");
    expect((await pdoc("list", "--json")).json.map((d: { title: string }) => d.title)).toEqual(["Kept elsewhere"]);
  });

  it("new and list: private by default, --public on request, recent first", async () => {
    const a = await pdoc("new", "First draft", "--json");
    expect(a.code).toBe(EXIT.ok);
    expect(a.json).toMatchObject({ title: "First draft", space: "private", bin: false });
    expect(existsSync(a.json.file)).toBe(true);
    await new Promise((r) => setTimeout(r, 20));
    const b = await pdoc("new", "Open letter", "--public", "--json");
    expect(b.json.space).toBe("public");
    const list = await pdoc("list", "--json");
    expect(list.json.map((d: { title: string }) => d.title)).toEqual(["Open letter", "First draft"]);
    expect((await pdoc("list")).out).toMatch(/private .*First draft/);
    expect((await pdoc("new", "--json")).code).toBe(EXIT.usage);
  });

  it("finds a document by id, id prefix, path or title, and says when none or several match", async () => {
    const made = (await pdoc("new", "Report", "--json")).json;
    const lib = await Library.open(join(dir, "lib"), { identity: () => ({ name: "T", email: "t@example.invalid" }) });
    for (const key of [made.id, made.id.slice(0, 8), made.path, `private/${made.path}`, "report"]) expect(findDoc(lib, key).id).toBe(made.id);
    expect((await pdoc("history", "Nothing like it", "--json")).code).toBe(EXIT.notFound);
    await pdoc("new", "Report");
    const two = await pdoc("history", "Report", "--json");
    expect(two.code).toBe(EXIT.notFound);
    expect(two.json.matches).toHaveLength(2);
  });

  it("history lists versions, and export reads any of them as Markdown", async () => {
    const made = (await pdoc("new", "Notes", "--json")).json;
    const lib = await Library.open(join(dir, "lib"), { identity: () => ({ name: "T", email: "t@example.invalid" }) });
    const ref = { space: made.space, path: made.path };
    const doc = lib.read(ref).doc;
    doc.content = { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Second thoughts" }] }] };
    lib.write(ref, doc);
    await lib.commitDoc(ref);

    const h = await pdoc("history", made.id, "--json");
    expect(h.code).toBe(EXIT.ok);
    expect(h.json.versions).toHaveLength(2);
    const first = h.json.versions.at(-1).sha as string;

    const now = await pdoc("export", "Notes", "--to", "md");
    expect(now.code).toBe(EXIT.ok);
    expect(now.out).toMatch(/Second thoughts/);
    const then = await pdoc("export", "Notes", "--to", "md", "--version", first.slice(0, 10), "--json");
    expect(then.json).toMatchObject({ version: first, format: "md" });
    expect(then.json.content).not.toMatch(/Second thoughts/);
    expect((await pdoc("export", "Notes", "--to", "md", "--version", "abcdef12")).code).toBe(EXIT.notFound);
    expect((await pdoc("export", "Notes", "--to", "pdf")).code).toBe(EXIT.usage);
  });

  it("exports Word only to a file, adding the extension", async () => {
    await pdoc("new", "Letter");
    expect((await pdoc("export", "Letter", "--to", "docx")).code).toBe(EXIT.usage);
    const r = await pdoc("export", "Letter", "--to", "docx", "--out", "letter", "--json");
    expect(r.code).toBe(EXIT.ok);
    expect(r.json.file).toBe(join(dir, "letter.docx"));
    expect(readFileSync(r.json.file).subarray(0, 2).toString()).toBe("PK");
  });

  it("imports Word, Markdown and P-Doc files as new private documents", async () => {
    const src = createDocument({ title: "Quarterly plan", content: { type: "doc", content: [{ type: "heading", attrs: { level: 1 }, content: [{ type: "text", text: "Goals" }] }] } });
    writeFileSync(join(dir, "Quarterly plan.docx"), await toDocx(src));
    writeFileSync(join(dir, "readme.md"), "# Hello\n\nSome *text*.\n");
    writeFileSync(join(dir, "copy.pdoc.json"), serializeDocument(src));

    const w = await pdoc("import", "Quarterly plan.docx", "--json");
    expect(w.code).toBe(EXIT.ok);
    expect(w.json).toMatchObject({ title: "Quarterly plan", space: "private", leftOut: [], kept: 0 });
    expect(readFileSync(w.json.file, "utf8")).toMatch(/Goals/);
    // Word comments come in with the document (U67).
    const reviewed = createDocument({ title: "Reviewed", content: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Look", marks: [{ type: "comment", attrs: { id: "t1" } }] }] }] }, comments: [{ id: "t1", author: "Ana", created: "2026-10-03T10:00:00.000Z", body: "Why?", resolved: false, quote: "Look", replies: [] }] });
    writeFileSync(join(dir, "Reviewed.docx"), await toDocx(reviewed));
    const rv = await pdoc("import", "Reviewed.docx", "--json");
    expect(JSON.parse(readFileSync(rv.json.file, "utf8")).comments).toMatchObject([{ author: "Ana", body: "Why?", quote: "Look" }]);
    const m = await pdoc("import", "readme.md", "--json");
    expect(m.json.title).toBe("readme");
    const p = await pdoc("import", "copy.pdoc.json", "--json");
    expect(p.json.title).toBe("Quarterly plan");
    expect(p.json.id).not.toBe(src.id);

    expect((await pdoc("import", "missing.docx", "--json")).code).toBe(EXIT.notFound);
    writeFileSync(join(dir, "picture.png"), "x");
    const bad = await pdoc("import", "picture.png", "--json");
    expect(bad.code).toBe(EXIT.failed);
    expect(bad.json.error).toMatch(/can open \.docx/);
    expect((await pdoc("list", "--json")).json).toHaveLength(4);
  });
});
