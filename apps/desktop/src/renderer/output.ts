/** File > Download > PDF and File > Print (U16): the pages on screen, as a PDF or on paper. */
import { printDocument } from "./editor/print.ts";
import { getEditor, ipcMessage, snapshot, syncSelection } from "./session.ts";
import { toast } from "./state.ts";

let busy = false;

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
    toast("Making PDF…");
    const r = await window.pdoc.output.pdf(p.request);
    if (!r) return;
    toast(`Saved ${fileOf(r.path)} · ${r.pages === 1 ? "1 page" : `${r.pages} pages`}`, { action: { label: "Show in folder", run: () => void window.pdoc.output.showFile(r.path) } });
  } catch (e) {
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
