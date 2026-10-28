// Stagehand capture rig for the RES knowledge bases.
// Usage: node capture.mjs <plan.json> [--headed]
// plan: { "kb": "../re-google-docs", "viewport": {"width":1440,"height":900},
//         each item writes <id>-<slug>.png and, when dataId is set, <dataId>-<slug>-data.json (RES: one file per EV id),
//         "items": [{ "id": "EV-001", "slug": "editor-view", "url": "https://...", "shows": "...",
//                     "waitMs": 4000, "steps": [{"key":"Escape"},{"click":[x,y]},{"eval":"js"},{"wait":500}],
//                     "inventory": true, "tokens": true, "fullPage": false }] }
// Chrome is started by this script and Stagehand attaches with localBrowser.connect,
// because localBrowser.launch hangs on this machine (see research/rig/README.md).
import { spawn } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync, appendFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { localBrowser, Stagehand } from "@browserbasehq/stagehand";

const here = dirname(fileURLToPath(import.meta.url));
const pageScripts = resolve(here, "../../.refs/res/skills/reverse-engineering-saas/scripts/page");
const chromePath = process.env.CHROME_PATH ?? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const planPath = resolve(process.argv[2] ?? "");
const headed = process.argv.includes("--headed");
const plan = JSON.parse(readFileSync(planPath, "utf8"));
const kb = resolve(here, plan.kb);
const evidenceDir = join(kb, "evidence");
mkdirSync(evidenceDir, { recursive: true });
const port = 9400 + Math.floor(Math.random() * 400);
const viewport = plan.viewport ?? { width: 1440, height: 900 };
const profile = join(here, ".cache", "profile");

const withTimeout = (promise, ms, what) => Promise.race([promise, new Promise((_, fail) => setTimeout(() => fail(new Error(`timeout: ${what}`)), ms))]);
// Stagehand's evaluate goes through its extension and is very slow on large documents,
// so page scripts run through a direct CDP session on the page target.
async function pageEval(expression, ms = 60000) {
  const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  const target = targets.find((t) => t.type === "page" && !t.url.startsWith("chrome-extension://"));
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((ok, fail) => { ws.onopen = ok; ws.onerror = () => fail(new Error("page socket failed")); });
  try {
    return await withTimeout(new Promise((ok, fail) => {
      ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id !== 1) return; if (d.error || d.result.exceptionDetails) fail(new Error(JSON.stringify(d.error ?? d.result.exceptionDetails).slice(0, 300))); else ok(d.result.result.value); };
      ws.send(JSON.stringify({ id: 1, method: "Runtime.evaluate", params: { expression, returnByValue: true, awaitPromise: true } }));
    }), ms, "eval");
  } finally { ws.close(); }
}
const readScript = (name) => readFileSync(join(pageScripts, name), "utf8");
const wrap = (src, call) => `(() => { ${src}; ${call ?? ""}; return window.__re.last; })()`;

const chrome = spawn(chromePath, [
  ...(headed ? [] : ["--headless"]),
  `--remote-debugging-port=${port}`,
  `--user-data-dir=${profile}`,
  `--window-size=${viewport.width},${viewport.height}`,
  "--no-first-run", "--no-default-browser-check", "--enable-unsafe-extension-debugging",
  "--remote-allow-origins=*", "--lang=en-US", "--mute-audio", "about:blank",
], { stdio: "ignore" });

async function waitForPort() {
  for (let i = 0; i < 100; i++) {
    try { const r = await fetch(`http://127.0.0.1:${port}/json/version`); if (r.ok) return r.json(); } catch {}
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error("Chrome debugging port did not open");
}

// Loads the bundled Stagehand extension over raw CDP and returns its id.
async function loadStagehandExtension(wsUrl) {
  const extensionDir = resolve(here, "node_modules/@browserbasehq/stagehand/dist/extension");
  const ws = new WebSocket(wsUrl);
  await new Promise((ok, fail) => { ws.onopen = ok; ws.onerror = () => fail(new Error("CDP socket failed")); });
  const call = (id, method, params) => new Promise((ok, fail) => {
    ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id === id) d.error ? fail(new Error(d.error.message)) : ok(d.result); };
    ws.send(JSON.stringify({ id, method, params }));
  });
  const existing = (await call(1, "Extensions.getExtensions", {})).extensions.find((e) => e.name === "Stagehand Runtime" && e.enabled);
  const id = existing?.id ?? (await call(2, "Extensions.loadUnpacked", { path: extensionDir })).id;
  await call(3, "Target.createTarget", { url: `chrome-extension://${id}/wake-service-worker.html` });
  ws.close();
  return id;
}

const today = new Date().toISOString().slice(0, 10);
const indexCsv = join(evidenceDir, "index.csv");
const csv = (v) => `"${String(v ?? "").replaceAll('"', '""')}"`;
let sh;
try {
  const version = await waitForPort();
  const extensionId = await loadStagehandExtension(version.webSocketDebuggerUrl);
  const browser = await localBrowser.connect({ cdpUrl: `http://127.0.0.1:${port}`, extensionId });
  sh = await Stagehand.create({ browser });
  const page = (await browser.context.pages())[0] ?? (await browser.context.newPage());
  await page.setViewportSize(viewport.width, viewport.height);
  for (const item of plan.items) {
    const base = join(evidenceDir, `${item.id}-${item.slug}`);
    const dataBase = item.dataId ? join(evidenceDir, `${item.dataId}-${item.slug}-data`) : null;
    try {
      if (item.url) await withTimeout(page.goto(item.url, { waitUntil: "load", timeout: 45000 }), 60000, "goto");
      await page.waitForTimeout(item.waitMs ?? 3000);
      for (const step of item.steps ?? []) {
        if (step.key) await withTimeout(page.keyPress(step.key), 10000, "key");
        if (step.click) await page.click(step.click[0], step.click[1]);
        if (step.eval) await pageEval(step.eval, 15000);
        await page.waitForTimeout(step.wait ?? 600);
      }
      if (item.mask !== false) await pageEval(wrap(readScript("mask.js"), "window.__re.mask.apply({ avatars: true, placeholders: true })"), 30000);
      const out = { id: item.id, url: await page.url(), title: await pageEval("document.title"), date: today };
      if (item.inventory !== false) out.inventory = await pageEval(wrap(readScript("inventory.js")), 60000);
      if (item.tokens !== false) out.tokens = await pageEval(wrap(readScript("tokens.js")), 60000);
      if (item.extract) out.extract = await pageEval(item.extract, item.evalMs ?? 30000);
      if (dataBase) writeFileSync(`${dataBase}.json`, JSON.stringify(out, null, 2));
      if (item.screenshot !== false) writeFileSync(`${base}.png`, await withTimeout(page.screenshot({ fullPage: item.fullPage === true }), 30000, "screenshot"));
      if (!existsSync(indexCsv)) writeFileSync(indexCsv, "id,date,session,route,shows,masked\n");
      const route = csv(new URL(out.url).pathname.slice(0, 60));
      const masked = item.mask === false ? "n/a" : "yes";
      if (item.screenshot !== false) appendFileSync(indexCsv, [item.id, today, plan.session ?? "s01", route, csv(item.shows ?? item.slug), masked].join(",") + "\n");
      if (dataBase) appendFileSync(indexCsv, [item.dataId, today, plan.session ?? "s01", route, csv(`Data for ${item.id}: ${item.shows ?? item.slug}`), masked].join(",") + "\n");
      console.log("captured", item.id, item.slug, out.title);
    } catch (error) {
      console.log("failed", item.id, item.slug, error.message);
    }
  }
} finally {
  await sh?.close().catch(() => {});
  chrome.kill();
}
