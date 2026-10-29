import { expect, type Page } from "@playwright/test";
import { launch, quit, test } from "./helpers.ts";
import { load } from "./fixtures.ts";

/**
 * Layout discipline: controls that share a row share a height and line up, everywhere in the chrome
 * (fields, selects and buttons in the library, the find bar, command search and every dialog).
 */

const DIALOGS = ["paragraph", "styles", "listOptions", "pageSetup", "settings", "table", "compare", "specialChars", "link", "wordCount", "headerFooter", "watermark", "sort", "contents", "equation", "shortcuts", "about", "bookmark", "designLibrary"];
const para = (text: string) => ({ type: "paragraph", content: [{ type: "text", text }] });
const set = (page: Page, patch: Record<string, unknown>) => page.evaluate((p) => (window as unknown as { __pdoc: { app: { set: (x: unknown) => void } } }).__pdoc.app.set(p), patch);

/** Puts the caret in the first node of a type, where the dialogs that edit it are enabled. */
const caret = (page: Page, type: string) =>
  page.evaluate((type) => {
    type Node = { type: { name: string }; nodeSize: number };
    const e = (window as unknown as { __pdoc: { getEditor(): { state: { doc: { descendants(f: (n: Node, pos: number) => boolean | void): void } }; commands: { setTextSelection(p: number): void; focus(): void } } } }).__pdoc.getEditor();
    let at = -1;
    e.state.doc.descendants((n, pos) => {
      if (at >= 0) return false;
      if (n.type.name === type) at = pos + (type === "tableCell" ? 2 : 1);
    });
    e.commands.setTextSelection(at);
    e.commands.focus();
  }, type);

/** Pairs of visible controls on the same row (vertically overlapping, side by side) whose heights or tops differ. */
function misaligned(page: Page, scope: string): Promise<string[]> {
  return page.evaluate((scope) => {
    const SEL = 'input:not([type="checkbox"]):not([type="radio"]):not([type="range"]):not([type="color"]), textarea, [role="combobox"], .btn, .icon-btn, .tb-btn';
    const roots = [...document.querySelectorAll(scope)];
    const name = (el: Element) => `${el.tagName.toLowerCase()}${el.className && typeof el.className === "string" ? "." + el.className.trim().split(/\s+/).join(".") : ""}[${(el.getAttribute("aria-label") ?? el.textContent ?? "").trim().slice(0, 24)}]`;
    const bad: string[] = [];
    for (const root of roots) {
      const els = [...root.querySelectorAll(SEL)].filter((el) => {
        if (el.closest(".pd-content, .select-list, .library-story, textarea")) return false;
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== "hidden" && el.tagName !== "TEXTAREA";
      });
      const boxes = els.map((el) => ({ el, r: el.getBoundingClientRect(), parent: el.parentElement }));
      for (let i = 0; i < boxes.length; i++)
        for (let j = i + 1; j < boxes.length; j++) {
          const a = boxes[i]!;
          const b = boxes[j]!;
          const sameRow = Math.min(a.r.bottom, b.r.bottom) - Math.max(a.r.top, b.r.top) > 4;
          const apart = a.r.right <= b.r.left + 1 || b.r.right <= a.r.left + 1;
          // Only controls laid out by the same row: siblings, or children of sibling cells.
          const related = a.parent === b.parent || a.parent?.parentElement === b.parent?.parentElement;
          if (!sameRow || !apart || !related) continue;
          if (Math.abs(a.r.height - b.r.height) > 0.5 || Math.abs(a.r.top - b.r.top) > 0.5)
            bad.push(`${scope}: ${name(a.el)} ${a.r.height}px@${Math.round(a.r.top)} vs ${name(b.el)} ${b.r.height}px@${Math.round(b.r.top)}`);
        }
    }
    return bad;
  }, scope);
}

test("controls that share a row share a height, in every surface", async () => {
  test.setTimeout(120_000);
  const l = await launch();
  const { page } = l;
  await load(page, { type: "doc", content: [
    para("Alignment check."),
    { type: "table", content: [0, 1].map(() => ({ type: "tableRow", content: [0, 1].map(() => ({ type: "tableCell", content: [para("Cell")] })) })) },
  ] });
  const bad: string[] = [];
  const skipped: string[] = [];
  await page.getByRole("tab", { name: "Library" }).click();
  bad.push(...(await misaligned(page, ".left-panel")));
  bad.push(...(await misaligned(page, ".toolbar")));
  bad.push(...(await misaligned(page, ".statusbar")));
  await page.locator(".pd-content p").first().click();
  await page.keyboard.press("Control+H");
  await expect(page.locator(".findbar")).toBeVisible();
  bad.push(...(await misaligned(page, ".findbar")));
  await page.keyboard.press("Escape");
  for (const kind of DIALOGS) {
    await caret(page, kind === "table" ? "tableCell" : "paragraph");
    await set(page, { dialog: { kind } });
    const open = page.locator("dialog[open]");
    // Some dialogs need what they edit (a table of contents, a bookmark); they render nothing without it.
    if (!(await open.waitFor({ timeout: 1500 }).then(() => true, () => false))) {
      skipped.push(kind);
      await set(page, { dialog: null });
      continue;
    }
    // Every tab of a tabbed dialog.
    const tabs = page.locator('dialog[open] [role="tab"]');
    const n = await tabs.count();
    for (let t = 0; t < Math.max(n, 1); t++) {
      if (n) await tabs.nth(t).click();
      bad.push(...(await misaligned(page, "dialog[open]")).map((b) => `${kind}${n ? `#${t}` : ""} ${b}`));
    }
    await set(page, { dialog: null });
  }
  await quit(l);
  console.log(`alignment: not covered here (need document context): ${skipped.join(", ") || "none"}`);
  expect(skipped.length).toBeLessThan(4);
  expect(bad).toEqual([]);
});
