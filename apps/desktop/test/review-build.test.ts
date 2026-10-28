import { describe, expect, it } from "vitest";
import { resolve, sep } from "node:path";
// @ts-expect-error: a plain ES module tool without type declarations
import { reviewEnv, reviewPaths } from "../../../tools/review-build.mjs";

describe("review build", () => {
  const repo = resolve("/work/p-doc");
  const paths = reviewPaths(repo);

  it("lives beside the repository, never inside it", () => {
    for (const p of Object.values(paths) as string[]) expect(p.startsWith(repo + sep)).toBe(false);
    expect(paths.worktree).toBe(resolve("/work/p-doc-review"));
    expect(paths.userData.startsWith(paths.data)).toBe(true);
    expect(paths.library.startsWith(paths.data)).toBe(true);
  });

  it("drops the developer's Git, P-Doc and Electron settings and uses its own folders", () => {
    const env = reviewEnv(paths, { PATH: "x", GIT_DIR: "/repo/.git", PDOC_LIBRARY: "/real", ELECTRON_RUN_AS_NODE: "1", git_config_global: "/home/.gitconfig" });
    expect(env.PATH).toBe("x");
    expect(env.GIT_DIR).toBeUndefined();
    expect(env.ELECTRON_RUN_AS_NODE).toBeUndefined();
    expect(env.git_config_global).toBeUndefined();
    expect(env.PDOC_LIBRARY).toBe(paths.library);
    expect(env.PDOC_USER_DATA).toBe(paths.userData);
    expect(env.GIT_CONFIG_GLOBAL).toBe(paths.gitConfig);
    expect(env.GIT_CONFIG_NOSYSTEM).toBe("1");
    expect(env.PDOC_SHOW_INACTIVE).toBe("1");
  });

  it("can't reach GitHub: the API is on this computer and pushes go to a local folder", () => {
    const env = reviewEnv(paths, {});
    expect(env.PDOC_GITHUB_API).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
    expect(env.PDOC_GITHUB_REMOTE).toMatch(/^file:\/\//);
  });
});
