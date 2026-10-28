/**
 * The waits of spec §7, measured in the built app with isolated data. Each budget fails the run when
 * its p95 is over; the numbers go to test-results/perf/results.json, and to
 * docs/product/perf-baseline.json when there is none yet or PDOC_PERF_UPDATE=1.
 */
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { cpus, tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Page } from "@playwright/test";
import { expect, launch, quit, tempDirs, test } from "../e2e/helpers.ts";
import { bigDocument, load, settled } from "../e2e/fixtures.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const baselineFile = join(root, "docs", "product", "perf-baseline.json");
const resultsFile = join(root, "test-results", "perf", "results.json");

interface Metric {
  wait: string;
  budgetMs: number;
  samples: number;
  medianMs: number;
  p95Ms: number;
  note?: string;
}
const results: Record<string, Metric> = {};

const rank = (xs: number[], q: number) => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.max(0, Math.ceil(q * s.length) - 1))]!;
};
const round = (n: number) => Math.round(n * 10) / 10;

function record(key: string, wait: string, budgetMs: number, samples: number[], note?: string): void {
  const m: Metric = { wait, budgetMs, samples: samples.length, medianMs: round(rank(samples, 0.5)), p95Ms: round(rank(samples, 0.95)), ...(note ? { note } : {}) };
  results[key] = m;
  test.info().annotations.push({ type: key, description: `p95 ${m.p95Ms} ms, median ${m.medianMs} ms (budget ${budgetMs} ms)` });
  console.log(`${wait}: p95 ${m.p95Ms} ms, median ${m.medianMs} ms (budget ${budgetMs} ms)`);
  expect(m.p95Ms, `${wait}: p95 ${m.p95Ms} ms is over the ${budgetMs} ms budget`).toBeLessThanOrEqual(budgetMs);
}

type Perf = {
  layoutNow(): unknown;
  flush(): Promise<void>;
  openDoc(r: unknown): Promise<void>;
  newDoc(): Promise<void>;
  downloadPdf(): Promise<void>;
};

/** Puts the caret inside the middle paragraph of the open document. */
async function caretMid(page: Page): Promise<void> {
  await page.evaluate(() => {
    const e = (window as unknown as { __pdoc: { getEditor(): { state: any; commands: any } } }).__pdoc.getEditor();
    const doc = e.state.doc;
    let at = 0;
    doc.forEach((_n: unknown, offset: number, i: number) => {
      if (i === Math.floor(doc.childCount / 2)) at = offset + 3;
    });
    e.commands.setTextSelection(at);
  });
}

test.afterAll(() => {
  const run = { measured: new Date().toISOString().slice(0, 10), machine: `${cpus()[0]?.model.trim() ?? "unknown"} × ${cpus().length}`, metrics: results };
  mkdirSync(dirname(resultsFile), { recursive: true });
  writeFileSync(resultsFile, `${JSON.stringify(run, null, 2)}\n`);
  if (!existsSync(baselineFile) || process.env.PDOC_PERF_UPDATE === "1") {
    const old = existsSync(baselineFile) ? JSON.parse(readFileSync(baselineFile, "utf8")) : {};
    writeFileSync(baselineFile, `${JSON.stringify({ ...old, ...run, metrics: { ...old.metrics, ...results } }, null, 2)}\n`);
  }
});

test("cold start to an editable page", async () => {
  const dirs = tempDirs();
  await quit(await launch({ dirs }));
  const samples: number[] = [];
  for (let i = 0; i < 5; i++) {
    const t = Date.now();
    const l = await launch({ dirs });
    await expect(l.page.locator(".pd-content[contenteditable=true]")).toBeVisible();
    samples.push(Date.now() - t);
    await quit(l);
  }
  record("coldStart", "Cold start to editable page", 2000, samples, "From launch to an editable page, including Playwright's connection");
});

test("typing, repagination and saving in a 50-page document", async () => {
  const l = await launch();
  const { page } = l;
  await load(page, bigDocument(50));
  const pages = await settled(page);
  expect(pages).toBeGreaterThanOrEqual(45);
  await caretMid(page);

  const keys = await page.evaluate(async () => {
    const view = (window as unknown as { __pdoc: { getEditor(): { view: any } } }).__pdoc.getEditor().view;
    const out: number[] = [];
    for (let i = 0; i < 100; i++) {
      const t = performance.now();
      view.dispatch(view.state.tr.insertText("x"));
      void document.body.offsetHeight;
      out.push(performance.now() - t);
      await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));
    }
    return out;
  });
  record("keystroke50", "Keystroke to glyph, 50-page document", 16, keys, `Transaction, editor update and browser layout for one character; ${pages} pages`);

  const relayout = await page.evaluate(async () => {
    const w = window as unknown as { __pdoc: { getEditor(): { view: any }; perf: Perf } };
    const view = w.__pdoc.getEditor().view;
    const out: number[] = [];
    for (let i = 0; i < 40; i++) {
      // A new line moves every later block; a character usually moves none.
      view.dispatch(i % 2 ? view.state.tr.insertText("y") : view.state.tr.split(view.state.selection.from));
      const t = performance.now();
      w.__pdoc.perf.layoutNow();
      out.push(performance.now() - t);
      await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));
    }
    return out;
  });
  record("repaginate50", "Repagination after an edit", 16, relayout, "Measuring every block and redrawing the sheet breaks, 50 pages, alternating new lines and characters");

  const saves = await page.evaluate(async () => {
    const w = window as unknown as { __pdoc: { getEditor(): { view: any }; perf: Perf } };
    const view = w.__pdoc.getEditor().view;
    const out: number[] = [];
    for (let i = 0; i < 10; i++) {
      view.dispatch(view.state.tr.insertText("z"));
      const t = performance.now();
      await w.__pdoc.perf.flush();
      out.push(performance.now() - t);
    }
    return out;
  });
  record("save50", "Save to disk after the debounce", 300, saves, "Serialising and writing a 50-page document");
  await quit(l);
});

test("opening a 100-page document from the library", async () => {
  const l = await launch();
  const { page } = l;
  await load(page, bigDocument(100));
  const pages = await settled(page);
  expect(pages).toBeGreaterThanOrEqual(90);
  const samples = await page.evaluate(async () => {
    const w = window as unknown as { __pdoc: { app: { get(): { current: { space: string; path: string } } }; layout(): { pages: number } | null; perf: Perf } };
    const big = w.__pdoc.app.get().current;
    await w.__pdoc.perf.flush();
    await w.__pdoc.perf.newDoc();
    const small = w.__pdoc.app.get().current;
    const out: number[] = [];
    for (let i = 0; i < 5; i++) {
      const t = performance.now();
      await w.__pdoc.perf.openDoc(big);
      while ((w.__pdoc.layout()?.pages ?? 0) < 90) await new Promise((r) => requestAnimationFrame(r));
      out.push(performance.now() - t);
      await w.__pdoc.perf.openDoc(small);
      await new Promise((r) => setTimeout(r, 200));
    }
    return out;
  });
  record("open100", "Open a 100-page document from the library", 500, samples, `Read, parse, draw and lay out all ${pages} pages`);
  await quit(l);
});

test("exporting a 50-page PDF", async () => {
  const saveDir = mkdtempSync(join(tmpdir(), "pdoc-perf-"));
  const l = await launch({ env: { PDOC_SAVE_DIR: saveDir } });
  const { page } = l;
  await load(page, bigDocument(50));
  await settled(page);
  const samples: number[] = [];
  for (let i = 0; i < 3; i++)
    samples.push(
      await page.evaluate(async () => {
        const t = performance.now();
        await (window as unknown as { __pdoc: { perf: Perf } }).__pdoc.perf.downloadPdf();
        return performance.now() - t;
      }),
    );
  record("pdf50", "Export PDF, 50 pages", 3000, samples, "Print layout in a hidden window and the PDF written");
  await quit(l);
});
