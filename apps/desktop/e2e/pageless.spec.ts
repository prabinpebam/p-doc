import { mkdtempSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, filesIn, launch, PROMPTLY, quit, test } from "./helpers.ts";
import { load, longDocument, settled } from "./fixtures.ts";

const pageWidth = async (page: import("@playwright/test").Page) => (await page.getByTestId("page").boundingBox())!.width;

test("2.2 Pageless shows one long sheet at a chosen width and keeps headers and page breaks for Pages", async () => {
  const saveDir = mkdtempSync(join(tmpdir(), "pdoc-pdf-"));
  const l = await launch({ env: { PDOC_SAVE_DIR: saveDir } });
  const { page } = l;
  await load(page, longDocument());
  const pages = await settled(page);
  await page.evaluate(() => (window as unknown as { __pdoc: { getEditor(): { commands: { focus(p: string): void } } } }).__pdoc.getEditor().commands.focus("start"));
  await page.getByRole("menuitem", { name: "Insert" }).click();
  await page.getByRole("menuitem", { name: "Header and footer" }).click();
  await page.locator('input[name="hf-header"]').fill("Field guide");
  await page.getByRole("button", { name: "Apply" }).click();
  await expect(page.locator(".page-head")).toHaveText("Field guide");

  // Text width only applies without pages.
  await page.getByRole("menuitem", { name: "View" }).click();
  await page.getByRole("menuitem", { name: "Text width" }).click();
  await expect(page.getByRole("menuitemcheckbox", { name: /^Narrow/ })).toBeDisabled();
  // Esc closes the submenu (it holds nothing to choose, so focus stayed on Text width), then the menu.
  await page.keyboard.press("Escape");
  await expect(page.getByRole("menuitem", { name: "Text width" })).toHaveAttribute("aria-expanded", "false");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("menuitem", { name: "View" })).toHaveAttribute("aria-expanded", "false");

  // View > Pageless: no sheets, headers, page numbers or page count.
  await page.getByRole("menuitem", { name: "View" }).click();
  await page.screenshot({ path: test.info().outputPath("dbg-view.png") });
  await page.getByRole("menuitemcheckbox", { name: "Pageless" }).click();
  const art = page.getByTestId("page");
  await expect(art).toHaveClass(/pageless/);
  await expect(art).not.toHaveAttribute("data-pages", /.*/);
  await expect(page.locator(".pd-sheet-break")).toHaveCount(0);
  await expect(page.locator(".pd-hf")).toHaveCount(0);
  await expect(page.getByTestId("page-indicator")).toHaveCount(0);
  // The manual page break shows as a marker, ready for Pages and print.
  await expect(page.locator(".pd-content .pd-page-break")).toBeVisible();
  await expect.poll(() => (filesIn(l.dirs, "private")[0]?.doc as unknown as { page: { mode: string; header: string } }).page, PROMPTLY).toMatchObject({ mode: "pageless", header: "Field guide" });

  // Text width: Narrow is 640 px of text plus half an inch either side; Full fills the window.
  for (const [name, width] of [["Narrow", 640 + 96], ["Medium", 800 + 96]] as const) {
    await page.getByRole("menuitem", { name: "View" }).click();
    await page.getByRole("menuitem", { name: "Text width" }).click();
    await page.getByRole("menuitemcheckbox", { name: new RegExp(`^${name}`) }).click();
    await expect.poll(() => pageWidth(page)).toBeCloseTo(width, 0);
  }
  await page.screenshot({ path: test.info().outputPath("pageless-wide.png") });
  await page.getByRole("menuitem", { name: "View" }).click();
  await page.getByRole("menuitem", { name: "Text width" }).click();
  await page.getByRole("menuitemcheckbox", { name: "Full width" }).click();
  const canvas = (await page.locator(".page-scroll").boundingBox())!;
  await expect.poll(() => pageWidth(page)).toBeGreaterThan(canvas.width - 80);
  await expect.poll(() => (filesIn(l.dirs, "private")[0]?.doc as unknown as { page: { textWidth: string } }).page.textWidth, PROMPTLY).toBe("full");

  // The PDF of a pageless document is plain flowing text: no header.
  const html = await page.evaluate(() => (window as unknown as { __pdoc: { printRequest(): { html: string } } }).__pdoc.printRequest().html);
  expect(html).toContain("print-flow");
  expect(html).not.toContain("Field guide");
  await page.getByRole("menuitem", { name: "File" }).click();
  await page.getByRole("menuitem", { name: /^Download/ }).click();
  await page.getByRole("menuitem", { name: /^PDF document/ }).click();
  await expect(page.getByText(/^Saved Untitled document\.pdf · \d+ pages?$/)).toBeVisible({ timeout: 20_000 });
  expect(readdirSync(saveDir).some((n) => n.endsWith(".pdf"))).toBe(true);

  // Back to Pages: the same sheets and header return.
  await page.getByRole("menuitem", { name: "View" }).click();
  await page.getByRole("menuitemcheckbox", { name: "Pages", exact: true }).click();
  await expect(art).toHaveClass(/paged/);
  expect(await settled(page)).toBe(pages);
  await expect(page.locator(".page-head")).toHaveText("Field guide");
  await quit(l);
});
