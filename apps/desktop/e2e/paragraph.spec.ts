import { mkdtempSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Locator, Page } from "@playwright/test";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { load, prose, zipText } from "./fixtures.ts";
import { editor, expect, launch, quit, test, choose } from "./helpers.ts";

async function menu(page: Page, top: string, item: RegExp): Promise<void> {
  await page.getByRole("menuitem", { name: top, exact: true }).click();
  await page.getByRole("menuitem", { name: item }).click();
}

async function download(page: Page, item: RegExp, saved: string): Promise<void> {
  await page.getByRole("menuitem", { name: "File" }).click();
  await page.getByRole("menuitem", { name: /^Download/ }).click();
  await page.getByRole("menuitem", { name: item }).click();
  await expect(page.getByText(saved)).toBeVisible({ timeout: 20_000 });
}

/** A paragraph's lines as drawn: each line's left and right edge, in page pixels from the text's left edge. */
function lines(page: Page, start: string) {
  return page.evaluate((start) => {
    const art = document.querySelector<HTMLElement>("[data-testid=page]")!;
    const scale = art.getBoundingClientRect().width / parseFloat(getComputedStyle(art).getPropertyValue("--page-width"));
    const root = art.querySelector<HTMLElement>(".pd-content")!;
    const base = [...root.querySelectorAll("p")].find((p) => p.textContent === "Plain start.")!;
    const r = document.createRange();
    r.selectNodeContents(base);
    const left = r.getClientRects()[0]!.left;
    const p = [...root.querySelectorAll("p")].find((x) => x.textContent!.startsWith(start))!;
    r.selectNodeContents(p);
    // Rects on one line overlap vertically (a tab box sits a little higher than the text beside it).
    const out: { top: number; bottom: number; left: number; right: number }[] = [];
    for (const rect of [...r.getClientRects()].filter((x) => x.width).sort((a, b) => a.top - b.top)) {
      const mid = (rect.top + rect.bottom) / 2;
      const line = out.find((x) => mid >= x.top && mid <= x.bottom);
      if (line) {
        line.left = Math.min(line.left, rect.left);
        line.right = Math.max(line.right, rect.right);
        line.top = Math.min(line.top, rect.top);
        line.bottom = Math.max(line.bottom, rect.bottom);
      } else out.push({ top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right });
    }
    return out.map((x) => ({ left: (x.left - left) / scale, right: (x.right - left) / scale }));
  }, start);
}

/** The PDF's text, page by page. */
async function pdfText(file: string): Promise<string> {
  const task = getDocument({ data: new Uint8Array(readFileSync(file)), useSystemFonts: false });
  const pdf = await task.promise;
  let out = "";
  for (let i = 1; i <= pdf.numPages; i++) {
    const tc = await (await pdf.getPage(i)).getTextContent();
    out += tc.items.map((it) => ("str" in it ? it.str : "")).join("") + "\n";
  }
  await task.destroy();
  return out;
}

async function paragraphDialog(page: Page, tab: string): Promise<Locator> {
  await menu(page, "Format", /^Paragraph…/);
  const dlg = page.getByRole("dialog", { name: "Paragraph" });
  await dlg.getByRole("tab", { name: tab }).click();
  return dlg;
}

test("9.1 9.4 9.5 paragraph layout: indents, exact spacing, tab leaders, borders, shading and right to left show, print and export; non-printing characters never print", async ({}, info) => {
  const saveDir = mkdtempSync(join(tmpdir(), "pdoc-para-"));
  const l = await launch({ env: { PDOC_SAVE_DIR: saveDir } });
  const { page } = l;
  const ed = editor(page);
  await page.locator("#doc-title").fill("Layout");
  await page.keyboard.press("Enter");
  await page.keyboard.type("Plain start.");
  await page.keyboard.press("Enter");

  // A right tab with dot leaders at 5 inches: the page number ends at the stop, dots fill the gap.
  await page.keyboard.type("Introduction");
  await menu(page, "Format", /^Tabs…/);
  const tabs = page.getByRole("dialog", { name: "Paragraph" });
  await expect(tabs.getByRole("tab", { name: "Tabs" })).toHaveAttribute("aria-selected", "true");
  const cm = (await tabs.getByText("Position (cm)").count()) > 0;
  const per = cm ? 2.54 : 1;
  await tabs.locator('[name="tab-pos"]').fill(String(5 * per));
  await choose(tabs.locator('[name="tab-align"]'), "right");
  await choose(tabs.locator('[name="tab-leader"]'), "dots");
  await tabs.locator('[name="tab-pos"]').press("Enter");
  await expect(tabs.getByRole("list", { name: "Tab stops" }).getByRole("listitem")).toHaveCount(1);
  await tabs.getByRole("button", { name: "Apply" }).click();
  await page.keyboard.press("Tab");
  await page.keyboard.type("12");
  const tab = ed.locator(".pd-tab");
  await expect(tab).toHaveCount(1);
  await expect(tab).toHaveAttribute("data-leader", "dots");
  const toc = await lines(page, "Introduction");
  expect(toc).toHaveLength(1);
  expect(Math.abs(toc[0]!.right - 5 * 96), "the number ends at the right tab").toBeLessThan(3);

  // Hanging indent, right indent, space before and exact line spacing from the dialog.
  await page.keyboard.press("Enter");
  await page.keyboard.type(`Hanging ${prose(70, 3)}.`);
  let dlg = await paragraphDialog(page, "Indents and spacing");
  await dlg.locator('[name="indent-left"]').fill(String(1 * per));
  await dlg.locator('[name="indent-right"]').fill(String(0.5 * per));
  await choose(dlg.locator('[name="special"]'), "hanging");
  await dlg.locator('[name="indent-by"]').fill(String(0.5 * per));
  await dlg.locator('[name="space-before"]').fill("12");
  await choose(dlg.locator('[name="line-spacing"]'), "exact");
  await dlg.locator('[name="line-at"]').fill("18");
  await dlg.getByRole("button", { name: "Apply" }).click();
  const hang = ed.locator("p", { hasText: /^Hanging/ });
  await expect(hang).toHaveCSS("line-height", "24px");
  const shape = await lines(page, "Hanging");
  expect(shape.length).toBeGreaterThan(2);
  expect(Math.abs(shape[0]!.left - 48), "first line at 0.5 in").toBeLessThan(2);
  for (const x of shape.slice(1)) expect(Math.abs(x.left - 96), "other lines at 1 in").toBeLessThan(2);
  const width = await ed.evaluate((root) => root.getBoundingClientRect().width);
  for (const x of shape) expect(x.right, "the right indent holds").toBeLessThanOrEqual(width - 48 + 2);

  // Borders and shading; then a right-to-left paragraph.
  await page.keyboard.press("Enter");
  dlg = await paragraphDialog(page, "Indents and spacing");
  await dlg.locator('[name="indent-left"]').fill("0");
  await choose(dlg.locator('[name="special"]'), "none");
  await choose(dlg.locator('[name="line-spacing"]'), "1.15");
  await dlg.getByRole("button", { name: "Apply" }).click();
  await page.keyboard.type("Boxed note");
  dlg = await paragraphDialog(page, "Borders and direction");
  await dlg.locator('[name="border-top"]').check();
  await dlg.locator('[name="border-bottom"]').check();
  await dlg.locator('[name="shading"]').check();
  await dlg.getByRole("button", { name: "Apply" }).click();
  const boxed = ed.locator("p", { hasText: "Boxed note" });
  await expect(boxed).toHaveCSS("border-top-style", "solid");
  await expect(boxed).toHaveCSS("border-bottom-style", "solid");
  await expect(boxed).not.toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  await page.keyboard.press("Enter");
  dlg = await paragraphDialog(page, "Borders and direction");
  await dlg.locator('[name="border-top"]').uncheck();
  await dlg.locator('[name="border-bottom"]').uncheck();
  await dlg.locator('[name="shading"]').uncheck();
  await dlg.getByRole("radio", { name: "Right to left" }).check();
  await dlg.getByRole("button", { name: "Apply" }).click();
  await page.keyboard.type("שלום עולם");
  await page.keyboard.press("Shift+Enter");
  await page.keyboard.type("second line");
  const rtl = ed.locator("p", { hasText: "שלום" });
  await expect(rtl).toHaveAttribute("dir", "rtl");
  await expect(rtl).toHaveCSS("direction", "rtl");
  await expect(rtl).not.toHaveCSS("border-top-style", "solid");

  // Ctrl+Shift+P shows ¶, dots for spaces, an arrow for the tab and ↵ for the line break.
  await page.keyboard.press("Control+Shift+P");
  await expect(page.locator(".page-scroll.pd-show-marks")).toHaveCount(1);
  expect(await boxed.evaluate((p) => getComputedStyle(p, "::after").content)).toBe('"¶"');
  expect(await tab.evaluate((t) => getComputedStyle(t, "::before").content)).toBe('"→"');
  await expect(ed.locator(".pd-np-space").first()).toBeVisible();
  await expect(ed.locator(".pd-np-break")).toHaveText("↵");
  // Typing keeps the marks in step.
  await page.keyboard.type(" more");
  await expect(rtl.locator(".pd-np-space")).toHaveCount(3);
  await page.screenshot({ path: info.outputPath("marks.png") });

  // Print carries the layout and none of the marks.
  const html = await page.evaluate(() => (window as unknown as { __pdoc: { printRequest(): { html: string } } }).__pdoc.printRequest().html);
  expect(html).toContain('data-leader="dots"');
  expect(html).toMatch(/class="pd-tab"[^>]*style="width: [\d.]+px/);
  expect(html).toContain("text-indent: -0.5in");
  expect(html).toContain('dir="rtl"');
  const body = html.slice(html.indexOf("<body"));
  expect(body).not.toContain("pd-np-");
  expect(body).toContain("Plain start.");
  await download(page, /^PDF document/, "Saved Layout.pdf · 1 page");
  const pdf = await pdfText(join(saveDir, "Layout.pdf"));
  expect(pdf).toContain("Introduction");
  expect(pdf).toContain("Boxed note");
  for (const mark of ["¶", "→", "↵", "·"]) expect(pdf, `no ${mark} in the PDF`).not.toContain(mark);

  // Word gets the same settings.
  await download(page, /^Microsoft Word/, "Saved Layout.docx");
  const xml = zipText(readFileSync(join(saveDir, "Layout.docx")), "word/document.xml");
  const tabStops = xml.match(/<w:tab [^>]*\/>/g) ?? [];
  expect(tabStops.some((t) => t.includes('w:val="right"') && t.includes('w:leader="dot"') && t.includes('w:pos="7200"'))).toBe(true);
  expect(xml).toMatch(/<w:ind [^>]*w:left="1440"[^>]*\/>|<w:ind [^>]*w:hanging="720"[^>]*\/>/);
  expect(xml).toMatch(/<w:ind [^>]*w:hanging="720"/);
  expect(xml).toMatch(/<w:ind [^>]*w:right="720"/);
  expect(xml).toMatch(/<w:spacing [^>]*w:line="360"[^>]*w:lineRule="exact"|<w:spacing [^>]*w:lineRule="exact"[^>]*w:line="360"/);
  expect(xml).toContain("<w:pBdr>");
  expect(xml).toMatch(/<w:shd [^>]*w:fill="FFF2CC"/i);
  expect(xml).toMatch(/<w:bidi\/>|<w:bidi w:val="(true|1|on)"\/>/);
  expect(readdirSync(saveDir).sort()).toEqual(["Layout.docx", "Layout.pdf"]);

  // The marks are a view setting: off again, nothing marked.
  await page.keyboard.press("Control+Shift+P");
  await expect(ed.locator(".pd-np-space")).toHaveCount(0);
  await quit(l);
});

const para = (text: string) => ({ type: "paragraph", content: [{ type: "text", text }] });
const item = (text: string) => ({ type: "listItem", content: [para(text)] });
const cell = (type: string, text: string) => ({ type, content: [para(text)] });
const row = (type: string, ...texts: string[]) => ({ type: "tableRow", content: texts.map((t) => cell(type, t)) });

test("9.6 sort orders paragraphs, list items and table rows, numbers in number order, and Undo returns", async () => {
  const l = await launch();
  const { page } = l;
  const ed = editor(page);
  await load(page, {
    type: "doc",
    content: [
      para("pear"),
      para("Apple"),
      para("item 10"),
      para("item 9"),
      para("banana"),
      { type: "bulletList", content: [item("cherry"), item("10 apples"), item("2 apples"), item("Avocado")] },
      { type: "table", content: [row("tableHeader", "Name", "Count"), row("tableCell", "Zed", "3"), row("tableCell", "Amy", "100"), row("tableCell", "Bob", "20")] },
      para("The end"),
    ],
  });
  const tops = () => ed.locator(":scope > p").allTextContents();
  await expect.poll(tops).toEqual(["pear", "Apple", "item 10", "item 9", "banana", "The end"]);

  // Five selected paragraphs.
  await ed.locator(":scope > p", { hasText: /^pear$/ }).click({ position: { x: 2, y: 5 } });
  await ed.locator(":scope > p", { hasText: /^banana$/ }).click({ modifiers: ["Shift"] });
  await menu(page, "Format", /^Sort…/);
  let dlg = page.getByRole("dialog", { name: "Sort" });
  await expect(dlg).toContainText("Sorts 5 paragraphs.");
  await dlg.getByRole("button", { name: "Sort" }).click();
  await expect.poll(tops).toEqual(["Apple", "banana", "item 9", "item 10", "pear", "The end"]);
  await page.keyboard.press("Control+Z");
  await expect.poll(tops).toEqual(["pear", "Apple", "item 10", "item 9", "banana", "The end"]);

  // The cursor in a list sorts the whole list, Z to A.
  await ed.locator("li", { hasText: "cherry" }).click();
  await menu(page, "Format", /^Sort…/);
  dlg = page.getByRole("dialog", { name: "Sort" });
  await expect(dlg).toContainText("Sorts 4 list items.");
  await dlg.getByRole("radio", { name: "Z to A" }).check();
  await dlg.getByRole("button", { name: "Sort" }).click();
  await expect.poll(() => ed.locator("li").allTextContents()).toEqual(["cherry", "Avocado", "10 apples", "2 apples"]);

  // The cursor in a table sorts its rows by a column; the header row stays first.
  await ed.locator("td", { hasText: "Zed" }).click();
  await menu(page, "Format", /^Sort…/);
  dlg = page.getByRole("dialog", { name: "Sort" });
  await expect(dlg).toContainText("Sorts 3 table rows.");
  await expect(dlg.locator('[name="sort-header"]')).toBeChecked();
  await choose(dlg.locator('[name="sort-column"]'), { label: "Count" });
  await dlg.getByRole("button", { name: "Sort" }).click();
  const firstColumn = () => ed.locator("tr").evaluateAll((rows) => rows.map((r) => r.firstElementChild?.textContent));
  await expect.poll(firstColumn).toEqual(["Name", "Zed", "Bob", "Amy"]);
  await page.keyboard.press("Control+Z");
  await expect.poll(firstColumn).toEqual(["Name", "Zed", "Amy", "Bob"]);
  await quit(l);
});
