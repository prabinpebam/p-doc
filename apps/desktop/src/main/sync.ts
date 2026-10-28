/**
 * Sync with GitHub (spec §4.7): each repository fetches, merges what came from other computers, and
 * pushes, one at a time through the library's queue so it never races a version being made. No
 * document is ever lost: when both sides changed one, this computer's stays and GitHub's is kept as
 * a new document beside it. Offline, versions wait and go up on the next sync.
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { newId, parseDocument, serializeDocument } from "@p-doc/core";
import { git, networkProblem, GitError, type GitOptions } from "./git.ts";
import { remoteUrl } from "./github.ts";
import { SPACES, writeAtomic, type Library } from "./library.ts";
import type { Account } from "./account.ts";
import { DOC_PATH, type DocRef, type GitHubLink, type Space, type SyncEvent, type SyncState, type SyncStatus } from "../shared/api.ts";

/** The file that marks a repository as a P-Doc library (spec §4.1 step 5). */
export const MARKER = ".p-doc";
export const markerText = (space: Space) => `${JSON.stringify({ format: "p-doc-library", version: 1, space }, null, 2)}\n`;

export const SYNC_EVERY_MS = 5 * 60_000;
export const SYNC_AFTER_VERSION_MS = 2_000;

/** Why a sync stopped; `offline` is not a problem, just a wait. */
export class SyncProblem extends Error {
  constructor(
    message: string,
    readonly kind: "offline" | "auth" | "missing" | "other",
  ) {
    super(message);
  }
}

export interface SyncOptions {
  library: Library;
  account: Account;
  link: () => GitHubLink | null;
  /** Makes versions of saved edits, so a merge never meets uncommitted work. */
  beforeMerge?: () => Promise<void>;
  onEvent?: (e: SyncEvent) => void;
}

interface SpaceResult {
  changed: DocRef[];
  kept: { title: string; copy: DocRef }[];
}

const day = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export class Sync {
  private state: SyncState = { kind: "off" };
  private running: Promise<SyncEvent> | null = null;
  private again = false;
  private timer: NodeJS.Timeout | null = null;
  private soon: NodeJS.Timeout | null = null;
  private lastPending: DocRef[] = [];

  constructor(private readonly o: SyncOptions) {}

  /** Whether sync is set up and allowed. */
  get on(): boolean {
    const l = this.o.link();
    return !!l && l.connected && this.o.library.versioned;
  }

  private gitOpts(extra: GitOptions = {}): GitOptions {
    const a = this.o.account.gitAuth();
    return { ...extra, config: [...(a.config ?? []), ...(extra.config ?? [])], env: { ...a.env, ...extra.env } };
  }

  /** Where a repository's `origin` points, or null. */
  async remoteOf(space: Space): Promise<string | null> {
    const dir = this.o.library.dir(space);
    if (!existsSync(join(dir, ".git"))) return null;
    const r = await git(dir, ["remote", "get-url", "origin"], { ok: [0, 2, 128] });
    return r.code === 0 ? r.stdout.trim() : null;
  }

  /**
   * Readies a repository to sync with `owner/name`: the `.p-doc` marker as a version, documents
   * never merged line by line, and `origin`. Safe to run again.
   */
  connect(space: Space, owner: string, name: string): Promise<void> {
    const lib = this.o.library;
    if (!lib.versioned) throw new SyncProblem("Git is needed to sync with GitHub.", "other");
    const dir = lib.dir(space);
    return lib.queue(space, async () => {
      const marker = join(dir, MARKER);
      if (!existsSync(marker)) writeFileSync(marker, markerText(space));
      await git(dir, ["add", "--", MARKER]);
      if ((await git(dir, ["diff", "--cached", "--quiet"], { ok: [0, 1] })).code === 1) await git(dir, ["commit", "-q", "-m", "Connect to GitHub"], { identity: lib.author() });
      const info = join(dir, ".git", "info");
      mkdirSync(info, { recursive: true });
      const attrs = join(info, "attributes");
      const had = existsSync(attrs) ? readFileSync(attrs, "utf8") : "";
      if (!/^\*\.pdoc\.json -merge$/m.test(had)) writeFileSync(attrs, `${had}${had && !had.endsWith("\n") ? "\n" : ""}*.pdoc.json -merge\n`);
      const url = remoteUrl(owner, name);
      const now = await git(dir, ["remote", "get-url", "origin"], { ok: [0, 2, 128] });
      if (now.code !== 0) await git(dir, ["remote", "add", "origin", url]);
      else if (now.stdout.trim() !== url) await git(dir, ["remote", "set-url", "origin", url]);
    });
  }

  /** Fetch, merge, push one repository. Throws SyncProblem. */
  async syncSpace(space: Space): Promise<SpaceResult> {
    const lib = this.o.library;
    const dir = lib.dir(space);
    const out: SpaceResult = { changed: [], kept: [] };
    await lib.queue(space, async () => {
      for (let attempt = 0; ; attempt++) {
        await this.fetch(dir, space);
        // 128: GitHub's repository has no commits yet.
        const behind = await git(dir, ["rev-list", "--count", "HEAD..refs/remotes/origin/main"], { ok: [0, 128] });
        if (behind.code === 0 && Number(behind.stdout.trim()) > 0) {
          const r = await this.merge(dir, space);
          out.changed.push(...r.changed);
          out.kept.push(...r.kept);
        }
        const pushed = await this.push(dir, space);
        if (pushed || attempt >= 1) {
          if (!pushed) throw new SyncProblem("GitHub kept changing while P-Doc synced. It tries again soon.", "other");
          return;
        }
      }
    });
    return out;
  }

  private problem(e: unknown, space: Space): SyncProblem {
    const stderr = e instanceof GitError ? e.result.stderr : String(e);
    const kind = networkProblem(stderr);
    const name = this.o.link()?.names[space] ?? space;
    if (kind === "offline") return new SyncProblem("You're offline.", kind);
    if (kind === "auth") return new SyncProblem("GitHub didn't accept the sign-in. Sign in again.", kind);
    if (kind === "missing") return new SyncProblem(`${name} isn't on GitHub, or this account can't reach it.`, kind);
    const line = stderr.split(/\r?\n/).map((l) => l.trim()).find((l) => /^(fatal|error):/i.test(l)) ?? stderr.trim().split(/\r?\n/)[0] ?? "";
    return new SyncProblem(`Sync with ${name} didn't finish${line ? `: ${line.replace(/^(fatal|error):\s*/i, "")}` : "."}`, kind);
  }

  private async fetch(dir: string, space: Space): Promise<void> {
    const r = await git(dir, ["fetch", "--no-auto-gc", "origin", "+refs/heads/*:refs/remotes/origin/*", "refs/tags/*:refs/tags/*"], this.gitOpts({ ok: [0, 1], timeoutMs: 120_000 })).catch((e: unknown) => {
      throw this.problem(e, space);
    });
    // A version named differently here than on GitHub keeps this computer's name (pushed next).
    if (r.code !== 0 && !/would clobber existing tag/i.test(r.stderr)) throw this.problem(new GitError("fetch", r), space);
  }

  /** Pushes `main` and version names. False when GitHub moved on meanwhile (fetch and try again). */
  private async push(dir: string, space: Space): Promise<boolean> {
    const r = await git(dir, ["push", "--porcelain", "-u", "origin", "refs/heads/main:refs/heads/main", "+refs/tags/pdoc/*:refs/tags/pdoc/*"], this.gitOpts({ ok: [0, 1], timeoutMs: 120_000 })).catch((e: unknown) => {
      throw this.problem(e, space);
    });
    if (r.code === 0) return true;
    if (/\[rejected\]|non-fast-forward|fetch first|stale info/i.test(r.stdout + r.stderr)) return false;
    throw this.problem(new GitError("push", r), space);
  }

  private async merge(dir: string, space: Space): Promise<SpaceResult> {
    const lib = this.o.library;
    const out: SpaceResult = { changed: [], kept: [] };
    const before = (await git(dir, ["rev-parse", "HEAD"])).stdout.trim();
    const related = (await git(dir, ["merge-base", "HEAD", "refs/remotes/origin/main"], { ok: [0, 1] })).code === 0;
    const m = await git(dir, ["merge", "--no-edit", "-q", ...(related ? [] : ["--allow-unrelated-histories"]), "-m", "Sync with GitHub", "refs/remotes/origin/main"], { identity: lib.author(), ok: [0, 1, 2] });
    if (m.code !== 0) {
      const unmerged = (await git(dir, ["ls-files", "-u", "-z"])).stdout.split("\0").filter(Boolean);
      if (unmerged.length === 0) {
        await git(dir, ["merge", "--abort"], { ok: [0, 128] });
        throw new SyncProblem(`Sync with ${this.o.link()?.names[space] ?? space} didn't finish: ${(m.stderr || m.stdout).trim().split(/\r?\n/)[0]}`, "other");
      }
      const stages = new Map<string, Set<number>>();
      for (const e of unmerged) {
        const [meta, path] = e.split("\t") as [string, string];
        const stage = Number(meta.split(" ")[2]);
        if (!stages.has(path)) stages.set(path, new Set());
        stages.get(path)!.add(stage);
      }
      for (const [path, s] of stages) {
        if (s.has(2) && s.has(3) && DOC_PATH.test(path)) {
          // Both sides edited it: keep ours here, and GitHub's as a new document beside it.
          const theirs = parseDocument((await git(dir, ["show", `:3:${path}`])).stdout);
          const copy = { ...theirs, id: newId(), title: `${theirs.title} (from GitHub ${day()})`, created: new Date().toISOString() };
          const ref: DocRef = { space, path: lib.freePath(space, copy) };
          writeAtomic(lib.file(ref), serializeDocument(copy));
          await git(dir, ["add", "--", ref.path]);
          await git(dir, ["checkout", "--ours", "--", path]);
          await git(dir, ["add", "--", path]);
          out.kept.push({ title: theirs.title, copy: ref });
          out.changed.push(ref);
        } else if (s.has(2)) {
          await git(dir, ["checkout", "--ours", "--", path]);
          await git(dir, ["add", "--", path]);
        } else if (s.has(3)) {
          await git(dir, ["checkout", "--theirs", "--", path]);
          await git(dir, ["add", "--", path]);
        } else {
          await git(dir, ["rm", "-q", "--cached", "--", path], { ok: [0, 128] });
        }
      }
      await git(dir, ["commit", "-q", "--no-edit"], { identity: lib.author() });
    }
    const diff = (await git(dir, ["diff", "--name-only", "-z", before, "HEAD"])).stdout.split("\0").filter((p) => DOC_PATH.test(p));
    for (const path of diff) if (!out.changed.some((r) => r.path === path)) out.changed.push({ space, path });
    return out;
  }

  /** Versions on this computer that GitHub doesn't have yet. */
  async waiting(): Promise<number> {
    let n = 0;
    for (const space of SPACES) {
      const dir = this.o.library.dir(space);
      if (!existsSync(join(dir, ".git"))) continue;
      const ahead = await git(dir, ["rev-list", "--count", "refs/remotes/origin/main..HEAD"], { ok: [0, 128] });
      n += Number((ahead.code === 0 ? ahead : await git(dir, ["rev-list", "--count", "HEAD"], { ok: [0, 128] })).stdout.trim() || 0);
    }
    return n;
  }

  /** Documents with changes GitHub doesn't have: versions not pushed, and saved edits not yet a version. */
  async pending(): Promise<DocRef[]> {
    if (!this.on) return [];
    const out: DocRef[] = [];
    for (const space of SPACES) {
      const dir = this.o.library.dir(space);
      if (!existsSync(join(dir, ".git"))) continue;
      let r = await git(dir, ["diff", "--name-only", "-z", "refs/remotes/origin/main", "HEAD"], { ok: [0, 128] });
      if (r.code !== 0) r = await git(dir, ["ls-tree", "-r", "--name-only", "-z", "HEAD"], { ok: [0, 128] });
      for (const path of r.stdout.split("\0")) if (DOC_PATH.test(path) && existsSync(join(dir, ...path.split("/")))) out.push({ space, path });
    }
    for (const ref of await this.o.library.unversioned()) if (!out.some((r) => r.space === ref.space && r.path === ref.path)) out.push(ref);
    this.lastPending = out;
    return out;
  }

  async status(): Promise<SyncStatus> {
    if (!this.on) return { state: { kind: "off" }, pending: [] };
    // Read the state after the slow part, so an answer never lands after (and undoes) a run's final event.
    const pending = await this.pending();
    return { state: this.running ? { kind: "syncing" } : this.state.kind === "off" ? { kind: "synced", at: "" } : this.state, pending };
  }

  /** Syncs both repositories now; a call while one runs waits for it and runs once more. */
  run(): Promise<SyncEvent> {
    if (this.running) {
      this.again = true;
      return this.running;
    }
    this.running = this.once().finally(() => {
      this.running = null;
      if (this.again) {
        this.again = false;
        void this.run();
      }
    });
    return this.running;
  }

  private async once(): Promise<SyncEvent> {
    const link = this.o.link();
    if (!link || !this.on) {
      this.state = { kind: "off" };
      return { status: { state: this.state, pending: [] }, changed: [], kept: [] };
    }
    this.emit({ status: { state: { kind: "syncing" }, pending: this.lastPending }, changed: [], kept: [] });
    const all: SpaceResult = { changed: [], kept: [] };
    try {
      await this.o.beforeMerge?.();
      for (const space of SPACES) {
        if ((await this.remoteOf(space)) == null) await this.connect(space, link.login, link.names[space]);
        const r = await this.syncSpace(space);
        all.changed.push(...r.changed);
        all.kept.push(...r.kept);
      }
      this.state = { kind: "synced", at: new Date().toISOString() };
    } catch (e) {
      const p = e instanceof SyncProblem ? e : new SyncProblem(`Sync didn't finish: ${(e as Error).message}`, "other");
      this.state = p.kind === "offline" ? { kind: "offline", waiting: await this.waiting() } : { kind: "problem", reason: p.message, signIn: p.kind === "auth" };
    }
    const event: SyncEvent = { status: { state: this.state, pending: await this.pending() }, ...all };
    this.emit(event);
    return event;
  }

  private emit(e: SyncEvent): void {
    try {
      this.o.onEvent?.(e);
    } catch {
      // A closed window.
    }
  }

  /** Syncs a little after a version is made (several versions in a row sync once). */
  soonAfterVersion(): void {
    if (!this.on || this.o.link()?.auto === false) return;
    if (this.soon) clearTimeout(this.soon);
    this.soon = setTimeout(() => {
      this.soon = null;
      void this.run();
    }, SYNC_AFTER_VERSION_MS);
  }

  /** Syncs now and then every 5 minutes. */
  start(): void {
    this.stop();
    this.timer = setInterval(() => {
      if (this.on && this.o.link()?.auto !== false) void this.run();
    }, SYNC_EVERY_MS);
    if (this.on && this.o.link()?.auto !== false) void this.run();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    if (this.soon) clearTimeout(this.soon);
    this.timer = this.soon = null;
  }

  /** Forgets the last result (after signing out). */
  reset(): void {
    this.state = { kind: "off" };
  }
}
