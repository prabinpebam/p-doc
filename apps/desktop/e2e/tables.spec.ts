import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Locator, Page } from "@playwright/test";
import { diskText, editor, expect, launch, PROMPTLY, quit, test } from "./helpers.ts";
import { zipText } from "./fixtures.ts";

/** Opens a menu and follows its path; the last item may be a plain, check or radio item. */
async function menu(page: Page, top: string, ...path: RegExp[]): Promise<void> {
  await page.getByRole("menuitem", { name: top, exact: true }).click();
  for (const item of path) await page.locator('[role^="menuitem"]').filter({ hasText: item }).first().click();
}

/** Selects the cells from one to another by dragging, as a person does. */
async function dragCells(page: Page, from: Locator, to: Locator): Promise<void> {
  const a = (await from.boundingBox())!;
  const b = (await to.boundingBox())!;
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 5 });
  await page.mouse.up();
}

const widths = (page: Page) => editor(page).locator("table colgroup col").evaluateAll((cols) => cols.map((c) => Math.round(c.getBoundingClientRect().width)));

test("12.1 tables: merge and split, a header row, drag and distribute widths, shading and vertical alignment, in Word and HTML", async () => {
  const saveDir = mkdtempSync(join(tmpdir(), "pdoc-tables-"));
  const l = await launch({ env: { PDOC_SAVE_DIR: saveDir } });
  const { page, dirs } = l;
  await page.locator("#doc-title").fill("Tables");
  await page.keyboard.press("Enter");
  await editor(page).click();
  await menu(page, "Insert", /^Table$/, /^4 × 4 table/);
  const table = editor(page).locator("table");
  const rows = table.locator("tr");
  await expect(rows).toHaveCount(4);
  for (const t of ["Item", "Notes", "Qty", "Price", "Pens", "Blue, fine", "12", "3.00"]) {
    await page.keyboard.type(t);
    await page.keyboard.press("Tab");
  }

  // Merge two cells of the top row, then split them again.
  await dragCells(page, rows.nth(0).locator("td").nth(1), rows.nth(0).locator("td").nth(2));
  await expect(table.locator(".selectedCell")).toHaveCount(2);
  await menu(page, "Format", /^Table$/, /^Merge cells/);
  await expect(rows.nth(0).locator("td")).toHaveCount(3);
  await expect(rows.nth(0).locator("td").nth(1)).toHaveAttribute("colspan", "2");
  await expect(rows.nth(0).locator("td").nth(1)).toContainText("Notes");
  await expect(rows.nth(0).locator("td").nth(1)).toContainText("Qty");
  await menu(page, "Format", /^Table$/, /^Split cell/);
  await expect(rows.nth(0).locator("td")).toHaveCount(4);
  await page.keyboard.press("Control+z");
  await page.keyboard.press("Control+z");
  await expect(rows.nth(0).locator("td")).toHaveCount(4);
  await expect(rows.nth(0).locator("td").nth(2)).toHaveText("Qty");

  // The top row becomes a header row (it repeats on each page; Word marks it).
  await rows.nth(0).locator("td").first().click();
  await menu(page, "Format", /^Table$/, /^Header row/);
  await expect(rows.nth(0).locator("th")).toHaveCount(4);
  await page.getByRole("menuitem", { name: "Format", exact: true }).click();
  await page.locator('[role^="menuitem"]').filter({ hasText: /^Table$/ }).click();
  await expect(page.getByRole("menuitemcheckbox", { name: /^Header row/ })).toHaveAttribute("aria-checked", "true");
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");

  // Shade the header row light blue; centre a cell's text vertically.
  await dragCells(page, rows.nth(0).locator("th").first(), rows.nth(0).locator("th").last());
  await menu(page, "Format", /^Table$/, /^Cell shading/, /^Light blue/);
  for (const i of [0, 1, 2, 3]) await expect(rows.nth(0).locator("th").nth(i)).toHaveCSS("background-color", "rgb(207, 226, 243)");
  await rows.nth(1).locator("td").nth(1).click();
  await menu(page, "Format", /^Table$/, /^Vertical alignment/, /^Middle/);
  await expect(rows.nth(1).locator("td").nth(1)).toHaveCSS("vertical-align", "middle");
  await expect.poll(() => diskText(dirs), PROMPTLY).toContain('"background":"#cfe2f3"');

  // Drag the first column's right edge 80 px wider; the others share what is left.
  const before = await widths(page);
  const first = (await rows.nth(1).locator("td").first().boundingBox())!;
  await page.mouse.move(first.x + first.width - 2, first.y + first.height / 2);
  await expect(editor(page)).toHaveClass(/resize-cursor/);
  await page.mouse.down();
  await page.mouse.move(first.x + first.width + 78, first.y + first.height / 2, { steps: 8 });
  await page.mouse.up();
  await expect.poll(async () => (await widths(page))[0]! - before[0]!).toBeGreaterThan(70);
  await expect.poll(() => diskText(dirs), PROMPTLY).toMatch(/"colwidth":\[\d+\]/);

  // Distribute: every column the same width again, as one Undo step.
  await menu(page, "Format", /^Table$/, /^Distribute columns/);
  await expect.poll(async () => new Set(await widths(page)).size).toBe(1);
  const even = (await widths(page))[0]!;
  await page.keyboard.press("Control+z");
  await expect.poll(async () => (await widths(page))[0]! - even).toBeGreaterThan(50);
  await page.keyboard.press("Control+y");
  await expect.poll(async () => new Set(await widths(page)).size).toBe(1);

  // Word: the grid and each cell's width, the shading, the vertical alignment and the header row.
  await menu(page, "File", /^Download/, /^Microsoft Word/);
  await expect(page.getByText(/^Saved Tables\.docx/)).toBeVisible({ timeout: 20_000 });
  const xml = zipText(readFileSync(join(saveDir, "Tables.docx")), "word/document.xml");
  expect(xml.match(/<w:gridCol w:w="(\d+)"\/>/g)?.length).toBe(4);
  expect(new Set(xml.match(/<w:gridCol w:w="(\d+)"\/>/g)).size).toBe(1);
  expect(xml.match(/<w:shd w:fill="CFE2F3"/g)?.length).toBe(4);
  expect(xml).toContain('<w:vAlign w:val="center"/>');
  expect(xml).toContain("<w:tblHeader/>");
  // The web page: the same widths, shading and alignment.
  await menu(page, "File", /^Download/, /^Web page/);
  await expect(page.getByText(/^Saved Tables\.html/)).toBeVisible({ timeout: 20_000 });
  const html = readFileSync(join(saveDir, "Tables.html"), "utf8");
  expect(html.match(/<col style="width: \d+px;">/g)?.length).toBe(4);
  expect(html.match(/background-color: #cfe2f3/g)?.length).toBe(4);
  expect(html).toContain("vertical-align: middle");
  await page.screenshot({ path: test.info().outputPath("tables.png") });
  await quit(l);
});
