import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { parseDocument, serializeDocument } from "@p-doc/core";
import { Account, SignInError } from "../src/main/account.ts";
import { git } from "../src/main/git.ts";
import { Library } from "../src/main/library.ts";
import { planRepos, runSetup, SetupError } from "../src/main/setup.ts";
import { MARKER, Sync } from "../src/main/sync.ts";
import { DEFAULT_REPOS, type GitHubLink, type SetupProgress } from "../src/shared/api.ts";
import { fakeHelperConfig, startFakeGitHub, type FakeGitHub } from "./fakes/fake-github.ts";

// Real Git and a fake GitHub on 127.0.0.1; none of the machine's or the owner's Git settings (PD8).
const home = mkdtempSync(join(tmpdir(), "pdoc-gh-test-"));
const TOKEN = "ghp_testtoken0123456789abcdefABCDEF0123";
const saved = { ...process.env };
let gh: FakeGitHub;
let gitconfig: string;
let store: string;

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

let n = 0;
let work: string;
beforeEach(async () => {
  work = join(home, `t-${++n}`);
  gitconfig = join(home, `gitconfig-${n}`);
  store = join(home, `vault-${n}.json`);
  writeFileSync(gitconfig, "");
  process.env.GIT_CONFIG_GLOBAL = gitconfig;
  gh.users.clear();
  gh.users.set(TOKEN, { login: `writer${n}`, id: 1000 + n, name: "Test Writer", scopes: "repo, workflow" });
});

const withHelper = async () => git(home, ["config", "--file", gitconfig, "credential.helper", fakeHelperConfig(store)]);
const account = () => new Account({ cwd: home, base: gh.api });
const identity = () => ({ name: "Test Writer", email: "writer@example.invalid" });
const login = () => `writer${n}`;

/** Everything under a folder, as text, to look for the token. */
function allText(dir: string): string {
  if (!existsSync(dir)) return "";
  let out = "";
  for (const e of readdirSync(dir, { recursive: true }) as string[]) {
    const p = join(dir, e);
    if (statSync(p).isFile()) out += readFileSync(p).toString("latin1");
  }
  return out;
}

describe("account", () => {
  it("is signed out when Git has no GitHub credential", async () => {
    expect(await account().status()).toEqual({ state: "signedOut" });
  });

  it("hands a pasted token to Git's helper, which then signs P-Doc in", async () => {
    await withHelper();
    const r = await account().signInWithToken(`  ${TOKEN}\n`);
    expect(r.account).toEqual({ login: login(), id: 1000 + n, name: "Test Writer", noreply: `${1000 + n}+${login()}@users.noreply.github.com` });
    expect(r.warning).toBeUndefined();
    expect(JSON.parse(readFileSync(store, "utf8"))["https://github.com"]).toEqual({ username: login(), password: TOKEN });
    // A fresh start finds it through Git.
    const s = await account().status();
    expect(s.state).toBe("signedIn");
    // The token is only in the helper's vault: not in Git's settings or P-Doc's folders.
    expect(readFileSync(gitconfig, "utf8")).not.toContain(TOKEN);
    expect(allText(work)).not.toContain(TOKEN);
  });

  it("says why a token isn't accepted", async () => {
    await withHelper();
    await expect(account().signInWithToken("ghp_wrong")).rejects.toThrow("GitHub didn't accept this token. Check it and try again.");
    await expect(account().signInWithToken("two words")).rejects.toThrow(SignInError);
    gh.users.set("ghp_noscope", { login: "x", id: 1, name: "", scopes: "read:user" });
    await expect(account().signInWithToken("ghp_noscope")).rejects.toThrow("This token can't create repositories. It needs the repo scope.");
    // Fine-grained tokens don't list scopes: accepted.
    gh.users.set("github_pat_fine", { login: "fine", id: 2, name: "", scopes: null });
    expect((await account().signInWithToken("github_pat_fine")).account.login).toBe("fine");
    expect(existsSync(store) ? readFileSync(store, "utf8") : "").not.toContain("ghp_wrong");
  });

  it("can't reach GitHub: says so, and an existing sign-in reads as offline", async () => {
    await withHelper();
    await account().signInWithToken(TOKEN);
    const away = new Account({ cwd: home, base: "http://127.0.0.1:9" });
    expect(await away.status()).toEqual({ state: "offline" });
    await expect(away.signInWithToken(TOKEN)).rejects.toThrow("GitHub can't be reached. Check your connection and try again.");
  });

  it("an expired token reads as invalid", async () => {
    await withHelper();
    await account().signInWithToken(TOKEN);
    gh.users.clear();
    expect(await account().status()).toEqual({ state: "invalid" });
  });

  it("without a helper keeps the token for this session only, and Git gets it from the environment", async () => {
    const a = account();
    const r = await a.signInWithToken(TOKEN);
    expect(r.warning).toMatch(/keeps the sign-in until it closes/);
    expect((await a.status()).state).toBe("signedIn");
    expect((await account().status()).state).toBe("signedOut");
    const auth = a.gitAuth();
    expect(auth.env).toEqual({ PDOC_GIT_TOKEN: TOKEN });
    expect(auth.config!.join(" ")).not.toContain(TOKEN);
    a.signOut();
    expect(a.gitAuth()).toEqual({});
  });

  it("Use another account: Git's helper forgets the credential", async () => {
    await withHelper();
    const a = account();
    await a.signInWithToken(TOKEN);
    await a.forget();
    expect(await account().status()).toEqual({ state: "signedOut" });
  });

  it("finds Git and the identity Git already has", async () => {
    await git(home, ["config", "--file", gitconfig, "user.name", "Ada"]);
    await git(home, ["config", "--file", gitconfig, "user.email", "ada@example.invalid"]);
    const a = account();
    expect(await a.gitIdentity()).toEqual({ name: "Ada", email: "ada@example.invalid" });
    const c = await a.gitCheck();
    expect(c.ok).toBe(true);
    expect(c.gcm).toBe(false);
  });

  it("browser sign-in without Git Credential Manager or the GitHub CLI says to paste a token", async () => {
    const a = account();
    const check = await a.gitCheck();
    if (check.gh) return; // This computer has the GitHub CLI; the message can't be shown here.
    await expect(a.signInWithBrowser(() => undefined)).rejects.toThrow("Signing in with the browser needs Git Credential Manager or the GitHub CLI. Paste a token instead.");
  });
});

/** A computer: its own library, account, settings link, and sync. */
async function computer(name: string, link: () => GitHubLink | null) {
  const lib = await Library.open(join(work, name), { identity });
  await lib.ensure();
  const acc = account();
  await acc.signInWithToken(TOKEN);
  const sync = new Sync({ library: lib, account: acc, link });
  return { lib, acc, sync };
}

describe("setup", { timeout: 60_000 }, () => {
  let link: GitHubLink;
  beforeEach(() => {
    link = { login: login(), names: { ...DEFAULT_REPOS }, connected: true, auto: true };
  });

  it("makes both repositories with the right visibility, connects, and pushes", async () => {
    const c = await computer("a", () => link);
    const api = await c.acc.api();
    expect((await planRepos(api, login(), DEFAULT_REPOS, c.sync)).map((p) => p.state)).toEqual(["create", "create"]);
    const steps: SetupProgress[] = [];
    const plan = await runSetup(api, login(), DEFAULT_REPOS, [], c.sync, (p) => steps.push(p));
    expect(plan.map((p) => p.state)).toEqual(["ready", "ready"]);
    expect(steps.filter((s) => s.step === "done").map((s) => s.space)).toEqual(["private", "public"]);
    expect(gh.repo(login(), "p-doc-private")).toEqual({ private: true });
    expect(gh.repo(login(), "p-doc-public")).toEqual({ private: false });
    for (const s of ["private", "public"] as const) {
      expect(JSON.parse(gh.file(login(), `p-doc-${s}`, MARKER)!)).toEqual({ format: "p-doc-library", version: 1, space: s });
      expect(gh.files(login(), `p-doc-${s}`)).toEqual([MARKER, "README.md"]);
      expect(readFileSync(join(c.lib.dir(s), ".git", "info", "attributes"), "utf8")).toContain("*.pdoc.json -merge");
    }
    // Again: nothing new is made, nothing fails.
    const before = gh.calls.filter((x) => x.startsWith("POST")).length;
    expect((await runSetup(api, login(), DEFAULT_REPOS, [], c.sync)).map((p) => p.state)).toEqual(["ready", "ready"]);
    expect(gh.calls.filter((x) => x.startsWith("POST")).length).toBe(before);
    expect((await git(c.lib.dir("private"), ["log", "--format=%s"])).stdout.trim().split("\n")).toEqual(["Connect to GitHub", "Start P-Doc library"]);
  });

  it("won't use a repository whose visibility is wrong", async () => {
    gh.addRepo(login(), "p-doc-public", { private: true });
    const c = await computer("a", () => link);
    const api = await c.acc.api();
    expect((await planRepos(api, login(), DEFAULT_REPOS, c.sync)).map((p) => p.state)).toEqual(["create", "visibility"]);
    await expect(runSetup(api, login(), DEFAULT_REPOS, [], c.sync)).rejects.toThrow("p-doc-public is private on GitHub. Choose another name, or make it public on GitHub first.");
    // Nothing was made while the plan had a problem.
    expect(gh.repo(login(), "p-doc-private")).toBeNull();
    gh.addRepo(login(), "mine", { private: false });
    await expect(runSetup(api, login(), { private: "mine", public: "p-doc-public" }, [], c.sync)).rejects.toThrow("mine is public on GitHub, so it can't hold private documents. Choose another name.");
    await expect(runSetup(api, login(), { private: "same", public: "same" }, [], c.sync)).rejects.toThrow(SetupError);
  });

  it("asks before using a repository that has other files, and keeps them when told to", async () => {
    gh.addRepo(login(), "p-doc-private", { private: true, files: { "notes.txt": "mine\n" } });
    const c = await computer("a", () => link);
    const api = await c.acc.api();
    expect((await planRepos(api, login(), DEFAULT_REPOS, c.sync))[0]!.state).toBe("taken");
    await expect(runSetup(api, login(), DEFAULT_REPOS, [], c.sync)).rejects.toThrow("A repository named p-doc-private already exists and isn't a P-Doc library.");
    await runSetup(api, login(), DEFAULT_REPOS, ["private"], c.sync);
    expect(gh.files(login(), "p-doc-private").sort()).toEqual([MARKER, "README.md", "notes.txt"]);
    expect(readFileSync(join(c.lib.dir("private"), "notes.txt"), "utf8")).toBe("mine\n");
  });

  it("a second computer finds the library and gets its documents", async () => {
    const a = await computer("a", () => link);
    const doc = await a.lib.create({ title: "Plan" });
    await runSetup(await a.acc.api(), login(), DEFAULT_REPOS, [], a.sync);
    const b = await computer("b", () => link);
    expect((await planRepos(await b.acc.api(), login(), DEFAULT_REPOS, b.sync)).map((p) => p.state)).toEqual(["found", "found"]);
    await runSetup(await b.acc.api(), login(), DEFAULT_REPOS, [], b.sync);
    expect(b.lib.list().map((d) => d.title)).toEqual(["Plan"]);
    expect(b.lib.read({ space: "private", path: doc.summary.path }).doc.id).toBe(doc.doc.id);
  });
});

describe("sync", { timeout: 90_000 }, () => {
  let link: GitHubLink;
  beforeEach(() => {
    link = { login: login(), names: { ...DEFAULT_REPOS }, connected: true, auto: true };
  });

  async function pair() {
    const a = await computer("a", () => link);
    await runSetup(await a.acc.api(), login(), DEFAULT_REPOS, [], a.sync);
    const b = await computer("b", () => link);
    await runSetup(await b.acc.api(), login(), DEFAULT_REPOS, [], b.sync);
    return { a, b };
  }

  it("is off until set up and connected", async () => {
    const c = await computer("a", () => null);
    expect(await c.sync.status()).toEqual({ state: { kind: "off" }, pending: [] });
    expect((await c.sync.run()).status.state).toEqual({ kind: "off" });
  });

  it("carries edits, new documents, moves, and version names between computers", async () => {
    const { a, b } = await pair();
    const made = await a.lib.create({ title: "Shared" });
    const ref = { space: "private" as const, path: made.summary.path };
    const pending = await a.sync.status();
    expect(pending.pending).toEqual([ref]);
    const ev = await a.sync.run();
    expect(ev.status.state.kind).toBe("synced");
    expect(ev.status.pending).toEqual([]);

    const got = await b.sync.run();
    expect(got.changed).toEqual([ref]);
    expect(b.lib.read(ref).doc.title).toBe("Shared");

    // Edited on B, named on B; A gets both.
    const d = b.lib.read(ref).doc;
    d.title = "Shared, edited";
    b.lib.write(ref, d);
    const sha = await b.lib.commitDoc(ref);
    await b.lib.nameVersion(ref, sha!, "First draft");
    await b.sync.run();
    const back = await a.sync.run();
    expect(back.changed).toEqual([ref]);
    expect(a.lib.read(ref).doc.title).toBe("Shared, edited");
    expect((await a.lib.history(ref)).find((v) => v.sha === sha)?.name).toBe("First draft");

    // Moved to Public on A: B's private copy goes and the public one arrives.
    const moved = await a.lib.move(ref, "public");
    await a.sync.run();
    const after = await b.sync.run();
    expect(after.changed).toEqual(expect.arrayContaining([ref, { space: "public", path: moved.path }]));
    expect(b.lib.list().map((x) => `${x.space}:${x.title}`)).toEqual(["public:Shared, edited"]);
    expect(gh.files(login(), "p-doc-public")).toContain(moved.path);
    expect(gh.files(login(), "p-doc-private")).not.toContain(ref.path);
  });

  it("keeps both when a document was edited on two computers apart", async () => {
    const { a, b } = await pair();
    const made = await a.lib.create({ title: "Essay" });
    const ref = { space: "private" as const, path: made.summary.path };
    await a.sync.run();
    await b.sync.run();
    const edit = async (c: typeof a, title: string) => {
      const d = c.lib.read(ref).doc;
      d.title = title;
      c.lib.write(ref, d);
      await c.lib.commitDoc(ref);
    };
    await edit(a, "Essay from A");
    await edit(b, "Essay from B");
    await a.sync.run();
    const ev = await b.sync.run();
    expect(ev.status.state.kind).toBe("synced");
    expect(ev.kept).toHaveLength(1);
    expect(ev.kept[0]!.title).toBe("Essay from A");
    expect(b.lib.read(ref).doc.title).toBe("Essay from B");
    const copy = b.lib.read(ev.kept[0]!.copy).doc;
    expect(copy.title).toMatch(/^Essay from A \(from GitHub \d{4}-\d{2}-\d{2}\)$/);
    expect(copy.id).not.toBe(made.doc.id);
    // Both reach A, so nothing is lost anywhere.
    await a.sync.run();
    expect(a.lib.list().map((x) => x.title).sort()).toEqual([copy.title, "Essay from B"].sort());
    expect(parseDocument(gh.file(login(), "p-doc-private", ref.path)!).title).toBe("Essay from B");
  });

  it("offline: versions wait, then go up when GitHub is back", async () => {
    const { a } = await pair();
    const dir = a.lib.dir("private");
    const url = (await git(dir, ["remote", "get-url", "origin"])).stdout.trim();
    await git(dir, ["remote", "set-url", "origin", "https://127.0.0.1:9/nobody/p-doc-private.git"]);
    const made = await a.lib.create({ title: "On the train" });
    const d = made.doc;
    d.title = "On the train, more";
    a.lib.write({ space: "private", path: made.summary.path }, d);
    await a.lib.commitDoc({ space: "private", path: made.summary.path });
    const ev = await a.sync.run();
    expect(ev.status.state).toEqual({ kind: "offline", waiting: 2 });
    expect(ev.status.pending).toEqual([{ space: "private", path: made.summary.path }]);
    await git(dir, ["remote", "set-url", "origin", url]);
    const back = await a.sync.run();
    expect(back.status.state.kind).toBe("synced");
    expect(await a.sync.waiting()).toBe(0);
    expect(gh.files(login(), "p-doc-private")).toContain(made.summary.path);
  });

  it("names a repository that's gone from GitHub", async () => {
    const { a } = await pair();
    rmSync(gh.bare(login(), "p-doc-public"), { recursive: true, force: true });
    const ev = await a.sync.run();
    expect(ev.status.state).toMatchObject({ kind: "problem", signIn: false });
    expect((ev.status.state as { reason: string }).reason).toMatch(/p-doc-public/);
  });

  it("makes versions of saved edits before merging", async () => {
    const { a, b } = await pair();
    const made = await a.lib.create({ title: "Draft" });
    const ref = { space: "private" as const, path: made.summary.path };
    await a.sync.run();
    await b.sync.run();
    // Saved on B but not yet a version, while A pushes a new document.
    const d = b.lib.read(ref).doc;
    d.title = "Draft on B";
    writeFileSync(b.lib.file(ref), serializeDocument(d));
    await a.lib.create({ title: "Other" });
    await a.sync.run();
    const withHook = new Sync({ library: b.lib, account: b.acc, link: () => link, beforeMerge: async () => void (await b.lib.commitDoc(ref)) });
    const ev = await withHook.run();
    expect(ev.status.state.kind).toBe("synced");
    expect(b.lib.list().map((x) => x.title).sort()).toEqual(["Draft on B", "Other"]);
    expect(parseDocument(gh.file(login(), "p-doc-private", ref.path)!).title).toBe("Draft on B");
  });
});
