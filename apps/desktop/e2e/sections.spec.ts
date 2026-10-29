import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Page } from "@playwright/test";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { dialogStep, diskText, expect, launch, PROMPTLY, quit, test, choose } from "./helpers.ts";
import { load, prose, settled } from "./fixtures.ts";

const h = (level: number, text: string) => ({ type: "heading", attrs: { level }, content: [{ type: "text", text }] });
const para = (text: string) => ({ type: "paragraph", content: [{ type: "text", text }] });

/** A short report: an introduction, a body paragraph, then an appendix and an index. */
const report = () => ({
  type: "doc",
  content: [h(1, "Report"), para(`Intro ${prose(40, 1)}`), para(`Body ${prose(40, 2)}`), h(1, "Appendix"), para(`Table ${prose(120, 3)}`), h(1, "Index"), para("Terms")],
});

async function menu(page: Page, top: string, ...path: RegExp[]): Promise<void> {
  await page.getByRole("menuitem", { name: top, exact: true }).click();
  for (const item of path) await page.getByRole("menuitem", { name: item }).click();
}

/** Puts the caret at the start of the first block whose text starts with `text`. */
async function caretAt(page: Page, text: string): Promise<void> {
  await page.evaluate((t) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const e = (window as unknown as { __pdoc: { getEditor(): any } }).__pdoc.getEditor();
    let at = -1;
    e.state.doc.descendants((n: { isTextblock: boolean; textContent: string }, pos: number) => {
      if (at < 0 && n.isTextblock && n.textContent.startsWith(t)) at = pos + 1;
      return at < 0;
    });
    e.commands.focus(at);
  }, text);
}

const indicator = (page: Page) => page.getByTestId("page-indicator");
/** The width of the block whose text starts with `text` (px). */
const widthOf = (page: Page, text: string) =>
  page.locator(".pd-content > *").evaluateAll((els, t) => els.find((e) => (e.textContent ?? "").startsWith(t))?.getBoundingClientRect().width ?? 0, text);

test("11.1 section breaks start where they say; each section's paper, orientation and margins show on screen and in the PDF", async () => {
  const saveDir = mkdtempSync(join(tmpdir(), "pdoc-sections-"));
  const l = await launch({ env: { PDOC_SAVE_DIR: saveDir } });
  const { page } = l;
  await page.locator("#doc-title").fill("Sections");
  await page.keyboard.press("Enter");
  await load(page, report());
  expect(await settled(page)).toBe(1);

  // A next-page section break before the appendix: it starts page 2; the line shows on screen.
  await caretAt(page, "Appendix");
  await menu(page, "Insert", /^Break/, /^Section break \(next page\)/);
  await expect(page.locator(".pd-content .pd-section-break")).toHaveCount(1);
  await expect(page.locator(".pd-content .pd-section-break")).toHaveAttribute("data-label", "Section break (next page)");
  await caretAt(page, "Appendix");
  await expect(indicator(page)).toHaveText("Page 2 of 2");
  const portrait = await widthOf(page, "Intro");
  expect(Math.abs((await widthOf(page, "Table")) - portrait)).toBeLessThan(1);

  // This section: landscape with half-inch side margins; one Undo step.
  await dialogStep(page, {
    open: () => menu(page, "File", /^Page setup/),
    name: "Page setup",
    fill: async (d) => {
      await expect(d.getByLabel("Apply to")).toHaveAttribute("data-value", "section");
      await d.getByRole("radio", { name: "Landscape" }).check();
      await d.getByLabel("Left (in)").fill("0.5");
      await d.getByLabel("Right (in)").fill("0.5");
    },
    read: () => widthOf(page, "Table"),
  });
  // Text is 10 in across in the appendix, 6.5 in before it.
  await expect.poll(async () => (await widthOf(page, "Table")) / portrait).toBeCloseTo(10 / 6.5, 1);
  expect(Math.abs((await widthOf(page, "Intro")) - portrait)).toBeLessThan(1);
  // Sheet widths in 96 dpi px, from the first (a portrait letter page, 816 px) whatever the zoom.
  const sheets = () =>
    page.locator(".pd-sheet-bg").evaluateAll((els) => {
      const first = els[0]?.getBoundingClientRect().width || 1;
      return els.map((e) => Math.round((e.getBoundingClientRect().width / first) * 816));
    });
  await expect.poll(sheets).toEqual([816, 1056]);
  await expect.poll(() => diskText(l.dirs), PROMPTLY).toContain('"orientation":"landscape"');

  // An even-page section before the index: page 3 would be odd, so a blank page comes first.
  await caretAt(page, "Index");
  await menu(page, "Insert", /^Break/, /^Section break \(even page\)/);
  await caretAt(page, "Index");
  await expect(indicator(page)).toHaveText("Page 4 of 4");
  await expect(page.locator(".pd-sheet-blank")).toHaveCount(1);
  // A continuous break keeps the body on page 1.
  await caretAt(page, "Body");
  await menu(page, "Insert", /^Break/, /^Section break \(continuous\)/);
  await caretAt(page, "Body");
  await expect(indicator(page)).toHaveText("Page 1 of 4");

  // The PDF: the same pages at the same sizes (points), each heading on its page.
  await menu(page, "File", /^Download/, /^PDF document/);
  await expect(page.getByText(/^Saved Sections\.pdf/)).toBeVisible({ timeout: 20_000 });
  const task = getDocument({ data: new Uint8Array(readFileSync(join(saveDir, "Sections.pdf"))), useSystemFonts: false });
  const pdf = await task.promise;
  const sizes: string[] = [];
  const texts: string[] = [];
  /** Each page's text column: where its text starts and ends across (pt). */
  const across: [number, number][] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const p = await pdf.getPage(i);
    const v = p.getViewport({ scale: 1 });
    sizes.push(`${Math.round(v.width)}x${Math.round(v.height)}`);
    const items = (await p.getTextContent()).items.filter((it) => "str" in it && it.str.trim());
    texts.push(items.map((it) => ("str" in it ? it.str : "")).join(""));
    const xs = items.map((it) => ("transform" in it ? [it.transform[4] as number, (it.transform[4] as number) + it.width] : [0, 0]));
    across.push([Math.min(...xs.map((x) => x[0]!)), Math.max(...xs.map((x) => x[1]!))]);
  }
  expect(sizes).toEqual(["612x792", "792x612", "792x612", "792x612"]);
  expect(texts.findIndex((t) => t.includes("Appendix")) + 1).toBe(2);
  expect(texts[2]!.trim()).toBe("");
  expect(texts.findIndex((t) => t.includes("Index")) + 1).toBe(4);
  // Pages print at full size with their own margins: 1 in on the letter page, 0.5 in on the landscape one, its text past 8.5 in.
  expect(Math.abs(across[0]![0] - 72)).toBeLessThan(2);
  expect(Math.abs(across[1]![0] - 36)).toBeLessThan(2);
  expect(across[1]![1]).toBeGreaterThan(700);
  await task.destroy();

  // 11.6 Pageless: one flow at one width, the breaks still marked; back to pages, every setting is kept.
  await menu(page, "File", /^Page setup/);
  const d = page.getByRole("dialog", { name: "Page setup" });
  await d.getByRole("radio", { name: "Pageless" }).check();
  await d.getByRole("button", { name: "Apply" }).click();
  await expect(page.locator(".pd-sheet-break")).toHaveCount(0);
  await expect(page.locator(".pd-content .pd-section-break")).toHaveCount(3);
  await expect(page.locator(".pd-sheet-bg")).toHaveCount(0);
  expect(Math.abs((await widthOf(page, "Table")) - (await widthOf(page, "Intro")))).toBeLessThan(1);
  await menu(page, "File", /^Page setup/);
  await d.getByRole("radio", { name: "Pages" }).check();
  await d.getByRole("button", { name: "Apply" }).click();
  await expect.poll(async () => (await widthOf(page, "Table")) / (await widthOf(page, "Intro"))).toBeCloseTo(10 / 6.5, 1);
  await caretAt(page, "Index");
  await expect(indicator(page)).toHaveText("Page 4 of 4");
  await quit(l);
});

/** Every header (or footer) on screen, in page order. */
const hfs = (page: Page, which: "header" | "footer") =>
  page.locator(`.pd-hf[data-hf="${which}"]`).evaluateAll((els) =>
    els
      .map((e) => [Number((e as HTMLElement).dataset.page), e.querySelector(".pd-hf-text")?.textContent ?? ""] as const)
      .sort((a, b) => a[0] - b[0])
      .map((x) => x[1]),
  );

test("11.3 odd and even headers, a section's own headers (Link to previous off) and page numbers i, ii on screen and in the PDF", async () => {
  const saveDir = mkdtempSync(join(tmpdir(), "pdoc-sections-hf-"));
  const l = await launch({ env: { PDOC_SAVE_DIR: saveDir } });
  const { page } = l;
  await page.locator("#doc-title").fill("Numbered");
  await page.keyboard.press("Enter");
  const pb = { type: "pageBreak" };
  await load(page, { type: "doc", content: [para("One"), pb, para("Two"), pb, para("Three"), { type: "sectionBreak", attrs: { kind: "next" } }, para("Annex A"), pb, para("Annex B")] });
  expect(await settled(page)).toBe(5);

  // Header and footer for the document: odd and even pages differ.
  await caretAt(page, "One");
  await menu(page, "Insert", /^Header and footer/);
  const d = page.getByRole("dialog", { name: "Header and footer" });
  await expect(d.getByText("Section 1 of 2")).toBeVisible();
  await expect(d.getByLabel("Link to previous")).toHaveCount(0);
  await d.locator('input[name="hf-header"]').fill("Report {page}");
  await d.locator('input[name="hf-footer"]').fill("{page} of {pages}");
  await d.getByLabel("Different odd and even pages").check();
  await d.locator('input[name="hf-evenHeader"]').fill("Even {page}");
  await d.locator('input[name="hf-evenFooter"]').fill("{page} of {pages}");
  await d.getByRole("button", { name: "Apply" }).click();
  await expect.poll(() => hfs(page, "header")).toEqual(["Report 1", "Even 2", "Report 3", "Even 4", "Report 5"]);

  // The second section: linked at first (the text shows but can't be edited); unlinked it has its own, numbered i, ii.
  await caretAt(page, "Annex A");
  await menu(page, "Insert", /^Header and footer/);
  await expect(d.getByText("Section 2 of 2")).toBeVisible();
  await expect(d.getByLabel("Link to previous")).toBeChecked();
  await expect(d.locator('input[name="hf-header"]')).toHaveValue("Report {page}");
  await expect(d.locator('input[name="hf-header"]')).toHaveJSProperty("readOnly", true);
  await d.getByLabel("Link to previous").uncheck();
  await d.locator('input[name="hf-header"]').fill("Annex {page}");
  await d.locator('input[name="hf-evenHeader"]').fill("Annex even {page}");
  await choose(d.getByLabel("Format"), "i");
  await choose(d.getByLabel("Numbering"), "start");
  await d.getByRole("spinbutton", { name: "Start at" }).fill("1");
  await d.getByRole("button", { name: "Apply" }).click();
  await expect.poll(() => hfs(page, "header")).toEqual(["Report 1", "Even 2", "Report 3", "Annex i", "Annex even ii"]);
  await expect.poll(() => hfs(page, "footer")).toEqual(["1 of 5", "2 of 5", "3 of 5", "i of 5", "ii of 5"]);
  await expect.poll(() => diskText(l.dirs), PROMPTLY).toContain("Annex even {page}");
  // One Undo step takes the section back to linked.
  await page.keyboard.press("Control+z");
  await expect.poll(() => hfs(page, "header")).toEqual(["Report 1", "Even 2", "Report 3", "Even 4", "Report 5"]);
  await page.keyboard.press("Control+y");
  await expect.poll(() => hfs(page, "header")).toEqual(["Report 1", "Even 2", "Report 3", "Annex i", "Annex even ii"]);

  // The PDF has the same headers and footers on the same pages.
  await menu(page, "File", /^Download/, /^PDF document/);
  await expect(page.getByText(/^Saved Numbered\.pdf/)).toBeVisible({ timeout: 20_000 });
  const task = getDocument({ data: new Uint8Array(readFileSync(join(saveDir, "Numbered.pdf"))), useSystemFonts: false });
  const pdf = await task.promise;
  const texts: string[] = [];
  for (let i = 1; i <= pdf.numPages; i++) texts.push(((await (await pdf.getPage(i)).getTextContent()).items as { str?: string }[]).map((it) => it.str ?? "").join(" "));
  expect(texts).toHaveLength(5);
  expect(texts[1]).toContain("Even 2");
  expect(texts[3]).toContain("Annex i");
  expect(texts[4]).toContain("Annex even ii");
  expect(texts[4]).toContain("ii of 5");
  await task.destroy();
  await quit(l);
});
test("11.2 a column break (Ctrl+Shift+Enter) on one column starts the next page; a continuous break's label doesn't cover the text", async () => {
  const l = await launch();
  const { page } = l;
  await load(page, report());
  expect(await settled(page)).toBe(1);
  await caretAt(page, "Body");
  await page.keyboard.press("Control+Shift+Enter");
  await expect(page.locator(".pd-content .pd-column-break")).toHaveCount(1);
  expect(await settled(page)).toBe(2);
  await caretAt(page, "Body");
  await expect(indicator(page)).toHaveText("Page 2 of 2");
  // A continuous break draws its line; the label shows only with formatting marks.
  await caretAt(page, "Appendix");
  await menu(page, "Insert", /^Break/, /^Section break \(continuous\)/);
  const label = () => page.locator(".pd-content .pd-section-break").evaluate((e) => getComputedStyle(e, "::after").display);
  await caretAt(page, "Appendix");
  await expect.poll(label).toBe("none");
  await quit(l);
});
test("11.4 a text watermark shows behind every page, blank ones too, prints, and comes off with Remove watermark", async () => {
  const saveDir = mkdtempSync(join(tmpdir(), "pdoc-sections-wm-"));
  const l = await launch({ env: { PDOC_SAVE_DIR: saveDir } });
  const { page } = l;
  await page.locator("#doc-title").fill("Marked");
  await page.keyboard.press("Enter");
  await load(page, { type: "doc", content: [para("One"), { type: "pageBreak" }, para("Two"), { type: "sectionBreak", attrs: { kind: "even" } }, para("Four")] });
  expect(await settled(page)).toBe(4);
  const marks = page.getByTestId("watermark");
  await expect(marks).toHaveCount(0);

  await menu(page, "Insert", /^Watermark/);
  const d = page.getByRole("dialog", { name: "Watermark" });
  await expect(d.getByLabel("Text")).toHaveValue("DRAFT");
  await d.getByLabel("Text").fill("");
  await expect(d.getByRole("alert")).toHaveText("Enter the words to show behind the text.");
  await expect(d.getByRole("button", { name: "Apply" })).toBeDisabled();
  await d.getByLabel("Text").fill("CONFIDENTIAL");
  await choose(d.getByLabel("Colour"), { label: "Red" });
  await d.getByRole("button", { name: "Apply" }).click();
  // One on each of the four pages, the blank page 3 included, turned corner to corner, behind the text.
  await expect(marks).toHaveCount(4);
  await expect(marks.first()).toHaveText("CONFIDENTIAL");
  const look = await marks.first().evaluate((e) => {
    const s = getComputedStyle(e.firstElementChild!);
    return { color: getComputedStyle(e).color, rotate: s.rotate, behind: getComputedStyle(e.parentElement!).zIndex };
  });
  expect(look.color).toBe("rgb(242, 184, 181)");
  expect(parseFloat(look.rotate)).toBeLessThan(-45);
  expect(look.behind).toBe("-1");
  await expect.poll(() => diskText(l.dirs), PROMPTLY).toContain("CONFIDENTIAL");

  // The PDF carries it on every page, turned.
  await menu(page, "File", /^Download/, /^PDF document/);
  await expect(page.getByText(/^Saved Marked\.pdf/)).toBeVisible({ timeout: 20_000 });
  const task = getDocument({ data: new Uint8Array(readFileSync(join(saveDir, "Marked.pdf"))), useSystemFonts: false });
  const pdf = await task.promise;
  expect(pdf.numPages).toBe(4);
  for (let i = 1; i <= pdf.numPages; i++) {
    const items = (await (await pdf.getPage(i)).getTextContent()).items as { str?: string; transform?: number[] }[];
    const mark = items.find((it) => it.str?.includes("CONFIDENTIAL"));
    expect(mark, `page ${i}`).toBeTruthy();
    expect(Math.abs(mark!.transform![1]!)).toBeGreaterThan(1);
  }
  await task.destroy();

  // Pageless shows none and keeps it; Remove watermark takes it off.
  const ps = page.getByRole("dialog", { name: "Page setup" });
  await menu(page, "File", /^Page setup/);
  await ps.getByRole("radio", { name: "Pageless" }).check();
  await ps.getByRole("button", { name: "Apply" }).click();
  await expect(marks).toHaveCount(0);
  await menu(page, "File", /^Page setup/);
  await ps.getByRole("radio", { name: "Pages" }).check();
  await ps.getByRole("button", { name: "Apply" }).click();
  await expect(marks).toHaveCount(4);
  await menu(page, "Insert", /^Remove watermark/);
  await expect(marks).toHaveCount(0);
  await expect.poll(() => diskText(l.dirs), PROMPTLY).not.toContain("CONFIDENTIAL");
  await quit(l);
});