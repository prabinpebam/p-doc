/**
 * The open document's life: autosave 800 ms after the last change, a recovery copy while unsaved,
 * and a flush before switching documents or closing (spec §4.2).
 */
import type { Editor } from "@tiptap/core";
import type { PDocFile } from "@p-doc/core";
import { sameRef, type CreateRequest, type DocRef, type DocSummary, type Opened } from "../shared/api.ts";
import { app, toast, updateSettings } from "./state.ts";

let editor: Editor | null = null;
let rev = 0;
let savedRev = 0;
let saveTimer: ReturnType<typeof setTimeout> | null = null;
let recoveryTimer: ReturnType<typeof setTimeout> | null = null;
let saving: Promise<void> | null = null;
let config = { saveDelayMs: 800, recoveryDelayMs: 300, e2e: false };

export async function loadConfig(): Promise<void> {
  config = await window.pdoc.app.config();
  app.set({ e2e: config.e2e });
}

export const getEditor = () => (editor && !editor.isDestroyed ? editor : null);

/**
 * Returns focus to the page now, keeping the selection. TipTap's focus command waits a frame, so a
 * dialog opened by the very next key would lose its focus to it.
 */
export function focusEditor(): void {
  getEditor()?.view.focus();
}

/**
 * Brings the editor's selection up to date with the page. ProseMirror reads caret moves the browser
 * made itself (Shift+End, a click) on the next selectionchange event, so a command run by a key
 * pressed straight after would otherwise act on the old selection.
 */
export function syncSelection(): void {
  const view = getEditor()?.view as unknown as { domObserver?: { flush(): void } } | undefined;
  view?.domObserver?.flush();
}

export function attachEditor(e: Editor): void {
  editor = e;
}
export function detachEditor(e: Editor): void {
  if (editor === e) editor = null;
}

/** The open document as it would be written now. */
export function snapshot(): PDocFile | null {
  const { doc } = app.get();
  if (!doc) return null;
  const e = getEditor();
  return { ...doc, content: e ? e.getJSON() : doc.content };
}

export const dirty = () => rev !== savedRev;

/** Something in the open document changed (content or settings). */
export function changed(): void {
  rev++;
  if (app.get().save !== "error") app.set({ save: "saving" });
  markPending();
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => void save(), config.saveDelayMs);
  if (!recoveryTimer)
    recoveryTimer = setTimeout(() => {
      recoveryTimer = null;
      const { current } = app.get();
      const doc = snapshot();
      if (current && doc && dirty()) window.pdoc.recovery.put(current, doc);
    }, config.recoveryDelayMs);
}

/** Edits not yet a version aren't on GitHub; main counts them too, but only tells us at the next sync or version. */
function markPending(): void {
  const { sync, current } = app.get();
  if (!sync || !current || sync.state.kind === "off" || sync.pending.some((p) => sameRef(p, current))) return;
  app.set({ sync: { ...sync, pending: [...sync.pending, { space: current.space, path: current.path }] } });
}

/** Changes the open document's settings (title, page, styles, comments) and saves them like typing. */
export function updateDoc(patch: Partial<PDocFile>): void {
  const { doc } = app.get();
  if (!doc) return;
  app.set({ doc: { ...doc, ...patch } });
  changed();
}

function patchSummary(s: DocSummary): void {
  app.set((st) => ({
    docs: [s, ...st.docs.filter((d) => !(d.space === s.space && d.path === s.path))].sort((a, b) => b.modified.localeCompare(a.modified)),
    current: sameRef(st.current, s) ? s : st.current,
  }));
}

/** Writes the open document if it changed; waits for a write already under way. */
export async function save(): Promise<void> {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = null;
  while (saving) await saving;
  const { current } = app.get();
  const doc = snapshot();
  if (!current || !doc || !dirty()) return;
  const target = rev;
  const ref: DocRef = { space: current.space, path: current.path };
  saving = (async () => {
    try {
      const summary = await window.pdoc.library.save(ref, doc);
      savedRev = Math.max(savedRev, target);
      patchSummary(summary);
      if (!dirty()) {
        window.pdoc.recovery.clear(ref);
        app.set({ save: "saved" });
      }
    } catch (e) {
      console.error(e);
      app.set({ save: "error" });
      if (saveTimer) clearTimeout(saveTimer);
      saveTimer = setTimeout(() => void save(), 2000);
    } finally {
      saving = null;
    }
  })();
  await saving;
}

/** Saves now, whatever the timers say. */
export async function flush(): Promise<void> {
  await save();
}

function show(o: Opened): void {
  rev = 0;
  savedRev = 0;
  app.set((s) => ({ current: o.summary, doc: o.doc, session: s.session + 1, save: "saved", find: null }));
  void updateSettings({ last: { space: o.summary.space, path: o.summary.path } });
}

export async function refreshList(): Promise<void> {
  app.set({ docs: await window.pdoc.library.list() });
}

export async function openDoc(ref: DocRef): Promise<void> {
  if (sameRef(app.get().current, ref)) return;
  await flush();
  try {
    show(await window.pdoc.library.open(ref));
  } catch (e) {
    toast(`Couldn't open the document: ${ipcMessage(e)}`, { tone: "error" });
  }
}

export async function newDoc(req: CreateRequest = {}): Promise<void> {
  await flush();
  const o = await window.pdoc.library.create(req);
  show(o);
  await refreshList();
}

/** Shows the open document afresh as it now is on disk (after restoring a version). */
export function reloadDoc(o: Opened): void {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = null;
  show(o);
  patchSummary(o.summary);
}

/** Renames the open document (or another one); the file name stays, the title changes. */
export async function renameDoc(ref: DocRef, title: string): Promise<void> {
  const t = title.trim() || "Untitled document";
  const isOpen = sameRef(app.get().current, ref);
  if (isOpen) {
    await flush();
    const { doc } = app.get();
    if (doc) app.set({ doc: { ...doc, title: t } });
  }
  const s = await window.pdoc.library.rename(ref, t);
  patchSummary(s);
}

/** Before the window closes: write everything, then tell main it may go. */
export function handleClosing(): void {
  void flush()
    .catch((e) => console.error(e))
    .finally(() => {
      // A save that failed leaves the newest text only here; recovery restores it at the next start.
      const { current } = app.get();
      const doc = snapshot();
      if (current && doc && dirty()) window.pdoc.recovery.put(current, doc);
      window.pdoc.app.closeReady();
    });
}

export const ipcMessage = (e: unknown) => String((e as Error)?.message ?? e).replace(/^Error invoking remote method '[^']+': (Error: )?/, "");
