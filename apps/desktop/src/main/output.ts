/**
 * Print and PDF (U16, A1): the renderer sends a self-contained print document; a hidden window with
 * no script and no network shows it at the page size on screen, then prints it or writes a PDF.
 */
import { app, BrowserWindow, dialog } from "electron";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { PDocFile } from "@p-doc/core";
import { EXPORTS, exportBytes } from "./files.ts";
import type { ExportKind, ExportResult, PdfResult, PrintRequest } from "../shared/api.ts";

const MAX_HTML = 200 * 1024 * 1024;

/** Files written this run: "Show in folder" reveals only these. */
export const exported = new Set<string>();

function check(r: PrintRequest): PrintRequest {
  const n = (v: unknown, lo: number, hi: number) => typeof v === "number" && Number.isFinite(v) && v >= lo && v <= hi;
  if (!r || typeof r.html !== "string" || r.html.length > MAX_HTML || typeof r.title !== "string") throw new Error("Not a print document");
  if (!n(r.size?.width, 1, 50) || !n(r.size?.height, 1, 50)) throw new Error("Unknown page size");
  const m = r.margins;
  if (!m || ![m.top, m.bottom, m.left, m.right].every((v) => n(v, 0, 10))) throw new Error("Unknown margins");
  return r;
}

/** A file name from a title: no characters Windows refuses, never empty. */
export function fileName(title: string, ext: string): string {
  const base = title
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[. ]+$/, "")
    .slice(0, 120);
  return `${base || "Untitled document"}.${ext}`;
}

/** Pages in a PDF Chromium wrote (its page objects are never in compressed streams). */
export function pdfPages(pdf: Buffer): number {
  const s = pdf.toString("latin1");
  const pages = s.match(/\/Type\s*\/Page(?![a-zA-Z])/g)?.length ?? 0;
  if (pages) return pages;
  const counts = [...s.matchAll(/\/Count\s+(\d+)/g)].map((x) => Number(x[1]));
  return counts.length ? Math.max(...counts) : 0;
}

async function withDocument<T>(r: PrintRequest, fn: (w: BrowserWindow) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(join(app.getPath("temp"), "p-doc-print-"));
  const file = join(dir, "document.html");
  await writeFile(file, r.html, "utf8");
  const w = new BrowserWindow({
    show: false,
    webPreferences: { partition: "p-doc-print", javascript: false, sandbox: true, contextIsolation: true, nodeIntegration: false, webviewTag: false, spellcheck: false },
  });
  w.webContents.on("will-navigate", (e) => e.preventDefault());
  w.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  // Its own session, so nothing it asks for reaches the network (the document is self-contained).
  w.webContents.session.webRequest.onBeforeRequest({ urls: ["http://*/*", "https://*/*", "ws://*/*", "wss://*/*"] }, (_d, cb) => cb({ cancel: true }));
  try {
    await w.loadFile(file);
    return await fn(w);
  } finally {
    w.destroy();
    await rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
}

/** Where to write a download: asked in a save dialog (tests set PDOC_SAVE_DIR); null when cancelled. */
async function savePath(parent: BrowserWindow | null, name: string, title: string, filter: { name: string; extensions: string[] }): Promise<string | null> {
  if (process.env.PDOC_SAVE_DIR) return join(process.env.PDOC_SAVE_DIR, name);
  const opts = { title, defaultPath: join(app.getPath("downloads"), name), filters: [filter] };
  const res = parent ? await dialog.showSaveDialog(parent, opts) : await dialog.showSaveDialog(opts);
  return res.canceled || !res.filePath ? null : res.filePath;
}

/** File > Download as Word, Markdown, a web page or plain text (U17). */
export async function exportDocument(parent: BrowserWindow | null, doc: PDocFile, kind: ExportKind): Promise<ExportResult | null> {
  const { ext, label } = EXPORTS[kind];
  const path = await savePath(parent, fileName(doc.title, ext), `Download ${label}`, { name: label, extensions: [ext] });
  if (!path) return null;
  await writeFile(path, await exportBytes(doc, kind));
  exported.add(path);
  return { path };
}

export async function savePdf(parent: BrowserWindow | null, req: PrintRequest): Promise<PdfResult | null> {
  const r = check(req);
  const path = await savePath(parent, fileName(r.title, "pdf"), "Download PDF", { name: "PDF document", extensions: ["pdf"] });
  if (!path) return null;
  const pdf = await withDocument(r, (w) =>
    w.webContents.printToPDF({
      pageSize: { width: r.size.width, height: r.size.height },
      margins: { top: r.margins.top, bottom: r.margins.bottom, left: r.margins.left, right: r.margins.right },
      printBackground: true,
      preferCSSPageSize: false,
      generateDocumentOutline: false,
    }),
  );
  await writeFile(path, pdf);
  exported.add(path);
  return { path, pages: pdfPages(pdf) };
}

export async function printDocument(req: PrintRequest): Promise<boolean> {
  const r = check(req);
  return withDocument(r, async (w) => {
    // Tests check the document renders; they never reach a printer.
    if (process.env.PDOC_E2E) return true;
    const microns = (inches: number) => Math.round(inches * 25400);
    const px = (inches: number) => Math.round(inches * 96);
    return new Promise<boolean>((resolve) =>
      w.webContents.print(
        {
          silent: false,
          printBackground: true,
          pageSize: { width: microns(r.size.width), height: microns(r.size.height) },
          margins: { marginType: "custom", top: px(r.margins.top), bottom: px(r.margins.bottom), left: px(r.margins.left), right: px(r.margins.right) },
        },
        (ok) => resolve(ok),
      ),
    );
  });
}
