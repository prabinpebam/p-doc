import { diskText, editor, expect, filesIn, launch, PROMPTLY, quit, test } from "./helpers.ts";
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
  await expect(page.getByRole("combobox", { name: "Paragraph style", exact: true })).toHaveValue("heading5");

  await ed.locator("p").click();
  await page.keyboard.press("Control+Alt+6");
  await expect(ed.locator("h6")).toHaveText("Deep six");
  await expect(page.getByRole("combobox", { name: "Paragraph style", exact: true })).toHaveValue("heading6");
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
  await dialog.getByLabel("Levels").selectOption("6");
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
  await expect(page.getByRole("combobox", { name: "Paragraph style" })).toHaveValue("heading1");
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
