/**
 * Version history for the open document (spec §4.6, V6): the list, viewing a version against the
 * current text, restoring, copying and naming. Versions themselves are made in the main process.
 */
import type { JSONContent } from "@tiptap/core";
import { diffContent, diffStats, type PDocFile } from "@p-doc/core";
import { sameRef, type DocRef, type VersionEntry } from "../shared/api.ts";
import { createStore } from "./lib/store.ts";
import { flush, focusEditor, getEditor, ipcMessage, openDoc, refreshList, reloadDoc, snapshot } from "./session.ts";
import { app, closeDialog, openDialog, pageEditable, toast } from "./state.ts";

export interface Viewing {
  entry: VersionEntry;
  doc: PDocFile;
  /** The current text with what changed since the version marked (green added, red removed). */
  content: JSONContent;
  added: number;
  removed: number;
}

export interface HistoryState {
  /** Newest first; null while loading. */
  list: VersionEntry[] | null;
  /** The document the list belongs to. */
  ref: DocRef | null;
  onlyNamed: boolean;
  /** The version whose name is being typed. */
  naming: string | null;
  viewing: Viewing | null;
  /** The version being opened. */
  opening: string | null;
  error: string | null;
}

export const history = createStore<HistoryState>({ list: null, ref: null, onlyNamed: false, naming: null, viewing: null, opening: null, error: null });

/** "Oct 28, 2:05 PM": how versions are named in banners, dialogs and toasts. */
export const versionTime = (iso: string) => new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

const currentRef = (): DocRef | null => {
  const c = app.get().current;
  return c ? { space: c.space, path: c.path } : null;
};

let loads = 0;
/**
 * Reads the open document's versions. With `commit`, the saved text becomes a version first, so the
 * newest row is the current text.
 */
export async function loadHistory(commit = false): Promise<void> {
  const ref = currentRef();
  if (!ref) return;
  const n = ++loads;
  if (!sameRef(history.get().ref, ref)) history.set({ list: null, ref, naming: null, viewing: null, error: null });
  try {
    if (commit && app.get().info?.git) {
      await flush();
      await window.pdoc.versions.commitNow(ref);
    }
    const list = await window.pdoc.versions.list(ref);
    if (n === loads && sameRef(currentRef(), ref)) history.set({ list, error: null });
  } catch (e) {
    if (n === loads) history.set({ list: [], error: ipcMessage(e) });
  }
}

export function openHistory(): void {
  if (!app.get().current) return;
  app.set({ history: true, review: false, focus: false });
  requestAnimationFrame(() => document.querySelector<HTMLElement>("#history-panel [data-autofocus]")?.focus());
}

export function closeHistory(): void {
  backToCurrent();
  app.set({ history: false });
  focusEditor();
}

export const toggleHistory = () => (app.get().history ? closeHistory() : openHistory());

/** Shows a version read-only, marked against the current text (U29). */
export async function viewVersion(v: VersionEntry): Promise<void> {
  const ref = currentRef();
  const list = history.get().list;
  if (!ref) return;
  if (list?.[0]?.sha === v.sha) {
    backToCurrent();
    return;
  }
  history.set({ opening: v.sha });
  try {
    await flush();
    const old = await window.pdoc.versions.at(ref, v.sha);
    const now = snapshot();
    if (!now || !sameRef(currentRef(), ref) || history.get().opening !== v.sha) return;
    const content = diffContent(old.content, now.content);
    getEditor()?.setEditable(false, false);
    app.set({ find: null });
    history.set({ viewing: { entry: v, doc: old, content, ...diffStats(content) } });
  } catch (e) {
    toast(`Couldn't open that version: ${ipcMessage(e)}`, { tone: "error" });
  } finally {
    if (history.get().opening === v.sha) history.set({ opening: null });
  }
}

export function backToCurrent(): void {
  if (!history.get().viewing && !history.get().opening) return;
  history.set({ viewing: null, opening: null });
  getEditor()?.setEditable(pageEditable(app.get()), false);
}

export function askRestore(v: VersionEntry): void {
  openDialog({ kind: "restoreVersion", sha: v.sha, time: versionTime(v.time) });
}

/** Makes the version current as a new version; the ones in between stay (U30). */
export async function restoreVersion(sha: string, time: string): Promise<void> {
  closeDialog();
  const ref = currentRef();
  if (!ref) return;
  try {
    await flush();
    const o = await window.pdoc.versions.restore(ref, sha);
    history.set({ viewing: null, opening: null });
    reloadDoc(o);
    await loadHistory();
    toast(`Restored the version from ${time}.`);
    focusEditor();
  } catch (e) {
    toast(`Couldn't restore that version: ${ipcMessage(e)}`, { tone: "error" });
  }
}

/** A new document from the version (U32). */
export async function copyVersion(v: VersionEntry): Promise<void> {
  const ref = currentRef();
  if (!ref) return;
  try {
    const s = await window.pdoc.versions.copy(ref, v.sha);
    await refreshList();
    toast(`Made "${s.title}" from the version of ${versionTime(v.time)}.`, {
      action: {
        label: "Open",
        run: () => {
          backToCurrent();
          void openDoc(s);
        },
      },
    });
  } catch (e) {
    toast(`Couldn't make a copy: ${ipcMessage(e)}`, { tone: "error" });
  }
}

/** Names a version, or removes its name when empty (U31). */
export async function nameVersion(sha: string, name: string): Promise<void> {
  const ref = currentRef();
  history.set({ naming: null });
  if (!ref) return;
  try {
    await window.pdoc.versions.name(ref, sha, name);
    await loadHistory();
  } catch (e) {
    toast(`Couldn't name that version: ${ipcMessage(e)}`, { tone: "error" });
  }
}

/** File > Version history > Name current version: the current text as a version, then its name field. */
export async function nameCurrent(): Promise<void> {
  if (!app.get().current) return;
  if (!app.get().history) openHistory();
  backToCurrent();
  history.set({ onlyNamed: false });
  await loadHistory(true);
  const top = history.get().list?.[0];
  if (top) history.set({ naming: top.sha });
}

export const startNaming = (sha: string) => history.set({ naming: sha });
