import { expect, filesIn, launch, PROMPTLY, quit, test } from "./helpers.ts";
import { headedDocument, load, settled } from "./fixtures.ts";

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
