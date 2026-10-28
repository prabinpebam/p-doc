/**
 * First run's Repositories step (spec §4.1 step 5): find or make `p-doc-private` (private) and
 * `p-doc-public` (public) on GitHub, connect the library to them, and push. Every part checks
 * before it acts, so running it again (after going offline, or quitting halfway) finishes the job.
 */
import { MARKER, type Sync } from "./sync.ts";
import { remoteUrl, GitHubError, type GitHubApi } from "./github.ts";
import { SPACES } from "./library.ts";
import { planProblem, type RepoPlan, type SetupProgress, type Space } from "../shared/api.ts";

export class SetupError extends Error {}

const DESCRIPTION: Record<Space, string> = {
  private: "Private documents written in P-Doc",
  public: "Public documents written in P-Doc",
};

/** What setup would do with each repository. */
export async function planRepos(api: GitHubApi, owner: string, names: Record<Space, string>, sync: Sync): Promise<RepoPlan[]> {
  const out: RepoPlan[] = [];
  for (const space of SPACES) {
    const name = names[space];
    const repo = await api.repo(owner, name);
    let state: RepoPlan["state"];
    if (!repo) state = "create";
    else if (repo.private !== (space === "private")) state = "visibility";
    else if ((await sync.remoteOf(space)) === remoteUrl(owner, name)) state = "ready";
    else if (repo.size === 0 || (await api.hasFile(owner, name, MARKER))) state = "found";
    else state = "taken";
    out.push({ space, owner, name, state });
  }
  return out;
}

export async function runSetup(
  api: GitHubApi,
  owner: string,
  names: Record<Space, string>,
  useTaken: Space[],
  sync: Sync,
  progress: (p: SetupProgress) => void = () => undefined,
): Promise<RepoPlan[]> {
  if (names.private === names.public) throw new SetupError("The two repositories need different names.");
  const plan = await planRepos(api, owner, names, sync);
  for (const p of plan) {
    const why = planProblem(p);
    if (p.state === "visibility" || (p.state === "taken" && !useTaken.includes(p.space))) throw new SetupError(why!);
  }
  for (const p of plan) {
    progress({ space: p.space, step: "find" });
    if (p.state === "create") {
      progress({ space: p.space, step: "create" });
      try {
        await api.createRepo(p.name, p.space === "private", DESCRIPTION[p.space]);
      } catch (e) {
        // Made a moment ago by another try: use it.
        if (!(e instanceof GitHubError && e.status === 422 && (await api.repo(owner, p.name)))) throw e;
      }
    }
    progress({ space: p.space, step: "local" });
    await sync.connect(p.space, owner, p.name);
    progress({ space: p.space, step: "push" });
    await sync.syncSpace(p.space);
    progress({ space: p.space, step: "done" });
    p.state = "ready";
  }
  return plan;
}
