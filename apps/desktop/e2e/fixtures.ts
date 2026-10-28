/** Documents for journeys, built the same way every run. */
import type { Page } from "@playwright/test";

/** Replaces the open document's content, as typing would (it saves and lays out again). */
export async function load(page: Page, doc: unknown): Promise<void> {
  await page.evaluate((d) => (window as unknown as { __pdoc: { getEditor(): { commands: { setContent(c: unknown, o: unknown): void } } } }).__pdoc.getEditor().commands.setContent(d, { emitUpdate: true }), doc);
}

/** The page's layout once it settles: the page count. */
export async function settled(page: Page): Promise<number> {
  const art = page.getByTestId("page");
  let last = -1;
  for (let i = 0; i < 50; i++) {
    const n = Number(await art.getAttribute("data-pages"));
    if (n > 0 && n === last) return n;
    last = n;
    await page.waitForTimeout(100);
  }
  throw new Error("The pages did not settle");
}

const WORDS =
  "the page keeps its own size and margins while the text flows from one sheet to the next as it would on paper and every block that does not fit moves down to start a new page".split(" ");

/** `n` words of plain prose, different for each seed. */
export function prose(n: number, seed: number): string {
  const out: string[] = [];
  for (let i = 0; i < n; i++) out.push(WORDS[(i * 7 + seed * 13) % WORDS.length]!);
  out[0] = out[0]![0]!.toUpperCase() + out[0]!.slice(1);
  return `${out.join(" ")}.`;
}

const text = (t: string) => ({ type: "text", text: t });
const p = (t: string) => ({ type: "paragraph", content: [text(t)] });
const h = (level: number, t: string, id: string) => ({ type: "heading", attrs: { level, id }, content: [text(t)] });

/**
 * About twenty Letter pages: headings, paragraphs, lists, a table, a quote, a manual page break, and
 * a code block taller than a page (it overflows onto the next page, as in Word).
 */
export function longDocument(): unknown {
  const content: unknown[] = [{ type: "paragraph", attrs: { textStyle: "title" }, content: [text("Pagination fixture")] }];
  for (let s = 1; s <= 16; s++) {
    content.push(h(2, `Section ${s}`, `sec-${s}`));
    for (let i = 0; i < 6; i++) content.push(p(prose(60 + ((s + i) % 5) * 10, s * 10 + i)));
    if (s % 4 === 0)
      content.push({
        type: "bulletList",
        content: [1, 2, 3, 4].map((i) => ({ type: "listItem", content: [p(prose(12, s + i))] })),
      });
    if (s === 5)
      content.push({
        type: "table",
        content: [0, 1, 2, 3].map((r) => ({ type: "tableRow", content: [0, 1, 2].map((c) => ({ type: "tableCell", content: [p(`Cell ${r + 1}.${c + 1}`)] })) })),
      });
    if (s === 6) content.push({ type: "blockquote", content: [p(prose(40, 99))] });
    if (s === 3) content.push({ type: "pageBreak" });
    if (s === 9) content.push({ type: "codeBlock", content: [text(Array.from({ length: 70 }, (_, i) => `line ${i + 1}: ${prose(6, i)}`).join("\n"))] });
  }
  content.push(p("The end."));
  return { type: "doc", content };
}

/** A short document with headings for the table of contents. */
export function headedDocument(pages = 3): unknown {
  const content: unknown[] = [];
  for (let s = 1; s <= pages; s++) {
    content.push(h(1, `Chapter ${s}`, `ch-${s}`));
    for (let i = 0; i < 3; i++) content.push(p(prose(50, s * 3 + i)));
    content.push({ type: "pageBreak" });
  }
  content.pop();
  return { type: "doc", content };
}

/** Plain prose of about `pages` Letter pages (ten paragraphs a page, a heading every three pages). */
export function bigDocument(pages: number): unknown {
  const content: unknown[] = [];
  for (let i = 0; i < pages * 10; i++) {
    if (i % 30 === 0) content.push(h(1, `Part ${i / 30 + 1}`, `part-${i / 30 + 1}`));
    content.push(p(prose(70, i)));
  }
  return { type: "doc", content };
}
