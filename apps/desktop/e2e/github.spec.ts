/**
 * Stage 5 journeys against a fake GitHub on 127.0.0.1 and bare repositories (never the real GitHub or
 * the owner's Git sign-in): first run's Connect GitHub, resuming half-way, sync both ways, and privacy.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import type { Page } from "@playwright/test";
import { diskText, editor, expect, filesIn, launch, PROMPTLY, quit, tempDirs, test, type Dirs } from "./helpers.ts";
import { fakeHelperConfig, startFakeGitHub, type FakeGitHub } from "../test/fakes/fake-github.ts";

const TOKEN = "ghp_e2eFakeToken0123456789abcdefABCDEF";
const NO_SCOPE = "ghp_e2eNoScope0123456789abcdefABCDEF";
const SYNCED = { timeout: 30_000, intervals: [100] };

let fake: FakeGitHub;
test.beforeEach(async () => {
  fake = await startFakeGitHub();
  fake.users.set(TOKEN, { login: "ada", id: 7, name: "Ada Lovelace", scopes: "repo, read:user" });
  fake.users.set(NO_SCOPE, { login: "ada", id: 7, name: "Ada Lovelace", scopes: "read:user" });
});
test.afterEach(async () => {
  await fake.close();
});

/** Fresh folders whose isolated Git config uses the fake credential helper (its "vault" sits beside them). */
function dirsWithHelper(): Dirs {
  const dirs = tempDirs();
  execFileSync("git", ["config", "--file", dirs.gitConfig, "credential.helper", fakeHelperConfig(join(dirname(dirs.gitConfig), "vault.json"))]);
  return dirs;
}

const envFor = () => ({ PDOC_GITHUB_API: fake.api, PDOC_GITHUB_REMOTE: fake.remote });

/** Every file under a folder, for "the token is nowhere" checks. */
function allText(dir: string): string {
  let out = "";
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    const s = statSync(p);
    if (s.isDirectory()) out += allText(p);
    else if (s.size < 5_000_000) out += readFileSync(p, "latin1");
  }
  return out;
}

async function signInWithToken(page: Page) {
  await page.getByRole("button", { name: "Connect GitHub" }).click();
  // Git works, so the Git step goes straight on.
  await expect(page.getByRole("heading", { name: "Sign in to GitHub" })).toBeVisible();
  await page.getByRole("button", { name: "Paste a token" }).click();
  const field = page.getByLabel("Personal access token (needs the repo scope)");
  await expect(field).toBeFocused();
  await expect(field).toHaveAttribute("type", "password");
  await field.fill("ghp_notARealToken000000000000000000000");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByText("GitHub didn't accept this token. Check it and try again.")).toBeVisible();
  await field.fill(NO_SCOPE);
  await field.press("Enter");
  await expect(page.getByText("This token can't create repositories. It needs the repo scope.")).toBeVisible();
  await field.fill(TOKEN);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByTestId("signed-in")).toHaveText("Signed in as @ada");
  await page.getByRole("button", { name: "Continue" }).click();
}

async function confirmIdentity(page: Page) {
  await expect(page.getByRole("heading", { name: "Your name on versions" })).toBeVisible();
  // Git has no name here (isolated config), so the GitHub account fills it, with the private address.
  await expect(page.getByLabel("Name")).toHaveValue("Ada Lovelace");
  await expect(page.getByLabel("Email")).toHaveValue("7+ada@users.noreply.github.com");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("heading", { name: "Repositories" })).toBeVisible();
}

test("5.1–5.3 first run: Connect GitHub signs in with a token, sets up both repositories and syncs both ways", async () => {
  const dirs = dirsWithHelper();
  const started = Date.now();
  const l = await launch({ dirs, setup: false, env: envFor() });
  const { page } = l;
  await expect(page.getByRole("list", { name: "Setup steps" }).locator("li")).toHaveCount(6);
  await signInWithToken(page);
  await confirmIdentity(page);

  await expect(page.getByTestId("repo-state-private")).toHaveText("Will be created");
  await expect(page.getByTestId("repo-state-public")).toHaveText("Will be created");
  await expect(page.getByTestId("repo-private").locator(".space-badge")).toHaveText("Private");
  await page.getByRole("button", { name: "Set up" }).click();
  await expect(page.getByText("You're set. Documents sync to GitHub when you're online.")).toBeVisible({ timeout: 30_000 });
  expect(fake.repo("ada", "p-doc-private")).toEqual({ private: true });
  expect(fake.repo("ada", "p-doc-public")).toEqual({ private: false });
  expect(fake.files("ada", "p-doc-private")).toContain(".p-doc");
  expect(fake.files("ada", "p-doc-public")).toContain(".p-doc");

  await page.getByRole("button", { name: "Start writing" }).click();
  await expect(editor(page)).toBeFocused();
  // PD7: a first saved document well inside a minute, signed in.
  await page.keyboard.type("Words for GitHub");
  await expect.poll(() => diskText(dirs), PROMPTLY).toContain("Words for GitHub");
  expect(Date.now() - started).toBeLessThan(60_000);
  const sync = page.getByTestId("sync-state");
  await expect(sync).toBeVisible();
  await page.keyboard.press("Control+Alt+s");
  const name = filesIn(dirs, "private")[0]!.name;
  await expect.poll(() => fake.file("ada", "p-doc-private", `docs/${name}`) ?? "", SYNCED).toContain("Words for GitHub");
  await expect(sync).toHaveText("Synced", SYNCED);
  // The title bar says so too, until the next edit is only on this computer.
  const saveState = page.getByTestId("save-state");
  await expect(saveState).toHaveText("Saved · synced");
  await page.keyboard.type(" more");
  await expect(saveState).toHaveText("Saved to this computer");
  await page.keyboard.press("Control+Alt+s");
  await expect(saveState).toHaveText("Saved · synced", SYNCED);
  expect(fake.files("ada", "p-doc-public").filter((f) => f.startsWith("docs/"))).toEqual([]);

  // Another computer renames the document; Sync now brings it in and the open page follows.
  const other = mkdtempSync(join(tmpdir(), "pdoc-other-"));
  const git = (...a: string[]) => execFileSync("git", ["-c", "user.name=Other", "-c", "user.email=other@example.invalid", "-c", "commit.gpgsign=false", "-c", "core.autocrlf=false", ...a], { cwd: other, encoding: "utf8" });
  git("clone", "-q", fake.bare("ada", "p-doc-private"), ".");
  const path = join(other, "docs", name);
  const doc = JSON.parse(readFileSync(path, "utf8"));
  doc.title = "Renamed elsewhere";
  writeFileSync(path, JSON.stringify(doc, null, 2) + "\n");
  git("commit", "-qam", "Rename elsewhere");
  git("push", "-q", "origin", "main");
  await page.getByRole("menuitem", { name: "File" }).click();
  await page.getByRole("menuitem", { name: /^Sync now/ }).click();
  await expect(page.locator("#doc-title")).toHaveValue("Renamed elsewhere", SYNCED);
  await expect(sync).toHaveText("Synced");

  // Settings shows the account and both repositories.
  await page.getByRole("menuitem", { name: "File" }).click();
  await page.getByRole("menuitem", { name: "Settings" }).click();
  const settings = page.getByRole("dialog", { name: "Settings" });
  await expect(settings.getByTestId("github-account")).toHaveText("Signed in as @ada");
  await expect(settings).toContainText("ada/p-doc-private");
  await expect(settings).toContainText("ada/p-doc-public");
  await expect(settings.getByLabel(/Sync automatically/)).toBeChecked();
  await settings.getByRole("button", { name: "Close" }).click();
  await quit(l);

  // 5.2: P-Doc never wrote the token: not in its data, the library, Git's remotes, or its log.
  expect(allText(dirs.userData)).not.toContain(TOKEN);
  expect(allText(dirs.library)).not.toContain(TOKEN);
  expect(l.log.join("")).not.toContain(TOKEN);

  // Next start: Git's helper still has the sign-in, so sync carries on with no first run.
  const again = await launch({ dirs, env: envFor() });
  await expect(again.page.getByTestId("sync-state")).toHaveText("Synced", SYNCED);
  // Sign out: P-Doc stops syncing and offers a fresh Connect, not "Finish connecting".
  await again.page.getByRole("menuitem", { name: "File" }).click();
  await again.page.getByRole("menuitem", { name: "Settings" }).click();
  const s2 = again.page.getByRole("dialog", { name: "Settings" });
  await s2.getByRole("button", { name: "Sign out" }).click();
  await expect(s2.getByRole("button", { name: "Connect GitHub" })).toBeVisible();
  await expect(s2.getByText("Not connected. Your documents are saved on this computer.")).toBeVisible();
  await s2.getByRole("button", { name: "Close" }).click();
  await expect(again.page.getByTestId("sync-state")).toHaveText("Not connected to GitHub");
  await quit(again);
});

test("5.3 quitting half-way resumes at the step that stopped; a taken name can be used anyway", async () => {
  const dirs = dirsWithHelper();
  fake.addRepo("ada", "p-doc-public", { private: false, files: { "README.md": "Someone else's project\n" } });
  const l = await launch({ dirs, setup: false, env: envFor() });
  await signInWithToken(l.page);
  await expect(l.page.getByRole("heading", { name: "Your name on versions" })).toBeVisible();
  await quit(l);

  const back = await launch({ dirs, setup: false, env: envFor() });
  const { page } = back;
  await confirmIdentity(page);
  await expect(page.getByTestId("repo-state-private")).toHaveText("Will be created");
  await expect(page.getByTestId("repo-state-public")).toHaveText("Already exists");
  await expect(page.getByText("A repository named p-doc-public already exists and isn't a P-Doc library.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Set up" })).toBeDisabled();
  await page.getByRole("button", { name: "Choose another name" }).click();
  await expect(page.getByLabel("Public repository name")).toBeFocused();
  await page.getByRole("button", { name: "Use it anyway" }).click();
  await expect(page.getByTestId("repo-state-public")).toHaveText("Will be used");
  await page.getByRole("button", { name: "Set up" }).click();
  await expect(page.getByRole("heading", { name: "You're set" })).toBeVisible({ timeout: 30_000 });
  // Their README stays beside P-Doc's marker.
  expect(fake.files("ada", "p-doc-public")).toEqual(expect.arrayContaining([".p-doc", "README.md"]));
  await page.getByRole("button", { name: "Start writing" }).click();
  await expect(editor(page)).toBeFocused();
  await quit(back);
});

test("5.6 privacy: a document reaches the public repository only after Move to Public is confirmed", async () => {
  const dirs = dirsWithHelper();
  const l = await launch({ dirs, setup: false, env: envFor() });
  const { page } = l;
  await signInWithToken(page);
  await confirmIdentity(page);
  await page.getByRole("button", { name: "Set up" }).click();
  await page.getByRole("button", { name: "Start writing" }).click({ timeout: 30_000 });
  const title = page.locator("#doc-title");
  await title.fill("Plans");
  await title.press("Enter");
  await page.keyboard.type("Private plans");
  const sync = page.getByTestId("sync-state");
  /** Sync now, and wait for that sync (not an earlier one) to finish. */
  const syncNow = async () => {
    const before = await sync.getAttribute("data-at");
    await page.keyboard.press("Control+Alt+s");
    await expect.poll(() => sync.getAttribute("data-at"), SYNCED).not.toBe(before);
    await expect(sync).toHaveText("Synced");
  };
  await expect.poll(() => diskText(dirs), PROMPTLY).toContain("Private plans");
  await syncNow();
  const name = filesIn(dirs, "private")[0]!.name;
  expect(fake.file("ada", "p-doc-private", `docs/${name}`)).toContain("Private plans");
  const publicDocs = () => fake.files("ada", "p-doc-public").filter((f) => f.startsWith("docs/"));
  expect(publicDocs()).toEqual([]);

  // Cancel changes nothing, even after a sync.
  await page.getByRole("menuitem", { name: "File" }).click();
  await page.getByRole("menuitem", { name: "Move to Public" }).click();
  const warn = page.getByRole("dialog", { name: 'Make "Plans" public?' });
  await expect(warn).toContainText("Anyone can read it and its history on GitHub from the next sync.");
  await warn.getByRole("button", { name: "Cancel" }).click();
  await syncNow();
  expect(publicDocs()).toEqual([]);
  expect(fake.file("ada", "p-doc-private", `docs/${name}`)).toContain("Private plans");

  await page.getByRole("menuitem", { name: "File" }).click();
  await page.getByRole("menuitem", { name: "Move to Public" }).click();
  await warn.getByRole("button", { name: "Move to Public" }).click();
  await expect(page.getByText('"Plans" is now in Public')).toBeVisible();
  await syncNow();
  await expect.poll(publicDocs, SYNCED).toEqual([`docs/${name}`]);
  expect(fake.file("ada", "p-doc-public", `docs/${name}`)).toContain("Private plans");
  await expect.poll(() => fake.files("ada", "p-doc-private"), SYNCED).not.toContain(`docs/${name}`);
  await quit(l);
});
