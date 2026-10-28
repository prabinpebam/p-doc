import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Page } from "@playwright/test";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { dialogStep, diskText, expect, filesIn, launch, PROMPTLY, quit, test } from "./helpers.ts";
import { headedDocument, load, prose, settled } from "./fixtures.ts";

test("2.5 the table of contents lists the headings with their pages, stays current, and jumps to them", async () => {
  const l = await launch();
  const { page } = l;
  await load(page, headedDocument(3));
  expect(await settled(page)).toBe(3);
  await page.evaluate(() => (window as unknown as { __pdoc: { getEditor(): { commands: { focus(p: string): void } } } }).__pdoc.getEditor().commands.focus("start"));

  await page.getByRole("menuitem", { name: "Insert" }).click();
  await page.getByRole("menuitem", { name: "Table of contents" }).click();
  const toc = page.locator(".pd-content .pd-toc");
  await expect(toc).toBeVisible();
  const entries = () => toc.locator("li").evaluateAll((lis) => lis.map((li) => `${li.querySelector("a")?.textContent} ${li.querySelector(".pd-toc-page")?.textContent ?? "-"}`));
  await expect.poll(entries).toEqual(["Chapter 1 1", "Chapter 2 2", "Chapter 3 3"]);
  await page.screenshot({ path: test.info().outputPath("toc.png") });

  /** Clicks a heading until the caret is in it (pages may still be settling under the pointer). */
  const caret = () =>
    page.evaluate(() => {
      const s = (window as unknown as { __pdoc: { getEditor(): { state: { selection: { empty: boolean; $from: { parentOffset: number; parent: { textContent: string; content: { size: number } } } } } } } }).__pdoc.getEditor().state.selection;
      return { text: s.$from.parent.textContent, empty: s.empty, atEnd: s.$from.parentOffset === s.$from.parent.content.size };
    });
  const caretInto = async (text: string) => {
    await expect(async () => {
      await page.locator(".pd-content h1", { hasText: text }).click();
      // Quick retries can count as a double or triple click and select the heading instead.
      expect(await caret()).toMatchObject({ text, empty: true });
    }).toPass({ intervals: [600], timeout: 10_000 });
  };
  const caretToEnd = async (text: string) => {
    await page.keyboard.press("End");
    await expect.poll(caret).toEqual({ text, empty: true, atEnd: true });
  };

  // Rename a heading: the contents follow as you type.
  await caretInto("Chapter 2");
  await caretToEnd("Chapter 2");
  await page.keyboard.type(" revised");
  await expect.poll(entries).toEqual(["Chapter 1 1", "Chapter 2 revised 2", "Chapter 3 3"]);

  // A new heading at the end joins the contents with its page.
  await page.keyboard.press("Control+End");
  await page.keyboard.press("Enter");
  await page.keyboard.type("# Appendix");
  await expect.poll(entries).toEqual(["Chapter 1 1", "Chapter 2 revised 2", "Chapter 3 3", "Appendix 3"]);

  // Text added before Chapter 3 pushes it to the next page, and its number follows.
  await caretInto("Chapter 2 revised");
  await caretToEnd("Chapter 2 revised");
  for (let i = 0; i < 45; i++) await page.keyboard.press("Enter");
  await expect.poll(entries).toEqual(["Chapter 1 1", "Chapter 2 revised 2", "Chapter 3 4", "Appendix 4"]);
  await page.keyboard.press("Control+z");
  await expect.poll(entries).toEqual(["Chapter 1 1", "Chapter 2 revised 2", "Chapter 3 3", "Appendix 3"]);

  // Click an entry: the cursor goes to that heading.
  await toc.getByRole("link", { name: "Chapter 3" }).click();
  await expect(page.getByTestId("page-indicator")).toHaveText("Page 3 of 3");

  // The saved document keeps the entries.
  await expect
    .poll(() => JSON.stringify(filesIn(l.dirs, "private")[0]?.doc.content), PROMPTLY)
    .toContain('"text":"Chapter 2 revised"');
  await expect.poll(() => JSON.stringify(filesIn(l.dirs, "private")[0]?.doc.content), PROMPTLY).toMatch(/"tableOfContents".*Appendix/);

  // Without pages there are no page numbers.
  await page.getByRole("menuitem", { name: "View" }).click();
  await page.getByRole("menuitemcheckbox", { name: "Pageless" }).click();
  await expect.poll(entries).toEqual(["Chapter 1 -", "Chapter 2 revised -", "Chapter 3 -", "Appendix -"]);
  await quit(l);
});

const h = (level: number, text: string) => ({ type: "heading", attrs: { level }, content: [{ type: "text", text }] });
const para = (seed: number) => ({ type: "paragraph", content: [{ type: "text", text: prose(60, seed) }] });

/** Headings of every level over four pages. */
const deepDocument = () => ({
  type: "doc",
  content: [
    h(1, "Part A"), para(1),
    { type: "pageBreak" },
    h(2, "Section A.1"), para(2), h(3, "Topic A.1.1"), para(3),
    { type: "pageBreak" },
    h(4, "Detail four"), para(4), h(5, "Detail five"), para(5), h(6, "Detail six"), para(6),
    { type: "pageBreak" },
    h(1, "Part B"), para(7),
  ],
});

async function menu(page: Page, top: string, ...path: RegExp[]): Promise<void> {
  await page.getByRole("menuitem", { name: top, exact: true }).click();
  for (const item of path) await page.getByRole("menuitem", { name: item }).click();
}

test("10.4 contents options: levels 1–6, page numbers with dotted leaders or links, matching the PDF's pages", async () => {
  const saveDir = mkdtempSync(join(tmpdir(), "pdoc-toc-"));
  const l = await launch({ env: { PDOC_SAVE_DIR: saveDir } });
  const { page } = l;
  await page.locator("#doc-title").fill("Contents");
  await page.keyboard.press("Enter");
  await load(page, deepDocument());
  expect(await settled(page)).toBe(4);
  await page.evaluate(() => (window as unknown as { __pdoc: { getEditor(): { commands: { focus(p: string): void } } } }).__pdoc.getEditor().commands.focus("start"));
  await menu(page, "Insert", /^Table of contents/);
  const toc = page.locator(".pd-content .pd-toc");
  const entries = () => toc.locator("li").evaluateAll((lis) => lis.map((li) => `${li.querySelector("a")?.textContent} ${li.querySelector(".pd-toc-page")?.textContent ?? "-"}`));
  await expect.poll(entries).toEqual(["Part A 1", "Section A.1 2", "Topic A.1.1 2", "Part B 4"]);
  const leaders = () => toc.locator(".pd-toc-dots").evaluateAll((els) => els.map((e) => e.getBoundingClientRect().width > 8 && getComputedStyle(e).borderBottomStyle === "dotted"));
  expect(await leaders()).toEqual([true, true, true, true]);

  // Contents options: all six levels, one Undo step.
  await dialogStep(page, {
    open: () => menu(page, "Insert", /^Contents options/),
    name: "Contents options",
    fill: async (d) => {
      await expect(d.getByLabel("Levels")).toHaveValue("3");
      await expect(d.getByRole("radio", { name: "Page numbers" })).toBeChecked();
      await d.getByLabel("Levels").selectOption({ label: "1–6" });
    },
    read: entries,
  });
  await expect.poll(entries).toEqual(["Part A 1", "Section A.1 2", "Topic A.1.1 2", "Detail four 3", "Detail five 3", "Detail six 3", "Part B 4"]);
  const indents = await toc.locator("li").evaluateAll((lis) => lis.map((li) => li.getBoundingClientRect().left + parseFloat(getComputedStyle(li).paddingLeft)));
  for (let i = 1; i < 6; i++) expect(indents[i]!, `level ${i + 1} is indented more than level ${i}`).toBeGreaterThan(indents[i - 1]!);
  await expect.poll(() => diskText(l.dirs), PROMPTLY).toContain('"levels":6');

  // The PDF: each number is the page its heading is printed on, and each entry links there.
  await menu(page, "File", /^Download/, /^PDF document/);
  await expect(page.getByText(/^Saved Contents\.pdf/)).toBeVisible({ timeout: 20_000 });
  const task = getDocument({ data: new Uint8Array(readFileSync(join(saveDir, "Contents.pdf"))), useSystemFonts: false });
  const pdf = await task.promise;
  const texts: string[] = [];
  for (let i = 1; i <= pdf.numPages; i++) texts.push((await (await pdf.getPage(i)).getTextContent()).items.map((it) => ("str" in it ? it.str : "")).join(""));
  const shown = await entries();
  for (const e of shown) {
    const [, text, n] = /^(.*) (\d+)$/.exec(e)!;
    expect(texts.findLastIndex((t) => t.includes(text!)) + 1, `${text} is printed on page ${n}`).toBe(Number(n));
  }
  const annots = ((await (await pdf.getPage(1)).getAnnotations()) as { subtype: string; dest?: unknown }[]).filter((a) => a.subtype === "Link" && a.dest);
  const targets: number[] = [];
  for (const a of annots) targets.push((await pdf.getPageIndex((typeof a.dest === "string" ? await pdf.getDestination(a.dest) : (a.dest as unknown[]))![0] as never)) + 1);
  expect(targets).toEqual(shown.map((e) => Number(e.split(" ").at(-1))));
  await task.destroy();

  // Links instead of page numbers; then only the top level.
  await dialogStep(page, {
    open: () => menu(page, "Insert", /^Contents options/),
    name: "Contents options",
    fill: async (d) => {
      await expect(d.getByLabel("Levels")).toHaveValue("6");
      await d.getByRole("radio", { name: "Links" }).check();
    },
    read: entries,
  });
  await expect.poll(entries).toEqual(["Part A -", "Section A.1 -", "Topic A.1.1 -", "Detail four -", "Detail five -", "Detail six -", "Part B -"]);
  await expect(toc.locator(".pd-toc-dots")).toHaveCount(0);
  await menu(page, "Insert", /^Contents options/);
  const d = page.getByRole("dialog", { name: "Contents options" });
  await d.getByLabel("Levels").selectOption({ label: "1" });
  await d.getByRole("button", { name: "Apply" }).click();
  await expect.poll(entries).toEqual(["Part A -", "Part B -"]);
  await toc.getByRole("link", { name: "Part B" }).click();
  await expect(page.getByTestId("page-indicator")).toHaveText("Page 4 of 4");
  await quit(l);
});
