import { mkdtempSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Page } from "@playwright/test";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { load, prose, settled } from "./fixtures.ts";
import { diskText, editor, expect, launch, PROMPTLY, quit, test } from "./helpers.ts";

async function menu(page: Page, top: string, ...path: RegExp[]): Promise<void> {
  await page.getByRole("menuitem", { name: top, exact: true }).click();
  for (const item of path) await page.getByRole("menuitem", { name: item }).click();
}

/** The numbers shown on the note references and on the notes, in document order. */
const numbers = (page: Page) =>
  page.evaluate(() => ({
    refs: [...document.querySelectorAll<HTMLElement>(".pd-content .pd-note-ref")].map((x) => x.dataset.n ?? ""),
    notes: [...document.querySelectorAll<HTMLElement>(".pd-content .pd-notes > .pd-note")].map((x) => `${x.dataset.n ?? ""}:${x.textContent}`),
  }));

/** Page geometry in client px: the bottom of the text area of page `n` (1-based, single-page sheets). */
const textBottom = (page: Page, n: number) =>
  page.evaluate((n) => {
    const art = document.querySelector<HTMLElement>("[data-testid=page]")!;
    const cs = getComputedStyle(art);
    const width = parseFloat(cs.getPropertyValue("--page-width"));
    const scale = art.getBoundingClientRect().width / width;
    const height = parseFloat(cs.getPropertyValue("--page-height"));
    const bottom = parseFloat(cs.getPropertyValue("--page-pad-bottom"));
    const probe = document.createElement("div");
    probe.style.cssText = "position:absolute;visibility:hidden;height:var(--c-page-gap)";
    document.body.append(probe);
    const gap = probe.getBoundingClientRect().height;
    probe.remove();
    return art.getBoundingClientRect().top + scale * (n * height + (n - 1) * gap - bottom);
  }, n);

const rect = (page: Page, sel: string) => page.locator(sel).first().evaluate((e) => e.getBoundingClientRect().toJSON() as DOMRect);

async function pdfPages(file: string): Promise<string[]> {
  const task = getDocument({ data: new Uint8Array(readFileSync(file)), useSystemFonts: false });
  const pdf = await task.promise;
  const out: string[] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const tc = await (await pdf.getPage(i)).getTextContent();
    out.push(tc.items.map((it) => ("str" in it ? it.str : "")).join(""));
  }
  await task.destroy();
  return out;
}

test("10.1 footnotes and endnotes: numbered in order, at the page foot, renumber, convert, format; the dialog is one undo step", async () => {
  const l = await launch();
  const { page, dirs } = l;
  const ed = editor(page);
  await page.locator("#doc-title").fill("Notes");
  await page.keyboard.press("Enter");
  await page.keyboard.type("First claim");
  await page.keyboard.press("Control+Alt+F");
  await page.keyboard.type("Source one.");
  await page.keyboard.press("Escape");
  await page.keyboard.type(" and second claim");
  await page.keyboard.press("Control+Alt+F");
  await page.keyboard.type("Source two.");
  await page.keyboard.press("Escape");
  await page.keyboard.type(" end.");
  await expect.poll(() => numbers(page), PROMPTLY).toEqual({ refs: ["1", "2"], notes: ["1:Source one.", "2:Source two."] });
  expect(await ed.locator("p").first().textContent()).toBe("First claim and second claim end.");

  // At the foot of page 1, the second note last, under a rule.
  await expect(ed.locator(".pd-note--placed")).toHaveCount(2);
  await expect(ed.locator(".pd-note--page-first")).toHaveCount(1);
  const foot = await textBottom(page, 1);
  const last = await rect(page, '.pd-notes > .pd-note[data-n="2"]');
  expect(Math.abs(last.bottom - foot), "the notes end at the foot of the text area").toBeLessThan(3);
  const text = await rect(page, ".pd-content > p");
  expect(last.top - text.bottom, "far below the text").toBeGreaterThan(300);

  // Deleting the first reference renumbers; Undo brings it and its note back.
  await page.keyboard.press("Control+Home");
  for (let i = 0; i < "First claim".length; i++) await page.keyboard.press("ArrowRight");
  await page.keyboard.press("Shift+ArrowRight");
  await page.keyboard.press("Delete");
  await expect.poll(() => numbers(page), PROMPTLY).toEqual({ refs: ["1"], notes: ["1:Source two."] });
  await page.keyboard.press("Control+Z");
  await expect.poll(() => numbers(page), PROMPTLY).toEqual({ refs: ["1", "2"], notes: ["1:Source one.", "2:Source two."] });

  // An endnote: numbered i, after the text, not at a page foot.
  await page.keyboard.press("Control+End");
  await page.keyboard.press("Enter");
  await page.keyboard.type("Third claim");
  await page.keyboard.press("Control+Alt+D");
  await page.keyboard.type("Closing note.");
  await page.keyboard.press("Shift+Tab");
  await page.keyboard.type(" done");
  await expect.poll(() => numbers(page), PROMPTLY).toEqual({ refs: ["1", "2", "i"], notes: ["1:Source one.", "2:Source two.", "i:Closing note."] });
  expect(await ed.locator(":scope > p").nth(1).textContent()).toBe("Third claim done");
  await expect(ed.locator(".pd-note--first-end")).not.toHaveClass(/pd-note--placed/);

  // Double-click the endnote's number, convert it to a footnote: it becomes 3.
  await ed.locator('.pd-note-ref[data-n="i"]').dblclick();
  await menu(page, "Format", /^Notes$/, /^Convert to footnote/);
  await expect.poll(() => numbers(page), PROMPTLY).toEqual({ refs: ["1", "2", "3"], notes: ["1:Source one.", "2:Source two.", "3:Closing note."] });
  await expect(ed.locator(".pd-note--placed")).toHaveCount(3);

  // Format > Notes…: letters for footnotes, and all to endnotes; focus returns and one Undo undoes it.
  await menu(page, "Format", /^Notes$/, /^Notes…/);
  const dlg = page.getByRole("dialog", { name: "Notes" });
  await dlg.locator('[name="foot-format"]').selectOption("a");
  await dlg.getByRole("button", { name: "Apply" }).click();
  await expect(dlg).toBeHidden();
  await expect(ed).toBeFocused();
  await expect.poll(() => numbers(page), PROMPTLY).toEqual({ refs: ["a", "b", "c"], notes: ["a:Source one.", "b:Source two.", "c:Closing note."] });
  await menu(page, "Format", /^Notes$/, /^Notes…/);
  await dlg.getByRole("radio", { name: "Make all footnotes endnotes" }).check();
  await dlg.getByRole("button", { name: "Apply" }).click();
  await expect.poll(() => numbers(page), PROMPTLY).toEqual({ refs: ["i", "ii", "iii"], notes: ["i:Source one.", "ii:Source two.", "iii:Closing note."] });
  await expect(ed.locator(".pd-note--placed")).toHaveCount(0);
  await expect(ed).toBeFocused();
  await page.keyboard.press("Control+Z");
  await expect.poll(() => numbers(page), PROMPTLY).toEqual({ refs: ["a", "b", "c"], notes: ["a:Source one.", "b:Source two.", "c:Closing note."] });

  // From a note, Esc goes back to its number; then Ctrl+End goes to the end of the text, not into the notes.
  await page.keyboard.press("Escape");
  await page.keyboard.press("Control+End");
  await page.keyboard.type("!");
  expect(await ed.locator(":scope > p").last().textContent()).toBe("Third claim done!");

  // Saved: the notes are in the file, the numbers are not.
  await expect.poll(() => diskText(dirs), PROMPTLY).toContain("Closing note.");
  const disk = diskText(dirs);
  expect(disk).toContain('"noteRef"');
  expect(disk).toContain('"footFormat":"a"');
  expect(disk).not.toContain('"data-n"');
  await quit(l);
});

const t = (s: string) => ({ type: "text", text: s });

/** Page 1 nearly full, a footnote near its foot too long to fit, so the note goes on over the page. */
function continuedDocument(): unknown {
  const content: unknown[] = [];
  for (let i = 0; i < 5; i++) content.push({ type: "paragraph", content: [t(prose(90, i + 1))] });
  content.push({ type: "paragraph", content: [t("Claim with a long note"), { type: "noteRef", attrs: { id: "n1", kind: "footnote" } }, t(" and more text after it.")] });
  for (let i = 0; i < 3; i++) content.push({ type: "paragraph", content: [t(prose(80, i + 20))] });
  const long = `Note opens here. ${prose(900, 5)} Note closes here.`;
  content.push({ type: "notes", content: [{ type: "note", attrs: { id: "n1", kind: "footnote" }, content: [{ type: "paragraph", content: [t(long)] }] }] });
  return { type: "doc", content };
}

test("10.1 a long footnote goes on at the foot of the next page, on screen and in the PDF", async () => {
  const saveDir = mkdtempSync(join(tmpdir(), "pdoc-notes-"));
  const l = await launch({ env: { PDOC_SAVE_DIR: saveDir } });
  const { page } = l;
  const ed = editor(page);
  await page.locator("#doc-title").fill("Continued");
  await page.keyboard.press("Enter");
  await load(page, continuedDocument());
  await settled(page);
  await expect(ed.locator(".pd-note--cut")).toHaveCount(1);
  await expect(ed.locator(".pd-note-rest")).toHaveCount(1);
  const cut = await rect(page, ".pd-note--cut");
  expect(Math.abs(cut.bottom - (await textBottom(page, 1))), "the first part ends at page 1's foot").toBeLessThan(3);
  const rest = await rect(page, ".pd-note-rest");
  expect(rest.top, "the rest is on page 2").toBeGreaterThan(await textBottom(page, 1));
  expect(Math.abs(rest.bottom - (await textBottom(page, 2))), "and ends at page 2's foot").toBeLessThan(3);
  const ref = await rect(page, ".pd-note-ref");
  expect(ref.bottom, "the reference is on page 1").toBeLessThan(cut.top);

  await page.getByRole("menuitem", { name: "File" }).click();
  await page.getByRole("menuitem", { name: /^Download/ }).click();
  await page.getByRole("menuitem", { name: /^PDF document/ }).click();
  await expect(page.getByText(/^Saved Continued\.pdf/)).toBeVisible({ timeout: 20_000 });
  const pdf = readdirSync(saveDir).find((f) => f.endsWith(".pdf"))!;
  const pages = await pdfPages(join(saveDir, pdf));
  const one = pages.findIndex((p) => p.includes("Claim with a long note"));
  expect(one).toBeGreaterThanOrEqual(0);
  expect(pages[one], "the note starts on the reference's page").toContain("Note opens here.");
  expect(pages[one + 1], "and closes on the next").toContain("Note closes here.");
  await quit(l);
});
