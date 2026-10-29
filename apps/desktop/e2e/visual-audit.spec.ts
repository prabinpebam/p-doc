import type { Page } from "@playwright/test";
import { launch, quit, test } from "./helpers.ts";
import { load } from "./fixtures.ts";

const SHOTS = process.env.PD_AUDIT_DIR;
const para = (text: string) => ({ type: "paragraph", content: [{ type: "text", text }] });
const DIALOGS = ["paragraph", "styles", "listOptions", "pageSetup", "settings", "table", "compare", "specialChars", "link", "wordCount", "headerFooter", "watermark", "sort", "contents", "equation", "shortcuts", "about", "designLibrary"];

async function shoot(page: Page, name: string): Promise<void> {
  for (const scheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    await page.waitForTimeout(350);
    await page.screenshot({ path: `${SHOTS}/${name}-${scheme}.png` });
  }
}

const set = (page: Page, patch: Record<string, unknown>) => page.evaluate((p) => (window as unknown as { __pdoc: { app: { set: (x: unknown) => void } } }).__pdoc.app.set(p), patch);

test("visual audit: every surface in light and dark", async () => {
  test.skip(!SHOTS, "Set PD_AUDIT_DIR to capture the visual audit.");
  test.setTimeout(240_000);
  const l = await launch();
  const { page } = l;
  await load(page, { type: "doc", content: [
    { type: "heading", attrs: { level: 1 }, content: [{ type: "text", text: "Quarterly plan" }] },
    para("The calm, always-saved flow of Docs with the page-true layout of Word."),
    { type: "bulletList", content: [{ type: "listItem", content: [para("Styles and lists")] }, { type: "listItem", content: [para("Review and comments")] }] },
    para("Closing paragraph."),
    { type: "codeBlock", attrs: { language: "javascript" }, content: [{ type: "text", text: "const answer = 42; // the answer" }] },
    { type: "table", content: [0, 1].map(() => ({ type: "tableRow", content: [0, 1].map(() => ({ type: "tableCell", content: [para("Cell")] })) })) },
  ] });
  await shoot(page, "01-main");
  await page.getByRole("menuitem", { name: "Format", exact: true }).click();
  await shoot(page, "02-menu-format");
  await page.keyboard.press("Escape");
  const tbSelects = page.locator('.toolbar [role="combobox"]');
  await tbSelects.first().click();
  await shoot(page, "03-toolbar-select");
  await page.keyboard.press("Escape");
  await tbSelects.nth(1).click();
  await shoot(page, "03b-toolbar-font");
  await page.keyboard.press("Escape");
  await page.getByRole("combobox", { name: "Code language" }).click().catch(() => undefined);
  await shoot(page, "03c-code-language");
  await page.keyboard.press("Escape");
  await page.locator(".pd-content p").first().click();
  await set(page, { dialog: { kind: "paragraph" } });
  await page.locator('dialog [role="combobox"]').first().click();
  await shoot(page, "03d-dialog-select");
  await set(page, { dialog: null });
  await set(page, { palette: true });
  await shoot(page, "04-command-search");
  await set(page, { palette: false, review: true });
  await shoot(page, "05-review");
  await set(page, { review: false, history: true });
  await shoot(page, "06-history");
  await set(page, { history: false });
  await page.getByRole("tab", { name: "Library" }).click().catch(() => undefined);
  await shoot(page, "07-library");
  for (const [i, kind] of DIALOGS.entries()) {
    // Each dialog opens from where its command is enabled: the table one from inside a table.
    await page.locator(kind === "table" ? ".pd-content td p" : ".pd-content p").first().click();
    await set(page, { dialog: { kind } });
    await page.waitForTimeout(150);
    await shoot(page, `${String(10 + i).padStart(2, "0")}-dialog-${kind}`);
    await set(page, { dialog: null });
  }
  await page.setViewportSize({ width: 900, height: 700 }).catch(() => undefined);
  await quit(l);
});
