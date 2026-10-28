import type { Page } from "@playwright/test";
import { editor, expect, filesIn, launch, PROMPTLY, quit, test, type Dirs } from "./helpers.ts";

interface Thread {
  id: string;
  body: string;
  quote: string;
  resolved: boolean;
  edited?: string;
  replies: { body: string }[];
}

const items = (page: Page) => page.getByTestId("review-item");
const panel = (page: Page) => page.getByRole("complementary", { name: "Review" });
const saved = (dirs: Dirs): Thread[] => ((filesIn(dirs, "private")[0]?.doc as { comments?: Thread[] } | undefined)?.comments ?? []);
const savedJson = (dirs: Dirs) => JSON.stringify(filesIn(dirs, "private")[0]?.doc.content ?? null);

async function selectWord(page: Page, word: string): Promise<void> {
  await editor(page).evaluate((el, w) => {
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const i = n.textContent!.indexOf(w);
      if (i >= 0) {
        const r = document.createRange();
        r.setStart(n, i);
        r.setEnd(n, i + w.length);
        getSelection()!.removeAllRanges();
        getSelection()!.addRange(r);
        return;
      }
    }
    throw new Error(`no ${w}`);
  }, word);
  await page.waitForTimeout(50);
}

async function cardAction(page: Page, scope: ReturnType<Page["locator"]>, action: string): Promise<void> {
  await scope.getByRole("button", { name: /^More actions for/ }).first().click();
  await page.getByRole("menu", { name: /^Actions for/ }).getByRole("menuitem", { name: action }).click();
}

test("4.5 comments: add, reply, edit, resolve, reopen, delete; kept in the file", async () => {
  const l = await launch();
  const { page, dirs } = l;
  const ed = editor(page);
  await page.keyboard.type("Alpha beta gamma.");

  // Add: on the selection; the draft is highlighted until posted.
  await selectWord(page, "beta");
  await page.keyboard.press("Control+Alt+M");
  await expect(page.locator("#comment-draft")).toBeFocused();
  await expect(ed.locator(".pd-comment-draft")).toHaveText("beta");
  await page.keyboard.type("Why beta?");
  await page.keyboard.press("Control+Enter");
  await expect(ed.locator(".pd-comment")).toHaveText("beta");
  await expect(ed.locator(".pd-comment-draft")).toHaveCount(0);
  await expect(items(page)).toHaveCount(1);
  await expect(items(page).first()).toContainText("Why beta?");
  await expect.poll(() => saved(dirs).map((t) => t.body), PROMPTLY).toEqual(["Why beta?"]);
  expect(saved(dirs)[0]!.quote).toBe("beta");
  expect(savedJson(dirs)).toContain('"type":"comment"');

  // With no selection, the word at the cursor; Esc drops the draft and nothing is added.
  await selectWord(page, "gamma");
  await page.keyboard.press("ArrowLeft");
  await page.keyboard.press("Control+Alt+M");
  await expect(page.getByTestId("comment-draft")).toContainText("gamma");
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("comment-draft")).toHaveCount(0);
  await expect(ed).toBeFocused();
  await expect(ed.locator(".pd-comment")).toHaveCount(1);

  // Reply.
  const card = items(page).first();
  await card.getByRole("textbox", { name: "Reply" }).fill("Because.");
  await card.getByRole("button", { name: "Reply", exact: true }).click();
  await expect(card.getByTestId("review-reply")).toContainText("Because.");
  await expect.poll(() => saved(dirs)[0]?.replies.map((r) => r.body), PROMPTLY).toEqual(["Because."]);

  // Edit your own comment.
  await cardAction(page, card.locator(".review-head").first(), "Edit");
  const box = card.getByRole("textbox", { name: "Edit comment" });
  await expect(box).toBeFocused();
  await box.fill("Why beta, really?");
  await box.press("Control+Enter");
  await expect(card).toContainText("Why beta, really?");
  await expect(card).toContainText("(edited)");
  await expect.poll(() => saved(dirs)[0]?.edited, PROMPTLY).toBeTruthy();

  // Resolve: under Resolved, without its highlight. Reopen: back.
  await card.getByRole("button", { name: "Resolve" }).click();
  await expect(items(page)).toHaveCount(0);
  expect(await ed.locator(".pd-comment").evaluate((e) => getComputedStyle(e).backgroundColor)).toBe("rgba(0, 0, 0, 0)");
  await expect.poll(() => saved(dirs)[0]?.resolved, PROMPTLY).toBe(true);
  await panel(page).getByRole("button", { name: /^Resolved/ }).click();
  await expect(items(page)).toHaveCount(1);
  await items(page).first().getByRole("button", { name: "Reopen" }).click();
  await panel(page).getByRole("button", { name: "Open", exact: true }).click();
  await expect(items(page)).toHaveCount(1);
  expect(await ed.locator(".pd-comment").evaluate((e) => getComputedStyle(e).backgroundColor)).not.toBe("rgba(0, 0, 0, 0)");
  await expect.poll(() => saved(dirs)[0]?.resolved, PROMPTLY).toBe(false);

  // Delete a reply, after asking.
  await cardAction(page, items(page).first().getByTestId("review-reply"), "Delete");
  const ask = page.getByRole("dialog", { name: "Delete this reply?" });
  await ask.getByRole("button", { name: "Delete" }).click();
  await expect(ask).toHaveCount(0);
  await expect(page.getByText("Reply deleted.")).toBeVisible();
  await expect(items(page).first().getByTestId("review-reply")).toHaveCount(0);
  await expect.poll(() => saved(dirs)[0]?.replies.length, PROMPTLY).toBe(0);

  // Comments can be made in Viewing too.
  await page.keyboard.press("Control+Alt+Shift+C");
  await selectWord(page, "Alpha");
  await page.keyboard.press("Control+Alt+M");
  await page.keyboard.type("Fine as is.");
  await page.keyboard.press("Control+Enter");
  await expect(ed.locator(".pd-comment")).toHaveCount(2);
  await expect(items(page)).toHaveCount(2);
  expect(await items(page).evaluateAll((els) => els.map((e) => e.textContent ?? ""))).toEqual([expect.stringContaining("Fine as is."), expect.stringContaining("Why beta, really?")]);
  await page.keyboard.press("Control+Alt+Shift+Z");

  // The commented text deleted: the thread stays, says so, and goes last.
  await selectWord(page, "beta");
  await page.keyboard.press("Backspace");
  await expect(ed.locator(".pd-comment")).toHaveCount(1);
  await expect(items(page).last()).toContainText("Text deleted.");
  await expect(items(page).last()).toContainText("beta");
  await page.screenshot({ path: test.info().outputPath("comments.png") });
  await quit(l);

  // Kept across a restart.
  const again = await launch({ dirs });
  await again.page.getByTestId("review-button").click();
  await expect(items(again.page)).toHaveCount(2);
  await expect(items(again.page).last()).toContainText("Text deleted.");

  // Delete a thread: the text loses its highlight.
  await cardAction(again.page, items(again.page).first().locator(".review-head").first(), "Delete");
  await again.page.getByRole("dialog", { name: "Delete this comment?" }).getByRole("button", { name: "Delete" }).click();
  await expect(again.page.getByText("Comment deleted.")).toBeVisible();
  await expect(items(again.page)).toHaveCount(1);
  await expect(editor(again.page).locator(".pd-comment")).toHaveCount(0);
  await expect.poll(() => saved(dirs).map((t) => t.body), PROMPTLY).toEqual(["Why beta, really?"]);
  expect(savedJson(dirs)).not.toContain('"type":"comment"');
  await quit(again);
});
