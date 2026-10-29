/** The contract between the renderer and the main process (the preload exposes it as `window.pdoc`). */
import type { PageSetup, PDocFile, Styles } from "@p-doc/core";

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
  /** Made with a newer P-Doc: shown read-only, never rewritten (spec §4.9 step 7). */
  newer?: boolean;
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
  /** Where an unfinished first run stopped, so the next start resumes there (spec §4.1). */
  firstRunStep: FirstRunStep;
  theme: Theme;
  /** Percent. */
  zoom: number;
  identity: Identity;
  spelling: boolean;
  leftPanel: LeftPanel;
  compact: boolean;
  /** View > Show ruler. */
  ruler: boolean;
  /** View > Show non-printing characters. */
  marks: boolean;
  /** "Set as default" in Page setup. */
  pageDefault: PageSetup | null;
  /** Personal paragraph styles for new documents (U41). */
  styleDefault: Styles | null;
  /** The document open when P-Doc last closed. */
  last: DocRef | null;
  /** The GitHub connection: no token, only who and where (the token stays in Git's helper). */
  github: GitHubLink | null;
  /** The library folder chosen with `pdoc setup --library`; null for Documents\P-Doc. Never set by the window. */
  library: string | null;
}

export type FirstRunStep = "welcome" | "git" | "signIn" | "identity" | "repos" | "done";

export interface GitHubLink {
  login: string;
  /** Repository names on GitHub (default `p-doc-private`, `p-doc-public`). */
  names: Record<Space, string>;
  /** Set up and syncing; false while setup is unfinished or after signing out. */
  connected: boolean;
  /** Sync after each version and every 5 minutes (Settings > GitHub). */
  auto: boolean;
}

export interface GitHubAccount {
  login: string;
  id: number;
  name: string;
  /** The address GitHub suggests for commits (`<id>+<login>@users.noreply.github.com`). */
  noreply: string;
}

/** Git's version and the sign-in helpers on this computer (first run's Git step). */
export interface GitCheck {
  version: string | null;
  ok: boolean;
  /** Git Credential Manager is Git's credential helper. */
  gcm: boolean;
  /** The GitHub CLI is installed. */
  gh: boolean;
}

export type AccountStatus =
  | { state: "signedIn"; account: GitHubAccount }
  | { state: "signedOut" }
  /** Git has a credential but GitHub can't be reached to check it. */
  | { state: "offline" }
  /** Git's credential for GitHub no longer works. */
  | { state: "invalid" };

export interface SignInProgress {
  message: string;
  /** The one-time code the browser asks for, when the helper gives one. */
  code?: string;
}

export interface SignInResult {
  account: GitHubAccount;
  /** Shown under the account, e.g. when the sign-in lasts only until P-Doc closes. */
  warning?: string;
}

export type RepoState = "create" | "found" | "ready" | "taken" | "visibility";

export interface RepoPlan {
  space: Space;
  owner: string;
  name: string;
  state: RepoState;
}

export interface SetupProgress {
  space: Space;
  step: "find" | "create" | "local" | "remote" | "push" | "done";
}

export type SyncState =
  | { kind: "off" }
  | { kind: "syncing" }
  | { kind: "synced"; at: string }
  | { kind: "offline"; waiting: number }
  | { kind: "problem"; reason: string; signIn: boolean };

export interface SyncStatus {
  state: SyncState;
  /** Documents with changes GitHub doesn't have yet. */
  pending: DocRef[];
}

export interface SyncEvent {
  status: SyncStatus;
  /** Documents a sync changed on this computer. */
  changed: DocRef[];
  /** Documents edited apart: this computer's stays, GitHub's is kept beside it (spec §4.7 step 5). */
  kept: { title: string; copy: DocRef }[];
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

/** An image stored beside the documents: its path in the repository and its natural size. */
export interface StoredAsset {
  src: string;
  width: number;
  height: number;
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
  styles?: Styles;
  comments?: PDocFile["comments"];
}

export interface PrintRequest {
  /** The print document (print.ts): self-contained HTML that runs no script. */
  html: string;
  title: string;
  /** Paper size in inches (the page as drawn on screen, so sheets fill pages exactly). */
  size: { width: number; height: number };
  /** Inches; 0 in Pages mode, where each sheet draws its own margins. */
  margins: { top: number; bottom: number; left: number; right: number };
  /** Sections with their own paper (U55): each sheet takes its size from the document's CSS. */
  cssPages?: boolean;
}

export interface PdfResult {
  path: string;
  pages: number;
}

/** File > Download formats besides PDF (U17). */
export type ExportKind = "docx" | "md" | "html" | "txt";
export const EXPORT_KINDS: readonly ExportKind[] = ["docx", "md", "html", "txt"];

export interface ExportResult {
  path: string;
}

/** A file read as a document for Compare documents: its title and content. */
export interface FileContent {
  title: string;
  content: PDocFile["content"];
}

/** A file opened with File > Open from file or dropped on the window (U18). */
export interface Imported {
  opened: Opened;
  /** Parts left out, for "Imported. Some parts … were left out."; empty when everything came in. */
  leftOut: string[];
  /** Word changes P-Doc keeps as comments (moves, formatting, table changes), for "*n* changes kept as comments". */
  kept: number;
}

/** The notice after an import, or null when everything came in as it was. */
export function importNotice(leftOut: string[], kept: number): string | null {
  const parts = leftOut.length ? ` Some parts (${leftOut.join(", ")}) were left out.` : "";
  const changes = kept === 1 ? " 1 change kept as a comment." : kept > 1 ? ` ${kept} changes kept as comments.` : "";
  return parts || changes ? `Imported.${parts}${changes}` : null;
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
    /** Asks where, then writes the document as Word, Markdown, a web page or plain text; null when cancelled. */
    export(doc: PDocFile, kind: ExportKind): Promise<ExportResult | null>;
    /** Asks for a file, then makes a new Private document from it; null when cancelled. */
    importFile(): Promise<Imported | null>;
    /** A new Private document from a file dropped on the window (its bytes, never its path). */
    importData(name: string, data: Uint8Array): Promise<Imported>;
    /** Asks for a file and reads it as a document without adding it to the library (Compare documents); null when cancelled. */
    readFile(): Promise<FileContent | null>;
    /** Open from file: the dialog has closed and the file is being read. */
    onImporting(cb: () => void): () => void;
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
    /** A document as it is on disk, without switching to it (no version is made). */
    read(ref: DocRef): Promise<Opened>;
    save(ref: DocRef, doc: PDocFile): Promise<DocSummary>;
    rename(ref: DocRef, title: string): Promise<DocSummary>;
    copy(ref: DocRef): Promise<DocSummary>;
    remove(ref: DocRef): Promise<DocSummary>;
    restore(ref: DocRef): Promise<DocSummary>;
    move(ref: DocRef, to: Space): Promise<DocSummary>;
    showInFolder(ref: DocRef): Promise<void>;
    /** Opens the library folder in the system file manager. */
    showRoot(): Promise<void>;
    /** Moves a document's images out of the file to beside it, with a version; null when there were none (spec §4.9). */
    storeImages(ref: DocRef): Promise<Opened | null>;
  };
  /** Images beside the documents (spec §4.9). */
  assets: {
    /** Stores an image in a repository once; rejects with a sentence to show (too big, not a picture). */
    put(space: Space, data: Uint8Array): Promise<StoredAsset>;
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
  /** GitHub: signing in and setting up the two repositories (spec §4.1). */
  github: {
    gitCheck(): Promise<GitCheck>;
    status(): Promise<AccountStatus>;
    /** Checks the token with GitHub and hands it to Git's helper; rejects with a sentence to show. */
    signInWithToken(token: string): Promise<SignInResult>;
    /** Git Credential Manager's window, or the GitHub CLI's browser sign-in. */
    signInWithBrowser(): Promise<SignInResult>;
    cancelSignIn(): void;
    onSignInProgress(cb: (p: SignInProgress) => void): () => void;
    /** Removes Git's GitHub credential ("Use another account"). */
    forget(): Promise<void>;
    /** The name and email Git already has, to prefill the Identity step. */
    gitIdentity(): Promise<Identity>;
    plan(names: Record<Space, string>): Promise<RepoPlan[]>;
    /** Finds or makes both repositories and pushes; safe to run again. */
    setup(names: Record<Space, string>, useTaken: Space[]): Promise<RepoPlan[]>;
    onSetupProgress(cb: (p: SetupProgress) => void): () => void;
    /** Stops syncing and forgets the account in P-Doc; Git keeps its sign-in. */
    signOut(): Promise<void>;
  };
  sync: {
    status(): Promise<SyncStatus>;
    now(): Promise<SyncStatus>;
    onChanged(cb: (e: SyncEvent) => void): () => void;
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
/** A name GitHub accepts for a repository. */
export const isRepoName = (n: unknown): n is string => typeof n === "string" && /^[A-Za-z0-9._-]{1,100}$/.test(n) && n !== "." && n !== ".." && !n.endsWith(".git");
export const DEFAULT_REPOS: Record<Space, string> = { private: "p-doc-private", public: "p-doc-public" };

/** The sentence first run shows for a repository that can't be used as it is (spec §4.1). */
export function planProblem(p: RepoPlan): string | null {
  if (p.state === "visibility")
    return p.space === "private"
      ? `${p.name} is public on GitHub, so it can't hold private documents. Choose another name.`
      : `${p.name} is private on GitHub. Choose another name, or make it public on GitHub first.`;
  if (p.state === "taken") return `A repository named ${p.name} already exists and isn't a P-Doc library.`;
  return null;
}
