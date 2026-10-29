import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Page } from "@playwright/test";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { diskText, editor, expect, launch, PROMPTLY, quit, test, choose } from "./helpers.ts";

async function menu(page: Page, top: string, ...path: RegExp[]): Promise<void> {
  await page.getByRole("menuitem", { name: top, exact: true }).click();
  for (const item of path) await page.getByRole("menuitem", { name: item }).click();
}

test("12.3 code blocks highlight by language, the picker changes it, and Markdown keeps it", async () => {
  const saveDir = mkdtempSync(join(tmpdir(), "pdoc-code-"));
  const l = await launch({ env: { PDOC_SAVE_DIR: saveDir } });
  const { page, dirs } = l;
  await page.locator("#doc-title").fill("Code");
  await page.keyboard.press("Enter");
  await editor(page).click();

  // ```js and a space start a JavaScript block; the code is coloured as it is typed.
  await page.keyboard.type("```js ");
  await page.keyboard.type('const n = 42; // the answer');
  await page.keyboard.press("Enter");
  await page.keyboard.type('log("done", n);');
  const pre = editor(page).locator("pre");
  await expect(pre).toHaveCount(1);
  await expect(pre.locator(".hljs-keyword", { hasText: "const" })).toHaveCount(1);
  await expect(pre.locator(".hljs-number", { hasText: "42" })).toHaveCount(1);
  await expect(pre.locator(".hljs-comment")).toHaveText("// the answer");
  await expect(pre.locator(".hljs-string")).toHaveText('"done"');
  // Its colours are the code tokens.
  const colour = await pre.locator(".hljs-keyword").first().evaluate((e) => getComputedStyle(e).color);
  const token = await page.evaluate(() => {
    const probe = document.createElement("span");
    probe.style.color = "var(--color-code-keyword)";
    document.body.append(probe);
    const c = getComputedStyle(probe).color;
    probe.remove();
    return c;
  });
  expect(colour).toBe(token);

  // The picker at the top right names the language; choosing another highlights the code again, and Undo puts it back.
  const pick = pre.getByRole("combobox", { name: "Code language" });
  await expect(pick).toHaveAttribute("data-value", "javascript");
  await choose(pick, { label: "Python" });
  await expect(pre.locator("code")).toHaveClass("language-python");
  await expect(pre.locator(".hljs-keyword", { hasText: "const" })).toHaveCount(0);
  await expect.poll(() => diskText(dirs), PROMPTLY).toContain('"language":"python"');
  await page.keyboard.press("Control+z");
  await expect(pick).toHaveAttribute("data-value", "javascript");
  await expect(pre.locator(".hljs-keyword", { hasText: "const" })).toHaveCount(1);
  // Plain text has no colours; Automatic guesses the language.
  await choose(pick, { label: "Plain text" });
  await expect(pre.locator("[class^=hljs]")).toHaveCount(0);
  await expect.poll(() => diskText(dirs), PROMPTLY).toContain('"language":"plaintext"');
  await choose(pick, { label: "Automatic" });
  await expect(pre.locator(".hljs-string")).toHaveText('"done"');
  await expect.poll(() => diskText(dirs), PROMPTLY).toContain('"language":null');
  await choose(pick, { label: "TypeScript" });
  await expect(pre.locator(".hljs-keyword", { hasText: "const" })).toHaveCount(1);
  // The text itself is unchanged by the colours, and the caret still types into the block.
  await pre.locator(".hljs-string").click();
  // ProseMirror puts a Chrome click's selection back 20 ms later; a key sooner than a person's is undone by it.
  await page.waitForTimeout(100);
  await page.keyboard.press("End");
  await page.keyboard.press("Enter");
  await page.keyboard.type("let k = 1;");
  await expect(pre.locator("code")).toHaveText('const n = 42; // the answer\nlog("done", n);\nlet k = 1;');

  // Markdown keeps the language; the web page keeps it as a class; the PDF has the code, not the picker.
  await menu(page, "File", /^Download/, /^Markdown/);
  await expect(page.getByText(/^Saved Code\.md/)).toBeVisible({ timeout: 20_000 });
  expect(readFileSync(join(saveDir, "Code.md"), "utf8")).toContain('```typescript\nconst n = 42; // the answer\nlog("done", n);\nlet k = 1;\n```');
  await menu(page, "File", /^Download/, /^Web page/);
  await expect(page.getByText(/^Saved Code\.html/)).toBeVisible({ timeout: 20_000 });
  expect(readFileSync(join(saveDir, "Code.html"), "utf8")).toContain('class="language-typescript"');
  await menu(page, "File", /^Download/, /^PDF document/);
  await expect(page.getByText(/^Saved Code\.pdf/)).toBeVisible({ timeout: 20_000 });
  const task = getDocument({ data: new Uint8Array(readFileSync(join(saveDir, "Code.pdf"))), useSystemFonts: false });
  const pdf = await task.promise;
  const text = (await (await pdf.getPage(1)).getTextContent()).items.map((it) => ("str" in it ? it.str : "")).join("");
  expect(text.replace(/\s+/g, "")).toContain("constn=42;//theanswer");
  expect(text).not.toMatch(/TypeScript|Plain text/);
  await task.destroy();

  // Viewing: the language shows but can't be changed.
  await page.getByRole("button", { name: "Mode: Editing" }).click();
  await page.getByRole("menuitemcheckbox", { name: /^Viewing/ }).click();
  await expect(page.getByTestId("mode-badge")).toHaveText("Viewing");
  await expect(pick).toBeDisabled();
  await page.getByRole("button", { name: "Mode: Viewing" }).click();
  await page.getByRole("menuitemcheckbox", { name: /^Editing/ }).click();
  await expect(pick).toBeEnabled();
  await quit(l);
});
