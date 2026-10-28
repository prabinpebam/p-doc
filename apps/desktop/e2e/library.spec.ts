import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { editor, expect, filesIn, launch, PROMPTLY, quit, test, type Launched } from "./helpers.ts";

const titles = (l: Launched, space: "private" | "public", folder = "docs") => filesIn(l.dirs, space, folder).map((f) => f.doc.title).sort();

test("1.7 the library: Private and Public, search, rename, copy, Bin and restore, Move to Public with a warning", async () => {
  const l = await launch();
  const { page } = l;
  const title = page.locator("#doc-title");
  const name = async (t: string) => {
    await title.fill(t);
    await title.press("Enter");
  };
  await name("Alpha notes");
  await page.keyboard.type("Alpha text");
  await page.keyboard.press("Control+n");
  await expect(title).toHaveValue("Untitled document");
  await expect(editor(page)).toBeFocused();
  await name("Beta plan");
  await page.keyboard.type("Beta text");
  await expect.poll(() => titles(l, "private"), PROMPTLY).toEqual(["Alpha notes", "Beta plan"]);

  await page.keyboard.press("Control+o");
  const search = page.locator("#library-search");
  await expect(search).toBeFocused();
  const priv = page.getByRole("list", { name: /Private/ });
  await expect(priv.locator(".doc-title")).toHaveText(["Beta plan", "Alpha notes"]);
  await expect(page.getByText("Nothing public.", { exact: false })).toBeVisible();

  await search.fill("alp");
  await expect(priv.locator(".doc-title")).toHaveText(["Alpha notes"]);
  await search.fill("zzz");
  await expect(page.getByText("No documents match.").first()).toBeVisible();
  await search.fill("");

  // Open from the list.
  await priv.getByRole("button", { name: /^Alpha notes/ }).click();
  await expect(title).toHaveValue("Alpha notes");
  await expect(editor(page)).toHaveText("Alpha text");

  const act = async (doc: string, action: string) => {
    await page.getByRole("button", { name: `More actions for ${doc}` }).click();
    await page.getByRole("menuitem", { name: action }).click();
  };

  // Rename from the row: the title changes, the file name does not.
  const before = filesIn(l.dirs, "private").map((f) => f.name).sort();
  await act("Beta plan", "Rename");
  const rename = page.getByRole("dialog", { name: "Rename" });
  await rename.getByRole("textbox").fill("Beta final");
  await rename.getByRole("button", { name: "Rename" }).click();
  await expect(priv.locator(".doc-title")).toContainText(["Beta final"]);
  await expect.poll(() => titles(l, "private"), PROMPTLY).toEqual(["Alpha notes", "Beta final"]);
  expect(filesIn(l.dirs, "private").map((f) => f.name).sort()).toEqual(before);

  // Make a copy.
  await act("Alpha notes", "Make a copy");
  await expect(page.getByText('Made "Copy of Alpha notes"')).toBeVisible();
  await expect.poll(() => titles(l, "private"), PROMPTLY).toEqual(["Alpha notes", "Beta final", "Copy of Alpha notes"]);

  // Delete goes to the Bin, and comes back.
  await act("Copy of Alpha notes", "Delete");
  await expect(page.getByText('Moved "Copy of Alpha notes" to Bin')).toBeVisible();
  await expect.poll(() => titles(l, "private", ".bin"), PROMPTLY).toEqual(["Copy of Alpha notes"]);
  expect(titles(l, "private")).toEqual(["Alpha notes", "Beta final"]);
  const bin = page.getByRole("button", { name: /^Bin/ });
  await expect(bin).toContainText("1");
  await bin.click();
  await page.getByRole("button", { name: "Restore Copy of Alpha notes" }).click();
  await expect(page.getByText('Restored "Copy of Alpha notes"')).toBeVisible();
  await expect.poll(() => titles(l, "private"), PROMPTLY).toEqual(["Alpha notes", "Beta final", "Copy of Alpha notes"]);
  expect(titles(l, "private", ".bin")).toEqual([]);

  // Move to Public asks first; Cancel changes nothing.
  await act("Beta final", "Move to Public");
  const warn = page.getByRole("dialog", { name: 'Make "Beta final" public?' });
  await expect(warn).toContainText("Anyone can read it");
  await warn.getByRole("button", { name: "Cancel" }).click();
  await expect(warn).toBeHidden();
  expect(titles(l, "public")).toEqual([]);
  await act("Beta final", "Move to Public");
  await warn.getByRole("button", { name: "Move to Public" }).click();
  await expect(page.getByText('"Beta final" is now in Public')).toBeVisible();
  await expect.poll(() => titles(l, "public"), PROMPTLY).toEqual(["Beta final"]);
  expect(titles(l, "private")).toEqual(["Alpha notes", "Copy of Alpha notes"]);
  await expect(page.getByRole("list", { name: /Public/ }).locator(".doc-title")).toHaveText(["Beta final"]);

  // Each space is its own Git repository with the work committed.
  for (const space of ["private", "public"]) expect(existsSync(join(l.dirs.library, space, ".git"))).toBe(true);
  expect(readdirSync(join(l.dirs.library, "public", "docs")).length).toBe(1);
  await quit(l);
});
