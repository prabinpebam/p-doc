import type { Locator, Page } from "@playwright/test";
import type { Editor } from "@tiptap/core";
import { editor, expect, launch, quit, test } from "./helpers.ts";

async function view(page: Page, item: string): Promise<void> {
  await page.getByRole("menuitem", { name: "View", exact: true }).click();
  await page.getByRole("menuitemcheckbox", { name: item }).click();
}

/** Drags a ruler marker by dx (and dy) pixels, in steps, the way a hand does. */
async function drag(page: Page, mark: Locator, dx: number, dy = 0): Promise<void> {
  // The ruler re-renders a frame after each change; take the box only once it holds still.
  let b = (await mark.boundingBox())!;
  for (let i = 0; i < 20; i++) {
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    const n = (await mark.boundingBox())!;
    if (n.x === b.x && n.y === b.y) break;
    b = n;
  }
  const x = b.x + b.width / 2;
  const y = b.y + b.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dx / 2, y + dy / 2, { steps: 4 });
  await page.mouse.move(x + dx, y + dy, { steps: 4 });
  await page.mouse.up();
}

const px = (v: string) => parseFloat(v);

test("9.2 ruler: margins shaded, indents and tabs dragged, clicked, keyed and removed, each one Undo step", async ({}, info) => {
  const l = await launch();
  const { page } = l;
  const ed = editor(page);
  await page.locator("#doc-title").fill("Ruler");
  await page.keyboard.press("Enter");
  await page.keyboard.type("The ruler shows where this paragraph starts and wraps, so dragging its markers moves the text while you watch it happen on the page.");
  const para = ed.locator("p").first();

  // Hidden until asked for; then it sits over the page with the margins shaded.
  await expect(page.getByTestId("ruler")).toHaveCount(0);
  await view(page, "Show ruler");
  const ruler = page.getByTestId("ruler");
  await expect(ruler).toBeVisible();
  const text = ruler.locator(".ruler-text");
  const margin = ruler.getByTestId("ruler-page");
  expect(await margin.evaluate((e) => getComputedStyle(e).backgroundColor)).not.toBe(await text.evaluate((e) => getComputedStyle(e).backgroundColor));
  const tb = (await text.boundingBox())!;
  const pb = (await para.boundingBox())!;
  expect(Math.abs(tb.x - pb.x), "the ruler's text area starts where the text does").toBeLessThan(1.5);
  expect(Math.abs(tb.x + tb.width - (pb.x + pb.width))).toBeLessThan(1.5);

  const first = ruler.getByTestId("ruler-first");
  const inches = (await first.getAttribute("aria-valuetext"))!.endsWith(" in");
  const step = inches ? 1 / 16 : 0.25 / 2.54;
  const snap = (inch: number) => Math.round(inch / step) * step * 96;

  // First line indent: drag half an inch, the first line moves; Undo puts it back in one step.
  await drag(page, first, 48);
  await expect.poll(async () => px(await para.evaluate((p) => getComputedStyle(p).textIndent))).toBeCloseTo(snap(0.5), 0);
  expect(px(await para.evaluate((p) => getComputedStyle(p).marginLeft))).toBe(0);
  await expect(page.locator(".ruler-guide")).toHaveCount(0);
  await page.keyboard.press("Control+z");
  await expect.poll(async () => px(await para.evaluate((p) => getComputedStyle(p).textIndent))).toBe(0);
  await expect(first).toHaveAttribute("aria-valuenow", "0");

  // Left indent: the box moves the whole paragraph, first line and all.
  await drag(page, ruler.getByTestId("ruler-left"), 96);
  await expect.poll(async () => px(await para.evaluate((p) => getComputedStyle(p).marginLeft))).toBeCloseTo(snap(1), 0);
  expect(px(await para.evaluate((p) => getComputedStyle(p).textIndent))).toBe(0);

  // Hanging indent: the body lines move, the first line stays at the left indent.
  await drag(page, ruler.getByTestId("ruler-hanging"), 48);
  await expect.poll(async () => px(await para.evaluate((p) => getComputedStyle(p).textIndent))).toBeCloseTo(-snap(0.5), 0);
  const firstAt = (await first.boundingBox())!;
  expect(Math.abs(firstAt.x + firstAt.width / 2 - (tb.x + snap(1)))).toBeLessThan(2);

  // Right indent with the keyboard: Shift+Left twice is eight steps in.
  const right = ruler.getByTestId("ruler-right");
  await right.focus();
  await page.keyboard.press("Shift+ArrowLeft");
  await page.keyboard.press("Shift+ArrowLeft");
  await expect.poll(async () => px(await para.evaluate((p) => getComputedStyle(p).marginRight))).toBeCloseTo(8 * step * 96, 0);
  // Set up the caret explicitly; this journey tests the ruler, not native Ctrl+End in a background window.
  await page.evaluate(() => (window as Window & { __pdoc: { getEditor(): Editor } }).__pdoc.getEditor().commands.focus("end"));
  await expect.poll(() => page.evaluate(() => {
    const ed = (window as Window & { __pdoc: { getEditor(): Editor } }).__pdoc.getEditor();
    return ed.state.selection.from === ed.state.doc.content.size - 1;
  })).toBe(true);

  // A click on the ruler sets a left tab there; the tab type button cycles left, centre, right, decimal.
  const kind = ruler.getByRole("button", { name: /^Tab type/ });
  await expect(kind).toHaveAccessibleName("Tab type: Left");
  await page.mouse.click(tb.x + snap(3), tb.y + tb.height / 2);
  const tabs = ruler.getByTestId("ruler-tab");
  await expect(tabs).toHaveCount(1);
  await expect(tabs.first()).toHaveAttribute("data-align", "left");
  await kind.click();
  await kind.click();
  await expect(kind).toHaveAccessibleName("Tab type: Right");
  await page.mouse.click(tb.x + snap(5), tb.y + tb.height / 2);
  await expect(tabs).toHaveCount(2);
  await expect(ruler.locator('[data-testid="ruler-tab"][data-align="right"]')).toHaveCount(1);
  await page.screenshot({ path: info.outputPath("ruler.png") });
  // The text keeps the keyboard: Tab goes to the stop at 3 inches.
  await page.keyboard.press("Enter");
  await page.keyboard.press("Tab");
  await page.keyboard.type("x");
  const second = ed.locator("p").nth(1);
  await expect(second.locator(".pd-tab")).toHaveCount(1);
  await expect(second).toHaveText(/^\s?x$/);
  const xLeft = await second.evaluate((p) => {
    const r = document.createRange();
    const t = p.querySelector(".pd-tab")!.nextSibling!;
    r.setStart(t, 0);
    r.setEnd(t, 1);
    return r.getBoundingClientRect().left;
  });
  expect(Math.abs(xLeft - (tb.x + snap(3)))).toBeLessThan(2);

  // Drag the 3 inch tab down off the ruler and it's gone.
  const leftTab = ruler.locator('[data-testid="ruler-tab"][data-align="left"]');
  await drag(page, leftTab, 0, 80);
  await expect(tabs).toHaveCount(1);
  await expect(second.locator(".pd-tab")).toHaveCount(1);

  // Drag the right tab along to 4 inches; Delete takes it off from the keyboard.
  const rightTab = ruler.locator('[data-testid="ruler-tab"][data-align="right"]');
  await drag(page, rightTab, -96);
  await expect(rightTab).toHaveAttribute("aria-valuenow", String(Math.round((snap(4) / 96) * 1000) / 1000));
  // A double-click opens the Tabs settings.
  await rightTab.dblclick();
  const dlg = page.getByRole("dialog", { name: "Paragraph" });
  await expect(dlg.getByRole("tab", { name: "Tabs" })).toHaveAttribute("aria-selected", "true");
  await dlg.getByRole("button", { name: "Cancel" }).click();
  await rightTab.focus();
  await page.keyboard.press("Delete");
  await expect(tabs).toHaveCount(0);

  // Off again from the View menu.
  await view(page, "Show ruler");
  await expect(page.getByTestId("ruler")).toHaveCount(0);
  await quit(l);
});
