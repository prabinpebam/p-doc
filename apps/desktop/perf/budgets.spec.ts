/**
 * The waits of spec §7, measured in the built app with isolated data. Each budget fails the run when
 * its p95 is over; the numbers go to test-results/perf/results.json, and to
 * docs/product/perf-baseline.json when there is none yet or PDOC_PERF_UPDATE=1.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { cpus, tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Page } from "@playwright/test";
import { expect, launch, quit, tempDirs, test } from "../e2e/helpers.ts";
import { bigDocument, imageNode, load, notesDocument, png, settled } from "../e2e/fixtures.ts";
import { fakeHelperConfig, startFakeGitHub } from "../test/fakes/fake-github.ts";

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
  downloadAs(kind: string): Promise<void>;
  reviewScan(): number;
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

  // Suggestions all through the document: the title bar's count and the Review panel's list are read again after each edit.
  const scans = await page.evaluate(async () => {
    const w = window as unknown as { __pdoc: { getEditor(): { view: any; commands: any; state: any }; perf: Perf } };
    const e = w.__pdoc.getEditor();
    e.commands.setSuggesting(true);
    const size = e.state.doc.content.size;
    for (let i = 0; i < 100; i++) {
      const at = Math.floor(((i + 0.5) / 100) * size);
      const $p = e.state.doc.resolve(at);
      if ($p.parent.isTextblock) e.view.dispatch(e.state.tr.insertText("s", at));
    }
    const found = w.__pdoc.perf.reviewScan();
    const out: number[] = [];
    for (let i = 0; i < 40; i++) {
      e.view.dispatch(e.state.tr.insertText("x"));
      const t = performance.now();
      w.__pdoc.perf.reviewScan();
      out.push(performance.now() - t);
      await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));
    }
    e.commands.setSuggesting(false);
    return { found, out };
  });
  expect(scans.found).toBeGreaterThanOrEqual(50);
  record("review50", "Review list after an edit", 16, scans.out, `Finding every suggestion and comment in a 50-page document with ${scans.found} changes`);
  await quit(l);
});

test("repagination with 40 footnotes in a 50-page document", async () => {
  const l = await launch();
  const { page } = l;
  await load(page, notesDocument(50, 40));
  const pages = await settled(page);
  expect(pages).toBeGreaterThanOrEqual(45);
  await expect(page.locator(".pd-note--placed")).toHaveCount(40);
  await caretMid(page);
  const relayout = await page.evaluate(async () => {
    const w = window as unknown as { __pdoc: { getEditor(): { view: any }; perf: Perf } };
    const view = w.__pdoc.getEditor().view;
    const out: number[] = [];
    for (let i = 0; i < 40; i++) {
      view.dispatch(i % 2 ? view.state.tr.insertText("y") : view.state.tr.split(view.state.selection.from));
      const t = performance.now();
      w.__pdoc.perf.layoutNow();
      out.push(performance.now() - t);
      await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));
    }
    return out;
  });
  record("repaginate50Notes", "Repagination with 40 notes", 16, relayout, `Measuring every block and placing 40 footnotes (every fifth one long) at the foot of their pages, ${pages} pages`);
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
    await new Promise((r) => setTimeout(r, 200));
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

test("opening a 100-page document with 20 images", async () => {
  const l = await launch();
  const { page } = l;
  // The A6 fixture: 20 pictures of about 2 MB each, spread through 100 pages of prose.
  const doc = bigDocument(100) as { content: unknown[] };
  const step = Math.floor(doc.content.length / 20);
  for (let i = 19; i >= 0; i--) {
    const src = `data:image/png;base64,${png(820, 820, [70, 120, 200], true).toString("base64")}`;
    doc.content.splice(i * step + 1, 0, imageNode(src, { width: 320, naturalWidth: 820, naturalHeight: 820 }));
  }
  await load(page, doc);
  const pages = await settled(page);
  expect(pages).toBeGreaterThanOrEqual(90);
  const samples = await page.evaluate(async () => {
    const w = window as unknown as { __pdoc: { app: { get(): { current: { space: string; path: string } } }; layout(): { pages: number } | null; perf: Perf; getEditor(): { getJSON(): unknown } | null } };
    const big = w.__pdoc.app.get().current;
    // Saving writes the pictures beside the document; the opens below read them from there.
    await w.__pdoc.perf.flush();
    await w.__pdoc.perf.newDoc();
    await new Promise((r) => setTimeout(r, 200));
    const small = w.__pdoc.app.get().current;
    const out: number[] = [];
    for (let i = 0; i < 5; i++) {
      const t = performance.now();
      await w.__pdoc.perf.openDoc(big);
      while (w.__pdoc.app.get().current.path !== big.path || !w.__pdoc.getEditor() || (w.__pdoc.layout()?.pages ?? 0) < 90) await new Promise((r) => requestAnimationFrame(r));
      out.push(performance.now() - t);
      if (!JSON.stringify(w.__pdoc.getEditor()!.getJSON()).includes("assets/")) throw new Error("The images were not stored beside the document");
      await w.__pdoc.perf.openDoc(small);
      await new Promise((r) => setTimeout(r, 200));
    }
    return out;
  });
  record("open100Images", "Open a 100-page document with 20 images", 500, samples, `Read, parse, draw and lay out all ${pages} pages with 20 images of about 2 MB stored beside the document; images fade in`);
  await quit(l);
});

test("inserting a 20 MB image", async () => {
  const l = await launch();
  const { page } = l;
  await load(page, bigDocument(3));
  await settled(page);
  const samples: number[] = [];
  for (let i = 0; i < 5; i++) {
    // Noise barely compresses, so each picture is just under the 20 MB limit and new to the asset store.
    const bytes = png(2580, 2700, [200, 120, 70], true);
    expect(bytes.length).toBeGreaterThan(19.5 * 1024 * 1024);
    samples.push(
      await page.evaluate(async (b64) => {
        const data = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
        const dt = new DataTransfer();
        dt.items.add(new File([data], "big.png", { type: "image/png" }));
        // A text caret, so the paste adds a picture instead of replacing the one just added.
        (window as unknown as { __pdoc: { getEditor(): { commands: { setTextSelection(n: number): void } } } }).__pdoc.getEditor().commands.setTextSelection(3);
        const target = document.querySelector(".pd-content")!;
        const before = target.querySelectorAll("img").length;
        const t = performance.now();
        target.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }));
        // Shown: the new picture is in the page and decoded.
        for (;;) {
          const imgs = target.querySelectorAll("img");
          const img = imgs.length > before ? (imgs[imgs.length - 1] as HTMLImageElement) : null;
          if (img?.complete && img.naturalWidth > 0) break;
          if (performance.now() - t > 10_000) throw new Error(`The image never showed: ${imgs.length} images, ${img ? `${img.closest(".pd-img")?.className} ${img.src} ${img.complete}` : "none new"}`);
          await new Promise((r) => requestAnimationFrame(r));
        }
        return performance.now() - t;
      }, bytes.toString("base64")),
    );
  }
  record("insertImage20", "Insert a 20 MB image", 300, samples, "From paste to the picture decoded on the page: reading the file, hashing and writing it beside the document, and drawing it");
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

test("exporting a 50-page Word document", async () => {
  const saveDir = mkdtempSync(join(tmpdir(), "pdoc-perf-"));
  const l = await launch({ env: { PDOC_SAVE_DIR: saveDir } });
  const { page } = l;
  await load(page, bigDocument(50));
  await settled(page);
  const samples: number[] = [];
  for (let i = 0; i < 5; i++)
    samples.push(
      await page.evaluate(async () => {
        const t = performance.now();
        await (window as unknown as { __pdoc: { perf: Perf } }).__pdoc.perf.downloadAs("docx");
        return performance.now() - t;
      }),
    );
  record("docx50", "Export .docx, 50 pages", 3000, samples, "From the renderer's request to the .docx written");
  await quit(l);
});

type Ref = { space: string; path: string };
const pdocApi = (page: Page) => page.evaluate(() => (window as unknown as { __pdoc: { app: { get(): { current: Ref } } } }).__pdoc.app.get().current);

test("a version commit of a 50-page document", async () => {
  const l = await launch();
  const { page } = l;
  await load(page, bigDocument(50));
  await settled(page);
  await caretMid(page);
  const ref = await pdocApi(page);
  const samples = await page.evaluate(async (ref) => {
    const w = window as unknown as { __pdoc: { getEditor(): { view: any }; perf: Perf }; pdoc: { versions: { commitNow(r: unknown): Promise<unknown> } } };
    const view = w.__pdoc.getEditor().view;
    const out: number[] = [];
    for (let i = 0; i < 10; i++) {
      view.dispatch(view.state.tr.insertText("v"));
      await w.__pdoc.perf.flush();
      const t = performance.now();
      await w.pdoc.versions.commitNow(ref);
      out.push(performance.now() - t);
    }
    return out;
  }, ref);
  record("versionCommit50", "Version commit", 1000, samples, "git add and commit of a changed 50-page document, from the renderer's request to its answer");
  await quit(l);
});

test("the version history of a document with 500 versions", async () => {
  const dirs = tempDirs();
  const first = await launch({ dirs });
  await first.page.keyboard.type("Version 0");
  const ref = await pdocApi(first.page);
  await quit(first);

  // 500 commits of the document, an hour apart, written straight into the repository.
  const repo = join(dirs.library, ref.space);
  const env = { ...process.env, GIT_CONFIG_GLOBAL: dirs.gitConfig, GIT_CONFIG_NOSYSTEM: "1" };
  const doc = JSON.parse(readFileSync(join(repo, ref.path), "utf8"));
  const now = Math.floor(Date.now() / 1000);
  let stream = "";
  const data = (s: string) => `data ${Buffer.byteLength(s)}\n${s}\n`;
  for (let i = 1; i <= 500; i++) {
    const body = `${JSON.stringify({ ...doc, content: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: `Version ${i}` }] }] } }, null, 2)}\n`;
    const when = `${now - (500 - i) * 3600} +0000`;
    stream += `commit refs/heads/main\nauthor Perf <perf@example.invalid> ${when}\ncommitter Perf <perf@example.invalid> ${when}\n${data(`Edit Untitled document ${i}`)}${i === 1 ? "from refs/heads/main^0\n" : ""}M 100644 inline ${ref.path}\n${data(body)}`;
  }
  execFileSync("git", ["-C", repo, "fast-import", "--quiet"], { input: stream, env });
  execFileSync("git", ["-C", repo, "reset", "--hard", "--quiet"], { env });

  const l = await launch({ dirs });
  const { page } = l;
  const samples: number[] = [];
  for (let i = 0; i < 5; i++) {
    samples.push(
      await page.evaluate(async () => {
        const t = performance.now();
        (document.querySelector(".save-button") as HTMLButtonElement).click();
        while (document.querySelectorAll("[data-testid=version-row]").length < 500) await new Promise((r) => requestAnimationFrame(r));
        const ms = performance.now() - t;
        (document.querySelector(".save-button") as HTMLButtonElement).click();
        while (document.querySelector("#history-panel")) await new Promise((r) => requestAnimationFrame(r));
        return ms;
      }),
    );
  }
  expect(await page.getByTestId("version-row").count()).toBe(0);
  record("history500", "Version history list", 300, samples, "From a click on the save state to all 500+ rows drawn: Git log, tags, grouping and rendering");
  await quit(l);
});

test("typing in a 50-page document while it syncs", async () => {
  const TOKEN = "ghp_perfFakeToken0123456789abcdefABCDEF";
  const fake = await startFakeGitHub();
  fake.users.set(TOKEN, { login: "ada", id: 7, name: "Ada Lovelace", scopes: "repo" });
  const dirs = tempDirs();
  execFileSync("git", ["config", "--file", dirs.gitConfig, "credential.helper", fakeHelperConfig(join(dirname(dirs.gitConfig), "vault.json"))]);
  const l = await launch({ dirs, env: { PDOC_GITHUB_API: fake.api, PDOC_GITHUB_REMOTE: fake.remote } });
  const { page } = l;
  await page.evaluate(async (token) => {
    const p = (window as unknown as { pdoc: { github: { signInWithToken(t: string): Promise<unknown>; setup(n: unknown, u: string[]): Promise<unknown> } } }).pdoc;
    await p.github.signInWithToken(token);
    await p.github.setup({ private: "p-doc-private", public: "p-doc-public" }, []);
  }, TOKEN);
  await load(page, bigDocument(50));
  await settled(page);
  await caretMid(page);
  // Each round: a sync (which first makes a version of the edits) with a key typed every frame until it ends.
  const r = await page.evaluate(async () => {
    const w = window as unknown as { __pdoc: { getEditor(): { view: any } }; pdoc: { sync: { now(): Promise<{ state: { kind: string } }> } } };
    const view = w.__pdoc.getEditor().view;
    const out: number[] = [];
    const kinds: string[] = [];
    let syncMs = 0;
    for (let round = 0; round < 4; round++) {
      let done = false;
      const t0 = performance.now();
      const run = w.pdoc.sync.now().then((s) => {
        kinds.push(s.state.kind);
        syncMs += performance.now() - t0;
        done = true;
      });
      while (!done) {
        const t = performance.now();
        view.dispatch(view.state.tr.insertText("k"));
        void document.body.offsetHeight;
        out.push(performance.now() - t);
        await new Promise((res) => requestAnimationFrame(() => setTimeout(res, 0)));
      }
      await run;
    }
    return { out, kinds, syncMs };
  });
  expect(r.kinds).toEqual(["synced", "synced", "synced", "synced"]);
  expect(r.out.length).toBeGreaterThanOrEqual(20);
  record("keystrokeSync50", "Sync (typing while it runs)", 16, r.out, `Keystroke to glyph in a 50-page document during 4 syncs to a local fake GitHub (${Math.round(r.syncMs / 4)} ms each), each pushing a new version`);
  await quit(l);
  await fake.close();
});
