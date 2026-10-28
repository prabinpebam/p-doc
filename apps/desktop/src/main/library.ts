/**
 * The library (U33): `<root>/private` and `<root>/public`, each a Git repository on `main` with
 * documents at `docs/<slug>-<id8>.pdoc.json`, deleted ones in `.bin/`, and a README. Electron-free, so
 * the CLI and unit tests use it as the app does. File names stay as created: a rename changes the
 * title inside the file, so history follows the file without rename detection.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { createDocument, documentPath, parseDocument, serializeDocument, newId, type PDocFile } from "@p-doc/core";
import { git, gitSupported, gitVersion } from "./git.ts";
import { DOC_PATH, isDocRef, type CreateRequest, type DocRef, type DocSummary, type Identity, type Opened, type Space } from "../shared/api.ts";

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
export function writeAtomic(file: string, text: string): void {
  mkdirSync(dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2, 8)}.tmp`;
  writeFileSync(tmp, text, "utf8");
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

export interface LibraryOptions {
  identity: () => Identity;
  /** Git's version; null turns versions off. Detected when left out. */
  git?: string | null;
}

export class Library {
  private queues = new Map<Space, Promise<unknown>>();

  private constructor(
    readonly root: string,
    readonly gitVersion: string | null,
    private readonly identity: () => Identity,
  ) {}

  static async open(root: string, o: LibraryOptions): Promise<Library> {
    const v = o.git === undefined ? await gitVersion() : o.git;
    return new Library(root, gitSupported(v) ? v : null, o.identity);
  }

  get versioned(): boolean {
    return this.gitVersion != null;
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
    const d = doc ?? parseDocument(readFileSync(file, "utf8"));
    return { space: ref.space, path: ref.path, id: d.id, title: d.title, modified: statSync(file).mtime.toISOString(), bin: ref.path.startsWith(".bin/") };
  }

  read(ref: DocRef): Opened {
    const doc = parseDocument(readFileSync(this.file(ref), "utf8"));
    return { doc, summary: this.summary(ref, doc) };
  }

  /** Saves a document's current state (no version: versions are made by the cadence or on close). */
  write(ref: DocRef, doc: PDocFile): DocSummary {
    writeAtomic(this.file(ref), serializeDocument(doc));
    return this.summary(ref, doc);
  }

  private freePath(space: Space, doc: PDocFile): string {
    let path = documentPath(doc);
    for (let n = 2; existsSync(join(this.dir(space), ...path.split("/"))) || existsSync(join(this.dir(space), ".bin", path.slice(5))); n++) path = path.replace(/(-\d+)?\.pdoc\.json$/, `-${n}.pdoc.json`);
    return path;
  }

  async create(req: CreateRequest = {}): Promise<Opened> {
    const space = req.space ?? "private";
    const doc = createDocument({ title: req.title, content: req.content, page: req.page });
    const ref = { space, path: this.freePath(space, doc) };
    const summary = this.write(ref, doc);
    await this.commit(space, [ref.path], `Create ${doc.title}`);
    return { doc, summary };
  }

  async rename(ref: DocRef, title: string): Promise<DocSummary> {
    const { doc } = this.read(ref);
    const old = doc.title;
    doc.title = title.trim() || "Untitled document";
    const s = this.write(ref, doc);
    if (old !== doc.title) await this.commit(ref.space, [ref.path], `Rename ${old} to ${doc.title}`);
    return s;
  }

  async copy(ref: DocRef, title?: string): Promise<DocSummary> {
    const { doc } = this.read(ref);
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
    const { doc } = this.read(ref);
    const to = { space, path: existsSync(join(this.dir(space), ...ref.path.split("/"))) ? this.freePath(space, doc) : ref.path };
    writeAtomic(this.file(to), serializeDocument(doc));
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
    const run = async () => {
      if (!existsSync(join(dir, ".git"))) return null;
      // One at a time: a path that is neither on disk nor tracked (a file put there by hand, then
      // moved) is no error. Only P-Doc stages, so the index holds just these paths.
      for (const p of paths) await git(dir, ["add", "-A", "--", p], { ok: [0, 128] });
      const staged = await git(dir, ["diff", "--cached", "--quiet"], { ok: [0, 1] });
      if (staged.code === 0) return null;
      await git(dir, ["commit", "-q", "-m", message], { identity: this.identity() });
      return (await git(dir, ["rev-parse", "HEAD"])).stdout.trim();
    };
    const next = (this.queues.get(space) ?? Promise.resolve()).then(run, run);
    this.queues.set(space, next.catch(() => null));
    return next;
  }

  /** Waits for every queued commit. */
  async settle(): Promise<void> {
    await Promise.all([...this.queues.values()]);
  }
}
