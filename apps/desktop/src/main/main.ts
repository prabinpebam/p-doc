/**
 * P-Doc's main process: one editor window, the library on disk, and a typed IPC surface. The
 * renderer has no Node; every argument from it is checked here (spec §6, Security).
 */
import { app, BrowserWindow, ipcMain, Menu, nativeTheme, shell, type MenuItemConstructorOptions } from "electron";
import { appendFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { parseDocument, type PDocFile } from "@p-doc/core";
import { Library } from "./library.ts";
import { RecoveryStore, SettingsStore } from "./state.ts";
import { isDocRef, isSpace, type CreateRequest, type DocRef, type Recovered, type Settings } from "../shared/api.ts";

// Isolation for tests and portable use: data and library folders from the environment.
if (process.env.PDOC_USER_DATA) app.setPath("userData", process.env.PDOC_USER_DATA);
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
const libraryRoot = () => process.env.PDOC_LIBRARY || join(app.getPath("documents"), "P-Doc");
let library: Library;
let recovered: Recovered[] = [];
let win: BrowserWindow | null = null;
let closeAllowed = false;

const identity = () => {
  const id = settings.get().identity;
  return { name: id.name || "P-Doc", email: id.email || "p-doc@localhost" };
};

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
    if (!process.env.PDOC_E2E) w.show();
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
    const r = req ?? {};
    return library.create({
      title: typeof r.title === "string" ? r.title.slice(0, 300) : undefined,
      space: isSpace(r.space) ? r.space : "private",
      content: r.content ? asDoc({ format: "p-doc", version: 1, id: "x", content: r.content }).content : undefined,
      page: r.page ?? settings.get().pageDefault ?? undefined,
    });
  });
  h("library:open", (ref: DocRef) => library.read(asRef(ref)));
  h("library:save", (ref: DocRef, doc: unknown) => library.write(asRef(ref), asDoc(doc)));
  h("library:rename", (ref: DocRef, title: string) => library.rename(asRef(ref), String(title ?? "").slice(0, 300)));
  h("library:copy", (ref: DocRef) => library.copy(asRef(ref)));
  h("library:remove", (ref: DocRef) => library.remove(asRef(ref)));
  h("library:restore", (ref: DocRef) => library.restore(asRef(ref)));
  h("library:move", (ref: DocRef, to: unknown) => {
    if (!isSpace(to)) throw new Error("Unknown space");
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
  on("app:closeReady", () => {
    closeAllowed = true;
    void library.settle().finally(() => win?.close());
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
  library = await Library.open(libraryRoot(), { identity });
  log("start", { version: app.getVersion(), library: library.root, git: library.gitVersion });
  if (library.ready) recovered = applyRecovery();
  handlers();
  win = createWindow();
});
