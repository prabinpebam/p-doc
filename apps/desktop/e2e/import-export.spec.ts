import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { load } from "./fixtures.ts";
import { diskText, editor, expect, filesIn, launch, PROMPTLY, quit, test } from "./helpers.ts";

const text = (t: string, marks?: unknown[]) => ({ type: "text", text: t, ...(marks ? { marks } : {}) });
const p = (...c: unknown[]) => ({ type: "paragraph", content: c });
const cell = (type: string, t: string) => ({ type, content: [p(text(t))] });
const PLAN = {
  type: "doc",
  content: [
    { type: "heading", attrs: { level: 1 }, content: [text("Goals")] },
    p(text("We "), text("ship", [{ type: "bold" }]), text(" in May. See "), text("the brief", [{ type: "link", attrs: { href: "https://example.com/brief" } }]), text(".")),
    { type: "bulletList", content: [{ type: "listItem", content: [p(text("First milestone"))] }, { type: "listItem", content: [p(text("Second milestone"))] }] },
    {
      type: "table",
      content: [
        { type: "tableRow", content: [cell("tableHeader", "Owner"), cell("tableHeader", "Date")] },
        { type: "tableRow", content: [cell("tableCell", "Ana"), cell("tableCell", "May 3")] },
      ],
    },
  ],
};

const cli = join(dirname(fileURLToPath(import.meta.url)), "..", "out", "main", "cli.mjs");

async function download(page: import("@playwright/test").Page, item: RegExp) {
  await page.getByRole("menuitem", { name: "File" }).click();
  await page.getByRole("menuitem", { name: /^Download/ }).click();
  await page.getByRole("menuitem", { name: item }).click();
}

test("6.1 6.2 6.3 6.4 download as Word, Markdown, web page and text; open a Word file and a dropped Markdown file as new documents", async ({}, info) => {
  const saveDir = mkdtempSync(join(tmpdir(), "pdoc-files-"));
  const l = await launch({ env: { PDOC_SAVE_DIR: saveDir, PDOC_OPEN_FILE: join(saveDir, "Quarterly plan.docx") } });
  const { page } = l;
  await page.locator("#doc-title").fill("Quarterly plan");
  await page.keyboard.press("Enter");
  await load(page, PLAN);
  await expect.poll(() => diskText(l.dirs), PROMPTLY).toContain("Second milestone");

  // File > Download: every format, each saved where asked and announced.
  await page.getByRole("menuitem", { name: "File" }).click();
  await page.getByRole("menuitem", { name: /^Download/ }).click();
  await expect(page.getByRole("menuitem", { name: /^Microsoft Word \(\.docx\)/ })).toBeVisible();
  await page.screenshot({ path: info.outputPath("download-menu.png") });
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
  for (const [item, ext] of [[/^Microsoft Word/, "docx"], [/^Markdown/, "md"], [/^Web page/, "html"], [/^Plain text/, "txt"]] as const) {
    await download(page, item);
    await expect(page.getByText(`Saved Quarterly plan.${ext}`)).toBeVisible();
    await expect.poll(() => existsSync(join(saveDir, `Quarterly plan.${ext}`))).toBe(true);
  }
  expect(readFileSync(join(saveDir, "Quarterly plan.docx")).subarray(0, 2).toString()).toBe("PK");
  const md = readFileSync(join(saveDir, "Quarterly plan.md"), "utf8");
  expect(md).toMatch(/^# Goals/m);
  expect(md).toContain("**ship**");
  expect(md).toContain("[the brief](https://example.com/brief)");
  expect(md).toMatch(/^[-*] First milestone/m);
  expect(md).toMatch(/\| *Owner *\| *Date *\|/);
  const html = readFileSync(join(saveDir, "Quarterly plan.html"), "utf8");
  expect(html).toMatch(/<h1[^>]*>Goals<\/h1>/);
  expect(html).toContain("<table");
  expect(readFileSync(join(saveDir, "Quarterly plan.txt"), "utf8")).toContain("Second milestone");

  // File > Open from file (Ctrl+Shift+O): the Word file comes back as a new private document with its structure.
  await page.keyboard.press("Control+Shift+O");
  await expect(page.getByText("Opened Quarterly plan")).toBeVisible();
  // One status: the "Importing…" sign gives way to the result.
  await expect(page.getByText("Importing…")).toHaveCount(0);
  await expect.poll(() => filesIn(l.dirs, "private").length, PROMPTLY).toBe(2);
  const ed = editor(page);
  await expect(ed.locator("h1")).toHaveText("Goals");
  await expect(ed.locator("strong")).toHaveText("ship");
  await expect(ed.locator("a")).toHaveAttribute("href", "https://example.com/brief");
  await expect(ed.locator("li")).toHaveCount(2);
  await expect(ed.locator("table tr")).toHaveCount(2);
  await expect(ed.locator("table")).toContainText("May 3");
  await page.screenshot({ path: info.outputPath("opened-docx.png") });

  // A Markdown file dropped on the window: its bytes, not its path, go to the app.
  const drop = (name: string, body: string) =>
    page.evaluate(
      ([n, b]) => {
        const dt = new DataTransfer();
        dt.items.add(new File([b!], n!, { type: "application/octet-stream" }));
        const target = document.querySelector(".pd-content")!;
        const r = target.getBoundingClientRect();
        target.dispatchEvent(new DragEvent("drop", { dataTransfer: dt, bubbles: true, cancelable: true, clientX: r.left + 20, clientY: r.top + 20 }));
      },
      [name, body],
    );
  await drop("Meeting notes.md", md);
  await expect(page.getByText("Opened Meeting notes")).toBeVisible();
  await expect(page.locator("#doc-title")).toHaveValue("Meeting notes");
  await expect(ed.locator("h1")).toHaveText("Goals");
  await expect(ed.locator("table")).toContainText("Ana");
  await expect.poll(() => filesIn(l.dirs, "private").length, PROMPTLY).toBe(3);

  // A file P-Doc can't open is refused with what it can open; nothing is made.
  await drop("archive.zip", "PK");
  await expect(page.getByText("P-Doc can open .docx, .md, .html, .txt and .pdoc.json files.")).toBeVisible();
  expect(filesIn(l.dirs, "private")).toHaveLength(3);
  await quit(l);

  // The pdoc CLI sees the same library (U38).
  const env = { ...process.env, PDOC_LOCALE: "en-US", PDOC_USER_DATA: l.dirs.userData, PDOC_LIBRARY: l.dirs.library, GIT_CONFIG_GLOBAL: l.dirs.gitConfig, GIT_CONFIG_NOSYSTEM: "1" };
  const listed = JSON.parse(execFileSync(process.execPath, [cli, "list", "--json"], { env, encoding: "utf8" })) as { title: string }[];
  expect(listed.map((d) => d.title).sort()).toEqual(["Meeting notes", "Quarterly plan", "Quarterly plan"]);
});
