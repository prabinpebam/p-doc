import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Page } from "@playwright/test";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { dialogStep, diskText, expect, launch, PROMPTLY, quit, test } from "./helpers.ts";
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
      await expect(d.getByLabel("Apply to")).toHaveValue("section");
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
