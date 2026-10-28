import { diskText, editor, expect, filesIn, launch, PROMPTLY, quit, test } from "./helpers.ts";

test("1.1 typing is on disk within 1 s of a pause, and the save state says so", async () => {
  const l = await launch();
  const { page } = l;
  const state = page.getByTestId("save-state");
  await page.keyboard.type("The first paragraph");
  await expect(state).toHaveText("Saving…");
  const paused = Date.now();
  await expect.poll(() => diskText(l.dirs), PROMPTLY).toContain("The first paragraph");
  const ms = Date.now() - paused;
  expect(ms, `on disk ${ms} ms after the pause`).toBeLessThan(1000);
  await expect(state).toHaveText("Saved to this computer");
  const [file] = filesIn(l.dirs, "private");
  expect(file!.name).toMatch(/^[a-z0-9-]+\.pdoc\.json$/);

  // The title is the document's own; the file stays where it is.
  await page.locator("#doc-title").fill("Trip notes");
  await page.keyboard.press("Enter");
  await expect(editor(page)).toBeFocused();
  await expect.poll(() => filesIn(l.dirs, "private")[0]?.doc.title, PROMPTLY).toBe("Trip notes");
  expect(filesIn(l.dirs, "private")[0]!.name).toBe(file!.name);

  // Quit and start again: the same document opens with its text.
  await page.keyboard.press("Control+End");
  await page.keyboard.press("Enter");
  await page.keyboard.type("Typed just before quitting");
  await quit(l);
  expect(diskText(l.dirs)).toContain("Typed just before quitting");
  const again = await launch({ dirs: l.dirs });
  await expect(again.page.locator("#doc-title")).toHaveValue("Trip notes");
  await expect(editor(again.page)).toContainText("The first paragraph");
  await expect(editor(again.page)).toContainText("Typed just before quitting");
  await quit(again);
});
