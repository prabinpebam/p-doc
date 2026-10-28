import type { ElectronApplication, Page } from "@playwright/test";
import { editor, expect, launch, quit, test } from "./helpers.ts";

async function resize(app: ElectronApplication, page: Page, width: number, height: number) {
  await app.evaluate(({ BrowserWindow }, [w, h]) => BrowserWindow.getAllWindows()[0]!.setContentSize(w!, h!), [width, height]);
  await expect.poll(() => page.evaluate(() => window.innerWidth)).toBe(width);
}

test("1.11 every control stays reachable down to 800 × 600: toolbar groups move into More, the left panel collapses under 1000 px", async ({}, info) => {
  const l = await launch();
  const { app, page } = l;
  const ed = editor(page);
  const toolbar = page.getByRole("toolbar", { name: "Formatting" });
  const more = toolbar.getByRole("button", { name: "More", exact: true });
  const outline = page.getByRole("tab", { name: "Outline" });

  // Wide: everything in one row, the panel beside the page.
  await resize(app, page, 1600, 900);
  await expect(more).toHaveCount(0);
  await expect(toolbar.getByRole("button", { name: /^Clear formatting/ })).toBeVisible();
  await expect(outline).toBeVisible();

  // Nothing in the toolbar spills past its edge at any width.
  for (const w of [1280, 1000, 800]) {
    await resize(app, page, w, 600);
    const edge = await toolbar.evaluate((t) => t.getBoundingClientRect().right);
    const furthest = await toolbar.evaluate((t) => Math.max(...[...t.querySelectorAll(":scope > .tb-group")].map((g) => g.getBoundingClientRect().right)));
    expect(furthest).toBeLessThanOrEqual(edge);
  }

  // At 800 px: the groups at the end are under More, and they work from there.
  await page.screenshot({ path: info.outputPath("narrow.png") });
  await expect(more).toBeVisible();
  await expect(outline).toHaveCount(0);
  await page.keyboard.type("Plain words");
  await page.keyboard.press("Shift+Home");
  await page.keyboard.press("Control+b");
  await expect(ed.locator("strong")).toHaveText("Plain words");
  await more.click();
  const panel = page.getByRole("toolbar", { name: "More formatting" });
  await expect(panel).toBeVisible();
  await page.screenshot({ path: info.outputPath("more-open.png") });
  await expect(panel.locator("[data-tb]").first()).toBeFocused();
  await page.keyboard.press("End");
  await expect(panel.getByRole("button", { name: /^Clear formatting/ })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(panel).toBeHidden();
  await expect(ed.locator("strong")).toHaveCount(0);
  await page.keyboard.press("End");
  await page.keyboard.type("!");
  await expect(ed).toContainText("Plain words!");
  await more.click();
  await expect(panel).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(panel).toBeHidden();
  await expect(more).toBeFocused();

  // The panel opens over the page and goes away with Esc or a press on the page.
  await page.keyboard.press("Control+Alt+a");
  await expect(outline).toBeVisible();
  await expect(page.locator(".left-panel")).toHaveClass(/overlay/);
  await page.screenshot({ path: info.outputPath("narrow-panel.png") });
  await outline.focus();
  await page.keyboard.press("Escape");
  await expect(outline).toHaveCount(0);
  await page.keyboard.press("Control+Alt+a");
  await expect(outline).toBeVisible();
  await ed.click();
  await expect(outline).toHaveCount(0);

  // Wide again: the panel is back beside the page, and More is gone.
  await resize(app, page, 1600, 900);
  await expect(outline).toBeVisible();
  await expect(page.locator(".left-panel")).not.toHaveClass(/overlay/);
  await expect(more).toHaveCount(0);
  await quit(l);
});
