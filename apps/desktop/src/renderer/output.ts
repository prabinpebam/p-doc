/** File > Download and File > Print (U16, U17); File > Open from file and dropped files (U18). */
import type { ExportKind, Imported } from "../shared/api.ts";
import { printDocument } from "./editor/print.ts";
import { getEditor, ipcMessage, openMade, snapshot, syncSelection } from "./session.ts";
import { dismissToast, toast } from "./state.ts";

let busy = false;
/** The "…" toast of the work under way, dismissed when its result shows. */
let working: number | null = null;
const progress = (text: string) => {
  done();
  working = toast(text);
};
const done = () => {
  if (working != null) dismissToast(working);
  working = null;
};

function build() {
  syncSelection();
  const e = getEditor();
  const doc = snapshot();
  return e && doc ? printDocument(doc, e.view) : null;
}

const fileOf = (path: string) => path.split(/[\\/]/).pop() ?? path;

export async function downloadPdf(): Promise<void> {
  if (busy) return;
  busy = true;
  try {
    const p = build();
    if (!p) return;
    progress("Making PDF…");
    const r = await window.pdoc.output.pdf(p.request);
    done();
    if (!r) return;
    toast(`Saved ${fileOf(r.path)} · ${r.pages === 1 ? "1 page" : `${r.pages} pages`}`, { action: { label: "Show in folder", run: () => void window.pdoc.output.showFile(r.path) } });
  } catch (e) {
    done();
    toast(`Couldn't make the PDF: ${ipcMessage(e)}`, { tone: "error" });
  } finally {
    busy = false;
  }
}

export async function printDoc(): Promise<void> {
  if (busy) return;
  busy = true;
  try {
    const p = build();
    if (!p) return;
    await window.pdoc.output.print(p.request);
  } catch (e) {
    toast(`Couldn't print: ${ipcMessage(e)}`, { tone: "error" });
  } finally {
    busy = false;
  }
}

/** File > Download as Word, Markdown, a web page or plain text (U17). */
export async function downloadAs(kind: ExportKind): Promise<void> {
  if (busy) return;
  const doc = snapshot();
  if (!doc) return;
  busy = true;
  try {
    const r = await window.pdoc.output.export(doc, kind);
    if (r) toast(`Saved ${fileOf(r.path)}`, { action: { label: "Show in folder", run: () => void window.pdoc.output.showFile(r.path) } });
  } catch (e) {
    toast(`Couldn't export: ${ipcMessage(e)}`, { tone: "error", action: { label: "Try again", run: () => void downloadAs(kind) } });
  } finally {
    busy = false;
  }
}

function imported(r: Imported | null): void {
  if (!r) return;
  toast(r.leftOut.length ? `Imported. Some parts (${r.leftOut.join(", ")}) were left out.` : `Opened ${r.opened.summary.title}`);
}

async function importWith(get: () => Promise<Imported | null>): Promise<void> {
  if (busy) return;
  busy = true;
  let r: Imported | null = null;
  try {
    await openMade(async () => {
      r = await get();
      return r?.opened ?? null;
    });
    done();
    imported(r);
  } catch (e) {
    done();
    toast(`Couldn't import: ${ipcMessage(e)}`, { tone: "error" });
  } finally {
    busy = false;
  }
}

/** File > Open from file (U18): a new Private document from a Word, Markdown, web page, text or P-Doc file. */
export function openFromFile(): Promise<void> {
  // Main says when the dialog has closed and reading begins ("Importing…").
  return importWith(() => window.pdoc.output.importFile());
}

/** A file dropped on the window: its bytes go to main, never its path. */
export function importDropped(file: File): Promise<void> {
  if (file.size > 50 * 1024 * 1024) {
    toast("Couldn't import: This file is larger than 50 MB.", { tone: "error" });
    return Promise.resolve();
  }
  return importWith(async () => {
    progress("Importing…");
    return window.pdoc.output.importData(file.name, new Uint8Array(await file.arrayBuffer()));
  });
}

export function listenImporting(): () => void {
  return window.pdoc.output.onImporting(() => progress("Importing…"));
}
