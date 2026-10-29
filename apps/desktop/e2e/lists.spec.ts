import { caretIn, editor, expect, filesIn, launch, PROMPTLY, quit, test } from "./helpers.ts";
import { load } from "./fixtures.ts";

const item = (text: string) => ({ type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text }] }] });
type Saved = { content: { content: { type: string; attrs?: Record<string, unknown> }[] } };
const savedBlocks = (dirs: Parameters<typeof filesIn>[0]) => (filesIn(dirs, "private")[0]?.doc as unknown as Saved | undefined)?.content.content ?? [];

test("8.3 list options set each level's format and start; restart and continue numbering; nine levels; kept after reopening", async () => {
  const l = await launch();
  const { page } = l;
  const ed = editor(page);
  await load(page, { type: "doc", content: [
    { type: "orderedList", attrs: { start: 1 }, content: [item("First"), item("Second"), item("Third")] },
    { type: "paragraph", content: [{ type: "text", text: "Between the lists" }] },
    { type: "orderedList", attrs: { start: 1 }, content: [item("Later one"), item("Later two")] },
    { type: "bulletList", content: [item("Bullet")] },
  ] });
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const lists = async (label: string) => {
    await page.getByRole("menuitem", { name: "Format", exact: true }).click();
    await page.getByRole("menuitem", { name: /^Lists/ }).click();
    await page.getByRole("menuitem", { name: label, exact: true }).click();
  };
  const p = (text: string) => ed.locator("li > p", { hasText: text });
  const first = ed.locator("ol").first();

  // Level 1 as a, b, c from 3; Undo returns, Redo applies again.
  await caretIn(p("First"));
  await lists("List options…");
  let dialog = page.getByRole("dialog", { name: "List options" });
  await dialog.locator('select[name="list-format-1"]').selectOption({ label: "a, b, c" });
  await dialog.locator('input[name="list-start-1"]').fill("abc");
  await expect(dialog.getByText("Enter a whole number from 0 to 32767.")).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Apply" })).toBeDisabled();
  await dialog.locator('input[name="list-start-1"]').fill("3");
  await dialog.getByRole("button", { name: "Apply" }).click();
  await expect(dialog).toBeHidden();
  await expect(first).toHaveCSS("list-style-type", "lower-alpha");
  await expect(first).toHaveAttribute("start", "3");
  await page.keyboard.press("Control+z");
  await expect(first).toHaveCSS("list-style-type", "decimal");
  await expect(first).not.toHaveAttribute("start", "3");
  await page.keyboard.press("Control+y");
  await expect(first).toHaveCSS("list-style-type", "lower-alpha");

  // Restart numbering at the second item splits the list there and counts from 1.
  await caretIn(p("Second"));
  await lists("Restart numbering");
  await expect(ed.locator("ol")).toHaveCount(3);
  await expect(ed.locator("ol").nth(1).locator("> li")).toHaveCount(2);
  await expect(ed.locator("ol").nth(1)).not.toHaveAttribute("start", /.+/);
  await expect(ed.locator("ol").nth(1)).toHaveCSS("list-style-type", "lower-alpha");

  // Continue numbering: the later list carries on from the one before it (1 + 2 items).
  await caretIn(p("Later one"));
  await lists("Continue numbering");
  await expect(ed.locator("ol").nth(2)).toHaveAttribute("start", "3");
  // Next to its list, continuing joins them again.
  await caretIn(p("Second"));
  await lists("Continue numbering");
  await expect(ed.locator("ol")).toHaveCount(2);
  await expect(first.locator("> li")).toHaveCount(3);

  // Nested levels default to 1, a, i; Tab stops at the ninth level.
  await caretIn(p("Bullet"));
  await page.keyboard.press("End");
  for (let i = 0; i < 9; i++) {
    await page.keyboard.press("Enter");
    await page.keyboard.type(`Level ${i + 2}`);
    await page.keyboard.press("Tab");
  }
  const deepest = await ed.locator("ul").evaluateAll((els) => Math.max(...els.map((el) => { let n = 0; for (let x: Element | null = el; x; x = x.parentElement?.closest("ul") ?? null) n++; return n; })));
  expect(deepest).toBe(9);
  await expect(ed.locator("ul ul").first()).toHaveCSS("list-style-type", "circle");
  await expect(ed.locator("ul ul ul").first()).toHaveCSS("list-style-type", "square");

  // List options on a bulleted list: level 2 as dashes, from command search.
  await caretIn(p("Level 2"));
  await page.keyboard.press("Alt+/");
  const palette = page.getByRole("dialog", { name: "Command search" });
  await palette.getByRole("combobox").fill("List options");
  await page.keyboard.press("Enter");
  dialog = page.getByRole("dialog", { name: "List options" });
  await expect(dialog.locator("select")).toHaveCount(9);
  await expect(dialog.locator('input[name^="list-start"]')).toHaveCount(0);
  await dialog.locator('select[name="list-format-2"]').selectOption({ label: "– Dash" });
  await page.screenshot({ path: test.info().outputPath("list-options-light.png") });
  await page.emulateMedia({ colorScheme: "dark" });
  await page.waitForTimeout(400);
  await page.screenshot({ path: test.info().outputPath("list-options-dark.png") });
  await page.emulateMedia({ colorScheme: "light" });
  await dialog.getByRole("button", { name: "Apply" }).click();
  await expect(ed.locator("ul ul").first()).toHaveAttribute("data-format", "dash");

  await expect.poll(() => savedBlocks(l.dirs)[0]?.attrs, PROMPTLY).toMatchObject({ start: 3, listFormat: "lower-alpha" });
  expect(errors).toEqual([]);
  await quit(l);

  const again = await launch({ dirs: l.dirs });
  const ed2 = editor(again.page);
  await expect(ed2.locator("ol").first()).toHaveCSS("list-style-type", "lower-alpha");
  await expect(ed2.locator("ol").first()).toHaveAttribute("start", "3");
  await expect(ed2.locator("ul ul").first()).toHaveAttribute("data-format", "dash");
  await quit(again);
});
