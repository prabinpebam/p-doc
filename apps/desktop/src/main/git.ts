/** Runs Git with P-Doc's settings: no prompts, no signing, LF line endings, and the writer's identity. */
import { spawn } from "node:child_process";
import type { Identity } from "../shared/api.ts";

export interface GitResult {
  code: number;
  stdout: string;
  stderr: string;
}

export class GitError extends Error {
  constructor(
    message: string,
    readonly result: GitResult,
  ) {
    super(message);
  }
}

export interface GitOptions {
  identity?: Identity;
  /** Standard input; credentials only ever travel this way, never in arguments (spec §6, GitHub). */
  input?: string;
  /** Exit codes that aren't failures (default: 0 only). */
  ok?: number[];
  /** Lets Git Credential Manager show its sign-in window (first run's "Sign in with browser"). */
  interactive?: boolean;
  /** Stops Git (Cancel during a sign-in). */
  signal?: AbortSignal;
  /** Stops Git after this long; it then fails with code -1. */
  timeoutMs?: number;
  /** Extra `-c key=value` settings (the session's GitHub sign-in when Git has no helper). */
  config?: string[];
  /** Extra environment for the program. */
  env?: Record<string, string>;
  /** Called as error output arrives (the GitHub CLI's one-time code). */
  onStderr?: (chunk: string) => void;
}

const BASE = ["-c", "core.autocrlf=false", "-c", "core.quotepath=false", "-c", "commit.gpgsign=false", "-c", "tag.gpgsign=false", "-c", "init.defaultBranch=main"];

export function git(cwd: string, args: string[], o: GitOptions = {}): Promise<GitResult> {
  const extra = (o.config ?? []).flatMap((c) => ["-c", c]);
  return run("git", [...BASE, ...extra, ...(o.identity ? ["-c", `user.name=${o.identity.name}`, "-c", `user.email=${o.identity.email}`] : []), ...args], cwd, o, `git ${args[0]}`);
}

/** Runs a program (Git, or the GitHub CLI for signing in) with prompts off unless asked. */
export function run(program: string, args: string[], cwd: string, o: GitOptions = {}, what = program): Promise<GitResult> {
  return new Promise((resolve, reject) => {
    const env: NodeJS.ProcessEnv = { ...process.env, ...o.env, GIT_TERMINAL_PROMPT: "0", LC_ALL: "C" };
    if (!o.interactive) {
      env.GCM_INTERACTIVE = "never";
      // Git tries an askpass program before honouring GIT_TERMINAL_PROMPT; empty means none.
      env.GIT_ASKPASS = "";
      env.SSH_ASKPASS = "";
    }
    const child = spawn(program, args, { cwd, windowsHide: true, env });
    let stdout = "";
    let stderr = "";
    let stopped = "";
    const stop = (why: string) => {
      stopped = why;
      child.kill();
    };
    const timer = o.timeoutMs ? setTimeout(() => stop("timed out"), o.timeoutMs) : null;
    const abort = () => stop("cancelled");
    o.signal?.addEventListener("abort", abort, { once: true });
    child.stdout.setEncoding("utf8").on("data", (d: string) => (stdout += d));
    child.stderr.setEncoding("utf8").on("data", (d: string) => {
      stderr += d;
      o.onStderr?.(d);
    });
    child.on("error", (e) => {
      if (timer) clearTimeout(timer);
      reject(new GitError(`${program} couldn't start: ${e.message}`, { code: -1, stdout, stderr }));
    });
    child.on("close", (code) => {
      if (timer) clearTimeout(timer);
      o.signal?.removeEventListener("abort", abort);
      const r = { code: stopped ? -1 : (code ?? -1), stdout, stderr: stopped ? `${stderr}\n(${stopped})` : stderr };
      if ((o.ok ?? [0]).includes(r.code)) resolve(r);
      else reject(new GitError(`${what} failed (${stopped || r.code}): ${stderr.trim() || stdout.trim()}`, r));
    });
    if (o.signal?.aborted) abort();
    child.stdin.on("error", () => undefined);
    if (o.input != null) child.stdin.end(o.input);
    else child.stdin.end();
  });
}

export type NetworkProblem = "offline" | "auth" | "missing" | "other";

/** Why a fetch or push failed, from Git's message. */
export function networkProblem(stderr: string): NetworkProblem {
  if (/could not resolve host|failed to connect|couldn't connect|connection (refused|timed out|reset)|network is unreachable|operation timed out|unable to access .*(timed out|resolve)|\(timed out\)/i.test(stderr)) return "offline";
  if (/authentication failed|could not read username|terminal prompts disabled|invalid username or password|permission to .* denied|returned error: 403|requested url returned error: 401/i.test(stderr)) return "auth";
  if (/repository not found|does not appear to be a git repository|not found/i.test(stderr)) return "missing";
  return "other";
}

/** Git's version ("2.45.1"), or null when Git is missing. */
export async function gitVersion(): Promise<string | null> {
  try {
    const r = await git(process.cwd(), ["--version"]);
    return /(\d+\.\d+(?:\.\d+)?)/.exec(r.stdout)?.[1] ?? null;
  } catch {
    return null;
  }
}

/** Whether a version is at least the one P-Doc needs (2.40). */
export function gitSupported(version: string | null, min = "2.40"): boolean {
  if (!version) return false;
  const [a, b] = version.split(".").map(Number);
  const [x, y] = min.split(".").map(Number);
  return a! > x! || (a === x && b! >= y!);
}
