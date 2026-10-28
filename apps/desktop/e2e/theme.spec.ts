import { editor, expect, launch, quit, test } from "./helpers.ts";

test("1.8 light and dark themes from Settings, saved for the next start", async ({}, info) => {
  const l = await launch();
  const { page } = l;
  await page.keyboard.press("Control+Alt+1");
  await page.keyboard.type("A heading to look at");
  await page.keyboard.press("Enter");
  await page.keyboard.type("Body text in the theme, with ");
  await page.keyboard.press("Control+b");
  await page.keyboard.type("bold");
  await page.keyboard.press("Control+b");
  await page.keyboard.type(" words.");

  const root = page.locator("html");
  const settings = async (theme: string) => {
    await page.getByRole("menuitem", { name: "File" }).click();
    await page.getByRole("menuitem", { name: "Settings" }).click();
    const dialog = page.getByRole("dialog", { name: "Settings" });
    await dialog.getByRole("radio", { name: theme }).check();
    await dialog.getByRole("button", { name: "Close" }).click();
    await expect(dialog).toBeHidden();
  };

  await settings("Light");
  await expect(root).toHaveAttribute("data-scheme", "light");
  const lightBg = await page.locator("body").evaluate((b) => getComputedStyle(b).backgroundColor);
  await page.screenshot({ path: info.outputPath("light.png") });

  await settings("Dark");
  await expect(root).toHaveAttribute("data-scheme", "dark");
  const darkBg = await page.locator("body").evaluate((b) => getComputedStyle(b).backgroundColor);
  expect(darkBg).not.toBe(lightBg);
  await page.screenshot({ path: info.outputPath("dark.png") });
  await quit(l);

  const again = await launch({ dirs: l.dirs });
  await expect(again.page.locator("html")).toHaveAttribute("data-scheme", "dark");
  await expect(editor(again.page)).toContainText("A heading to look at");
  await quit(again);
});
