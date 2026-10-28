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
  input?: string;
  /** Exit codes that aren't failures (default: 0 only). */
  ok?: number[];
}

const BASE = ["-c", "core.autocrlf=false", "-c", "core.quotepath=false", "-c", "commit.gpgsign=false", "-c", "tag.gpgsign=false", "-c", "init.defaultBranch=main"];

export function git(cwd: string, args: string[], o: GitOptions = {}): Promise<GitResult> {
  const id = o.identity ? ["-c", `user.name=${o.identity.name}`, "-c", `user.email=${o.identity.email}`] : [];
  return new Promise((resolve, reject) => {
    const child = spawn("git", [...BASE, ...id, ...args], {
      cwd,
      windowsHide: true,
      env: { ...process.env, GIT_TERMINAL_PROMPT: "0", GCM_INTERACTIVE: "never", LC_ALL: "C" },
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8").on("data", (d: string) => (stdout += d));
    child.stderr.setEncoding("utf8").on("data", (d: string) => (stderr += d));
    child.on("error", (e) => reject(new GitError(`Git couldn't start: ${e.message}`, { code: -1, stdout, stderr })));
    child.on("close", (code) => {
      const r = { code: code ?? -1, stdout, stderr };
      if ((o.ok ?? [0]).includes(r.code)) resolve(r);
      else reject(new GitError(`git ${args[0]} failed (${r.code}): ${stderr.trim() || stdout.trim()}`, r));
    });
    if (o.input != null) child.stdin.end(o.input);
    else child.stdin.end();
  });
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
