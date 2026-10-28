import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Page } from "@playwright/test";
import { expect, launch, quit, test } from "./helpers.ts";
import { imageDocument, load, longDocument, settled } from "./fixtures.ts";

interface ScreenSheet {
  first: string;
  /** Height the sheet's blocks take, in page pixels. */
  extent: number;
  span: number;
  /** Outer height of the sheet's first block. */
  firstHeight: number;
  /** The previous sheet ended with a manual page break. */
  afterBreak: boolean;
}

/** The sheets as drawn: what starts each one and how much of its pages its blocks fill. */
function screenSheets(page: Page) {
  return page.evaluate(() => {
    const art = document.querySelector<HTMLElement>("[data-testid=page]")!;
    const cs = getComputedStyle(art);
    const v = (name: string) => parseFloat(cs.getPropertyValue(name));
    const scale = art.getBoundingClientRect().width / v("--page-width");
    const content = v("--page-height") - v("--page-pad-top") - v("--page-pad-bottom");
    const root = art.querySelector<HTMLElement>(".pd-content")!;
    const pages = Number(art.dataset.pages);
    const outer = (el: Element) => {
      const r = el.getBoundingClientRect();
      const s = getComputedStyle(el);
      return { top: r.top - parseFloat(s.marginTop) * scale, bottom: r.bottom + parseFloat(s.marginBottom) * scale };
    };
    const sheets: ScreenSheet[] = [];
    let start = root.getBoundingClientRect().top;
    let pageNo = 1;
    let blocks: Element[] = [];
    let afterBreak = false;
    const close = (end: number, lastPage: number) => {
      const first = blocks[0]!;
      const o = outer(first);
      sheets.push({ first: (first.textContent ?? "").slice(0, 40), extent: (end - start) / scale, span: lastPage - pageNo + 1, firstHeight: (o.bottom - o.top) / scale, afterBreak });
      afterBreak = blocks.at(-1)!.classList.contains("pd-page-break");
    };
    for (const k of root.children) {
      if (k.classList.contains("pd-sheet-break")) {
        const end = Number((k as HTMLElement).dataset.pageEnd);
        close(k.querySelector(".pd-sheet-fill")!.getBoundingClientRect().top, end);
        start = k.getBoundingClientRect().bottom;
        pageNo = end + 1;
        blocks = [];
      } else blocks.push(k);
    }
    close(outer(blocks.at(-1)!).bottom, pages);
    return { pages, content, sheets };
  });
}

test("2.1 2.4 Pages lays out sheets of the page size, moves blocks that don't fit, and the PDF has the same pages", async () => {
  const saveDir = mkdtempSync(join(tmpdir(), "pdoc-pdf-"));
  const l = await launch({ env: { PDOC_SAVE_DIR: saveDir } });
  const { page, app } = l;
  await load(page, longDocument());
  const art = page.getByTestId("page");
  await expect.poll(async () => Number(await art.getAttribute("data-pages"))).toBeGreaterThanOrEqual(15);
  await settled(page);

  const s = await screenSheets(page);
  expect(s.sheets.length).toBe((await page.locator(".pd-sheet-break").count()) + 1);
  expect(s.sheets.reduce((n, x) => n + x.span, 0)).toBe(s.pages);
  // The code block is taller than a page: its sheet covers two pages, as it prints.
  expect(s.sheets.some((x) => x.span > 1)).toBe(true);
  for (const [i, x] of s.sheets.entries()) {
    // Every sheet's blocks fit its pages.
    expect(x.extent, `sheet ${i + 1} fits`).toBeLessThanOrEqual(s.content * x.span + 1);
    // A block starts a new sheet only when it didn't fit on the one before (or after a page break).
    if (i > 0 && !x.afterBreak) expect(s.sheets[i - 1]!.extent + x.firstHeight, `sheet ${i + 1} starts because "${x.first}" didn't fit`).toBeGreaterThan(s.content * s.sheets[i - 1]!.span - 1);
  }
  // The block after the manual page break starts a page.
  expect(s.sheets.some((x) => x.afterBreak && x.first.startsWith("Section 4"))).toBe(true);
  await page.screenshot({ path: test.info().outputPath("pages.png") });
  await page.locator(".pd-sheet-break").first().scrollIntoViewIfNeeded();
  await page.screenshot({ path: test.info().outputPath("sheet-break.png") });
  await page.locator(".pd-content pre").scrollIntoViewIfNeeded();
  await page.screenshot({ path: test.info().outputPath("tall-block.png") });

  // The status bar shows the page with the cursor.
  await page.keyboard.press("Control+End");
  await expect(page.getByTestId("page-indicator")).toHaveText(`Page ${s.pages} of ${s.pages}`);
  await page.keyboard.press("Control+Home");
  await expect(page.getByTestId("page-indicator")).toHaveText(`Page 1 of ${s.pages}`);

  // The print document has the same sheets, starting with the same blocks, and none overflows its pages.
  const req = await page.evaluate(() => (window as unknown as { __pdoc: { printRequest(): { html: string } } }).__pdoc.printRequest());
  const htmlFile = join(saveDir, "print.html");
  writeFileSync(htmlFile, req.html);
  const printed = await app.evaluate(async ({ BrowserWindow }, file) => {
    const w = new BrowserWindow({ show: false, width: 1200, height: 900 });
    await w.loadFile(file);
    const r = (await w.webContents.executeJavaScript(`[...document.querySelectorAll(".print-sheet")].map((sh) => {
      const c = sh.querySelector(".pd-content");
      const last = c.lastElementChild;
      const first = c.firstElementChild;
      const end = last ? last.getBoundingClientRect().bottom + parseFloat(getComputedStyle(last).marginBottom) : c.getBoundingClientRect().top;
      return { first: (first?.textContent ?? "").slice(0, 40), extent: end - c.getBoundingClientRect().top, room: c.clientHeight, height: sh.getBoundingClientRect().height };
    })`)) as { first: string; extent: number; room: number; height: number }[];
    w.destroy();
    return r;
  }, htmlFile);
  expect(printed.map((x) => x.first)).toEqual(s.sheets.map((x) => x.first));
  for (const [i, x] of printed.entries()) expect(x.extent, `printed sheet ${i + 1} fits`).toBeLessThanOrEqual(x.room + 1);

  // File > Download > PDF: the PDF has as many pages as the screen.
  await page.getByRole("menuitem", { name: "File" }).click();
  await page.getByRole("menuitem", { name: /^Download/ }).click();
  await page.getByRole("menuitem", { name: /^PDF document/ }).click();
  await expect(page.getByText(new RegExp(`^Saved Untitled document\\.pdf · ${s.pages} pages$`))).toBeVisible({ timeout: 20_000 });
  const pdfName = readdirSync(saveDir).find((n) => n.endsWith(".pdf"))!;
  const pdf = readFileSync(join(saveDir, pdfName)).toString("latin1");
  expect(pdf.match(/\/Type\s*\/Page(?![a-zA-Z])/g)?.length).toBe(s.pages);

  // Print (Ctrl+P) renders the same document (tests stop short of the printer).
  await page.keyboard.press("Control+p");
  await expect(page.getByText(/Couldn't print/)).toHaveCount(0);

  // Zoom changes the size on screen, not the pages.
  await page.keyboard.press("Control+=");
  await page.keyboard.press("Control+=");
  await expect(page.getByRole("button", { name: /^Zoom 150%/ })).toBeVisible();
  await page.waitForTimeout(300);
  await expect(art).toHaveAttribute("data-pages", String(s.pages));
  const zoomed = await screenSheets(page);
  expect(zoomed.sheets.map((x) => x.first)).toEqual(s.sheets.map((x) => x.first));
  await page.keyboard.press("Control+0");
  await quit(l);
});

/** Each sheet as drawn, with floats: what starts it and how low its lowest block (wrapped images too) reaches. */
function floatSheets(page: Page) {
  return page.evaluate(() => {
    const art = document.querySelector<HTMLElement>("[data-testid=page]")!;
    const cs = getComputedStyle(art);
    const v = (name: string) => parseFloat(cs.getPropertyValue(name));
    const scale = art.getBoundingClientRect().width / v("--page-width");
    const content = v("--page-height") - v("--page-pad-top") - v("--page-pad-bottom");
    const root = art.querySelector<HTMLElement>(".pd-content")!;
    const key = (el: Element) => (el.matches(".pd-img") ? `image ${el.getAttribute("data-natural-width")}x${el.getAttribute("data-natural-height")}` : (el.textContent ?? "").slice(0, 40));
    const sheets: { first: string; reach: number; room: number; floats: number }[] = [];
    let start = root.getBoundingClientRect().top;
    let blocks: Element[] = [];
    const close = (end: number) => {
      const reach = Math.max(...blocks.map((b) => b.getBoundingClientRect().bottom + parseFloat(getComputedStyle(b).marginBottom) * scale));
      sheets.push({ first: key(blocks[0]!), reach: (Math.max(reach, end) - start) / scale, room: content, floats: blocks.filter((b) => getComputedStyle(b).float !== "none").length });
    };
    for (const k of root.children) {
      if (k.classList.contains("pd-sheet-break")) {
        close(k.querySelector(".pd-sheet-fill")!.getBoundingClientRect().top);
        start = k.getBoundingClientRect().bottom;
        blocks = [];
      } else blocks.push(k);
    }
    close(0);
    return { pages: Number(art.dataset.pages), sheets };
  });
}

test("7.5 wrapped images keep the pages: text runs beside them, none crosses a page, and the PDF matches", async () => {
  const saveDir = mkdtempSync(join(tmpdir(), "pdoc-pdf-"));
  const l = await launch({ env: { PDOC_SAVE_DIR: saveDir } });
  const { page, app } = l;
  await load(page, imageDocument());
  const art = page.getByTestId("page");
  await expect(page.locator(".pd-img img")).toHaveCount(14);
  await page.waitForFunction(() => [...document.querySelectorAll<HTMLImageElement>(".pd-img img")].every((i) => i.complete && i.naturalWidth > 0));
  await expect.poll(async () => Number(await art.getAttribute("data-pages"))).toBeGreaterThanOrEqual(5);
  await settled(page);

  const s = await floatSheets(page);
  expect(s.sheets.length).toBe(s.pages);
  expect(s.sheets.reduce((n, x) => n + x.floats, 0)).toBe(12);
  // Every sheet's blocks, floats included, end within its page.
  for (const [i, x] of s.sheets.entries()) expect(x.reach, `sheet ${i + 1} fits`).toBeLessThanOrEqual(x.room + 1);
  // Text runs beside a wrapped image: the paragraph after it starts level with it, not below it.
  const beside = await page.evaluate(() => {
    const img = document.querySelector<HTMLElement>('.pd-content .pd-img[data-wrap="left"]')!;
    const next = img.nextElementSibling!;
    return { img: img.getBoundingClientRect(), next: next.getBoundingClientRect() };
  });
  expect(beside.next.top).toBeLessThan(beside.img.bottom);
  expect(beside.next.top).toBeGreaterThanOrEqual(beside.img.top - 1);
  await page.locator('.pd-img[data-wrap="right"]').first().scrollIntoViewIfNeeded();
  await page.screenshot({ path: test.info().outputPath("wrapped.png") });

  // The layout settles: it doesn't change when nothing does.
  const again = await floatSheets(page);
  expect(again.sheets.map((x) => x.first)).toEqual(s.sheets.map((x) => x.first));

  // Print has the same sheets, and no image runs past its page.
  const req = await page.evaluate(() => (window as unknown as { __pdoc: { printRequest(): { html: string } } }).__pdoc.printRequest());
  const htmlFile = join(saveDir, "print.html");
  writeFileSync(htmlFile, req.html);
  const printed = await app.evaluate(async ({ BrowserWindow }, file) => {
    const w = new BrowserWindow({ show: false, width: 1200, height: 900 });
    await w.loadFile(file);
    await w.webContents.executeJavaScript(`Promise.all([...document.images].map((i) => i.decode().catch(() => {})))`);
    const r = (await w.webContents.executeJavaScript(`[...document.querySelectorAll(".print-sheet")].map((sh) => {
      const c = sh.querySelector(".pd-content");
      const kids = [...c.children];
      const first = kids[0];
      const key = (el) => el.matches(".pd-img") ? "image " + el.getAttribute("data-natural-width") + "x" + el.getAttribute("data-natural-height") : (el.textContent ?? "").slice(0, 40);
      const top = c.getBoundingClientRect().top;
      const reach = Math.max(0, ...kids.map((k) => k.getBoundingClientRect().bottom + parseFloat(getComputedStyle(k).marginBottom) - top));
      return { first: first ? key(first) : "", reach, room: c.clientHeight, missing: c.querySelectorAll(".pd-img-handle, .pd-img-missing, .pd-crop").length };
    })`)) as { first: string; reach: number; room: number; missing: number }[];
    w.destroy();
    return r;
  }, htmlFile);
  expect(printed.map((x) => x.first)).toEqual(s.sheets.map((x) => x.first));
  for (const [i, x] of printed.entries()) {
    expect(x.reach, `printed sheet ${i + 1} fits`).toBeLessThanOrEqual(x.room + 1);
    expect(x.missing, "no editing handles in print").toBe(0);
  }
  await quit(l);
});

