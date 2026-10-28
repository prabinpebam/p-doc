import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { diskText, editor, expect, filesIn, launch, PROMPTLY, quit, test, type Dirs, type Launched } from "./helpers.ts";

const CADENCE = { PDOC_VERSION_PAUSE_MS: "1500", PDOC_VERSION_MAX_MS: "60000" };

/** Runs Git on a space's repository with the journey's own empty config. */
function git(dirs: Dirs, args: string[], space = "private"): string {
  return execFileSync("git", ["-C", join(dirs.library, space), ...args], {
    encoding: "utf8",
    env: { ...process.env, GIT_CONFIG_GLOBAL: dirs.gitConfig, GIT_CONFIG_NOSYSTEM: "1" },
  });
}

const subjects = (dirs: Dirs) => git(dirs, ["log", "--format=%s"]).split("\n").filter(Boolean);
const edits = (dirs: Dirs) => subjects(dirs).filter((s) => s.startsWith("Edit ")).length;

const rows = (l: Launched) => l.page.getByTestId("version-row");
const panel = (l: Launched) => l.page.getByRole("complementary", { name: "Version history" });

async function rowAction(l: Launched, row: number, action: string): Promise<void> {
  await rows(l).nth(row).getByRole("button", { name: /^More actions for/ }).click();
  await l.page.getByRole("menuitem", { name: action }).click();
}

async function resize(l: Launched, width: number, height: number): Promise<void> {
  await l.app.evaluate(({ BrowserWindow }, [w, h]) => BrowserWindow.getAllWindows()[0]!.setContentSize(w!, h!), [width, height]);
  await expect.poll(() => l.page.evaluate(() => window.innerWidth)).toBe(width);
}

test("3.1 versions are made as you write, after a pause, and on close", async () => {
  const l = await launch({ env: CADENCE });
  const { page } = l;
  await page.locator("#doc-title").fill("Plan");
  await page.locator("#doc-title").press("Enter");
  await page.keyboard.type("Alpha one. Gamma.");
  await expect.poll(() => edits(l.dirs), PROMPTLY).toBe(1);

  // Nothing new is made while the text is unchanged.
  await page.waitForTimeout(2000);
  expect(edits(l.dirs)).toBe(1);

  await page.keyboard.type(" Delta.");
  await quit(l);
  expect(edits(l.dirs)).toBe(2);
  expect(git(l.dirs, ["show", "HEAD:" + `docs/${filesIn(l.dirs, "private")[0].name}`])).toContain("Delta.");
  expect(git(l.dirs, ["status", "--porcelain"]).trim()).toBe("");

  // A forced quit after a save but before a version: the next start makes the version.
  const again = await launch({ dirs: l.dirs, env: CADENCE });
  await editor(again.page).press("Control+End");
  await again.page.keyboard.type(" Epsilon.");
  await expect.poll(() => diskText(l.dirs), PROMPTLY).toContain("Delta. Epsilon.");
  process.kill(again.pid, "SIGKILL");
  expect(edits(l.dirs)).toBe(2);
  const third = await launch({ dirs: l.dirs, env: CADENCE });
  await expect.poll(() => edits(l.dirs), PROMPTLY).toBe(3);
  expect(git(l.dirs, ["show", "HEAD:" + `docs/${filesIn(l.dirs, "private")[0].name}`])).toContain("Epsilon.");
  await quit(third);
});

test("3.2–3.6 history: see, compare, name, restore, copy", async () => {
  const l = await launch({ env: CADENCE });
  const { page } = l;
  await page.locator("#doc-title").fill("Plan");
  await page.locator("#doc-title").press("Enter");
  await page.keyboard.type("Alpha one. Gamma.");
  await expect.poll(() => edits(l.dirs), PROMPTLY).toBe(1);
  for (let i = 0; i < "Gamma.".length; i++) await page.keyboard.press("Backspace");
  await page.keyboard.type("Beta two.");

  // 3.2 The save state opens history; opening it keeps the current text as the top row.
  await page.getByRole("button", { name: "See version history" }).click();
  await expect(panel(l)).toBeVisible();
  await expect(page.getByRole("button", { name: "Close version history" })).toBeFocused();
  await expect(panel(l).getByRole("region", { name: "Today" })).toBeVisible();
  await expect(rows(l).first()).toContainText("Current version");
  await expect.poll(() => rows(l).count(), PROMPTLY).toBeGreaterThanOrEqual(2);
  expect(edits(l.dirs)).toBe(2);
  await expect(rows(l).first().getByRole("button", { name: /More actions/ })).toBeVisible();

  // 3.3 Selecting an earlier version shows it read-only with what changed since.
  await rows(l).nth(1).locator("button.doc-open").click();
  const view = page.getByTestId("version-view");
  await expect(view).toBeVisible();
  await expect(view.getByRole("status")).toContainText("Viewing the version from");
  await expect(view.getByRole("status")).toContainText("Since then: 2 words added, 1 removed.");
  const text = page.getByRole("textbox", { name: "Version text" });
  await expect(text).toHaveAttribute("contenteditable", "false");
  await expect(text.locator('ins[data-id="diff"]')).toContainText("Beta two.");
  await expect(text.locator('del[data-id="diff"]')).toContainText("Gamma.");
  await expect(page.locator(".canvas")).toHaveClass(/viewing/);
  await page.screenshot({ path: test.info().outputPath("version-diff.png") });

  // At 800 × 600 the panel lies over the page and every banner action stays clear of it.
  const size = await page.evaluate(() => [window.innerWidth, window.innerHeight]);
  await resize(l, 800, 600);
  await expect(panel(l)).toBeVisible();
  const edge = (await panel(l).boundingBox())!.x;
  for (const name of ["Restore this version", "Make a copy", "Back to current"]) {
    const box = (await view.getByRole("button", { name }).boundingBox())!;
    expect(box.x + box.width).toBeLessThanOrEqual(edge);
  }
  await expect(page.getByTestId("save-state")).toHaveText("Saved to this computer");
  await page.screenshot({ path: test.info().outputPath("version-diff-800.png") });
  await resize(l, size[0]!, size[1]!);
  await rows(l).nth(1).locator("button.doc-open").focus();

  // Esc goes back to the current text, then closes the panel.
  await page.keyboard.press("Escape");
  await expect(view).toBeHidden();
  await expect(editor(page)).toHaveText("Alpha one. Beta two.");
  await page.getByRole("button", { name: "Close version history" }).focus();
  await page.keyboard.press("Escape");
  await expect(panel(l)).toBeHidden();

  // 3.4 Name a version; filter to named ones; the name is a Git tag.
  await page.keyboard.press("Control+Alt+Shift+H");
  await expect(panel(l)).toBeVisible();
  await expect.poll(() => rows(l).count()).toBeGreaterThanOrEqual(2);
  await rowAction(l, 1, "Name this version");
  const name = page.getByRole("textbox", { name: "Version name" });
  await expect(name).toBeFocused();
  await name.fill("First draft");
  await name.press("Enter");
  await expect(rows(l).nth(1)).toContainText("First draft");
  expect(git(l.dirs, ["tag", "-l", "pdoc/*"]).trim().split("\n")).toHaveLength(1);
  await panel(l).getByRole("checkbox", { name: "Only named versions" }).check();
  await expect(rows(l)).toHaveCount(1);
  await expect(rows(l).first()).toContainText("First draft");
  await page.screenshot({ path: test.info().outputPath("named-only.png") });
  await panel(l).getByRole("checkbox", { name: "Only named versions" }).uncheck();
  const before = await rows(l).count();

  // 3.5 Restore: the old text comes back as a new version; nothing is lost.
  await rows(l).nth(1).locator("button.doc-open").click();
  await expect(page.getByTestId("version-view")).toContainText("(First draft)");
  await page.getByTestId("version-view").getByRole("button", { name: "Restore this version" }).click();
  const dialog = page.getByRole("dialog", { name: /^Restore the version from/ });
  await expect(dialog).toContainText("The current version stays in history.");
  await dialog.getByRole("button", { name: "Restore" }).click();
  await expect(page.getByText(/^Restored the version from/)).toBeVisible();
  await expect(page.getByTestId("version-view")).toBeHidden();
  await expect(editor(page)).toHaveText("Alpha one. Gamma.");
  await expect(rows(l)).toHaveCount(before + 1);
  expect(subjects(l.dirs)[0]).toMatch(/^Restore \d{4}-\d\d-\d\d \d\d:\d\d$/);
  expect(diskText(l.dirs)).toContain("Gamma.");
  expect(git(l.dirs, ["log", "--format=%s"])).toContain("Edit Plan");

  // Editing works again after a restore.
  await page.keyboard.press("End");
  await page.keyboard.type(" Omega.");
  await expect.poll(() => diskText(l.dirs), PROMPTLY).toContain("Omega.");

  // 3.6 Make a copy from a version: a new document, the original untouched.
  const draft = rows(l).filter({ hasText: "First draft" });
  await draft.getByRole("button", { name: /^More actions for/ }).click();
  await page.getByRole("menuitem", { name: "Make a copy" }).click();
  await expect(page.getByText(/^Made "Copy of Plan" from the version of/)).toBeVisible();
  await expect.poll(() => filesIn(l.dirs, "private").map((f) => f.doc.title).sort(), PROMPTLY).toEqual(["Copy of Plan", "Plan"]);
  await page.getByRole("button", { name: "Open", exact: true }).click();
  await expect(page.locator("#doc-title")).toHaveValue("Copy of Plan");
  expect(subjects(l.dirs).some((s) => /^Copy Plan from \d{4}-/.test(s))).toBe(true);
  await quit(l);
});

test("3.2 without Git, history says how to get versions", async () => {
  const pathKey = Object.keys(process.env).find((k) => k.toUpperCase() === "PATH") ?? "PATH";
  const root = process.env.SystemRoot ?? "C:\\Windows";
  const l = await launch({ env: { ...CADENCE, [pathKey]: `${join(root, "System32")};${root}` } });
  await l.page.keyboard.press("Control+Alt+Shift+H");
  await expect(panel(l)).toBeVisible();
  await expect(panel(l)).toContainText("Install Git to keep versions.");
  await expect(panel(l).getByTestId("version-row")).toHaveCount(0);
  await quit(l);
});
