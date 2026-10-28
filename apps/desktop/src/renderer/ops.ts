/** Library actions shared by the menus, the library rows and command search (U33, U37). */
import { sameRef, type DocRef, type DocSummary, type Space } from "../shared/api.ts";
import { flush, ipcMessage, newDoc, openDoc, refreshList } from "./session.ts";
import { app, toast } from "./state.ts";

const titleOf = (ref: DocRef) => app.get().docs.find((d) => sameRef(d, ref))?.title ?? "the document";

async function attempt<T>(what: string, fn: () => Promise<T>): Promise<T | null> {
  try {
    return await fn();
  } catch (e) {
    toast(`Couldn't ${what}: ${ipcMessage(e)}`, { tone: "error" });
    return null;
  }
}

export async function copyDoc(ref: DocRef): Promise<void> {
  if (sameRef(app.get().current, ref)) await flush();
  const s = await attempt("make a copy", () => window.pdoc.library.copy(ref));
  if (!s) return;
  await refreshList();
  toast(`Made "${s.title}"`, { action: { label: "Open", run: () => void openDoc(s) } });
}

/** After the open document leaves the list: open the most recent other one, or a new one. */
async function openSomethingElse(except: DocRef): Promise<void> {
  const next = app.get().docs.find((d) => !d.bin && !sameRef(d, except));
  if (next) await openDoc(next);
  else await newDoc();
}

export async function deleteDoc(ref: DocRef): Promise<void> {
  const isOpen = sameRef(app.get().current, ref);
  if (isOpen) await flush();
  const title = titleOf(ref);
  const s = await attempt("delete", () => window.pdoc.library.remove(ref));
  if (!s) return;
  await refreshList();
  if (isOpen) {
    app.set({ current: null, doc: null });
    await openSomethingElse(s);
  }
  toast(`Moved "${title}" to Bin`, { action: { label: "Restore", run: () => void restoreDoc(s) } });
}

export async function restoreDoc(ref: DocRef): Promise<DocSummary | null> {
  const s = await attempt("restore", () => window.pdoc.library.restore(ref));
  if (!s) return null;
  await refreshList();
  toast(`Restored "${s.title}"`, { action: { label: "Open", run: () => void openDoc(s) } });
  return s;
}

export async function moveDoc(ref: DocRef, to: Space): Promise<void> {
  const isOpen = sameRef(app.get().current, ref);
  if (isOpen) await flush();
  const s = await attempt(to === "public" ? "move to Public" : "move to Private", () => window.pdoc.library.move(ref, to));
  if (!s) return;
  await refreshList();
  if (isOpen) {
    const opened = await window.pdoc.library.open(s);
    app.set({ current: opened.summary, doc: { ...app.get().doc!, title: opened.doc.title } });
  }
  toast(to === "public" ? `"${s.title}" is now in Public` : `"${s.title}" is now in Private. Copies already synced stay in the public repository's history.`);
}

export function showInFolder(ref: DocRef): void {
  void attempt("show the file", () => window.pdoc.library.showInFolder(ref));
}
