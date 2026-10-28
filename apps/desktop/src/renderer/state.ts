/** The app's state outside the editor: settings, the library, the open document, panels and dialogs. */
import type { PDocFile } from "@p-doc/core";
import type { DocRef, DocSummary, LibraryInfo, Settings, Space } from "../shared/api.ts";
import { createStore } from "./lib/store.ts";

export type SaveState = "saved" | "saving" | "error";

export type Dialog =
  | { kind: "wordCount" }
  | { kind: "shortcuts" }
  | { kind: "link" }
  | { kind: "specialChars" }
  | { kind: "settings" }
  | { kind: "about" }
  | { kind: "pageSetup" }
  | { kind: "headerFooter" }
  | { kind: "rename"; ref: DocRef; title: string }
  | { kind: "move"; ref: DocRef; title: string; to: Space };

export interface Toast {
  id: number;
  text: string;
  tone?: "error";
  action?: { label: string; run: () => void };
}

export interface AppState {
  phase: "loading" | "firstRun" | "ready";
  settings: Settings | null;
  info: LibraryInfo | null;
  docs: DocSummary[];
  /** The open document's place and summary. */
  current: DocSummary | null;
  /** The open document without its live content (title, page, styles, comments): content lives in the editor. */
  doc: PDocFile | null;
  /** Changes whenever another document opens, so the editor (and its undo history) is made fresh. */
  session: number;
  save: SaveState;
  dialog: Dialog | null;
  find: "find" | "replace" | null;
  palette: boolean;
  toasts: Toast[];
  focus: boolean;
  fullscreen: boolean;
  /** The window is under 1000 px wide: the left panel collapses and opens over the page (spec V1). */
  narrow: boolean;
  /** The left panel is open over the page in a narrow window. */
  peek: boolean;
  /** Bumped on each editor transaction, for views that follow the content (outline, counts). */
  tick: number;
  e2e: boolean;
}

export const app = createStore<AppState>({
  phase: "loading",
  settings: null,
  info: null,
  docs: [],
  current: null,
  doc: null,
  session: 0,
  save: "saved",
  dialog: null,
  find: null,
  palette: false,
  toasts: [],
  focus: false,
  fullscreen: false,
  narrow: false,
  peek: false,
  tick: 0,
  e2e: false,
});

let toastId = 0;
export function toast(text: string, o: Omit<Toast, "id" | "text"> = {}): void {
  const id = ++toastId;
  app.set((s) => ({ toasts: [...s.toasts, { id, text, ...o }].slice(-3) }));
  setTimeout(() => dismissToast(id), o.action ? 8000 : 5000);
}
export const dismissToast = (id: number) => app.set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));

export async function updateSettings(patch: Partial<Omit<Settings, "version">>): Promise<void> {
  const prev = app.get().settings;
  if (prev) app.set({ settings: { ...prev, ...patch } });
  const next = await window.pdoc.settings.set(patch);
  app.set({ settings: next });
}

export const openDialog = (dialog: Dialog) => app.set({ dialog, palette: false });
export const closeDialog = () => app.set({ dialog: null });

type PanelTab = "library" | "outline";
/** The panel on screen: the saved choice, unless a narrow window has it collapsed. */
export const shownPanel = (s: AppState): PanelTab | null => (s.narrow && !s.peek ? null : (s.settings?.leftPanel ?? null));
/** Opens a tab of the left panel (over the page in a narrow window). */
export function showPanel(t: PanelTab): void {
  if (app.get().narrow) app.set({ peek: true });
  void updateSettings({ leftPanel: t });
}
/** View > Show outline / library: open that tab, or close the panel if it's the one showing. */
export function togglePanel(t: PanelTab): void {
  const s = app.get();
  if (shownPanel(s) !== t) showPanel(t);
  else if (s.narrow) app.set({ peek: false });
  else void updateSettings({ leftPanel: null });
}
