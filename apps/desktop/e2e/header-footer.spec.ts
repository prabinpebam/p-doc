import type { Page } from "@playwright/test";
import { expect, filesIn, launch, PROMPTLY, quit, test } from "./helpers.ts";
import { headedDocument, load, settled } from "./fixtures.ts";

const texts = (page: Page, sel: string) => page.locator(sel).allTextContents();
const savedPage = (l: Awaited<ReturnType<typeof launch>>) => (filesIn(l.dirs, "private")[0]?.doc as unknown as { page?: Record<string, unknown> })?.page;

test("2.3 headers and footers show on every page with page numbers, alignment and a different first page", async () => {
  const l = await launch();
  const { page } = l;
  await load(page, headedDocument(3));
  expect(await settled(page)).toBe(3);

  // Insert > Header and footer.
  await page.getByRole("menuitem", { name: "Insert" }).click();
  await page.getByRole("menuitem", { name: "Header and footer" }).click();
  const dialog = page.getByRole("dialog", { name: "Header and footer" });
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('input[name="hf-header"]')).toBeFocused();
  await dialog.locator('input[name="hf-header"]').fill("Quarterly report");
  await dialog.locator('select[name="hf-headerAlign"]').selectOption("right");
  const footer = dialog.locator('input[name="hf-footer"]');
  await footer.click();
  await footer.pressSequentially("Page ");
  await dialog.getByRole("button", { name: "Page number" }).click();
  await footer.pressSequentially(" of ");
  await dialog.getByRole("button", { name: "Page count" }).click();
  await expect(footer).toHaveValue("Page {page} of {pages}");
  await dialog.getByRole("button", { name: "Apply" }).click();
  await expect(dialog).toBeHidden();

  // Page 1's header and the last page's footer sit on the page; the others between the sheets.
  await expect(page.locator(".page-head")).toHaveText("Quarterly report");
  await expect.poll(() => texts(page, ".pd-sheet-head")).toEqual(["Quarterly report", "Quarterly report"]);
  await expect.poll(() => texts(page, ".pd-sheet-foot")).toEqual(["Page 1 of 3", "Page 2 of 3"]);
  await expect(page.locator(".page-foot")).toHaveText("Page 3 of 3");
  // Right-aligned header ends at the text's right edge; the centred footer is centred.
  const content = (await page.locator(".pd-content").boundingBox())!;
  const head = (await page.locator(".page-head .pd-hf-text").boundingBox())!;
  expect(Math.abs(head.x + head.width - (content.x + content.width))).toBeLessThan(2);
  const foot = (await page.locator(".page-foot .pd-hf-text").boundingBox())!;
  expect(Math.abs(foot.x + foot.width / 2 - (content.x + content.width / 2))).toBeLessThan(2);
  await page.screenshot({ path: test.info().outputPath("header-footer.png") });
  await expect.poll(() => savedPage(l)?.footer, PROMPTLY).toBe("Page {page} of {pages}");

  // Cancel keeps what was there.
  await page.locator(".page-head").dblclick();
  await expect(dialog).toBeVisible();
  await dialog.locator('input[name="hf-header"]').fill("Nope");
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(page.locator(".page-head")).toHaveText("Quarterly report");

  // Double-click a footer between pages; a different first page has its own header and footer.
  await page.locator(".pd-sheet-foot").first().dblclick();
  await expect(dialog).toBeVisible();
  await dialog.getByLabel("Different first page").check();
  await dialog.locator('input[name="hf-firstFooter"]').fill("Cover");
  await dialog.getByRole("button", { name: "Apply" }).click();
  await expect(page.locator(".page-head")).toHaveText("");
  await expect.poll(() => texts(page, ".pd-sheet-foot")).toEqual(["Cover", "Page 2 of 3"]);
  await expect.poll(() => texts(page, ".pd-sheet-head")).toEqual(["Quarterly report", "Quarterly report"]);
  await expect.poll(() => savedPage(l), PROMPTLY).toMatchObject({ header: "Quarterly report", headerAlign: "right", footerAlign: "center", differentFirstPage: true, firstHeader: "", firstFooter: "Cover" });

  // Print and PDF carry the same headers and footers on each sheet.
  const html = await page.evaluate(() => (window as unknown as { __pdoc: { printRequest(): { html: string } } }).__pdoc.printRequest().html);
  for (const t of ["Cover", "Page 2 of 3", "Page 3 of 3", "Quarterly report"]) expect(html).toContain(t);
  expect(html).not.toContain("Page 1 of 3");
  expect(html).not.toContain("{page}");
  await quit(l);
});
