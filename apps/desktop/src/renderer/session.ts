/**
 * The open document's life: autosave 800 ms after the last change, a recovery copy while unsaved,
 * and a flush before switching documents or closing (spec §4.2).
 */
import type { Editor, JSONContent } from "@tiptap/core";
import { eachImage, hasDataImages, isDataImage, type PDocFile } from "@p-doc/core";
import { sameRef, type CreateRequest, type DocRef, type DocSummary, type Opened } from "../shared/api.ts";
import { app, pageEditable, toast, updateSettings } from "./state.ts";

export const NEWER_MESSAGE = "Made with a newer P-Doc. Update to edit it.";

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
  if (app.get().locked) return;
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
  const { current, locked } = app.get();
  const doc = snapshot();
  if (!current || !doc || !dirty() || locked) return;
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
  const locked = o.summary.newer ? NEWER_MESSAGE : null;
  app.set((s) => ({ current: o.summary, doc: o.doc, locked, session: s.session + 1, save: "saved", find: null, mode: o.doc.alwaysSuggest ? "suggesting" : s.mode }));
  void updateSettings({ last: { space: o.summary.space, path: o.summary.path } });
  void storeOldImages(o);
}

/** Stops typing in the open document and says why (it changed in a way this window can't show). */
export function lockDoc(reason: string): void {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = null;
  app.set({ locked: reason });
  getEditor()?.setEditable(false, false);
}

/**
 * A document from before stage 7 keeps its pictures inside it; the first time it's open for editing
 * main writes them beside it, then the document, and makes a version (spec §4.9 step 6). The page
 * showed the old file meanwhile; its images are then pointed at the files without an undo step.
 * Saves wait for it, so the move never writes over newer typing.
 */
async function storeOldImages(o: Opened): Promise<void> {
  if (o.summary.newer || o.summary.bin || !hasDataImages(o.doc.content) || !pageEditable(app.get())) return;
  const ref: DocRef = { space: o.summary.space, path: o.summary.path };
  while (saving) await saving;
  const run = (async () => {
    try {
      const m = await window.pdoc.library.storeImages(ref);
      if (!m) return;
      const before: JSONContent[] = [];
      const after: JSONContent[] = [];
      eachImage(o.doc.content, (n) => before.push(n));
      eachImage(m.doc.content, (n) => after.push(n));
      const stored = new Map<string, Record<string, unknown>>();
      if (before.length === after.length) before.forEach((n, i) => isDataImage(n.attrs?.src) && stored.set(n.attrs!.src as string, after[i]!.attrs ?? {}));
      const e = getEditor();
      if (e && stored.size && sameRef(app.get().current, ref)) {
        const tr = e.state.tr;
        e.state.doc.descendants((n, pos) => {
          const a = n.type.name === "image" ? stored.get(n.attrs.src) : undefined;
          if (a) tr.setNodeMarkup(pos, undefined, { ...n.attrs, src: a.src, naturalWidth: n.attrs.naturalWidth ?? a.naturalWidth ?? null, naturalHeight: n.attrs.naturalHeight ?? a.naturalHeight ?? null });
          return n.isBlock;
        });
        if (tr.docChanged) e.view.dispatch(tr.setMeta("addToHistory", false).setMeta("pdoc-quiet", true));
      }
      patchSummary(m.summary);
    } catch (err) {
      // Saving stores the images beside the document all the same.
      console.error(err);
    }
  })();
  saving = run;
  try {
    await run;
  } finally {
    if (saving === run) saving = null;
  }
}

export async function refreshList(): Promise<void> {
  app.set({ docs: await window.pdoc.library.list() });
}

export async function openDoc(ref: DocRef): Promise<void> {
  if (sameRef(app.get().current, ref) && !app.get().locked) return;
  await flush();
  try {
    const o = await window.pdoc.library.open(ref);
    show(o);
    if (o.summary.newer) toast(NEWER_MESSAGE);
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

/** Opens a document main has just made (an import), after saving the one on screen. */
export async function openMade(make: () => Promise<Opened | null>): Promise<Opened | null> {
  await flush();
  const o = await make();
  if (!o) return null;
  show(o);
  await refreshList();
  return o;
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
