import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Page } from "@playwright/test";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { diskText, editor, expect, launch, PROMPTLY, quit, test } from "./helpers.ts";
import { zipText } from "./fixtures.ts";

async function menu(page: Page, top: string, ...path: RegExp[]): Promise<void> {
  await page.getByRole("menuitem", { name: top, exact: true }).click();
  for (const item of path) await page.getByRole("menuitem", { name: item }).click();
}

test("12.4 equations from LaTeX: Alt+= inline and on their own line, $…$ typed, a readable mistake, edit by click; Word, web page, Markdown and PDF", async () => {
  const saveDir = mkdtempSync(join(tmpdir(), "pdoc-equations-"));
  const l = await launch({ env: { PDOC_SAVE_DIR: saveDir } });
  const { page, dirs } = l;
  await page.locator("#doc-title").fill("Maths");
  await page.keyboard.press("Enter");
  await editor(page).click();
  await page.keyboard.type("Area is ");

  // Alt+= in a line of text: an inline equation. A mistake says why and keeps the source.
  await page.keyboard.press("Alt+=");
  const dlg = page.getByRole("dialog", { name: "Equation" });
  await expect(dlg).toBeVisible();
  const field = dlg.getByRole("textbox", { name: "LaTeX" });
  await field.fill("\\frac{a");
  await expect(dlg.getByRole("alert")).toContainText("Can't read this:");
  await field.press("Enter");
  await expect(dlg).toBeVisible();
  await expect(field).toHaveValue("\\frac{a");
  await field.fill("\\frac{a}{b}");
  await expect(dlg.getByRole("alert")).toHaveCount(0);
  await expect(dlg.getByTestId("equation-preview").locator("math mfrac")).toHaveCount(1);
  await field.press("Enter");
  await expect(dlg).toBeHidden();
  const first = editor(page).locator("p .pd-math").first();
  await expect(first.locator("math mfrac")).toHaveCount(1);
  await page.keyboard.press("End");
  await page.keyboard.type(" here.");
  await expect(editor(page).locator("p").first()).toContainText("here.");

  // On an empty line: a display equation, centred on its own line.
  await page.keyboard.press("Enter");
  await page.keyboard.press("Alt+=");
  await dlg.getByRole("textbox", { name: "LaTeX" }).fill("\\sum_{k=1}^{n} k^2");
  await dlg.getByRole("textbox", { name: "LaTeX" }).press("Enter");
  const block = editor(page).locator(".pd-math-block");
  await expect(block).toHaveCount(1);
  await expect(block.locator('math[display="block"] munderover')).toHaveCount(1);

  // Typing $…$ makes an inline equation; a price stays text.
  await page.keyboard.press("Control+End");
  await page.keyboard.type("Growth $e^x$ costs $5 or $6.");
  await expect(editor(page).locator("p", { hasText: "Growth" }).locator(".pd-math math msup")).toHaveCount(1);
  await expect(editor(page).locator("p", { hasText: "Growth" })).toContainText("costs $5 or $6.");

  // A click on an equation edits it again.
  await first.click();
  await expect(dlg).toBeVisible();
  await expect(dlg.getByRole("textbox", { name: "LaTeX" })).toHaveValue("\\frac{a}{b}");
  await dlg.getByRole("textbox", { name: "LaTeX" }).fill("\\frac{c}{d}");
  await dlg.getByRole("button", { name: "Apply" }).click();
  await expect(dlg).toBeHidden();
  await expect.poll(() => diskText(dirs), PROMPTLY).toContain('"latex":"\\\\frac{c}{d}"');
  expect(diskText(dirs)).toContain('"type":"mathBlock"');

  // Word: three of Word's own equations. Web page: MathML. Markdown: $…$ and $$…$$.
  await menu(page, "File", /^Download/, /^Microsoft Word/);
  await expect(page.getByText(/^Saved Maths\.docx/)).toBeVisible({ timeout: 20_000 });
  const xml = zipText(readFileSync(join(saveDir, "Maths.docx")), "word/document.xml");
  expect(xml.match(/<m:oMath>/g)?.length).toBe(3);
  expect(xml).toContain("<m:f>");
  expect(xml).toContain("<m:nary>");
  await menu(page, "File", /^Download/, /^Web page/);
  await expect(page.getByText(/^Saved Maths\.html/)).toBeVisible({ timeout: 20_000 });
  const html = readFileSync(join(saveDir, "Maths.html"), "utf8");
  expect(html.match(/<math/g)?.length).toBe(3);
  await menu(page, "File", /^Download/, /^Markdown/);
  await expect(page.getByText(/^Saved Maths\.md/)).toBeVisible({ timeout: 20_000 });
  const md = readFileSync(join(saveDir, "Maths.md"), "utf8");
  expect(md).toContain("Area is $\\frac{c}{d}$ here.");
  expect(md).toContain("$$\n\\sum_{k=1}^{n} k^2\n$$");
  expect(md).toContain("costs \\$5 or \\$6.");

  // The PDF draws the maths: the words around it and the equation's letters are on the page.
  await menu(page, "File", /^Download/, /^PDF document/);
  await expect(page.getByText(/^Saved Maths\.pdf/)).toBeVisible({ timeout: 20_000 });
  const task = getDocument({ data: new Uint8Array(readFileSync(join(saveDir, "Maths.pdf"))), useSystemFonts: false });
  const pdf = await task.promise;
  const text = (await (await pdf.getPage(1)).getTextContent()).items.map((it) => ("str" in it ? it.str : "")).join(" ");
  expect(text).toMatch(/Area is/);
  expect(text).toMatch(/∑/);
  await task.destroy();
  await quit(l);
});
