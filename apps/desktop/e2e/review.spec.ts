import type { Page } from "@playwright/test";
import { editor, expect, launch, quit, test } from "./helpers.ts";

const text = (page: Page) => editor(page).evaluate((el) => (el as HTMLElement).innerText.trim());
const items = (page: Page) => page.getByTestId("review-item");
const panel = (page: Page) => page.getByRole("complementary", { name: "Review" });
const me = (page: Page) => page.evaluate(() => (window as unknown as { __pdoc: { app: { get(): { settings: { identity: { name: string } } } } } }).__pdoc.app.get().settings.identity.name || "Me");
/** The page's selected text (the editor's own selection: the page needn't have focus). */
const selected = (page: Page) =>
  page.evaluate(() => {
    const e = (window as unknown as { __pdoc: { getEditor(): { state: { doc: { textBetween(a: number, b: number): string }; selection: { from: number; to: number } } } } }).__pdoc.getEditor();
    return e.state.doc.textBetween(e.state.selection.from, e.state.selection.to);
  });

async function markup(page: Page, name: RegExp): Promise<void> {
  await page.getByRole("menuitem", { name: "View" }).click();
  await page.getByRole("menuitem", { name: /^Markup/ }).click();
  await page.getByRole("menuitemcheckbox", { name }).click();
}

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
  // ProseMirror reads the DOM selection on selectionchange.
  await page.waitForTimeout(50);
}

test("4.1 Editing, Suggesting and Viewing switch from the toolbar and shortcuts; Viewing blocks edits", async () => {
  const l = await launch();
  const { page } = l;
  const ed = editor(page);
  await page.keyboard.type("Hello world.");
  await expect(page.getByTestId("mode-badge")).toHaveCount(0);

  // The toolbar's mode menu.
  await page.getByRole("button", { name: "Mode: Editing" }).click();
  await page.getByRole("menuitemcheckbox", { name: /^Suggesting/ }).click();
  await expect(page.getByTestId("mode-badge")).toHaveText("Suggesting");
  await expect(page.getByRole("button", { name: "Mode: Suggesting" })).toBeVisible();

  // Shortcuts.
  await ed.press("Control+End");
  await page.keyboard.press("Control+Alt+Shift+C");
  await expect(page.getByTestId("mode-badge")).toHaveText("Viewing");
  await expect(ed).toHaveAttribute("contenteditable", "false");
  await expect(page.getByRole("button", { name: /^Bold/ })).toBeDisabled();
  await expect(page.getByRole("combobox", { name: "Paragraph style" })).toBeDisabled();
  await ed.click();
  await page.keyboard.type("XYZ");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Backspace");
  await page.keyboard.press("Control+B");
  expect(await text(page)).toBe("Hello world.");
  await expect(ed.locator("strong")).toHaveCount(0);

  await page.keyboard.press("Control+Alt+Shift+Z");
  await expect(page.getByTestId("mode-badge")).toHaveCount(0);
  await expect(ed).toHaveAttribute("contenteditable", "true");
  await ed.press("Control+End");
  await page.keyboard.type(" Bye.");
  expect(await text(page)).toBe("Hello world. Bye.");
  // Editing makes no marks.
  await expect(ed.locator("ins, del")).toHaveCount(0);
  await quit(l);
});

test("4.2–4.6 suggest, see markup views, review in order, accept and reject", async () => {
  const l = await launch();
  const { page } = l;
  const ed = editor(page);
  const author = await me(page);
  await page.keyboard.type("The quick fox runs.");

  // 4.2 Suggesting: a replaced word is a deletion and an insertion, with author and time.
  await page.keyboard.press("Control+Alt+Shift+X");
  await expect(page.getByTestId("mode-badge")).toHaveText("Suggesting");
  await selectWord(page, "quick");
  await page.keyboard.type("slow");
  await expect(ed.locator("del.pd-deletion")).toHaveText("quick");
  await expect(ed.locator("ins.pd-insertion")).toHaveText("slow");
  const ins = ed.locator("ins.pd-insertion").first();
  await expect(ins).toHaveAttribute("data-author", author);
  expect(Date.now() - Date.parse((await ins.getAttribute("data-time"))!)).toBeLessThan(60_000);
  expect(await text(page)).toBe("The quickslow fox runs.");

  // Deleting your own suggestion takes it away; it never becomes a deletion.
  await ed.press("End");
  await page.keyboard.type(" Fast");
  await expect(ed.locator("ins.pd-insertion")).toHaveCount(2);
  for (let i = 0; i < 5; i++) await page.keyboard.press("Backspace");
  await expect(ed.locator("ins.pd-insertion")).toHaveCount(1);
  await expect(ed.locator("del.pd-deletion")).toHaveCount(1);
  expect(await text(page)).toBe("The quickslow fox runs.");
  await page.keyboard.type(" Done.");

  // 4.3 Markup views.
  await markup(page, /^Simple markup/);
  expect(await text(page)).toBe("The slow fox runs. Done.");
  expect(await ed.locator("p").first().evaluate((p) => getComputedStyle(p, "::after").content)).not.toBe("none");
  await expect(ed).toHaveAttribute("contenteditable", "true");
  await expect(page.getByTestId("markup-note")).toHaveText("Simple markup");
  await markup(page, /^No markup/);
  expect(await text(page)).toBe("The slow fox runs. Done.");
  await expect(ed).toHaveAttribute("contenteditable", "false");
  await expect(page.getByTestId("markup-note")).toContainText("read only");
  await markup(page, /^Original/);
  expect(await text(page)).toBe("The quick fox runs.");
  await expect(ed).toHaveAttribute("contenteditable", "false");
  await page.screenshot({ path: test.info().outputPath("markup-original.png") });
  // The note goes back to All markup.
  await page.getByTestId("markup-note").click();
  await expect(page.getByTestId("markup-note")).toHaveCount(0);
  expect(await text(page)).toBe("The quickslow fox runs. Done.");
  await expect(ed).toHaveAttribute("contenteditable", "true");

  // A comment on the first word, made in Suggesting.
  await selectWord(page, "The");
  await page.keyboard.press("Control+Alt+M");
  await expect(page.locator("#comment-draft")).toBeFocused();
  await page.keyboard.type("Capitalise?");
  await page.keyboard.press("Control+Enter");

  // 4.6 The panel lists changes and comments in document order.
  await expect(panel(page)).toBeVisible();
  await expect(page.getByTestId("review-counts")).toHaveText("3 changes · 1 comment");
  await expect(page.getByTestId("review-button")).toHaveAttribute("aria-label", "Review: 3 changes, 1 comment");
  await expect(items(page)).toHaveCount(4);
  expect(await items(page).evaluateAll((els) => els.map((e) => e.getAttribute("data-kind")))).toEqual(["comment", "deletion", "insertion", "insertion"]);
  await expect(items(page).nth(1)).toContainText("quick");
  await expect(items(page).nth(2)).toContainText("slow");
  await expect(items(page).nth(3)).toContainText("Done.");
  await expect(items(page).nth(0)).toContainText("Capitalise?");
  await page.screenshot({ path: test.info().outputPath("review-panel.png") });

  // 4.4 Next and Previous move through them and select their text.
  await items(page).nth(0).locator(".review-open").click();
  await expect(items(page).nth(0)).toHaveClass(/active/);
  await panel(page).getByRole("button", { name: "Next change or comment" }).click();
  await expect(items(page).nth(1)).toHaveClass(/active/);
  expect(await selected(page)).toBe("quick");
  await panel(page).getByRole("button", { name: "Next change or comment" }).click();
  await expect(items(page).nth(2)).toHaveClass(/active/);
  await panel(page).getByRole("button", { name: "Previous change or comment" }).click();
  await expect(items(page).nth(1)).toHaveClass(/active/);

  // Accept the insertion, reject the deletion.
  await items(page).nth(2).getByRole("button", { name: "Accept" }).click();
  await items(page).nth(1).getByRole("button", { name: "Reject" }).click();
  await expect(items(page)).toHaveCount(2);
  expect(await text(page)).toBe("The quickslow fox runs. Done.");
  await expect(ed.locator("del")).toHaveCount(0);
  await expect(ed.locator("ins")).toHaveCount(1);

  // Resolve the comment: it moves to Resolved and its highlight goes.
  await items(page).nth(0).getByRole("button", { name: "Resolve" }).click();
  await expect(items(page)).toHaveCount(1);
  await expect(page.getByTestId("review-counts")).toHaveText("1 change · 0 comments");
  const bg = await ed.locator(".pd-comment").evaluate((e) => getComputedStyle(e).backgroundColor);
  expect(bg).toBe("rgba(0, 0, 0, 0)");
  await panel(page).getByRole("button", { name: /^Resolved/ }).click();
  await expect(items(page)).toHaveCount(1);
  await expect(items(page).first()).toHaveAttribute("data-kind", "comment");
  await panel(page).getByRole("button", { name: "Open", exact: true }).click();

  // Viewing: accept and reject are off; typing does nothing.
  await page.keyboard.press("Control+Alt+Shift+C");
  await expect(items(page).first().getByRole("button", { name: "Accept" })).toBeDisabled();
  await expect(panel(page).getByRole("button", { name: "Accept all" })).toBeDisabled();
  await page.keyboard.press("Control+Alt+Shift+X");

  // Esc closes the panel.
  await panel(page).getByRole("button", { name: "Close review" }).focus();
  await page.keyboard.press("Escape");
  await expect(panel(page)).toHaveCount(0);
  await quit(l);
});

test("PD5 accept all gives the suggested text; reject all the original, exactly", async () => {
  const l = await launch();
  const { page } = l;
  const ed = editor(page);
  await page.keyboard.type("One two three.");
  await page.keyboard.press("Enter");
  await page.keyboard.type("Four five.");
  const original = await ed.innerHTML();

  await page.keyboard.press("Control+Alt+Shift+X");
  await selectWord(page, "two");
  await page.keyboard.type("2");
  await selectWord(page, "Four");
  await page.keyboard.press("Backspace");
  await ed.press("Control+End");
  await page.keyboard.press("Enter");
  await page.keyboard.type("Six.");
  await ed.press("Control+Home");
  await page.keyboard.type("Zero ");
  await expect(ed.locator("ins, del").first()).toBeVisible();

  await page.getByTestId("review-button").click();
  await panel(page).getByRole("button", { name: "Accept all" }).click();
  await expect(page.getByText(/^Accepted \d+ changes\.$/)).toBeVisible();
  await expect(ed.locator("ins, del, .pd-split, .pd-join")).toHaveCount(0);
  expect(await text(page)).toBe("Zero One 2 three.\n\n five.\n\nSix.");

  await page.keyboard.press("Control+Z");
  await expect(ed.locator("ins, del").first()).toBeVisible();
  await panel(page).getByRole("button", { name: "Reject all" }).click();
  await expect(ed.locator("ins, del, .pd-split, .pd-join")).toHaveCount(0);
  expect(await ed.innerHTML()).toBe(original);
  await quit(l);
});

test("13.1 formatting changes in Suggesting are suggestions; accept all and reject all are exact", async () => {
  const l = await launch();
  const { page } = l;
  const ed = editor(page);
  await page.keyboard.type("Make this bold.");
  await page.keyboard.press("Enter");
  await page.keyboard.type("A heading line.");
  const original = await ed.innerHTML();

  await page.keyboard.press("Control+Alt+Shift+X");
  await selectWord(page, "bold");
  await page.keyboard.press("Control+B");
  await selectWord(page, "heading");
  await page.keyboard.press("Control+Alt+1");
  await expect(ed.locator("strong")).toHaveText("bold");
  await expect(ed.locator(".pd-format")).toHaveText("bold");
  await expect(ed.locator("h1.pd-format-block")).toHaveText("A heading line.");

  await page.getByTestId("review-button").click();
  await expect(items(page)).toHaveCount(2);
  await expect(items(page).nth(0)).toContainText("Formatted: Bold");
  await expect(items(page).nth(1)).toContainText("Formatted: Heading 1");
  await page.screenshot({ path: test.info().outputPath("format-suggestions.png") });

  // Reject one: the heading goes back to a paragraph; the bold stays suggested.
  await items(page).nth(1).getByRole("button", { name: "Reject" }).click();
  await expect(ed.locator("h1")).toHaveCount(0);
  await expect(items(page)).toHaveCount(1);
  await ed.focus();
  await page.keyboard.press("Control+Z");
  await expect(ed.locator("h1")).toHaveCount(1);

  await panel(page).getByRole("button", { name: "Accept all" }).click();
  await expect(ed.locator(".pd-format, .pd-format-block")).toHaveCount(0);
  await expect(ed.locator("strong")).toHaveText("bold");
  await expect(ed.locator("h1")).toHaveText("A heading line.");

  await page.keyboard.press("Control+Z");
  await expect(ed.locator(".pd-format")).toHaveCount(1);
  await panel(page).getByRole("button", { name: "Reject all" }).click();
  await expect(ed.locator(".pd-format, .pd-format-block")).toHaveCount(0);
  expect(await ed.innerHTML()).toBe(original);
  await quit(l);
});