/**
 * P-Doc's main process: one editor window, the library on disk, and a typed IPC surface. The
 * renderer has no Node; every argument from it is checked here (spec §6, Security).
 */
import { app, BrowserWindow, dialog, ipcMain, Menu, nativeTheme, net, protocol, shell, type MenuItemConstructorOptions, type OpenDialogOptions } from "electron";
import { appendFileSync, existsSync, mkdirSync, readFileSync, statSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { basename, join } from "node:path";
import { ASSET_SCHEME, assetOfUrl, cleanPage, importKind, parseDocument, type PDocFile } from "@p-doc/core";
import { Library } from "./library.ts";
import { exported, exportDocument, printDocument, savePdf } from "./output.ts";
import { ImportError, importInto, isExportKind, MAX_IMPORT } from "./files.ts";
import { RecoveryStore, SettingsStore } from "./state.ts";
import { Versions } from "./versions.ts";
import { Account, SignInError } from "./account.ts";
import { GitHubError } from "./github.ts";
import { planRepos, runSetup, SetupError } from "./setup.ts";
import { Sync, SyncProblem } from "./sync.ts";
import { DEFAULT_REPOS, isDocRef, isRepoName, isSpace, type CreateRequest, type DocRef, type Imported, type PrintRequest, type Recovered, type Settings, type Space } from "../shared/api.ts";

// Isolation for tests and portable use: data and library folders from the environment. Otherwise the data
// folder is %APPDATA%\P-Doc in development and when installed, so the `pdoc` CLI finds the same settings.
if (process.env.PDOC_USER_DATA) app.setPath("userData", process.env.PDOC_USER_DATA);
else app.setPath("userData", join(app.getPath("appData"), "P-Doc"));
const dataDir = app.getPath("userData");
const logDir = join(dataDir, "logs");

export function log(...parts: unknown[]): void {
  const line = `${new Date().toISOString()} ${parts.map((p) => (p instanceof Error ? (p.stack ?? p.message) : typeof p === "string" ? p : JSON.stringify(p))).join(" ")}\n`;
  try {
    mkdirSync(logDir, { recursive: true });
    appendFileSync(join(logDir, "main.log"), line);
  } catch {
    // Logging never stops the app.
  }
  if (process.env.PDOC_E2E) process.stdout.write(`[p-doc] ${line}`);
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
  process.exit(0);
}

const settings = new SettingsStore(dataDir);
const recovery = new RecoveryStore(dataDir);
const libraryRoot = () => process.env.PDOC_LIBRARY || settings.get().library || join(app.getPath("documents"), "P-Doc");
let library: Library;
let recovered: Recovered[] = [];
let win: BrowserWindow | null = null;
let closeAllowed = false;
const versions = new Versions({
  commit: (ref) => library.commitDoc(ref),
  committed: (ref, sha) => {
    log("version", ref, sha.slice(0, 12));
    if (win && !win.webContents.isDestroyed()) win.webContents.send("pdoc:versions", ref);
  },
  failed: (ref, e) => log("version failed", ref, e),
  pauseMs: Number(process.env.PDOC_VERSION_PAUSE_MS) || undefined,
  maxMs: Number(process.env.PDOC_VERSION_MAX_MS) || undefined,
});

const identity = () => {
  const id = settings.get().identity;
  return { name: id.name || "P-Doc", email: id.email || "p-doc@localhost" };
};

const send = (channel: string, ...args: unknown[]) => {
  if (win && !win.webContents.isDestroyed()) win.webContents.send(`pdoc:${channel}`, ...args);
};
const account = new Account({ cwd: dataDir });
const sync = new Sync({
  get library() {
    return library;
  },
  account,
  link: () => settings.get().github,
  beforeMerge: () => versions.commitAll(),
  onEvent: (e) => {
    if (e.status.state.kind !== "syncing") log("sync", e.status.state, { changed: e.changed.length, kept: e.kept.length });
    send("sync", e);
  },
});

/** A sentence for a GitHub step that failed. */
function githubMessage(e: unknown): string {
  if (e instanceof SignInError || e instanceof SetupError) return e.message;
  if ((e instanceof GitHubError && e.offline) || (e instanceof SyncProblem && e.kind === "offline")) return "You're offline. Setup continues when you're back, or use P-Doc offline now.";
  if (e instanceof GitHubError && e.status === 401) return "GitHub didn't accept the sign-in. Sign in again.";
  if (e instanceof GitHubError) return `GitHub said: ${e.message}`;
  if (e instanceof SyncProblem) return e.message;
  return `Something went wrong: ${(e as Error).message}`;
}

function cleanNames(n: unknown): Record<Space, string> {
  const v = (n ?? {}) as Record<string, unknown>;
  if (!isRepoName(v.private) || !isRepoName(v.public)) throw new SetupError("Repository names can use letters, numbers, hyphens, dots, and underscores.");
  return { private: v.private, public: v.public };
}

async function owner(): Promise<string> {
  if (account.account) return account.account.login;
  const s = await account.status();
  if (s.state === "signedIn") return s.account.login;
  throw new SetupError(s.state === "offline" ? "You're offline. Setup continues when you're back, or use P-Doc offline now." : "Sign in to GitHub first.");
}

/** Recovery copies hold text newer than the file (they're cleared once it's saved): write them back. */
function applyRecovery(): Recovered[] {
  const out: Recovered[] = [];
  for (const r of recovery.take()) {
    try {
      library.write(r.ref, r.doc);
      out.push(r);
      log("recovered", r.ref);
    } catch (e) {
      log("recovery failed", r.ref, e);
    }
  }
  return out;
}

function themeColors(): { color: string; symbolColor: string } {
  // The title bar's colours follow the tokens' --color-bg and --color-text (light, dark).
  return nativeTheme.shouldUseDarkColors ? { color: "#16161b", symbolColor: "#f7f7f8" } : { color: "#f7f7f8", symbolColor: "#16161b" };
}

function createWindow(): BrowserWindow {
  const w = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 800,
    minHeight: 600,
    show: false,
    title: "P-Doc",
    backgroundColor: themeColors().color,
    titleBarStyle: "hidden",
    titleBarOverlay: { ...themeColors(), height: 44 },
    icon: join(import.meta.dirname, "icon.png"),
    webPreferences: {
      preload: join(import.meta.dirname, "preload.cjs"),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webviewTag: false,
      spellcheck: true,
    },
  });
  // Tests never take the computer's focus.
  if (process.env.PDOC_E2E) w.showInactive();
  w.once("ready-to-show", () => {
    log("window shown");
    if (process.env.PDOC_E2E) return;
    // The review build starts and refreshes behind whatever the owner is doing.
    if (process.env.PDOC_SHOW_INACTIVE) w.showInactive();
    else w.show();
  });
  w.webContents.on("did-finish-load", () => log("window loaded"));
  w.webContents.on("did-fail-load", (_e, code, desc) => log("window failed to load", code, desc));
  w.webContents.on("render-process-gone", (_e, d) => log("renderer gone", d.reason));
  w.webContents.on("console-message", (e) => {
    if (e.level === "error") log("renderer error", String(e.message).slice(0, 300));
  });
  w.webContents.on("will-navigate", (e) => e.preventDefault());
  w.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https:\/\//i.test(url)) void shell.openExternal(url);
    return { action: "deny" };
  });
  w.webContents.on("context-menu", (_e, p) => {
    const items: MenuItemConstructorOptions[] = [];
    for (const s of p.dictionarySuggestions.slice(0, 6)) items.push({ label: s, click: () => w.webContents.replaceMisspelling(s) });
    if (p.misspelledWord) {
      if (!p.dictionarySuggestions.length) items.push({ label: "No suggestions", enabled: false });
      items.push({ label: "Add to dictionary", click: () => w.webContents.session.addWordToSpellCheckerDictionary(p.misspelledWord) }, { type: "separator" });
    }
    if (p.isEditable) items.push({ role: "cut", enabled: p.editFlags.canCut }, { role: "copy", enabled: p.editFlags.canCopy }, { role: "paste", enabled: p.editFlags.canPaste });
    else if (p.selectionText) items.push({ role: "copy" });
    if (items.length) Menu.buildFromTemplate(items).popup({ window: w });
  });
  w.on("enter-full-screen", () => w.webContents.send("pdoc:fullscreen", true));
  w.on("leave-full-screen", () => w.webContents.send("pdoc:fullscreen", false));
  // The renderer saves before the window goes (spec §4.2 step 5).
  w.on("close", (e) => {
    if (closeAllowed || w.webContents.isDestroyed()) return;
    e.preventDefault();
    w.webContents.send("pdoc:closing");
    setTimeout(() => {
      if (!closeAllowed) {
        log("renderer didn't answer close in time");
        closeAllowed = true;
        w.close();
      }
    }, 5000);
  });
  w.on("closed", () => (win = null));
  void w.loadFile(join(import.meta.dirname, "..", "renderer", "index.html"));
  return w;
}

function asDoc(d: unknown): PDocFile {
  return parseDocument(JSON.stringify(d));
}
function asRef(r: unknown): DocRef {
  if (!isDocRef(r)) throw new Error("Not a document in the library");
  return { space: r.space, path: r.path };
}

function handlers(): void {
  const h = (channel: string, fn: (...args: never[]) => unknown) =>
    ipcMain.handle(`pdoc:${channel}`, async (e, ...args) => {
      if (e.sender !== win?.webContents) throw new Error("Unknown sender");
      try {
        return await (fn as (...a: unknown[]) => unknown)(...args);
      } catch (err) {
        log(`ipc ${channel} failed`, err);
        throw err;
      }
    });
  h("settings:get", () => settings.get());
  h("settings:set", (patch: Partial<Settings>) => {
    const next = settings.set(patch ?? {});
    if (patch?.theme) {
      nativeTheme.themeSource = next.theme;
      win?.setTitleBarOverlay({ ...themeColors(), height: 44 });
    }
    return next;
  });
  h("library:info", () => ({ root: library.root, git: library.gitVersion, ready: library.ready }));
  h("library:setupOffline", async () => {
    await library.ensure();
    settings.set({ firstRun: "done" });
    return { root: library.root, git: library.gitVersion, ready: library.ready };
  });
  h("library:list", () => library.list());
  h("library:create", async (req: CreateRequest) => {
    await library.ensure();
    void versions.commitAll();
    const r = req ?? {};
    const page = r.page ?? settings.get().pageDefault;
    return library.create({
      title: typeof r.title === "string" ? r.title.slice(0, 300) : undefined,
      space: isSpace(r.space) ? r.space : "private",
      content: r.content ? asDoc({ format: "p-doc", version: 1, id: "x", content: r.content }).content : undefined,
      // Checked and completed like a file's page setup (older defaults lack newer fields).
      page: page ? cleanPage(page) : undefined,
    });
  });
  h("library:open", (ref: DocRef) => {
    const r = asRef(ref);
    // Switching documents makes a version of the ones left behind (U27).
    void versions.commitExcept(r);
    return library.read(r);
  });
  // Images (spec §4.9): stored beside the document before it refers to them.
  h("assets:put", (space: unknown, data: unknown) => {
    if (!isSpace(space)) throw new Error("Unknown space");
    const bytes = data instanceof Uint8Array ? data : data instanceof ArrayBuffer ? new Uint8Array(data) : null;
    if (!bytes) throw new Error("Not an image");
    return library.putAsset(space, bytes);
  });
  h("library:storeImages", (ref: DocRef) => library.storeImagesOf(asRef(ref)));
  h("library:save", (ref: DocRef, doc: unknown) => {
    const r = asRef(ref);
    const s = library.write(r, asDoc(doc));
    versions.changed(r);
    return s;
  });
  h("library:rename", (ref: DocRef, title: string) => library.rename(asRef(ref), String(title ?? "").slice(0, 300)));
  h("library:copy", (ref: DocRef) => library.copy(asRef(ref)));
  h("library:remove", (ref: DocRef) => {
    versions.drop(asRef(ref));
    return library.remove(asRef(ref));
  });
  h("library:restore", (ref: DocRef) => library.restore(asRef(ref)));
  h("library:move", (ref: DocRef, to: unknown) => {
    if (!isSpace(to)) throw new Error("Unknown space");
    versions.drop(asRef(ref));
    return library.move(asRef(ref), to);
  });
  h("library:showInFolder", (ref: DocRef) => shell.showItemInFolder(library.file(asRef(ref))));
  h("library:showRoot", async () => {
    await shell.openPath(library.root);
  });
  h("recovery:take", () => {
    const r = recovered;
    recovered = [];
    return r;
  });
  const sha = (s: unknown) => {
    if (typeof s !== "string" || !/^[0-9a-f]{40}$/.test(s)) throw new Error("Not a version");
    return s;
  };
  h("versions:list", (ref: DocRef) => library.history(asRef(ref)));
  h("versions:at", (ref: DocRef, s: string) => library.versionAt(asRef(ref), sha(s)));
  h("versions:name", (ref: DocRef, s: string, name: unknown) => library.nameVersion(asRef(ref), sha(s), typeof name === "string" ? name : ""));
  h("versions:restore", (ref: DocRef, s: string) => {
    versions.drop(asRef(ref));
    return library.restoreVersion(asRef(ref), sha(s));
  });
  h("versions:copy", (ref: DocRef, s: string) => library.copyVersion(asRef(ref), sha(s)));
  h("versions:commitNow", (ref: DocRef) => versions.commitIfWaiting(asRef(ref)));

  // GitHub (spec §4.1, §4.7). Failures reach the renderer as one sentence to show.
  const g = (channel: string, fn: (...args: never[]) => unknown) =>
    h(channel, async (...args: never[]) => {
      try {
        return await (fn as (...a: unknown[]) => unknown)(...args);
      } catch (e) {
        throw new Error(githubMessage(e));
      }
    });
  g("github:gitCheck", () => account.gitCheck());
  g("github:status", () => account.status());
  g("github:gitIdentity", () => account.gitIdentity());
  const signedIn = (r: { account: { login: string } }) => {
    const l = settings.get().github;
    settings.set({ github: { login: r.account.login, names: l?.names ?? DEFAULT_REPOS, connected: false, auto: l?.auto ?? true } });
    return r;
  };
  g("github:signInWithToken", async (token: unknown) => {
    if (typeof token !== "string" || token.length > 400) throw new SignInError("That doesn't look like a GitHub token.");
    return signedIn(await account.signInWithToken(token));
  });
  g("github:signInWithBrowser", async () => signedIn(await account.signInWithBrowser((p) => send("signInProgress", p))));
  g("github:forget", () => account.forget());
  g("github:plan", async (names: unknown) => planRepos(await account.api(), await owner(), cleanNames(names), sync));
  g("github:setup", async (names: unknown, useTaken: unknown) => {
    const n = cleanNames(names);
    const taken = Array.isArray(useTaken) ? useTaken.filter(isSpace) : [];
    const login = await owner();
    await library.ensure();
    await versions.commitAll();
    const l = settings.get().github;
    settings.set({ github: { login, names: n, connected: false, auto: l?.auto ?? true } });
    const plan = await runSetup(await account.api(), login, n, taken, sync, (p) => send("setupProgress", p));
    settings.set({ github: { login, names: n, connected: true, auto: l?.auto ?? true }, firstRun: "done", firstRunStep: "done" });
    sync.start();
    return plan;
  });
  g("github:signOut", () => {
    account.signOut();
    sync.stop();
    sync.reset();
    const l = settings.get().github;
    if (l) settings.set({ github: { ...l, connected: false } });
    send("sync", { status: { state: { kind: "off" }, pending: [] }, changed: [], kept: [] });
  });
  h("sync:status", () => sync.status());
  h("sync:now", async () => {
    // Sync now sends what's on screen: the renderer has saved, so make a version of anything since the last.
    await versions.commitAll();
    return (await sync.run()).status;
  });
  h("app:toggleFullScreen", () => {
    const on = !win?.isFullScreen();
    win?.setFullScreen(on);
    return on;
  });
  h("app:openExternal", (url: string) => {
    if (typeof url === "string" && /^https:\/\//i.test(url)) return shell.openExternal(url);
  });
  h("app:openLogs", () => {
    mkdirSync(logDir, { recursive: true });
    return shell.openPath(logDir).then(() => undefined);
  });
  h("app:version", () => app.getVersion());
  h("output:pdf", (req: PrintRequest) => savePdf(win, req, library));
  h("output:print", (req: PrintRequest) => printDocument(req, library));
  h("output:export", (doc: unknown, kind: unknown) => {
    if (!isExportKind(kind)) throw new Error("Unknown format");
    return exportDocument(win, asDoc(doc), kind, library);
  });
  const importBytes = async (name: string, data: Uint8Array): Promise<Imported> => {
    void versions.commitAll();
    const r = await importInto(library, name, data, settings.get().pageDefault);
    log("import", { kind: importKind(name), leftOut: r.leftOut });
    return r;
  };
  h("output:importFile", async () => {
    let file: string | undefined;
    // Tests name the file instead of answering a dialog.
    if (process.env.PDOC_E2E && process.env.PDOC_OPEN_FILE) file = process.env.PDOC_OPEN_FILE;
    else {
      const opts: OpenDialogOptions = { title: "Open from file", properties: ["openFile"], filters: [{ name: "Documents", extensions: ["docx", "md", "markdown", "html", "htm", "txt", "json"] }] };
      const res = win ? await dialog.showOpenDialog(win, opts) : await dialog.showOpenDialog(opts);
      if (res.canceled || !res.filePaths[0]) return null;
      file = res.filePaths[0];
    }
    if (statSync(file).size > MAX_IMPORT) throw new ImportError("This file is larger than 50 MB.");
    send("importing");
    return importBytes(basename(file), new Uint8Array(readFileSync(file)));
  });
  h("output:importData", (name: unknown, data: unknown) => {
    if (typeof name !== "string" || !name || name.length > 260) throw new Error("Not a file");
    const bytes = data instanceof Uint8Array ? data : data instanceof ArrayBuffer ? new Uint8Array(data) : null;
    if (!bytes) throw new Error("Not a file");
    return importBytes(basename(name), bytes);
  });
  h("output:showFile", (path: unknown) => {
    if (typeof path === "string" && exported.has(path) && existsSync(path)) shell.showItemInFolder(path);
  });
  h("app:config", () => ({
    saveDelayMs: Number(process.env.PDOC_SAVE_DELAY_MS) || 800,
    recoveryDelayMs: Number(process.env.PDOC_RECOVERY_DELAY_MS) || 300,
    e2e: Boolean(process.env.PDOC_E2E),
  }));

  const on = (channel: string, fn: (...args: never[]) => void) =>
    ipcMain.on(`pdoc:${channel}`, (e, ...args) => {
      if (e.sender !== win?.webContents) return;
      try {
        (fn as (...a: unknown[]) => void)(...args);
      } catch (err) {
        log(`ipc ${channel} failed`, err);
      }
    });
  on("recovery:put", (ref: DocRef, doc: unknown) => recovery.put(asRef(ref), asDoc(doc)));
  on("recovery:clear", (ref: DocRef) => recovery.clear(asRef(ref)));
  on("github:cancelSignIn", () => account.cancelSignIn());
  on("app:closeReady", () => {
    closeAllowed = true;
    sync.stop();
    void versions
      .commitAll()
      .then(() => library.settle())
      .finally(() => win?.close());
  });
  on("app:setTitleBar", (c: { color: string; symbolColor: string }) => {
    if (c && /^#[0-9a-f]{6}$/i.test(c.color) && /^#[0-9a-f]{6}$/i.test(c.symbolColor)) win?.setTitleBarOverlay({ color: c.color, symbolColor: c.symbolColor, height: 44 });
  });
  on("app:quit", () => win?.close());
  on("app:edit", (action: string) => {
    const wc = win?.webContents;
    if (!wc) return;
    if (action === "cut") wc.cut();
    else if (action === "copy") wc.copy();
    else if (action === "paste") wc.paste();
    else if (action === "pasteAndMatchStyle") wc.pasteAndMatchStyle();
    else if (action === "selectAll") wc.selectAll();
  });
}

// Images in the window load from the library through their own scheme: only `assets/` files, read-only.
protocol.registerSchemesAsPrivileged([{ scheme: ASSET_SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true } }]);

Menu.setApplicationMenu(null);
app.on("second-instance", () => {
  if (win) {
    if (win.isMinimized()) win.restore();
    win.focus();
  }
});
app.on("window-all-closed", () => app.quit());
nativeTheme.on("updated", () => win?.setTitleBarOverlay({ ...themeColors(), height: 44 }));

void app.whenReady().then(async () => {
  nativeTheme.themeSource = settings.get().theme;
  // Recorded so the pdoc CLI finds the same folder when Documents is redirected (OneDrive, a policy).
  if (!process.env.PDOC_LIBRARY && !settings.get().library) settings.setLibrary(libraryRoot());
  library = await Library.open(libraryRoot(), { identity, changed: () => sync.soonAfterVersion() });
  log("start", { version: app.getVersion(), library: library.root, git: library.gitVersion });
  if (library.ready) recovered = applyRecovery();
  handlers();
  protocol.handle(ASSET_SCHEME, (req) => {
    const src = assetOfUrl(req.url);
    const file = src ? library.findAsset(src) : null;
    return file ? net.fetch(pathToFileURL(file).toString()) : new Response("Image missing", { status: 404 });
  });
  win = createWindow();
  // Text saved but never made a version (a crash, a forced quit) gets one on the usual cadence.
  if (library.ready) void library.unversioned().then((refs) => refs.forEach((r) => versions.changed(r)), (e) => log("unversioned failed", String(e)));
  // Sync on start and every 5 minutes once GitHub is set up.
  if (library.ready && sync.on) win.webContents.once("did-finish-load", () => sync.start());
});
