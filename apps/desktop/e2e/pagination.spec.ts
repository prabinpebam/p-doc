import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Page } from "@playwright/test";
import { expect, launch, quit, test } from "./helpers.ts";
import { imageDocument, load, longDocument, settled, splitDocument } from "./fixtures.ts";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

interface ScreenSheet {
  first: string;
  /** Height the sheet's blocks take, in page pixels. */
  extent: number;
  span: number;
  /** Outer height of the sheet's first block. */
  firstHeight: number;
  /** The previous sheet ended with a manual page break. */
  afterBreak: boolean;
  /** The sheet starts partway through a paragraph split across pages. */
  split: boolean;
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
    const blockAfter = (el: Element | null) => {
      while (el && el.classList.contains("pd-sheet-break")) el = el.nextElementSibling;
      return el;
    };
    const sheets: ScreenSheet[] = [];
    let start = root.getBoundingClientRect().top;
    let pageNo = 1;
    let first: Element = blockAfter(root.firstElementChild)!;
    let split = false;
    let afterBreak = false;
    for (const k of root.querySelectorAll<HTMLElement>(".pd-sheet-break")) {
      const end = Number(k.dataset.pageEnd);
      const o = outer(first);
      sheets.push({ first: split ? "(continued)" : (first.textContent ?? "").slice(0, 40), extent: (k.querySelector(".pd-sheet-fill")!.getBoundingClientRect().top - start) / scale, span: end - pageNo + 1, firstHeight: (o.bottom - o.top) / scale, afterBreak, split });
      const inside = k.parentElement !== root;
      afterBreak = !inside && !!k.previousElementSibling?.classList.contains("pd-page-break");
      start = k.getBoundingClientRect().bottom;
      pageNo = end + 1;
      split = inside;
      first = inside ? k.parentElement! : blockAfter(k.nextElementSibling)!;
    }
    const last = [...root.children].filter((c) => !c.classList.contains("pd-sheet-break")).at(-1)!;
    const o = outer(first);
    sheets.push({ first: split ? "(continued)" : (first.textContent ?? "").slice(0, 40), extent: (outer(last).bottom - start) / scale, span: pages - pageNo + 1, firstHeight: (o.bottom - o.top) / scale, afterBreak, split });
    return { pages, content, sheets };
  });
}

test("2.1 2.4 Pages lays out sheets of the page size, moves blocks that don't fit, and the PDF has the same pages", async () => {
  const saveDir = mkdtempSync(join(tmpdir(), "pdoc-pdf-"));
  const l = await launch({ env: { PDOC_SAVE_DIR: saveDir } });
  const { page, app } = l;
  await load(page, longDocument());
  const art = page.getByTestId("page");
  await expect.poll(async () => Number(await art.getAttribute("data-pages"))).toBeGreaterThanOrEqual(12);
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
    // A sheet that starts inside a split paragraph follows the widow and orphan rule instead (9.3).
    if (i > 0 && !x.afterBreak && !x.split) expect(s.sheets[i - 1]!.extent + x.firstHeight, `sheet ${i + 1} starts because "${x.first}" didn't fit`).toBeGreaterThan(s.content * s.sheets[i - 1]!.span - 1);
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
      return { first: first?.classList.contains("pd-split-tail") ? "(continued)" : (first?.textContent ?? "").slice(0, 40), extent: end - c.getBoundingClientRect().top, room: c.clientHeight, height: sh.getBoundingClientRect().height };
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
      const key = (el) => el.matches(".pd-split-tail") ? "(continued)" : el.matches(".pd-img") ? "image " + el.getAttribute("data-natural-width") + "x" + el.getAttribute("data-natural-height") : (el.textContent ?? "").slice(0, 40);
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

/** Each PDF page's text, without spaces (they differ in how the PDF places words). */
async function pdfPages(file: string): Promise<string[]> {
  const task = getDocument({ data: new Uint8Array(readFileSync(file)), useSystemFonts: false });
  const pdf = await task.promise;
  const out: string[] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const tc = await (await pdf.getPage(i)).getTextContent();
    out.push(tc.items.map((it) => ("str" in it ? it.str : "")).join("").replace(/\s+/g, ""));
  }
  await task.destroy();
  return out;
}

test("9.3 A10 paragraphs split across pages at lines, and the PDF breaks at the same words", async () => {
  const saveDir = mkdtempSync(join(tmpdir(), "pdoc-pdf-"));
  const l = await launch({ env: { PDOC_SAVE_DIR: saveDir } });
  const { page } = l;
  await load(page, splitDocument());
  const art = page.getByTestId("page");
  await expect.poll(async () => Number(await art.getAttribute("data-pages"))).toBeGreaterThanOrEqual(8);
  await settled(page);

  // Each page's text as drawn: from the end of one sheet break to the start of the next.
  const screen = await page.evaluate(() => {
    const art = document.querySelector<HTMLElement>("[data-testid=page]")!;
    const scale = art.getBoundingClientRect().width / parseFloat(getComputedStyle(art).getPropertyValue("--page-width"));
    const root = art.querySelector<HTMLElement>(".pd-content")!;
    const breaks = [...root.querySelectorAll<HTMLElement>(".pd-sheet-break")];
    const r = document.createRange();
    const texts: string[] = [];
    let from: [Node, number] = [root, 0];
    for (const b of [...breaks, null]) {
      r.setStart(...from);
      if (b) r.setEndBefore(b);
      else r.setEnd(root, root.childNodes.length);
      texts.push(r.toString().replace(/\s+/g, ""));
      if (b) from = [b.parentNode!, [...b.parentNode!.childNodes].indexOf(b) + 1];
    }
    const line = parseFloat(getComputedStyle(root.querySelector("p")!).lineHeight);
    return {
      pages: Number(art.dataset.pages),
      texts,
      inside: breaks.filter((b) => b.classList.contains("pd-sheet-break--inside")).length,
      fills: breaks.map((b) => b.querySelector<HTMLElement>(".pd-sheet-fill")!.getBoundingClientRect().height / scale),
      line,
    };
  });
  expect(screen.texts.length).toBe(screen.pages);
  // Most pages break inside a paragraph, and no page foot is left with more than two lines of space.
  expect(screen.inside).toBeGreaterThanOrEqual(screen.pages / 2);
  for (const [i, f] of screen.fills.entries()) expect(f, `space at the foot of page ${i + 1}`).toBeLessThan(2 * screen.line + 11);
  await page.locator(".pd-sheet-break--inside").first().scrollIntoViewIfNeeded();
  await page.screenshot({ path: test.info().outputPath("split.png") });

  // The status bar counts a split paragraph's later lines on the later page.
  await page.locator(".pd-sheet-break--inside").first().evaluate((b) => b.scrollIntoView({ block: "center" }));

  await page.getByRole("menuitem", { name: "File" }).click();
  await page.getByRole("menuitem", { name: /^Download/ }).click();
  await page.getByRole("menuitem", { name: /^PDF document/ }).click();
  await expect(page.getByText(new RegExp(`^Saved Untitled document\\.pdf · ${screen.pages} pages$`))).toBeVisible({ timeout: 20_000 });
  const printed = await pdfPages(join(saveDir, readdirSync(saveDir).find((n) => n.endsWith(".pdf"))!));
  expect(printed.length).toBe(screen.pages);
  // Each PDF page starts and ends at the same word as the page on screen.
  for (const [i, t] of printed.entries()) {
    expect(t.slice(0, 30), `page ${i + 1} starts the same`).toBe(screen.texts[i]!.slice(0, 30));
    expect(t.slice(-30), `page ${i + 1} ends the same`).toBe(screen.texts[i]!.slice(-30));
  }
  await quit(l);
});
