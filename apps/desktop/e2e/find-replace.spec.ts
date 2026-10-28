import { editor, expect, launch, quit, test } from "./helpers.ts";

test("1.5 find counts with match case, whole words and regular expressions; replace one and all", async () => {
  const l = await launch();
  const { page } = l;
  const ed = editor(page);
  await page.keyboard.type("Cat cat category CAT. dog-cat");

  await page.keyboard.press("Control+f");
  const query = page.locator("#find-query");
  await expect(query).toBeFocused();
  await page.keyboard.type("cat");
  const status = page.getByRole("search").getByRole("status");
  await expect(status).toHaveText(/of 5$/);
  await expect(ed.locator(".pd-match")).toHaveCount(5);

  const toggle = (name: string) => page.getByRole("button", { name, exact: true }).click();
  await toggle("Match case");
  await expect(status).toHaveText(/of 3$/);
  await toggle("Whole words");
  await expect(status).toHaveText(/of 2$/);
  await toggle("Match case");
  await expect(status).toHaveText(/of 4$/);
  await toggle("Whole words");
  await toggle("Regular expressions");
  await query.fill("ca(t|r)egory|dog");
  await expect(status).toHaveText(/of 2$/);
  await query.fill("(");
  await expect(query).toHaveAttribute("aria-invalid", "true");
  await toggle("Regular expressions");
  await query.fill("nothing here");
  await expect(status).toHaveText("No results");

  // Replace: whole words, any case.
  await page.keyboard.press("Control+h");
  await query.fill("cat");
  await toggle("Whole words");
  await expect(status).toHaveText(/of 4$/);
  await query.press("Enter");
  await page.locator("#find-replace").fill("bird");
  await page.getByRole("button", { name: "Replace", exact: true }).click();
  await expect(status).toHaveText(/of 3$/);
  await expect(ed).toContainText("bird");
  await page.getByRole("button", { name: "Replace all" }).click();
  await expect(page.getByText("Replaced 3 matches")).toBeVisible();
  await expect(ed).toHaveText("bird bird category bird. dog-bird");

  // Esc closes the bar and the page has the keyboard again; Ctrl+Z undoes the replace-all in one step.
  await page.keyboard.press("Escape");
  await expect(page.getByRole("search")).toBeHidden();
  await expect(ed).toBeFocused();
  await page.keyboard.press("Control+z");
  await expect(ed).toHaveText(/^\w+ \w+ category \w+\. dog-\w+$/);
  await expect(ed).toContainText("cat");
  await quit(l);
});
