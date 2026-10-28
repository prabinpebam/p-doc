import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Page } from "@playwright/test";
import { diskText, editor, expect, launch, quit, test } from "./helpers.ts";

const text = (page: Page) => editor(page).evaluate((el) => (el as HTMLElement).innerText.trim());
const items = (page: Page) => page.getByTestId("review-item");
const panel = (page: Page) => page.getByRole("complementary", { name: "Review" });
const current = (page: Page) => page.evaluate(() => (window as unknown as { __pdoc: { app: { get(): { current: { title: string; space: string } | null } } } }).__pdoc.app.get().current);

async function selectWord(page: Page, word: string): Promise<void> {
  await editor(page).evaluate((el, w) => {
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const i = n.textContent!.indexOf(w);
      if (i >= 0) {
        const r = document.createRange();
        r.setStart(n, i);
        r.setEnd(n, i + w.length);
        const s = getSelection()!;
        s.removeAllRanges();
        s.addRange(r);
        return;
      }
    }
    throw new Error(`no ${w}`);
  }, word);
  await page.waitForTimeout(50);
}

async function openCompare(page: Page) {
  await page.getByRole("menuitem", { name: "Tools" }).click();
  await page.getByRole("menuitem", { name: "Compare documents…" }).click();
  const dialog = page.getByRole("dialog", { name: "Compare documents" });
  await expect(dialog).toBeVisible();
  return dialog;
}

test("13.4 Compare documents makes a new private document whose accept all gives the revised text and reject all the original", async () => {
  const l = await launch();
  const { page } = l;
  const ed = editor(page);
  await page.keyboard.type("The quick brown fox.");
  await page.keyboard.press("Enter");
  await page.keyboard.type("This paragraph goes.");
  await page.keyboard.press("Enter");
  await page.keyboard.type("Last line.");
  const originalText = await text(page);

  // The older copy, then the revision in this document.
  await page.getByRole("menuitem", { name: "File" }).click();
  await page.getByRole("menuitem", { name: "Make a copy" }).click();
  await expect(page.getByText(/^Made "/)).toBeVisible();
  await selectWord(page, "quick");
  await page.keyboard.type("slow");
  await selectWord(page, "This paragraph goes.");
  await page.keyboard.press("Backspace");
  await page.keyboard.press("Backspace");
  await selectWord(page, "Last");
  await page.keyboard.press("Control+Alt+1");
  await ed.press("Control+End");
  await page.keyboard.press("Enter");
  await page.keyboard.type("A new ending.");
  const revisedText = await text(page);
  expect(revisedText).not.toBe(originalText);
  const revisedTitle = (await current(page))!.title;

  const dialog = await openCompare(page);
  const original = dialog.getByRole("combobox", { name: "Original" });
  const revised = dialog.getByRole("combobox", { name: "Revised" });
  await expect(original.locator("option:checked")).toHaveText(/^Copy of /);
  await expect(revised.locator("option:checked")).toHaveText(/^This document/);
  const originalTitle = (await original.locator("option:checked").textContent())!;
  // The same document on both sides can't be compared.
  await original.selectOption({ label: (await revised.locator("option:checked").textContent())! });
  await expect(dialog.getByRole("button", { name: "Compare" })).toBeDisabled();
  await original.selectOption({ label: originalTitle });
  await page.screenshot({ path: test.info().outputPath("compare-dialog.png") });
  await dialog.getByRole("button", { name: "Compare" }).click();

  await expect(page.getByText(/^Compared: \d+ differences\.$/)).toBeVisible();
  await expect(dialog).toHaveCount(0);
  await expect.poll(async () => (await current(page))?.title).toBe(`Comparison of ${originalTitle} and ${revisedTitle}`);
  expect((await current(page))!.space).toBe("private");
  await expect(page.locator(".page.markup-all")).toBeVisible();
  await expect(ed.locator("del", { hasText: "quick" })).toBeVisible();
  await expect(ed.locator("ins", { hasText: "slow" })).toBeVisible();
  await expect(ed.locator(".pd-block-deletion")).toHaveText("This paragraph goes.");
  await expect(ed.locator("h1.pd-format-block")).toHaveText("Last line.");

  await page.getByTestId("review-button").click();
  await expect(items(page).first()).toContainText("Comparison");
  await page.screenshot({ path: test.info().outputPath("compare-result.png") });

  await panel(page).getByRole("button", { name: "Accept all" }).click();
  await expect(ed.locator("ins, del, .pd-block-insertion, .pd-block-deletion, .pd-format-block")).toHaveCount(0);
  expect(await text(page)).toBe(revisedText);
  await expect(ed.locator("h1")).toHaveText("Last line.");

  await ed.focus();
  await page.keyboard.press("Control+Z");
  await expect(ed.locator("ins").first()).toBeVisible();
  await panel(page).getByRole("button", { name: "Reject all" }).click();
  await expect(ed.locator("ins, del, .pd-block-insertion, .pd-block-deletion, .pd-format-block")).toHaveCount(0);
  expect(await text(page)).toBe(originalText);
  await expect(ed.locator("h1")).toHaveCount(0);

  await page.keyboard.press("Control+S");
  await expect.poll(() => diskText(l.dirs)).toContain("Comparison of");
  await quit(l);
});

test("13.4 Compare documents reads a file as the original without adding it to the library", async () => {
  const dir = mkdtempSync(join(tmpdir(), "pdoc-compare-"));
  const file = join(dir, "Older notes.md");
  writeFileSync(file, "# Notes\n\nApples and pears.\n");
  const l = await launch({ env: { PDOC_OPEN_FILE: file } });
  const { page } = l;
  const ed = editor(page);
  await page.keyboard.press("Control+Alt+1");
  await page.keyboard.type("Notes");
  await page.keyboard.press("Enter");
  await page.keyboard.type("Apples and plums.");
  const before = (await page.evaluate(() => (window as unknown as { __pdoc: { app: { get(): { docs: unknown[] } } } }).__pdoc.app.get().docs.length)) as number;

  const dialog = await openCompare(page);
  await dialog.getByRole("combobox", { name: "Original" }).selectOption({ label: "A file…" });
  await expect(dialog.getByRole("combobox", { name: "Original" }).locator("option:checked")).toHaveText("Older notes (file)");
  await dialog.getByRole("button", { name: "Compare" }).click();

  await expect(page.getByText(/^Compared: \d+ differences?\.$/)).toBeVisible();
  await expect.poll(async () => (await current(page))?.title).toMatch(/^Comparison of Older notes and /);
  await expect(ed.locator("del")).toHaveText("pears.");
  await expect(ed.locator("ins")).toHaveText("plums.");
  // The file came in only for the comparison: one new document, the comparison.
  const after = (await page.evaluate(() => (window as unknown as { __pdoc: { app: { get(): { docs: unknown[] } } } }).__pdoc.app.get().docs.length)) as number;
  expect(after).toBe(before + 1);
  await quit(l);
});
