import { caretIn, diskText, editor, expect, filesIn, launch, PROMPTLY, quit, test, choose } from "./helpers.ts";
import { load } from "./fixtures.ts";

test("8.1 Heading 5 and 6 have distinct styles, shortcuts and commands; outline and contents follow after reopen", async () => {
  const l = await launch();
  const { page } = l;
  const ed = editor(page);
  await load(page, { type: "doc", content: [
    { type: "paragraph", content: [{ type: "text", text: "Deep five" }] },
    { type: "paragraph", content: [{ type: "text", text: "Deep six" }] },
  ] });
  await ed.locator("p").first().click();
  await page.keyboard.press("Control+Alt+5");
  await expect(ed.locator("h5")).toHaveText("Deep five");
  await expect(page.getByRole("combobox", { name: "Paragraph style", exact: true })).toHaveAttribute("data-value", "heading5");

  await ed.locator("p").click();
  await page.keyboard.press("Control+Alt+6");
  await expect(ed.locator("h6")).toHaveText("Deep six");
  await expect(page.getByRole("combobox", { name: "Paragraph style", exact: true })).toHaveAttribute("data-value", "heading6");
  await expect(ed.locator("h5")).toHaveCSS("font-weight", "700");
  await expect(ed.locator("h6")).toHaveCSS("font-style", "italic");

  for (const level of [5, 6]) {
    await page.keyboard.press("Alt+/");
    const palette = page.getByRole("dialog", { name: "Command search" });
    await palette.getByRole("combobox").fill(`Heading ${level}`);
    const option = palette.getByRole("option").first();
    await expect(option).toContainText(`Heading ${level}`);
    await expect(option).toContainText(`Ctrl+Alt+${level}`);
    await expect(option).toContainText("Format › Paragraph styles");
    await page.keyboard.press("Enter");
    await expect(ed.locator(`h${level}`).filter({ hasText: "Deep six" })).toHaveCount(1);
  }

  await expect(page.getByRole("button", { name: "Deep five", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Deep six", exact: true })).toBeVisible();

  await page.keyboard.press("Control+Home");
  await page.getByRole("menuitem", { name: "Insert", exact: true }).click();
  await page.getByRole("menuitem", { name: "Table of contents", exact: true }).click();
  await page.getByRole("menuitem", { name: "Insert", exact: true }).click();
  await page.getByRole("menuitem", { name: "Contents options…", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Contents options" });
  await choose(dialog.getByLabel("Levels"), "6");
  await dialog.getByRole("button", { name: "Apply", exact: true }).click();
  const toc = ed.locator(".pd-toc");
  await expect(toc.getByRole("link")).toHaveText(["Deep five", "Deep six"]);
  await expect.poll(() => diskText(l.dirs), PROMPTLY).toContain('"level":6');
  await page.screenshot({ path: test.info().outputPath("deep-styles-light.png") });
  await page.emulateMedia({ colorScheme: "dark" });
  await page.screenshot({ path: test.info().outputPath("deep-styles-dark.png") });
  await quit(l);

  const again = await launch({ dirs: l.dirs });
  await expect(editor(again.page).locator("h5")).toHaveText("Deep five");
  await expect(editor(again.page).locator("h6")).toHaveText("Deep six");
  await expect(editor(again.page).locator(".pd-toc a")).toHaveText(["Deep five", "Deep six"]);
  await quit(again);
});

test("1.3 a paragraph style is updated from a formatted heading, applies to every heading, and resets", async () => {
  const l = await launch();
  const { page } = l;
  const ed = editor(page);
  const styles = () => (filesIn(l.dirs, "private")[0]?.doc as unknown as { styles?: Record<string, { bold: boolean; fontSize: number }> })?.styles;

  await page.keyboard.press("Control+Alt+1");
  await page.keyboard.type("First heading");
  await page.keyboard.press("Enter");
  await page.keyboard.type("Body text");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Control+Alt+1");
  await page.keyboard.type("Second heading");
  await expect(ed.locator("h1")).toHaveCount(2);
  await expect(page.getByRole("combobox", { name: "Paragraph style" })).toHaveAttribute("data-value", "heading1");
  const second = ed.locator("h1").nth(1);
  const before = await second.evaluate((el) => Number.parseFloat(getComputedStyle(el).fontSize));

  // Format the first heading directly, then make Heading 1 match it.
  await ed.locator("h1").first().click();
  await page.keyboard.press("Home");
  await page.keyboard.press("Shift+End");
  await page.keyboard.press("Control+b");
  await page.keyboard.press("Control+]");
  await page.keyboard.press("Control+]");
  await page.getByRole("menuitem", { name: "Format" }).click();
  await page.getByRole("menuitem", { name: /^Paragraph styles/ }).click();
  await page.getByRole("menuitem", { name: /^Update Heading 1 to match/ }).click();
  await expect(page.getByText("Updated Heading 1 to match")).toBeVisible();

  await expect.poll(() => styles()?.heading1?.bold, PROMPTLY).toBe(true);
  const size = styles()!.heading1!.fontSize;
  expect(size).toBeGreaterThan(20);
  // The other heading follows the style, with no direct formatting of its own.
  await expect.poll(() => second.evaluate((el) => getComputedStyle(el).fontWeight)).toBe("700");
  await expect.poll(() => second.evaluate((el) => Number.parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThan(before);
  await expect(second.locator("strong")).toHaveCount(0);
  await expect(ed.locator("h1").first().locator("strong")).toHaveCount(0);

  // Reset brings the defaults back.
  await page.keyboard.press("Alt+/");
  await page.keyboard.type("reset styles");
  await page.keyboard.press("Enter");
  await expect(page.getByText("Styles reset")).toBeVisible();
  await expect.poll(() => styles()?.heading1?.bold, PROMPTLY).toBe(false);
  await expect.poll(() => second.evaluate((el) => Number.parseFloat(getComputedStyle(el).fontSize))).toBeCloseTo(before, 0);
  await quit(l);
});

type SavedStyles = Record<string, { name?: string; fontSize: number; bold: boolean; fontFamily: string; next?: string }>;
const savedDocs = (dirs: Parameters<typeof filesIn>[0]) => filesIn(dirs, "private").map((f) => f.doc as unknown as { id: string; styles: SavedStyles; content: unknown });

test("8.1 Edit styles changes a style at once with Undo, makes, follows, renames and deletes an own style, and keeps defaults for new documents", async () => {
  const l = await launch();
  const { page } = l;
  const ed = editor(page);
  await load(page, { type: "doc", content: [
    { type: "heading", attrs: { level: 1 }, content: [{ type: "text", text: "Big idea" }] },
    { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Section" }] },
    { type: "paragraph", content: [{ type: "text", text: "Plain body" }] },
  ] });
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const styles = () => savedDocs(l.dirs)[0]?.styles;
  const h1Size = () => ed.locator("h1").evaluate((el) => Number.parseFloat(getComputedStyle(el).fontSize));
  const before = await h1Size();

  const openStyles = async () => {
    await page.getByRole("menuitem", { name: "Format", exact: true }).click();
    await page.getByRole("menuitem", { name: /^Paragraph styles/ }).click();
    await page.getByRole("menuitem", { name: /^Edit styles/ }).click();
    return page.getByRole("dialog", { name: "Styles" });
  };
  let dialog = await openStyles();
  const list = dialog.getByRole("listbox", { name: "Styles" });
  await expect(list.getByRole("option")).toHaveCount(11);

  // A built-in style: the page changes while the dialog is open.
  await choose(list, { label: "Heading 1" });
  await dialog.locator('input[name="style-size"]').fill("30");
  await dialog.getByLabel("Bold").check();
  await expect.poll(h1Size).toBeCloseTo(40, 0);
  await expect(ed.locator("h1")).toHaveCSS("font-weight", "700");
  await expect.poll(() => styles()?.heading1?.fontSize, PROMPTLY).toBe(30);

  // An own style, started from Normal text.
  await dialog.getByRole("button", { name: "New style…" }).click();
  await dialog.locator('input[name="style-new-name"]').fill("Heading 2");
  await expect(dialog.getByText("A style with this name already exists.")).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Create" })).toBeVisible();
  await dialog.locator('input[name="style-new-name"]').fill("Callout");
  await choose(dialog.locator('[role=combobox][name="style-new-from"]'), { label: "Normal text" });
  await dialog.getByRole("button", { name: "Create" }).click();
  await expect(list).toHaveAttribute("data-value", /^custom-/);
  const key = (await list.getAttribute("data-value"))!;
  await dialog.locator('input[name="style-size"]').fill("15");
  await dialog.getByLabel("Italic").check();
  await choose(dialog.locator('[role=combobox][name="style-colour"]'), { label: "Teal" });

  // Heading 2 is followed by the own style.
  await choose(list, { label: "Heading 2" });
  await choose(dialog.locator('[role=combobox][name="style-next"]'), { label: "Callout" });
  await dialog.getByRole("button", { name: "Done" }).click();
  await expect(dialog).toBeHidden();
  await expect.poll(() => styles()?.[key], PROMPTLY).toMatchObject({ name: "Callout", fontSize: 15 });
  expect(styles()?.heading2?.next).toBe(key);
  await expect(ed).toBeFocused();

  await caretIn(ed.locator("h2"));
  await page.keyboard.press("End");
  await page.keyboard.press("Enter");
  await page.keyboard.type("Note well");
  const callout = ed.locator(`p[data-style="${key}"]`);
  await expect(callout).toHaveText("Note well");
  await expect(callout).toHaveCSS("font-style", "italic");
  await expect(callout).toHaveCSS("color", "rgb(18, 133, 138)");
  await expect(page.getByRole("combobox", { name: "Paragraph style", exact: true })).toHaveAttribute("data-value", key);
  // Applied from the toolbar and found by command search.
  await caretIn(ed.locator("p", { hasText: "Plain body" }));
  await choose(page.getByRole("combobox", { name: "Paragraph style", exact: true }), { label: "Title" });
  await expect(ed.locator("p.pd-style-title")).toHaveText("Plain body");
  await choose(page.getByRole("combobox", { name: "Paragraph style", exact: true }), { label: "Callout" });
  await expect(ed.locator(`p[data-style="${key}"]`)).toHaveCount(2);
  await page.keyboard.press("Alt+/");
  const palette = page.getByRole("dialog", { name: "Command search" });
  await palette.getByRole("combobox").fill("Callout");
  await expect(palette.getByRole("option").first()).toContainText("Format › Paragraph styles");
  await page.keyboard.press("Escape");

  // Undo a style change on its own: Heading 1's edit is still there.
  dialog = await openStyles();
  await choose(list, { label: "Heading 1" });
  await dialog.locator('input[name="style-size"]').fill("12");
  await expect.poll(h1Size).toBeCloseTo(16, 0);
  await dialog.getByRole("button", { name: "Done" }).click();
  await page.keyboard.press("Control+z");
  await expect.poll(h1Size).toBeCloseTo(40, 0);
  await page.keyboard.press("Control+y");
  await expect.poll(h1Size).toBeCloseTo(16, 0);
  await page.keyboard.press("Control+z");
  await expect.poll(() => styles()?.heading1?.fontSize, PROMPTLY).toBe(30);

  // Rename, then keep these styles as defaults.
  dialog = await openStyles();
  await choose(list, { label: "Callout" });
  await dialog.locator('input[name="style-name"]').fill("Aside");
  await expect(list.getByRole("option", { name: "Aside" })).toHaveCount(1);
  await dialog.getByRole("button", { name: "Save as my default styles" }).click();
  await expect(page.getByText("New documents will use these styles.")).toBeVisible();

  // Delete: its text becomes Normal text, and Heading 2 is followed by Normal text again.
  await choose(list, { label: "Aside" });
  await dialog.getByRole("button", { name: "Delete style" }).click();
  await expect(list.getByRole("option", { name: "Aside" })).toHaveCount(0);
  await dialog.getByRole("button", { name: "Done" }).click();
  await expect(ed.locator("p[data-style]")).toHaveCount(0);
  await expect(ed.locator("p", { hasText: "Note well" })).toHaveCSS("font-style", "normal");
  await expect.poll(() => styles()?.[key], PROMPTLY).toBeUndefined();
  expect(styles()?.heading2?.next).toBe("normal");
  await page.screenshot({ path: test.info().outputPath("styles-after-delete.png") });

  // A new document starts with the saved defaults, including the own style.
  const firstId = savedDocs(l.dirs)[0]!.id;
  await page.keyboard.press("Control+n");
  await expect.poll(() => savedDocs(l.dirs).length, PROMPTLY).toBe(2);
  const fresh = savedDocs(l.dirs).find((d) => d.id !== firstId)!;
  expect(fresh.styles.heading1).toMatchObject({ fontSize: 30, bold: true });
  expect(fresh.styles[key]).toMatchObject({ name: "Aside", fontSize: 15 });
  dialog = await openStyles();
  await expect(list.getByRole("option", { name: "Aside" })).toHaveCount(1);
  await page.screenshot({ path: test.info().outputPath("styles-dialog-light.png") });
  await dialog.getByRole("button", { name: "Done" }).click();
  await page.emulateMedia({ colorScheme: "dark" });
  dialog = await openStyles();
  await choose(list, { label: "Aside" });
  await page.screenshot({ path: test.info().outputPath("styles-dialog-dark.png") });
  await dialog.getByRole("button", { name: "Done" }).click();
  expect(errors).toEqual([]);
  await quit(l);
});

test("8.2 each style set restyles the document, Undo returns, and the chosen set is kept after reopening", async () => {
  const l = await launch();
  const { page } = l;
  const ed = editor(page);
  await load(page, { type: "doc", content: [
    { type: "heading", attrs: { level: 1 }, content: [{ type: "text", text: "Report" }] },
    { type: "paragraph", content: [{ type: "text", text: "Body words" }] },
  ] });
  const family = (sel: string) => ed.locator(sel).first().evaluate((el) => getComputedStyle(el).fontFamily);
  const set = async (name: string) => {
    await page.getByRole("menuitem", { name: "Format", exact: true }).click();
    await page.getByRole("menuitem", { name: /^Style set/ }).click();
    await page.getByRole("menuitem", { name, exact: true }).click();
  };
  const sans = await family("p");
  await set("Classic");
  await expect.poll(() => family("p")).toContain("Times New Roman");
  await expect(ed.locator("h1")).toHaveCSS("font-variant-caps", "small-caps");
  await page.keyboard.press("Control+z");
  await expect.poll(() => family("p")).toBe(sans);
  await expect(ed.locator("h1")).toHaveCSS("font-variant-caps", "normal");

  await set("Modern");
  await expect(ed.locator("h1")).toHaveCSS("color", "rgb(23, 78, 166)");
  await set("Compact");
  await expect(ed.locator("h1")).not.toHaveCSS("color", "rgb(23, 78, 166)");
  const line = await ed.locator("p").first().evaluate((el) => getComputedStyle(el).lineHeight);
  await page.keyboard.press("Control+z");
  await expect(ed.locator("h1")).toHaveCSS("color", "rgb(23, 78, 166)");
  await page.keyboard.press("Control+y");
  await expect.poll(() => ed.locator("p").first().evaluate((el) => getComputedStyle(el).lineHeight)).toBe(line);
  await set("Classic");
  await expect.poll(() => diskText(l.dirs), PROMPTLY).toContain("Times New Roman");
  await quit(l);

  const again = await launch({ dirs: l.dirs });
  await expect.poll(() => editor(again.page).locator("p").first().evaluate((el) => getComputedStyle(el).fontFamily)).toContain("Times New Roman");
  // A reopened document starts a fresh history: Undo doesn't go behind the saved styles.
  await editor(again.page).locator("p").first().click();
  await again.page.keyboard.press("Control+z");
  await expect.poll(() => editor(again.page).locator("p").first().evaluate((el) => getComputedStyle(el).fontFamily)).toContain("Times New Roman");
  await quit(again);
});
