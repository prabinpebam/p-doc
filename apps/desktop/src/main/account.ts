/**
 * Signing in to GitHub (spec §4.1 step 3, §6 GitHub). The token belongs to Git's own credential
 * helper: P-Doc asks for it with `git credential fill`, hands a new one over with `git credential
 * approve`, and never writes it to a file, a log, or a process argument. Without a helper, a pasted
 * token is kept in memory for this session only and passed to Git through the environment.
 */
import { git, run, GitError, gitSupported, gitVersion } from "./git.ts";
import { GitHubApi, GitHubError, apiBase, noreplyOf, type Fetch } from "./github.ts";
import type { AccountStatus, GitCheck, GitHubAccount, Identity, SignInProgress } from "../shared/api.ts";

/** The question Git's helper answers: only the protocol and host. */
export const CREDENTIAL_QUERY = "protocol=https\nhost=github.com\n\n";

const NO_HELPER_STORE =
  "Git has no credential helper here, so P-Doc keeps the sign-in until it closes. Install Git Credential Manager to stay signed in.";

export class SignInError extends Error {}

export interface AccountOptions {
  /** Where Git runs (any folder; the library root). */
  cwd: string;
  fetch?: Fetch;
  /** The API address (default: GitHub's, or the test fake from `PDOC_GITHUB_API`). */
  base?: string;
}

const passwordOf = (out: string) => out.split(/\r?\n/).find((l) => l.startsWith("password="))?.slice(9) || null;

export class Account {
  private memory: string | null = null;
  private signIn: AbortController | null = null;
  private last: GitHubAccount | null = null;

  constructor(private readonly o: AccountOptions) {}

  private get base(): string {
    return this.o.base ?? apiBase();
  }

  /** The configured credential helpers (`credential.helper`, `credential.<url>.helper`). */
  async helpers(): Promise<string[]> {
    const r = await git(this.o.cwd, ["config", "--get-regexp", "^credential\\..*helper$"], { ok: [0, 1] }).catch(() => null);
    return (r?.stdout ?? "")
      .split(/\r?\n/)
      .map((l) => l.replace(/^\S+\s?/, "").trim())
      .filter(Boolean);
  }

  async gitCheck(): Promise<GitCheck> {
    const version = await gitVersion();
    const helpers = version ? await this.helpers() : [];
    const gh = await run("gh", ["--version"], this.o.cwd, { timeoutMs: 10_000 }).then(
      () => true,
      () => false,
    );
    return { version, ok: gitSupported(version), gcm: helpers.some((h) => /manager/i.test(h)), gh };
  }

  /** The name and email Git already uses, to prefill the Identity step. */
  async gitIdentity(): Promise<Identity> {
    const get = async (k: string) => (await git(this.o.cwd, ["config", "--get", k], { ok: [0, 1] }).catch(() => null))?.stdout.trim() ?? "";
    return { name: await get("user.name"), email: await get("user.email") };
  }

  /** The token Git has for github.com, or null. Never logged. */
  async token(): Promise<string | null> {
    if (this.memory) return this.memory;
    try {
      const r = await git(this.o.cwd, ["credential", "fill"], { input: CREDENTIAL_QUERY, timeoutMs: 30_000 });
      return passwordOf(r.stdout);
    } catch {
      return null;
    }
  }

  /** Settings Git needs to reach GitHub: none with a helper; the session's token without one. */
  gitAuth(): { config?: string[]; env?: Record<string, string> } {
    if (!this.memory) return {};
    return {
      config: ["credential.helper=", 'credential.helper=!f() { test "$1" = get && echo username=x-access-token && echo "password=$PDOC_GIT_TOKEN"; }; f'],
      env: { PDOC_GIT_TOKEN: this.memory },
    };
  }

  /** An API client for the signed-in account. */
  async api(): Promise<GitHubApi> {
    const t = await this.token();
    if (!t) throw new GitHubError("Not signed in to GitHub", 401);
    return new GitHubApi(t, this.o.fetch, this.base);
  }

  /** The account last confirmed by GitHub in this session. */
  get account(): GitHubAccount | null {
    return this.last;
  }

  async status(): Promise<AccountStatus> {
    const t = await this.token();
    if (!t) return { state: "signedOut" };
    try {
      const { user } = await new GitHubApi(t, this.o.fetch, this.base).user();
      this.last = { login: user.login, id: user.id, name: user.name ?? "", noreply: noreplyOf(user) };
      return { state: "signedIn", account: this.last };
    } catch (e) {
      if (e instanceof GitHubError && e.status === 401) return { state: "invalid" };
      return { state: "offline" };
    }
  }

  /** Checks a pasted token and gives it to Git's helper. Rejects with a sentence to show. */
  async signInWithToken(raw: string): Promise<{ account: GitHubAccount; warning?: string }> {
    const token = raw.trim();
    if (!token || /[\s\0]/.test(token)) throw new SignInError("That doesn't look like a GitHub token.");
    const account = await this.verify(token);
    const warning = await this.keep(account.login, token);
    return { account, warning };
  }

  private async verify(token: string): Promise<GitHubAccount> {
    let r;
    try {
      r = await new GitHubApi(token, this.o.fetch, this.base).user();
    } catch (e) {
      if (e instanceof GitHubError && e.offline) throw new SignInError("GitHub can't be reached. Check your connection and try again.");
      if (e instanceof GitHubError && e.status === 401) throw new SignInError("GitHub didn't accept this token. Check it and try again.");
      throw new SignInError(`GitHub said: ${(e as Error).message}`);
    }
    if (r.scopes && !r.scopes.includes("repo")) throw new SignInError("This token can't create repositories. It needs the repo scope.");
    this.last = { login: r.user.login, id: r.user.id, name: r.user.name ?? "", noreply: noreplyOf(r.user) };
    return this.last;
  }

  /** Hands the token to Git's helper, or keeps it in memory when there is none. */
  private async keep(login: string, token: string): Promise<string | undefined> {
    if ((await this.helpers()).length === 0) {
      this.memory = token;
      return NO_HELPER_STORE;
    }
    this.memory = null;
    await git(this.o.cwd, ["credential", "approve"], { input: `protocol=https\nhost=github.com\nusername=${login}\npassword=${token}\n\n`, timeoutMs: 30_000 });
    return undefined;
  }

  /**
   * Signs in in the browser: Git Credential Manager's own window when it is Git's helper, otherwise
   * the GitHub CLI's device sign-in (the one-time code is passed on as progress).
   */
  async signInWithBrowser(progress: (p: SignInProgress) => void): Promise<{ account: GitHubAccount; warning?: string }> {
    this.cancelSignIn();
    const ctl = new AbortController();
    this.signIn = ctl;
    try {
      const check = await this.gitCheck();
      if (check.gcm) {
        progress({ message: "Finish signing in in the window Git Credential Manager opened." });
        const r = await git(this.o.cwd, ["credential", "fill"], { input: CREDENTIAL_QUERY, interactive: true, signal: ctl.signal, timeoutMs: 600_000 });
        const token = passwordOf(r.stdout);
        if (!token) throw new SignInError("Sign-in didn't finish. Try again, or paste a token.");
        const account = await this.verify(token);
        await this.keep(account.login, token);
        return { account };
      }
      if (check.gh) {
        progress({ message: "Opening GitHub in your browser…" });
        await run("gh", ["auth", "login", "--hostname", "github.com", "--git-protocol", "https", "--web", "--scopes", "repo"], this.o.cwd, {
          input: "\n",
          interactive: true,
          signal: ctl.signal,
          timeoutMs: 600_000,
          onStderr: (chunk) => {
            const code = /\b([A-Z0-9]{4}-[A-Z0-9]{4})\b/.exec(chunk)?.[1];
            if (code) progress({ message: "Enter this code on the GitHub page in your browser.", code });
          },
        });
        const token = (await run("gh", ["auth", "token", "--hostname", "github.com"], this.o.cwd, { timeoutMs: 30_000 })).stdout.trim();
        const account = await this.verify(token);
        if ((await this.helpers()).length === 0) await run("gh", ["auth", "setup-git", "--hostname", "github.com"], this.o.cwd, { timeoutMs: 30_000 });
        else await this.keep(account.login, token);
        return { account };
      }
      throw new SignInError("Signing in with the browser needs Git Credential Manager or the GitHub CLI. Paste a token instead.");
    } catch (e) {
      if (ctl.signal.aborted) throw new SignInError("Sign-in cancelled.");
      if (e instanceof SignInError) throw e;
      if (e instanceof GitError) throw new SignInError("Sign-in didn't finish. Try again, or paste a token.");
      throw e;
    } finally {
      if (this.signIn === ctl) this.signIn = null;
    }
  }

  cancelSignIn(): void {
    this.signIn?.abort();
    this.signIn = null;
  }

  /** "Use another account": Git's helper forgets its GitHub credential. */
  async forget(): Promise<void> {
    this.memory = null;
    this.last = null;
    await git(this.o.cwd, ["credential", "reject"], { input: CREDENTIAL_QUERY, timeoutMs: 30_000 }).catch(() => null);
  }

  /** Sign out in P-Doc only: the session's token goes, Git's helper keeps its own. */
  signOut(): void {
    this.memory = null;
    this.last = null;
  }
}
