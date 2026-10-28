import { editor, expect, filesIn, launch, PROMPTLY, quit, test } from "./helpers.ts";

const headings = (c: unknown): string[] =>
  ((c as { content?: { type: string; content?: { text?: string }[] }[] })?.content ?? []).filter((b) => b.type === "heading").map((b) => (b.content ?? []).map((t) => t.text ?? "").join(""));

test("1.4 the outline lists headings, jumps, collapses, and moves a section with its body", async () => {
  const l = await launch();
  const { page } = l;
  const ed = editor(page);
  const heading = async (level: number, text: string, body?: string) => {
    await page.keyboard.press(`Control+Alt+${level}`);
    await page.keyboard.type(text);
    await page.keyboard.press("Enter");
    if (body) {
      await page.keyboard.type(body);
      await page.keyboard.press("Enter");
    }
  };
  await heading(1, "Alpha", "Alpha body");
  await heading(1, "Beta", "Beta body");
  await heading(2, "Beta child", "Child body");

  const outline = page.getByRole("list", { name: "Outline" });
  await expect(page.getByRole("tab", { name: "Outline" })).toHaveAttribute("aria-selected", "true");
  const rows = outline.locator(".outline-text");
  await expect(rows).toHaveText(["Alpha", "Beta", "Beta child"]);

  // Jump: the cursor goes to the heading and the row shows where you are.
  await outline.getByRole("button", { name: "Alpha" }).click();
  await expect(outline.locator('[aria-current="location"] .outline-text')).toHaveText("Alpha");
  await page.keyboard.type("!");
  await expect(ed.locator("h1").first()).toHaveText(/Alpha!|!Alpha/);
  await page.keyboard.press("Backspace");

  // Collapse hides the children, expand brings them back.
  await outline.getByRole("button", { name: "Collapse Beta" }).click();
  await expect(rows).toHaveText(["Alpha", "Beta"]);
  await outline.getByRole("button", { name: "Expand Beta" }).click();
  await expect(rows).toHaveText(["Alpha", "Beta", "Beta child"]);

  // Alt+Shift+Up moves Beta, with its body and child, above Alpha.
  await outline.getByRole("button", { name: "Beta", exact: true }).focus();
  await page.keyboard.press("Alt+Shift+ArrowUp");
  await expect(rows).toHaveText(["Beta", "Beta child", "Alpha"]);
  // The section is everything up to the next heading of its level, so the empty last paragraph goes with it.
  await expect(ed.locator("h1, h2, p")).toHaveText(["Beta", "Beta body", "Beta child", "Child body", "", "Alpha", "Alpha body"]);
  await expect.poll(() => headings(filesIn(l.dirs, "private")[0]?.doc.content), PROMPTLY).toEqual(["Beta", "Beta child", "Alpha"]);

  // Undo puts it back in one step.
  await page.keyboard.press("Control+z");
  await expect(rows).toHaveText(["Alpha", "Beta", "Beta child"]);
  await quit(l);
});
