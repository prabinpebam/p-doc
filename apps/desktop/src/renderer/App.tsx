/** The app shell: start-up, theme, layout and the keys that work everywhere. */
import { useEffect } from "react";
import { chordOf } from "./lib/keys.ts";
import { commandForChord, COMMANDS, runCommand } from "./commands.ts";
import { flush, getEditor, handleClosing, ipcMessage, loadConfig, newDoc, openDoc, refreshList, focusEditor, snapshot, syncSelection } from "./session.ts";
import { layoutNow, pageLayout } from "./editor/pages.ts";
import { downloadPdf } from "./output.ts";
import { printDocument } from "./editor/print.ts";
import { app, shownPanel, toast } from "./state.ts";
import { backToCurrent, history, loadHistory } from "./versions.ts";
import { reviewItems } from "./review.ts";
import { applySync, loadSync } from "./sync.ts";
import { sameRef } from "../shared/api.ts";
import { CommandSearch } from "./ui/CommandSearch.tsx";
import { Dialogs } from "./ui/Dialogs.tsx";
import { FirstRun } from "./ui/FirstRun.tsx";
import { HistoryPanel } from "./ui/HistoryPanel.tsx";
import { LeftPanel } from "./ui/LeftPanel.tsx";
import { MenuBar } from "./ui/MenuBar.tsx";
import { PageArea } from "./ui/PageArea.tsx";
import { ReviewPanel } from "./ui/ReviewPanel.tsx";
import { StatusBar } from "./ui/StatusBar.tsx";
import { TitleBar } from "./ui/TitleBar.tsx";
import { Toasts } from "./ui/Toasts.tsx";
import { Toolbar } from "./ui/Toolbar.tsx";

async function start(): Promise<void> {
  await loadConfig();
  if (app.get().e2e)
    Object.defineProperty(window, "__pdoc", {
      value: {
        app,
        getEditor,
        commands: () => [...COMMANDS.keys()],
        layout: () => pageLayout.get().layout,
        printRequest: () => {
          const e = getEditor();
          const d = snapshot();
          return e && d ? printDocument(d, e.view).request : null;
        },
        // The pieces `pnpm perf` times (spec §7).
        perf: {
          layoutNow,
          flush,
          openDoc,
          newDoc,
          downloadPdf,
          // What the title bar's count and the Review panel read after each edit.
          reviewScan: () => {
            const e = getEditor();
            const d = app.get().doc;
            return e && d ? reviewItems(e.state.doc, d.comments, "open", null).length : 0;
          },
        },
      },
      configurable: true,
    });
  const [settings, info] = await Promise.all([window.pdoc.settings.get(), window.pdoc.library.info()]);
  app.set({ settings, info });
  if (settings.firstRun === "pending" || !info.ready) {
    app.set({ phase: "firstRun" });
    return;
  }
  app.set({ phase: "ready" });
  if (settings.github?.connected) void loadSync();
  for (const r of await window.pdoc.recovery.take()) toast(`Recovered unsaved changes to ${r.doc.title}`);
  await refreshList();
  const { docs } = app.get();
  const last = settings.last && docs.find((d) => !d.bin && d.space === settings.last!.space && d.path === settings.last!.path);
  const first = last ?? docs.find((d) => !d.bin);
  if (first) await openDoc(first);
  else await newDoc();
}

const isTextField = (el: Element | null) =>
  !!el && (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement || ((el as HTMLElement).isContentEditable && !el.closest(".pd-content")));

function focusRegion(dir: 1 | -1): void {
  const regions = [...document.querySelectorAll<HTMLElement>("[data-region]")].filter((r) => r.offsetParent !== null);
  if (!regions.length) return;
  const i = regions.findIndex((r) => r.contains(document.activeElement));
  const next = regions[(i + dir + regions.length) % regions.length]!;
  if (next.classList.contains("canvas")) {
    focusEditor();
    return;
  }
  const target =
    next.querySelector<HTMLElement>('[tabindex="0"]') ??
    next.querySelector<HTMLElement>('button:not([disabled]), input, select, [role="tab"][aria-selected="true"], [tabindex]:not([tabindex="-1"])');
  target?.focus();
}

function onKeyCapture(e: KeyboardEvent): void {
  const s = app.get();
  if (s.phase !== "ready" || s.dialog) return;
  if (e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey && /^Key[A-Z]$/.test(e.code)) {
    const letter = e.code.slice(3);
    if ("FEVIOTH".includes(letter)) {
      e.preventDefault();
      e.stopPropagation();
      window.dispatchEvent(new CustomEvent("pdoc:menu", { detail: letter }));
      return;
    }
  }
  const chord = chordOf(e);
  if (!chord) return;
  const cmd = commandForChord(chord);
  if (!cmd) return;
  if (s.palette && cmd.id !== "tools.search") return;
  if (isTextField(document.activeElement) && !cmd.global) return;
  syncSelection();
  if (cmd.enabled && !cmd.enabled()) {
    e.preventDefault();
    return;
  }
  e.preventDefault();
  e.stopPropagation();
  runCommand(cmd.id);
}

function onKey(e: KeyboardEvent): void {
  const s = app.get();
  if (s.phase !== "ready" || s.dialog || e.defaultPrevented) return;
  if (e.key === "F6") {
    e.preventDefault();
    focusRegion(e.shiftKey ? -1 : 1);
  } else if (e.key === "Escape") {
    if (s.palette) app.set({ palette: false });
    else if (s.find) {
      app.set({ find: null });
      focusEditor();
    } else if (history.get().viewing) backToCurrent();
    else if (s.focus) app.set({ focus: false });
  }
}

function useTheme(): void {
  const theme = app.use((s) => s.settings?.theme ?? "system");
  useEffect(() => {
    const root = document.documentElement;
    if (theme === "system") root.removeAttribute("data-scheme");
    else root.setAttribute("data-scheme", theme);
  }, [theme]);
}

export function App() {
  const phase = app.use((s) => s.phase);
  const focus = app.use((s) => s.focus);
  const fullscreen = app.use((s) => s.fullscreen);
  const compact = app.use((s) => !!s.settings?.compact);
  const panel = app.use(shownPanel);
  const narrow = app.use((s) => s.narrow);
  const hasDoc = app.use((s) => !!s.current);
  const historyOpen = app.use((s) => s.history);
  const reviewOpen = app.use((s) => s.review);
  useTheme();

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 999.98px)");
    const sync = () => app.set({ narrow: mq.matches, peek: false });
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    start().catch((e) => {
      console.error(e);
      toast(`P-Doc couldn't start: ${ipcMessage(e)}`, { tone: "error" });
    });
    const offClosing = window.pdoc.app.onClosing(handleClosing);
    const offFull = window.pdoc.app.onFullScreen((on) => app.set({ fullscreen: on }));
    // A version made by the cadence shows up in an open history at once.
    const offVersions = window.pdoc.versions.onChanged((ref) => {
      if (app.get().history && sameRef(app.get().current, ref)) void loadHistory();
      if (app.get().settings?.github?.connected) void loadSync();
    });
    const offSync = window.pdoc.sync.onChanged((e) => void applySync(e));
    window.addEventListener("keydown", onKeyCapture, true);
    window.addEventListener("keydown", onKey);
    return () => {
      offClosing();
      offFull();
      offVersions();
      offSync();
      window.removeEventListener("keydown", onKeyCapture, true);
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  if (phase === "loading") return <div className="app loading" aria-busy="true" />;
  if (phase === "firstRun")
    return (
      <div className="app first">
        <TitleBar />
        <FirstRun />
        <Toasts />
      </div>
    );

  const chrome = !focus;
  return (
    <div className={`app${focus ? " focus" : ""}${compact ? " compact" : ""}${fullscreen ? " fullscreen" : ""}`} data-testid="app">
      {chrome && !fullscreen ? <TitleBar /> : null}
      {chrome && !compact ? <MenuBar /> : null}
      {chrome ? <Toolbar /> : null}
      <div className={`workspace${narrow ? " narrow" : ""}`}>
        {chrome && panel ? <LeftPanel /> : null}
        {hasDoc ? <PageArea /> : <main className="canvas" data-region aria-label="Page" />}
        {chrome && hasDoc && historyOpen ? <HistoryPanel /> : null}
        {chrome && hasDoc && reviewOpen && !historyOpen ? <ReviewPanel /> : null}
      </div>
      {chrome ? <StatusBar /> : null}
      {focus ? (
        <button type="button" className="btn subtle focus-exit" onClick={() => app.set({ focus: false })}>
          Exit focus view (Esc)
        </button>
      ) : null}
      <CommandSearch />
      <Dialogs />
      <Toasts />
    </div>
  );
}
