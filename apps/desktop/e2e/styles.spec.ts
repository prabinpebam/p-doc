import { editor, expect, filesIn, launch, PROMPTLY, quit, test } from "./helpers.ts";

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
