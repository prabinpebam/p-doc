/**
 * A stand-in for the bits of GitHub P-Doc uses, on 127.0.0.1, for unit and e2e tests (no test ever
 * reaches the real GitHub). Repositories are bare Git repositories under `<root>/<owner>/<name>.git`,
 * reached by Git through `file://` (`PDOC_GITHUB_REMOTE`); the API answers from the same folders.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";

export interface FakeUser {
  login: string;
  id: number;
  name: string;
  /** `x-oauth-scopes`; null leaves the header out, like a fine-grained token. */
  scopes: string | null;
}

export interface FakeGitHub {
  /** The API address (`PDOC_GITHUB_API`). */
  api: string;
  /** The `file://` base for Git (`PDOC_GITHUB_REMOTE`). */
  remote: string;
  root: string;
  users: Map<string, FakeUser>;
  /** Requests seen, as "METHOD /path". */
  calls: string[];
  bare(owner: string, name: string): string;
  /** A repository made on "GitHub" outside P-Doc, optionally with a first commit of these files. */
  addRepo(owner: string, name: string, o: { private: boolean; files?: Record<string, string> }): void;
  /** Whether a repository exists and is private. */
  repo(owner: string, name: string): { private: boolean } | null;
  /** A file on `main`, or null. */
  file(owner: string, name: string, path: string): string | null;
  /** Paths on `main`. */
  files(owner: string, name: string): string[];
  close(): Promise<void>;
}

const quietGit = (args: string[], cwd?: string) =>
  execFileSync("git", ["-c", "init.defaultBranch=main", "-c", "user.name=Someone", "-c", "user.email=someone@example.invalid", "-c", "commit.gpgsign=false", ...args], { cwd, stdio: ["ignore", "pipe", "pipe"], encoding: "utf8" });

export async function startFakeGitHub(root = mkdtempSync(join(tmpdir(), "pdoc-gh-"))): Promise<FakeGitHub> {
  mkdirSync(root, { recursive: true });
  const users = new Map<string, FakeUser>();
  const calls: string[] = [];
  const bare = (owner: string, name: string) => join(root, owner, `${name}.git`);
  const metaOf = (owner: string, name: string) => join(root, owner, `${name}.json`);

  const repo = (owner: string, name: string) => {
    if (!existsSync(bare(owner, name))) return null;
    return JSON.parse(readFileSync(metaOf(owner, name), "utf8")) as { private: boolean };
  };
  const hasCommits = (dir: string) =>
    readdirSync(join(dir, "refs", "heads")).length > 0 || (existsSync(join(dir, "packed-refs")) && /refs\/heads\//.test(readFileSync(join(dir, "packed-refs"), "utf8")));
  const file = (owner: string, name: string, path: string) => {
    try {
      return quietGit(["--git-dir", bare(owner, name), "show", `main:${path}`]);
    } catch {
      return null;
    }
  };
  const files = (owner: string, name: string) => {
    try {
      return quietGit(["--git-dir", bare(owner, name), "ls-tree", "-r", "--name-only", "main"]).split("\n").filter(Boolean);
    } catch {
      return [];
    }
  };
  const create = (owner: string, name: string, isPrivate: boolean) => {
    mkdirSync(join(root, owner), { recursive: true });
    quietGit(["init", "-q", "--bare", "-b", "main", bare(owner, name)]);
    writeFileSync(metaOf(owner, name), JSON.stringify({ private: isPrivate }));
  };
  const json = (res: ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}) => {
    res.writeHead(status, { "Content-Type": "application/json", ...headers });
    res.end(JSON.stringify(body));
  };
  const body = (req: IncomingMessage) =>
    new Promise<string>((resolve) => {
      let s = "";
      req.on("data", (d) => (s += d));
      req.on("end", () => resolve(s));
    });
  const view = (owner: string, name: string) => {
    const r = repo(owner, name)!;
    return { name, private: r.private, size: hasCommits(bare(owner, name)) ? 1 : 0, owner: { login: owner } };
  };

  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    calls.push(`${req.method} ${url.pathname}`);
    const token = /^Bearer (.+)$/.exec(req.headers.authorization ?? "")?.[1];
    const user = token ? users.get(token) : undefined;
    if (!user) return json(res, 401, { message: "Bad credentials" });
    if (req.method === "GET" && url.pathname === "/user") return json(res, 200, { login: user.login, id: user.id, name: user.name }, user.scopes == null ? {} : { "x-oauth-scopes": user.scopes });
    const m = /^\/repos\/([^/]+)\/([^/]+?)(\/contents\/(.+))?$/.exec(url.pathname);
    if (req.method === "GET" && m) {
      const owner = decodeURIComponent(m[1]!);
      const name = decodeURIComponent(m[2]!);
      const path = m[4];
      const r = repo(owner, name);
      if (!r || (r.private && owner !== user.login)) return json(res, 404, { message: "Not Found" });
      if (path) return file(owner, name, path) == null ? json(res, 404, { message: "Not Found" }) : json(res, 200, { name: path, type: "file" });
      return json(res, 200, view(owner, name));
    }
    if (req.method === "POST" && url.pathname === "/user/repos") {
      const b = JSON.parse((await body(req)) || "{}") as { name?: string; private?: boolean };
      if (!b.name) return json(res, 422, { message: "Repository creation failed." });
      if (repo(user.login, b.name)) return json(res, 422, { message: "Repository creation failed.", errors: [{ message: "name already exists on this account" }] });
      create(user.login, b.name, b.private === true);
      return json(res, 201, view(user.login, b.name));
    }
    json(res, 404, { message: "Not Found" });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as { port: number }).port;

  return {
    api: `http://127.0.0.1:${port}`,
    remote: pathToFileURL(root).href,
    root,
    users,
    calls,
    bare,
    repo,
    file,
    files,
    addRepo(owner, name, o) {
      create(owner, name, o.private);
      if (!o.files) return;
      const work = mkdtempSync(join(tmpdir(), "pdoc-gh-seed-"));
      quietGit(["init", "-q", "-b", "main", work]);
      for (const [p, text] of Object.entries(o.files)) {
        mkdirSync(dirname(join(work, p)), { recursive: true });
        writeFileSync(join(work, p), text);
      }
      quietGit(["add", "-A"], work);
      quietGit(["commit", "-q", "-m", "First"], work);
      quietGit(["push", "-q", bare(owner, name), "main"], work);
      rmSync(work, { recursive: true, force: true });
    },
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  };
}

/** The `credential.helper` value for the fake helper, keeping its "vault" in `store`. */
export function fakeHelperConfig(store: string): string {
  const script = join(import.meta.dirname, "fake-helper.mjs").replace(/\\/g, "/");
  return `!node "${script}" "${store.replace(/\\/g, "/")}"`;
}
