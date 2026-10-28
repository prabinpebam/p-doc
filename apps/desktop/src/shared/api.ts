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

export interface PrintRequest {
  /** The print document (print.ts): self-contained HTML that runs no script. */
  html: string;
  title: string;
  /** Paper size in inches (the page as drawn on screen, so sheets fill pages exactly). */
  size: { width: number; height: number };
  /** Inches; 0 in Pages mode, where each sheet draws its own margins. */
  margins: { top: number; bottom: number; left: number; right: number };
}

export interface PdfResult {
  path: string;
  pages: number;
}

/** One version (commit) of a document (U28). */
export interface VersionEntry {
  sha: string;
  /** ISO time of the commit. */
  time: string;
  author: string;
  message: string;
  /** The name given with "Name this version", or null (U31). */
  name: string | null;
  /** The document's path in that version (it moves to `.bin/` and back). */
  path: string;
}

export interface PDocApi {
  output: {
    /** Asks where, then writes the print document as a PDF; null when the person cancels. */
    pdf(req: PrintRequest): Promise<PdfResult | null>;
    /** The system print dialog for the print document; false when cancelled or it failed. */
    print(req: PrintRequest): Promise<boolean>;
    /** Shows an exported file in the system file manager. */
    showFile(path: string): Promise<void>;
  };
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
  /** A document's versions (spec §4.6). */
  versions: {
    /** Newest first; empty without Git. */
    list(ref: DocRef): Promise<VersionEntry[]>;
    /** The document as it was in a version. */
    at(ref: DocRef, sha: string): Promise<PDocFile>;
    /** Names a version; an empty name removes the name. */
    name(ref: DocRef, sha: string, name: string): Promise<void>;
    /** Makes the version current as a new version; returns the document as it now is. */
    restore(ref: DocRef, sha: string): Promise<Opened>;
    /** A new document from a version. */
    copy(ref: DocRef, sha: string): Promise<DocSummary>;
    /** Makes a version of the saved state now; null when it already is one. */
    commitNow(ref: DocRef): Promise<string | null>;
    /** A version was made by the cadence (after a pause, on switching documents). */
    onChanged(cb: (ref: DocRef) => void): () => void;
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
