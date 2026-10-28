import { editor, expect, launch, quit, test } from "./helpers.ts";

test("1.6 command search runs any command by name; shortcuts and word count are a key away", async () => {
  const l = await launch();
  const { page } = l;
  const ed = editor(page);
  await page.keyboard.type("Three short words");

  // Alt+/ finds a command by a word of its name and shows its menu path and shortcut.
  await page.keyboard.press("Alt+/");
  const palette = page.getByRole("dialog", { name: "Command search" });
  await expect(palette.getByRole("combobox", { name: "Search commands" })).toBeFocused();
  await page.keyboard.type("bulleted");
  const first = palette.getByRole("option").first();
  await expect(first).toContainText("Bulleted list");
  await expect(first).toContainText("Format › Lists");
  await expect(first).toContainText("Ctrl+Shift+8");
  await page.keyboard.press("Enter");
  await expect(palette).toBeHidden();
  await expect(ed.locator("ul li")).toHaveText("Three short words");
  await expect(ed).toBeFocused();

  // Arrow keys pick a later result; Esc closes and gives the page back the keyboard.
  await page.keyboard.press("Alt+/");
  await page.keyboard.type("zoom");
  await page.keyboard.press("ArrowDown");
  await expect(palette.getByRole("option").nth(1)).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("Escape");
  await expect(palette).toBeHidden();
  await expect(ed).toBeFocused();

  // No match says so.
  await page.keyboard.press("Alt+/");
  await page.keyboard.type("qwertyuiop");
  await expect(palette.getByText("No commands match.")).toBeVisible();
  await page.keyboard.press("Escape");

  // Ctrl+/ lists every shortcut by menu, searchable.
  await page.keyboard.press("Control+/");
  const shortcuts = page.getByRole("dialog", { name: "Keyboard shortcuts" });
  await expect(shortcuts).toBeVisible();
  await expect(shortcuts).toContainText("Bold");
  await expect(shortcuts).toContainText("Ctrl+B");
  await page.keyboard.type("justify");
  await expect(shortcuts).toContainText("Ctrl+Shift+J");
  await expect(shortcuts).not.toContainText("Ctrl+B");
  await page.keyboard.press("Escape");
  await expect(shortcuts).toBeHidden();

  // Ctrl+Shift+C counts words; the status bar agrees.
  await page.keyboard.press("Control+Shift+c");
  const count = page.getByRole("dialog", { name: "Word count" });
  await expect(count.getByTestId("count-words")).toHaveText("3");
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("word-total")).toHaveText(/^3 words$/);
  await expect(ed).toBeFocused();
  await quit(l);
});
