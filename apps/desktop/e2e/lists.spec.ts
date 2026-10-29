import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import type { JSONContent } from "@tiptap/core";
import { BULLET_FORMATS, NUMBER_FORMATS, fromMarkdown, listMarker } from "@p-doc/core";
import { caretIn, editor, expect, filesIn, launch, PROMPTLY, quit, test, choose } from "./helpers.ts";
import { load } from "./fixtures.ts";

const item = (text: string) => ({ type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text }] }] });
type Saved = { content: { content: { type: string; attrs?: Record<string, unknown> }[] } };
const savedBlocks = (dirs: Parameters<typeof filesIn>[0]) => (filesIn(dirs, "private")[0]?.doc as unknown as Saved | undefined)?.content.content ?? [];

test("8.3 list options set each level's format and start; restart and continue numbering; nine levels; kept after reopening", async () => {
  const l = await launch();
  const { page } = l;
  const ed = editor(page);
  await load(page, { type: "doc", content: [
    { type: "orderedList", attrs: { start: 1 }, content: [item("First"), item("Second"), item("Third")] },
    { type: "paragraph", content: [{ type: "text", text: "Between the lists" }] },
    { type: "orderedList", attrs: { start: 1 }, content: [item("Later one"), item("Later two")] },
    { type: "bulletList", content: [item("Bullet")] },
  ] });
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const lists = async (label: string) => {
    await page.getByRole("menuitem", { name: "Format", exact: true }).click();
    await page.getByRole("menuitem", { name: /^Lists/ }).click();
    await page.getByRole("menuitem", { name: label, exact: true }).click();
  };
  const p = (text: string) => ed.locator("li > p", { hasText: text });
  const first = ed.locator("ol").first();

  // Level 1 as a, b, c from 3; Undo returns, Redo applies again.
  await caretIn(p("First"));
  await lists("List options…");
  let dialog = page.getByRole("dialog", { name: "List options" });
  await choose(dialog.locator('[role=combobox][name="list-format-1"]'), { label: "a, b, c" });
  await dialog.locator('input[name="list-start-1"]').fill("abc");
  await expect(dialog.getByText("Enter a whole number from 0 to 32767.")).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Apply" })).toBeDisabled();
  await dialog.locator('input[name="list-start-1"]').fill("3");
  await dialog.getByRole("button", { name: "Apply" }).click();
  await expect(dialog).toBeHidden();
  await expect(first).toHaveCSS("list-style-type", "lower-alpha");
  await expect(first).toHaveAttribute("start", "3");
  await page.keyboard.press("Control+z");
  await expect(first).toHaveCSS("list-style-type", "decimal");
  await expect(first).not.toHaveAttribute("start", "3");
  await page.keyboard.press("Control+y");
  await expect(first).toHaveCSS("list-style-type", "lower-alpha");

  // Restart numbering at the second item splits the list there and counts from 1.
  await caretIn(p("Second"));
  await lists("Restart numbering");
  await expect(ed.locator("ol")).toHaveCount(3);
  await expect(ed.locator("ol").nth(1).locator("> li")).toHaveCount(2);
  await expect(ed.locator("ol").nth(1)).not.toHaveAttribute("start", /.+/);
  await expect(ed.locator("ol").nth(1)).toHaveCSS("list-style-type", "lower-alpha");

  // Continue numbering: the later list carries on from the one before it (1 + 2 items).
  await caretIn(p("Later one"));
  await lists("Continue numbering");
  await expect(ed.locator("ol").nth(2)).toHaveAttribute("start", "3");
  // Next to its list, continuing joins them again.
  await caretIn(p("Second"));
  await lists("Continue numbering");
  await expect(ed.locator("ol")).toHaveCount(2);
  await expect(first.locator("> li")).toHaveCount(3);

  // Nested levels default to 1, a, i; Tab stops at the ninth level.
  await caretIn(p("Bullet"));
  await page.keyboard.press("End");
  for (let i = 0; i < 9; i++) {
    await page.keyboard.press("Enter");
    await page.keyboard.type(`Level ${i + 2}`);
    await page.keyboard.press("Tab");
  }
  const deepest = await ed.locator("ul").evaluateAll((els) => Math.max(...els.map((el) => { let n = 0; for (let x: Element | null = el; x; x = x.parentElement?.closest("ul") ?? null) n++; return n; })));
  expect(deepest).toBe(9);
  await expect(ed.locator("ul ul").first()).toHaveCSS("list-style-type", "circle");
  await expect(ed.locator("ul ul ul").first()).toHaveCSS("list-style-type", "square");

  // List options on a bulleted list: level 2 as dashes, from command search.
  await caretIn(p("Level 2"));
  await page.keyboard.press("Alt+/");
  const palette = page.getByRole("dialog", { name: "Command search" });
  await palette.getByRole("combobox").fill("List options");
  await page.keyboard.press("Enter");
  dialog = page.getByRole("dialog", { name: "List options" });
  await expect(dialog.getByRole("combobox")).toHaveCount(9);
  await expect(dialog.locator('input[name^="list-start"]')).toHaveCount(0);
  await choose(dialog.locator('[role=combobox][name="list-format-2"]'), { label: "– Dash" });
  await page.screenshot({ path: test.info().outputPath("list-options-light.png") });
  await page.emulateMedia({ colorScheme: "dark" });
  await page.waitForTimeout(400);
  await page.screenshot({ path: test.info().outputPath("list-options-dark.png") });
  await page.emulateMedia({ colorScheme: "light" });
  await dialog.getByRole("button", { name: "Apply" }).click();
  await expect(ed.locator("ul ul").first()).toHaveAttribute("data-format", "dash");

  await expect.poll(() => savedBlocks(l.dirs)[0]?.attrs, PROMPTLY).toMatchObject({ start: 3, listFormat: "lower-alpha" });
  expect(errors).toEqual([]);
  await quit(l);

  const again = await launch({ dirs: l.dirs });
  const ed2 = editor(again.page);
  await expect(ed2.locator("ol").first()).toHaveCSS("list-style-type", "lower-alpha");
  await expect(ed2.locator("ol").first()).toHaveAttribute("start", "3");
  await expect(ed2.locator("ul ul").first()).toHaveAttribute("data-format", "dash");
  await quit(again);
});

test("8.3 list formats and start numbers survive Markdown and text downloads and print to PDF", async () => {
  const saveDir = mkdtempSync(join(tmpdir(), "pdoc-lists-"));
  const l = await launch({ env: { PDOC_SAVE_DIR: saveDir } });
  const { page } = l;
  await page.locator("#doc-title").fill("List formats");
  await page.keyboard.press("Enter");
  const formats = [...NUMBER_FORMATS, ...BULLET_FORMATS];
  const nested = (kind: "orderedList" | "bulletList") => {
    let list: JSONContent | undefined;
    for (let depth = 9; depth >= 1; depth--) {
      list = { type: kind, content: [{ type: "listItem", content: [
        { type: "paragraph", content: [{ type: "text", text: `${kind} level ${depth}` }] },
        ...(list ? [list] : []),
      ] }] };
    }
    return list!;
  };
  await load(page, { type: "doc", content: [...formats.map((format) => ({
    type: NUMBER_FORMATS.some((f) => f === format) ? "orderedList" : "bulletList",
    attrs: { start: 4, listFormat: format },
    content: [item(`${format} first`), item(`${format} second`)],
  })), nested("orderedList"), nested("bulletList")] });
  const download = async (label: RegExp, ext: string) => {
    await page.getByRole("menuitem", { name: "File", exact: true }).click();
    await page.getByRole("menuitem", { name: /^Download/ }).click();
    await page.getByRole("menuitem", { name: label }).click();
    await expect(page.getByText(new RegExp(`^Saved List formats\\.${ext}(?: ·|$)`))).toBeVisible({ timeout: 20_000 });
    return join(saveDir, `List formats.${ext}`);
  };
  const md = readFileSync(await download(/^Markdown/, "md"), "utf8");
  expect(md).toContain("4. decimal first\n5. decimal second");
  const back = fromMarkdown(md).content!;
  expect(back).toHaveLength(formats.length + 2);
  formats.forEach((format, i) => {
    if (format !== "decimal" && format !== "disc") expect(back[i]!.attrs?.listFormat).toBe(format);
    if (NUMBER_FORMATS.some((f) => f === format)) expect(back[i]!.attrs?.start).toBe(4);
  });
  const text = readFileSync(await download(/^Plain text/, "txt"), "utf8");
  for (const format of formats) {
    expect(text).toContain(`${listMarker(format, 4)} ${format} first`);
    expect(text).toContain(`${listMarker(format, 5)} ${format} second`);
  }
  await page.screenshot({ path: test.info().outputPath("list-formats-page.png"), fullPage: true });
  const pdfPath = await download(/^PDF document/, "pdf");
  const task = getDocument({ data: new Uint8Array(readFileSync(pdfPath)), useSystemFonts: false });
  try {
    const pdf = await task.promise;
    // pdfjs types this Node canvas factory as object; its render context is canvas-compatible.
    type PdfCanvas = { canvas: { toBuffer(format: "image/png"): Buffer }; context: CanvasRenderingContext2D };
    const canvasFactory = pdf.canvasFactory as { create(width: number, height: number): PdfCanvas; destroy(canvas: PdfCanvas): void };
    const lines: string[] = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      const sheet = await pdf.getPage(i);
      const content = await sheet.getTextContent();
      lines.push(content.items.map((it) => "str" in it ? it.str : "").join(" "));
      const viewport = sheet.getViewport({ scale: 1.5 });
      const canvas = canvasFactory.create(viewport.width, viewport.height);
      await sheet.render({ canvas: null, canvasContext: canvas.context, viewport }).promise;
      writeFileSync(test.info().outputPath(`list-formats-print-${i}.png`), canvas.canvas.toBuffer("image/png"));
      canvasFactory.destroy(canvas);
    }
    const printed = lines.join("").replace(/\s+/g, "");
    for (const format of formats) {
      // Chromium draws these bullets as shapes, not PDF text; inspect the rendered pages too.
      const marker = (n: number) => ["disc", "circle", "square"].includes(format) ? "" : listMarker(format, n);
      expect(printed).toContain(`${marker(4)}${format}first`);
      expect(printed).toContain(`${marker(5)}${format}second`);
    }
    for (let depth = 1; depth <= 9; depth++) {
      const marker = ["1.", "a.", "i."][(depth - 1) % 3];
      expect(printed).toContain(`${marker}orderedListlevel${depth}`);
      expect(printed).toContain(`bulletListlevel${depth}`);
    }
  } finally {
    await task.destroy();
  }
  expect(l.log.filter((line) => line.includes("[pageerror]"))).toEqual([]);
  await quit(l);
});
