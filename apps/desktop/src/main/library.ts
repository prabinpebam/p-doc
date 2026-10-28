/**
 * The library (U33): `<root>/private` and `<root>/public`, each a Git repository on `main` with
 * documents at `docs/<slug>-<id8>.pdoc.json`, deleted ones in `.bin/`, and a README. Electron-free, so
 * the CLI and unit tests use it as the app does. File names stay as created: a rename changes the
 * title inside the file, so history follows the file without rename detection. Images live beside the
 * documents as `assets/<sha256>.<ext>` (spec §4.9): written before the document that uses them,
 * committed with it, copied into the other repository when a document goes there, and never deleted.
 */
import { createHash } from "node:crypto";
import { closeSync, copyFileSync, existsSync, mkdirSync, openSync, readdirSync, readFileSync, readSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import {
  assetsOf,
  createDocument,
  dataImageParts,
  dataImageUrl,
  declaredVersion,
  documentPath,
  FORMAT_VERSION,
  hasDataImages,
  IMAGE_MIME,
  imageInfo,
  isAssetSrc,
  mapImages,
  MAX_IMAGE_BYTES,
  newId,
  parseDocument,
  serializeDocument,
  type PDocFile,
} from "@p-doc/core";
import { git, gitSupported, gitVersion } from "./git.ts";
import { DOC_PATH, isDocRef, type StoredAsset, type CreateRequest, type DocRef, type DocSummary, type Identity, type Opened, type Space, type VersionEntry } from "../shared/api.ts";

/** "2026-10-28 14:05" in local time, for version messages. */
export function localTime(iso: string): string {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export const SPACES: Space[] = ["private", "public"];

const README: Record<Space, string> = {
  private: "# P-Doc private documents\n\nDocuments written in [P-Doc](https://github.com/prabinpebam/p-doc). This repository is private: only you can read it.\n\nEach document is a `.pdoc.json` file in `docs/`. Deleted documents are kept in `.bin/`.\n",
  public: "# P-Doc public documents\n\nDocuments written in [P-Doc](https://github.com/prabinpebam/p-doc) and made public on purpose.\n\nEach document is a `.pdoc.json` file in `docs/`. Deleted documents are kept in `.bin/`.\n",
};

const RENAME_RETRY = new Set(["EPERM", "EACCES", "EBUSY"]);
const pause = (ms: number) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

/**
 * Writes a file so a reader never sees half of it: a temp file beside it, then a rename. On Windows a
 * rename over a file that another process (Git, the indexer, antivirus) has open fails for a moment,
 * so it is retried for up to about two seconds before the error is reported.
 */
export function writeAtomic(file: string, data: string | Uint8Array): void {
  mkdirSync(dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2, 8)}.tmp`;
  if (typeof data === "string") writeFileSync(tmp, data, "utf8");
  else writeFileSync(tmp, data);
  for (let attempt = 0; ; attempt++) {
    try {
      renameSync(tmp, file);
      return;
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code ?? "";
      if (!RENAME_RETRY.has(code) || attempt >= 20) {
        rmSync(tmp, { force: true });
        throw err;
      }
      pause(Math.min(10 * (attempt + 1), 150));
    }
  }
}

export class LibraryError extends Error {}

export const NEWER_MESSAGE = "Made with a newer P-Doc. Update to edit it.";
export const TOO_BIG_MESSAGE = "This image is larger than 20 MB. Make it smaller and try again.";
export const NOT_IMAGE_MESSAGE = "This file isn't an image P-Doc can show. Use PNG, JPEG, GIF, WebP, SVG or BMP.";


/** The format version at the head of a file on disk, or null. */
function versionOnDisk(file: string): number | null {
  if (!existsSync(file)) return null;
  const fd = openSync(file, "r");
  try {
    const buf = Buffer.alloc(4096);
    const n = readSync(fd, buf, 0, buf.length, 0);
    return declaredVersion(buf.subarray(0, n).toString("utf8"));
  } finally {
    closeSync(fd);
  }
}

export interface LibraryOptions {
  identity: () => Identity;
  /** Git's version; null turns versions off. Detected when left out. */
  git?: string | null;
  /** Called after a repository gets a new version or version name (sync follows). */
  changed?: (space: Space) => void;
}

export class Library {
  private queues = new Map<Space, Promise<unknown>>();
  /** Called after a repository gets a new version or version name. */
  changed: (space: Space) => void = () => undefined;

  private constructor(
    readonly root: string,
    readonly gitVersion: string | null,
    private readonly identity: () => Identity,
  ) {}

  static async open(root: string, o: LibraryOptions): Promise<Library> {
    const v = o.git === undefined ? await gitVersion() : o.git;
    const lib = new Library(root, gitSupported(v) ? v : null, o.identity);
    if (o.changed) lib.changed = o.changed;
    return lib;
  }

  get versioned(): boolean {
    return this.gitVersion != null;
  }

  /** The name and email versions are made with. */
  author(): Identity {
    return this.identity();
  }

  dir(space: Space): string {
    return join(this.root, space);
  }

  file(ref: DocRef): string {
    if (!isDocRef(ref)) throw new LibraryError(`Not a document in the library: ${JSON.stringify(ref)}`);
    return join(this.dir(ref.space), ...ref.path.split("/"));
  }

  /** Whether both repositories exist. */
  get ready(): boolean {
    return SPACES.every((s) => existsSync(join(this.dir(s), "docs")));
  }

  /** Makes both repositories, or finishes making them; safe to run again. */
  async ensure(): Promise<void> {
    for (const space of SPACES) {
      const dir = this.dir(space);
      mkdirSync(join(dir, "docs"), { recursive: true });
      const readme = join(dir, "README.md");
      if (!existsSync(readme)) writeFileSync(readme, README[space]);
      if (this.versioned && !existsSync(join(dir, ".git"))) {
        await git(dir, ["init", "-b", "main"]);
        await this.commit(space, ["README.md"], "Start P-Doc library");
      }
    }
  }

  /** Every document, recently edited first. */
  list(): DocSummary[] {
    const out: DocSummary[] = [];
    for (const space of SPACES) {
      for (const folder of ["docs", ".bin"] as const) {
        const dir = join(this.dir(space), folder);
        if (!existsSync(dir)) continue;
        for (const name of readdirSync(dir)) {
          const path = `${folder}/${name}`;
          if (!DOC_PATH.test(path)) continue;
          try {
            out.push(this.summary({ space, path }));
          } catch {
            // Not a readable P-Doc document: left alone, not listed.
          }
        }
      }
    }
    return out.sort((a, b) => b.modified.localeCompare(a.modified));
  }

  summary(ref: DocRef, doc?: PDocFile): DocSummary {
    const file = this.file(ref);
    const d = doc ?? parseDocument(readFileSync(file, "utf8"), { allowNewer: true });
    const s: DocSummary = { space: ref.space, path: ref.path, id: d.id, title: d.title, modified: statSync(file).mtime.toISOString(), bin: ref.path.startsWith(".bin/") };
    if (d.version > FORMAT_VERSION) s.newer = true;
    return s;
  }

  /** A document as saved. One from a newer P-Doc comes marked `newer`: shown read-only, never rewritten (A18). */
  read(ref: DocRef): Opened {
    const doc = parseDocument(readFileSync(this.file(ref), "utf8"), { allowNewer: true });
    return { doc, summary: this.summary(ref, doc) };
  }

  /** A document this build may change; a newer one refuses with the update message. */
  private editable(ref: DocRef): PDocFile {
    const { doc } = this.read(ref);
    if (doc.version > FORMAT_VERSION) throw new LibraryError(NEWER_MESSAGE);
    return doc;
  }

  /**
   * Saves a document's current state (no version: versions are made by the cadence or on close).
   * Never over a newer P-Doc's file. Images still inside it are stored beside it first, and images it
   * uses from the other repository are copied in, so the file on disk never points at a missing one.
   */
  write(ref: DocRef, doc: PDocFile): DocSummary {
    const file = this.file(ref);
    if ((versionOnDisk(file) ?? 0) > FORMAT_VERSION || doc.version > FORMAT_VERSION) throw new LibraryError(NEWER_MESSAGE);
    const stored = this.storeImages(ref.space, doc);
    writeAtomic(file, serializeDocument(stored));
    return this.summary(ref, stored);
  }

  // ------------------------------------------------------------------------------ images (§4.9)

  assetFile(space: Space, src: string): string {
    if (!isAssetSrc(src)) throw new LibraryError(`Not an image in the library: ${src}`);
    return join(this.dir(space), ...src.split("/"));
  }

  /** Where an image's file is: the given repository first, then the other; null when missing. */
  findAsset(src: string, prefer: Space = "private"): string | null {
    if (!isAssetSrc(src)) return null;
    for (const space of [prefer, ...SPACES.filter((x) => x !== prefer)]) {
      const f = this.assetFile(space, src);
      if (existsSync(f)) return f;
    }
    return null;
  }

  /** Stores an image's bytes once in a repository (content-addressed; a second copy is the same file). */
  putAsset(space: Space, bytes: Uint8Array): StoredAsset {
    if (bytes.byteLength > MAX_IMAGE_BYTES) throw new LibraryError(TOO_BIG_MESSAGE);
    const info = imageInfo(bytes);
    if (!info) throw new LibraryError(NOT_IMAGE_MESSAGE);
    const src = `assets/${createHash("sha256").update(bytes).digest("hex")}.${info.type}`;
    const file = this.assetFile(space, src);
    if (!existsSync(file)) writeAtomic(file, bytes);
    return { src, width: info.width, height: info.height };
  }

  /** An image's bytes and type, from either repository; null when missing. */
  readAsset(src: string, prefer: Space = "private"): { mime: string; bytes: Uint8Array } | null {
    const f = this.findAsset(src, prefer);
    if (!f) return null;
    return { mime: IMAGE_MIME[src.slice(src.lastIndexOf(".") + 1)] ?? "application/octet-stream", bytes: readFileSync(f) };
  }

  /**
   * The document with every image inside it stored beside it (a v1 file, a paste, an import) and every
   * image it uses present in this repository. Images it can't store (an unknown type) stay inside.
   */
  storeImages(space: Space, doc: PDocFile): PDocFile {
    let content = doc.content;
    if (hasDataImages(content)) {
      content = mapImages(content, (a) => {
        const parts = typeof a.src === "string" ? dataImageParts(a.src) : null;
        if (!parts || parts.bytes.byteLength > MAX_IMAGE_BYTES) return null;
        try {
          const put = this.putAsset(space, parts.bytes);
          return { ...a, src: put.src, naturalWidth: a.naturalWidth ?? put.width, naturalHeight: a.naturalHeight ?? put.height };
        } catch {
          return null;
        }
      });
    }
    for (const src of assetsOf(content)) {
      const here = this.assetFile(space, src);
      if (existsSync(here)) continue;
      const there = this.findAsset(src, space);
      if (there) {
        mkdirSync(dirname(here), { recursive: true });
        copyFileSync(there, `${here}.tmp`);
        renameSync(`${here}.tmp`, here);
      }
    }
    return content === doc.content ? doc : { ...doc, content };
  }

  /** The document with its images inside it as data, for exports; images whose file is missing are left out. */
  inlineImages(doc: PDocFile, prefer: Space = "private"): PDocFile {
    const missing = new Set<string>();
    let content = mapImages(doc.content, (a) => {
      if (!isAssetSrc(a.src)) return null;
      const got = this.readAsset(a.src, prefer);
      if (!got) {
        missing.add(a.src);
        return null;
      }
      return { ...a, src: dataImageUrl(got.mime, got.bytes) };
    });
    if (missing.size) content = dropImages(content, missing);
    return { ...doc, content };
  }

  /**
   * Moves a document that still has its images inside it to the new form (spec §4.9 step 6): images
   * first, then the document, then a version "Store images beside *title*". Null when nothing to do.
   */
  async storeImagesOf(ref: DocRef): Promise<Opened | null> {
    const { doc } = this.read(ref);
    if (doc.version > FORMAT_VERSION || !hasDataImages(doc.content) || !ref.path.startsWith("docs/")) return null;
    this.write(ref, doc);
    await this.commit(ref.space, [ref.path], `Store images beside ${doc.title}`);
    return this.read(ref);
  }

  /** A file name in `docs/` for a document that no other document (or Bin entry) has. */
  freePath(space: Space, doc: PDocFile): string {
    let path = documentPath(doc);
    for (let n = 2; existsSync(join(this.dir(space), ...path.split("/"))) || existsSync(join(this.dir(space), ".bin", path.slice(5))); n++) path = path.replace(/(-\d+)?\.pdoc\.json$/, `-${n}.pdoc.json`);
    return path;
  }

  async create(req: CreateRequest = {}): Promise<Opened> {
    const space = req.space ?? "private";
    const doc = createDocument({ title: req.title, content: req.content, page: req.page });
    const ref = { space, path: this.freePath(space, doc) };
    this.write(ref, doc);
    await this.commit(space, [ref.path], `Create ${doc.title}`);
    // As written: its pictures stored beside it.
    return this.read(ref);
  }

  /** A new document from a whole P-Doc file (File > Open from file): a fresh id, so it never collides with the original. */
  async adopt(source: PDocFile, space: Space = "private"): Promise<Opened> {
    const doc: PDocFile = { ...structuredClone(source), id: newId(), created: new Date().toISOString() };
    const ref = { space, path: this.freePath(space, doc) };
    this.write(ref, doc);
    await this.commit(space, [ref.path], `Import ${doc.title}`);
    return this.read(ref);
  }

  async rename(ref: DocRef, title: string): Promise<DocSummary> {
    const doc = this.editable(ref);
    const old = doc.title;
    doc.title = title.trim() || "Untitled document";
    const s = this.write(ref, doc);
    if (old !== doc.title) await this.commit(ref.space, [ref.path], `Rename ${old} to ${doc.title}`);
    return s;
  }

  async copy(ref: DocRef, title?: string): Promise<DocSummary> {
    const doc = this.editable(ref);
    const copy: PDocFile = { ...structuredClone(doc), id: newId(), title: title ?? `Copy of ${doc.title}`, created: new Date().toISOString() };
    const to = { space: ref.space, path: this.freePath(ref.space, copy) };
    const s = this.write(to, copy);
    await this.commit(ref.space, [to.path], `Copy ${doc.title}`);
    return s;
  }

  private relocate(from: DocRef, to: DocRef): void {
    const a = this.file(from);
    const b = this.file(to);
    if (existsSync(b)) throw new LibraryError(`${to.path} already exists`);
    mkdirSync(dirname(b), { recursive: true });
    renameSync(a, b);
  }

  /** Moves a document to the Bin (recoverable). */
  async remove(ref: DocRef): Promise<DocSummary> {
    if (!ref.path.startsWith("docs/")) throw new LibraryError("Already in the Bin");
    const to = { space: ref.space, path: `.bin/${ref.path.slice(5)}` };
    const { doc } = this.read(ref);
    this.relocate(ref, to);
    await this.commit(ref.space, [ref.path, to.path], `Delete ${doc.title}`);
    return this.summary(to, doc);
  }

  async restore(ref: DocRef): Promise<DocSummary> {
    if (!ref.path.startsWith(".bin/")) throw new LibraryError("Not in the Bin");
    const { doc } = this.read(ref);
    let to = { space: ref.space, path: `docs/${ref.path.slice(5)}` };
    if (existsSync(this.file(to))) to = { space: ref.space, path: this.freePath(ref.space, doc) };
    this.relocate(ref, to);
    await this.commit(ref.space, [ref.path, to.path], `Restore ${doc.title} from the Bin`);
    return this.summary(to, doc);
  }

  /** Moves a document between Private and Public; the caller asks the person first (P6). */
  async move(ref: DocRef, space: Space): Promise<DocSummary> {
    if (ref.space === space) return this.summary(ref);
    const doc = this.editable(ref);
    const to = { space, path: existsSync(join(this.dir(space), ...ref.path.split("/"))) ? this.freePath(space, doc) : ref.path };
    // Its images are copied over first (write); the ones in the old repository stay, since its versions use them.
    this.write(to, doc);
    rmSync(this.file(ref));
    const label = space === "public" ? "Public" : "Private";
    await this.commit(space, [to.path], `Move ${doc.title} to ${label}`);
    await this.commit(ref.space, [ref.path], `Move ${doc.title} to ${label}`);
    return this.summary(to, doc);
  }

  /**
   * Records the given paths as a version, one commit at a time per repository. Returns the commit,
   * or null when nothing changed or Git is off.
   */
  commit(space: Space, paths: string[], message: string): Promise<string | null> {
    if (!this.versioned) return Promise.resolve(null);
    const dir = this.dir(space);
    return this.queue(space, async () => {
      if (!existsSync(join(dir, ".git"))) return null;
      // One at a time: a path that is neither on disk nor tracked (a file put there by hand, then
      // moved) is no error. Only P-Doc stages, so the index holds just these paths.
      for (const p of [...paths, ...this.assetsFor(space, paths)]) await git(dir, ["add", "-A", "--", p], { ok: [0, 128] });
      const staged = await git(dir, ["diff", "--cached", "--quiet"], { ok: [0, 1] });
      if (staged.code === 0) return null;
      await git(dir, ["commit", "-q", "-m", message], { identity: this.identity() });
      const sha = (await git(dir, ["rev-parse", "HEAD"])).stdout.trim();
      this.changed(space);
      return sha;
    });
  }

  /** The image files the given documents use that are in this repository (only those are ever committed). */
  private assetsFor(space: Space, paths: string[]): string[] {
    const out = new Set<string>();
    for (const p of paths) {
      if (!DOC_PATH.test(p)) continue;
      const file = join(this.dir(space), ...p.split("/"));
      if (!existsSync(file)) continue;
      try {
        for (const src of assetsOf(parseDocument(readFileSync(file, "utf8"), { allowNewer: true }).content)) if (existsSync(this.assetFile(space, src))) out.add(src);
      } catch {
        // Not readable: committed as it is, without images.
      }
    }
    return [...out];
  }

  /** Runs Git work on a repository after the work already queued there (sync uses it too). */
  queue<T>(space: Space, run: () => Promise<T>): Promise<T> {
    const next = (this.queues.get(space) ?? Promise.resolve()).then(run, run);
    this.queues.set(space, next.catch(() => null));
    return next;
  }

  /** Makes a version of a document's saved state ("Edit *title*"); null when nothing changed. */
  async commitDoc(ref: DocRef): Promise<string | null> {
    if (!existsSync(this.file(ref))) return null;
    const { doc } = this.read(ref);
    return this.commit(ref.space, [ref.path], `Edit ${doc.title}`);
  }

  /** The name a document's version tags share: its file name, which stays through Bin and back. */
  private tagPrefix(ref: DocRef): string {
    return `pdoc/${ref.path.replace(/^(docs|\.bin)\//, "").replace(/\.pdoc\.json$/, "")}/`;
  }

  /** Documents saved but not yet a version (left by a crash or a forced quit). Empty without Git. */
  async unversioned(): Promise<DocRef[]> {
    if (!this.versioned) return [];
    const out: DocRef[] = [];
    for (const space of SPACES) {
      const dir = this.dir(space);
      if (!existsSync(join(dir, ".git"))) continue;
      const r = await this.queue(space, () => git(dir, ["status", "--porcelain", "-z", "--untracked-files=all", "--", "docs"]));
      for (const entry of r.stdout.split("\0")) {
        const path = entry.slice(3);
        if (DOC_PATH.test(path) && path.startsWith("docs/") && existsSync(join(dir, ...path.split("/")))) out.push({ space, path });
      }
    }
    return out;
  }

  /** Every version of a document, newest first, with names (U28, U31). Empty without Git. */
  async history(ref: DocRef): Promise<VersionEntry[]> {
    this.file(ref);
    if (!this.versioned) return [];
    const dir = this.dir(ref.space);
    if (!existsSync(join(dir, ".git"))) return [];
    return this.queue(ref.space, async () => {
      const [r, tags] = await Promise.all([
        git(dir, ["log", "--follow", "--name-only", "--format=%x1e%H%x1f%aI%x1f%an%x1f%s", "--", ref.path], { ok: [0, 128] }),
        git(dir, ["for-each-ref", `refs/tags/${this.tagPrefix(ref)}`, "--format=%(*objectname)%1f%(contents:subject)%1e"]),
      ]);
      if (r.code) return [];
      const names = new Map<string, string>();
      for (const t of tags.stdout.split("\x1e")) {
        const [sha, name] = t.trim().split("\x1f");
        if (sha && name) names.set(sha, name);
      }
      const out: VersionEntry[] = [];
      for (const rec of r.stdout.split("\x1e")) {
        const [head, ...rest] = rec.split("\n");
        const [sha, time, author, message] = (head ?? "").split("\x1f");
        if (!sha || !time) continue;
        const path = rest.map((s) => s.trim()).find(Boolean) ?? ref.path;
        out.push({ sha, time, author: author ?? "", message: message ?? "", name: names.get(sha) ?? null, path });
      }
      return out;
    });
  }

  private async version(ref: DocRef, sha: unknown): Promise<VersionEntry> {
    if (typeof sha !== "string" || !/^[0-9a-f]{40}$/.test(sha)) throw new LibraryError("Not a version");
    const v = (await this.history(ref)).find((x) => x.sha === sha);
    if (!v) throw new LibraryError("Not a version of this document");
    return v;
  }

  /** The document as it was in a version. */
  async versionAt(ref: DocRef, sha: string): Promise<PDocFile> {
    const v = await this.version(ref, sha);
    const r = await git(this.dir(ref.space), ["show", `${v.sha}:${v.path}`]);
    return parseDocument(r.stdout, { allowNewer: true });
  }

  /** Names a version (an annotated Git tag); an empty name removes it (U31). */
  async nameVersion(ref: DocRef, sha: string, name: string): Promise<void> {
    const v = await this.version(ref, sha);
    const clean = name.replace(/\s+/g, " ").trim().slice(0, 100);
    const tag = `${this.tagPrefix(ref)}${v.sha.slice(0, 12)}`;
    const dir = this.dir(ref.space);
    await this.queue(ref.space, async () => {
      if (clean) await git(dir, ["tag", "-f", "-a", tag, v.sha, "-m", clean], { identity: this.identity() });
      else await git(dir, ["tag", "-d", tag], { ok: [0, 1] });
    });
    this.changed(ref.space);
  }

  /**
   * Makes an old version current as a new version "Restore *time*"; the versions in between stay in
   * history (U30, GD R-006). Unsaved-as-version edits are kept as a version first.
   */
  async restoreVersion(ref: DocRef, sha: string): Promise<Opened> {
    const v = await this.version(ref, sha);
    const old = await this.versionAt(ref, v.sha);
    await this.commitDoc(ref);
    const cur = this.editable(ref);
    this.write(ref, { ...old, id: cur.id, created: cur.created });
    await this.commit(ref.space, [ref.path], `Restore ${localTime(v.time)}`);
    return this.read(ref);
  }

  /** A new document from an old version (U32). */
  async copyVersion(ref: DocRef, sha: string): Promise<DocSummary> {
    const old = await this.versionAt(ref, sha);
    if (old.version > FORMAT_VERSION) throw new LibraryError(NEWER_MESSAGE);
    const copy: PDocFile = { ...old, id: newId(), title: `Copy of ${old.title}`, created: new Date().toISOString() };
    const to = { space: ref.space, path: this.freePath(ref.space, copy) };
    const s = this.write(to, copy);
    await this.commit(ref.space, [to.path], `Copy ${old.title} from ${localTime((await this.version(ref, sha)).time)}`);
    return s;
  }

  /** Waits for every queued commit. */
  async settle(): Promise<void> {
    await Promise.all([...this.queues.values()]);
  }
}

/** Content without the images whose files are missing (exports skip them, spec §4.9). */
function dropImages(content: PDocFile["content"], missing: Set<string>): PDocFile["content"] {
  const walk = (n: PDocFile["content"]): PDocFile["content"] => (n.content ? { ...n, content: n.content.filter((c) => !(c.type === "image" && missing.has(String(c.attrs?.src)))).map(walk) } : n);
  return walk(content);
}
