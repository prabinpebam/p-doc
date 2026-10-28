import { editor, expect, filesIn, launch, PROMPTLY, quit, test } from "./helpers.ts";

type Node = { type: string; content?: Node[]; marks?: { type: string; attrs?: Record<string, unknown> }[]; text?: string };
const types = (n: Node): string[] => [n.type, ...(n.marks ?? []).map((m) => `mark:${m.type}`), ...(n.content ?? []).flatMap(types)];

test("1.2 formatting by keys, toolbar and menus lands in the file and survives a restart", async () => {
  const l = await launch();
  const { page } = l;
  const ed = editor(page);

  // Keys: bold, bulleted list, numbered list, page break.
  await page.keyboard.press("Control+b");
  await page.keyboard.type("Bold start");
  await page.keyboard.press("Control+b");
  await page.keyboard.type(" plain");
  await expect(ed.locator("strong")).toHaveText("Bold start");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Control+Shift+8");
  await page.keyboard.type("First bullet");
  await expect(ed.locator("ul li")).toHaveText("First bullet");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Control+Shift+7");
  await page.keyboard.type("First number");
  await expect(ed.locator("ol li")).toHaveText("First number");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Control+Enter");
  await expect(ed.locator(".pd-page-break")).toHaveCount(1);

  // Toolbar: italic, a table from the grid.
  await page.getByRole("button", { name: "Italic (Ctrl+I)" }).click();
  await page.keyboard.type("Leaning words");
  await expect(ed.locator("em")).toHaveText("Leaning words");
  await expect(page.getByRole("button", { name: "Italic (Ctrl+I)" })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Insert table" }).click();
  await page.getByRole("gridcell", { name: "2 by 3" }).click();
  await expect(ed.locator("table tr")).toHaveCount(2);
  await expect(ed.locator("table tr").first().locator("td")).toHaveCount(3);
  await page.keyboard.type("Cell one");
  await expect(ed.locator("table td").first()).toHaveText("Cell one");

  // Menus: a horizontal line after the table, then a link from the dialog.
  await page.keyboard.press("Control+End");
  await page.getByRole("menuitem", { name: "Insert" }).click();
  await page.getByRole("menuitem", { name: /^Horizontal line/ }).click();
  await expect(ed.locator("hr")).toHaveCount(1);
  await page.keyboard.type("See the site");
  await page.keyboard.press("Shift+Home");
  await page.keyboard.press("Control+k");
  const dialog = page.getByRole("dialog", { name: /link/i });
  await expect(dialog).toBeVisible();
  await page.keyboard.type("example.com");
  await page.keyboard.press("Enter");
  await expect(dialog).toBeHidden();
  await expect(ed.locator("a")).toHaveAttribute("href", /example\.com/);

  // Every structure is in the saved file.
  const want = ["mark:bold", "mark:italic", "bulletList", "orderedList", "pageBreak", "table", "horizontalRule", "mark:link"];
  await expect.poll(() => types(filesIn(l.dirs, "private")[0]?.doc.content as Node ?? { type: "none" }), PROMPTLY).toEqual(expect.arrayContaining(want));
  await quit(l);

  const again = await launch({ dirs: l.dirs });
  const ed2 = editor(again.page);
  await expect(ed2.locator("strong")).toHaveText("Bold start");
  await expect(ed2.locator("em")).toHaveText("Leaning words");
  await expect(ed2.locator("ul li")).toHaveText("First bullet");
  await expect(ed2.locator("ol li")).toHaveText("First number");
  await expect(ed2.locator(".pd-page-break")).toHaveCount(1);
  await expect(ed2.locator("table td").first()).toHaveText("Cell one");
  await expect(ed2.locator("hr")).toHaveCount(1);
  await expect(ed2.locator("a")).toHaveText("See the site");
  await quit(again);
});
