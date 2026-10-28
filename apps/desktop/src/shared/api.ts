/** The contract between the renderer and the main process (the preload exposes it as `window.pdoc`). */
import type { PageSetup, PDocFile } from "@p-doc/core";

export type Space = "private" | "public";

/** A document's place in the library: its repository and its path inside it. */
export interface DocRef {
  space: Space;
  /** `docs/<name>.pdoc.json`, or `.bin/<name>.pdoc.json` for a deleted document. */
  path: string;
}

export interface DocSummary extends DocRef {
  id: string;
  title: string;
  /** ISO time of the last write. */
  modified: string;
  /** In the Bin. */
  bin: boolean;
}

export interface Identity {
  name: string;
  email: string;
}

export type Theme = "light" | "dark" | "system";
export type LeftPanel = "library" | "outline" | null;

export interface Settings {
  version: 1;
  firstRun: "pending" | "done";
  theme: Theme;
  /** Percent. */
  zoom: number;
  identity: Identity;
  spelling: boolean;
  leftPanel: LeftPanel;
  compact: boolean;
  /** "Set as default" in Page setup. */
  pageDefault: PageSetup | null;
  /** The document open when P-Doc last closed. */
  last: DocRef | null;
}

export interface LibraryInfo {
  root: string;
  /** Git's version, or null when Git is missing (versions are then off). */
  git: string | null;
  ready: boolean;
}

export interface Opened {
  summary: DocSummary;
  doc: PDocFile;
}

export interface Recovered {
  ref: DocRef;
  doc: PDocFile;
}

export interface CreateRequest {
  title?: string;
  space?: Space;
  content?: PDocFile["content"];
  page?: PageSetup;
}

export interface PDocApi {
  settings: {
    get(): Promise<Settings>;
    set(patch: Partial<Omit<Settings, "version">>): Promise<Settings>;
  };
  library: {
    info(): Promise<LibraryInfo>;
    /** First run's "Use offline": makes the two repositories. */
    setupOffline(): Promise<LibraryInfo>;
    list(): Promise<DocSummary[]>;
    create(req: CreateRequest): Promise<Opened>;
    open(ref: DocRef): Promise<Opened>;
    save(ref: DocRef, doc: PDocFile): Promise<DocSummary>;
    rename(ref: DocRef, title: string): Promise<DocSummary>;
    copy(ref: DocRef): Promise<DocSummary>;
    remove(ref: DocRef): Promise<DocSummary>;
    restore(ref: DocRef): Promise<DocSummary>;
    move(ref: DocRef, to: Space): Promise<DocSummary>;
    showInFolder(ref: DocRef): Promise<void>;
    /** Opens the library folder in the system file manager. */
    showRoot(): Promise<void>;
  };
  recovery: {
    /** Keeps a copy of unsaved text (fire and forget). */
    put(ref: DocRef, doc: PDocFile): void;
    clear(ref: DocRef): void;
    /** Copies left by a run that ended before saving; taking them removes them. */
    take(): Promise<Recovered[]>;
  };
  app: {
    /** The main process asks before the window closes; the renderer saves, then calls closeReady. */
    onClosing(cb: () => void): () => void;
    closeReady(): void;
    toggleFullScreen(): Promise<boolean>;
    onFullScreen(cb: (on: boolean) => void): () => void;
    setTitleBar(colors: { color: string; symbolColor: string }): void;
    openExternal(url: string): Promise<void>;
    openLogs(): Promise<void>;
    version(): Promise<string>;
    /** Timing the environment may override (tests stretch the save delay to prove recovery). */
    config(): Promise<{ saveDelayMs: number; recoveryDelayMs: number; e2e: boolean }>;
    /** Clipboard actions the page cannot start itself (Paste needs the main process). */
    edit(action: "cut" | "copy" | "paste" | "pasteAndMatchStyle" | "selectAll"): void;
    quit(): void;
  };
}

declare global {
  interface Window {
    pdoc: PDocApi;
  }
}

export const DOC_PATH = /^(docs|\.bin)\/[a-z0-9-]+\.pdoc\.json$/;
export const isSpace = (s: unknown): s is Space => s === "private" || s === "public";
export const isDocRef = (r: unknown): r is DocRef => !!r && typeof r === "object" && isSpace((r as DocRef).space) && typeof (r as DocRef).path === "string" && DOC_PATH.test((r as DocRef).path);
export const sameRef = (a: DocRef | null | undefined, b: DocRef | null | undefined) => !!a && !!b && a.space === b.space && a.path === b.path;
