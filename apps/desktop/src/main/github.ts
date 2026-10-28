/**
 * The three GitHub API calls P-Doc makes (spec §6, GitHub): who the token belongs to, a repository,
 * and creating one. Requests go only to https://api.github.com; tests point it at a fake on this
 * computer (`PDOC_GITHUB_API`, accepted only for 127.0.0.1 or localhost). The token is sent in a
 * header and never logged; errors carry GitHub's message, never the request.
 */

export const GITHUB_API = "https://api.github.com";
export const GITHUB_WEB = "https://github.com";

export type Fetch = (url: string, init: RequestInit) => Promise<Response>;

export class GitHubError extends Error {
  constructor(
    message: string,
    /** HTTP status; 0 when GitHub couldn't be reached. */
    readonly status: number,
  ) {
    super(message);
  }
  get offline(): boolean {
    return this.status === 0;
  }
}

export interface GitHubUser {
  login: string;
  id: number;
  name: string | null;
}

export interface GitHubRepo {
  name: string;
  private: boolean;
  /** KB; 0 for a repository with no commits. */
  size: number;
  owner: { login: string };
}

const LOCAL = /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?\/?$/;

/** The API's address: GitHub's, or a test fake on this computer. */
export function apiBase(env: NodeJS.ProcessEnv = process.env): string {
  const o = env.PDOC_GITHUB_API;
  return o && LOCAL.test(o) ? o.replace(/\/$/, "") : GITHUB_API;
}

/** Where Git pushes a repository: GitHub, or (tests) a folder of bare repositories (`PDOC_GITHUB_REMOTE`, `file://` only). */
export function remoteUrl(owner: string, name: string, env: NodeJS.ProcessEnv = process.env): string {
  const o = env.PDOC_GITHUB_REMOTE;
  const base = o && /^file:\/\//i.test(o) ? o.replace(/\/$/, "") : GITHUB_WEB;
  return `${base}/${owner}/${name}.git`;
}

export class GitHubApi {
  constructor(
    private readonly token: string,
    private readonly fetchFn: Fetch = (u, i) => fetch(u, i),
    private readonly base: string = GITHUB_API,
  ) {}

  private async call<T>(method: string, path: string, body?: unknown): Promise<{ data: T; scopes: string | null }> {
    let res: Response;
    try {
      res = await this.fetchFn(`${this.base}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${this.token}`,
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
          "User-Agent": "P-Doc",
          ...(body ? { "Content-Type": "application/json" } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
        redirect: "error",
        signal: AbortSignal.timeout(20_000),
      });
    } catch {
      throw new GitHubError("GitHub can't be reached", 0);
    }
    if (!res.ok) {
      let message = res.statusText;
      try {
        message = ((await res.json()) as { message?: string }).message || message;
      } catch {
        // No JSON body.
      }
      throw new GitHubError(message, res.status);
    }
    return { data: (await res.json()) as T, scopes: res.headers.get("x-oauth-scopes") };
  }

  /** The token's account, and its scopes (null for fine-grained tokens, which don't list them). */
  async user(): Promise<{ user: GitHubUser; scopes: string[] | null }> {
    const r = await this.call<GitHubUser>("GET", "/user");
    return { user: r.data, scopes: r.scopes == null ? null : r.scopes.split(",").map((s) => s.trim()).filter(Boolean) };
  }

  /** A repository, or null when there is none by that name (or the token can't see it). */
  async repo(owner: string, name: string): Promise<GitHubRepo | null> {
    try {
      return (await this.call<GitHubRepo>("GET", `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}`)).data;
    } catch (e) {
      if (e instanceof GitHubError && e.status === 404) return null;
      throw e;
    }
  }

  /** Whether a repository has a file on its default branch (P-Doc's `.p-doc` marker). */
  async hasFile(owner: string, name: string, path: string): Promise<boolean> {
    try {
      await this.call("GET", `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/contents/${path}`);
      return true;
    } catch (e) {
      if (e instanceof GitHubError && e.status === 404) return false;
      throw e;
    }
  }

  async createRepo(name: string, isPrivate: boolean, description: string): Promise<GitHubRepo> {
    return (await this.call<GitHubRepo>("POST", "/user/repos", { name, private: isPrivate, description, auto_init: false, has_issues: false, has_wiki: false, has_projects: false })).data;
  }
}

/** GitHub's no-reply address for commits. */
export const noreplyOf = (u: GitHubUser) => `${u.id}+${u.login}@users.noreply.github.com`;
