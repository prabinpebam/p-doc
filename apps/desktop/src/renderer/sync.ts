/** GitHub sync in the window (spec §4.7): the status bar's words, Sync now, and what a sync changed. */
import type { SyncEvent, SyncState, SyncStatus } from "../shared/api.ts";
import { sameRef } from "../shared/api.ts";
import { dirty, flush, ipcMessage, lockDoc, refreshList, reloadDoc } from "./session.ts";
import { app, openDialog, toast } from "./state.ts";

/** The status bar's words for a sync state (spec §4.7 step 4). */
export function syncLabel(s: SyncState | undefined): string {
  if (!s || s.kind === "off") return "Not connected to GitHub";
  if (s.kind === "syncing") return "Syncing…";
  if (s.kind === "synced") return "Synced";
  if (s.kind === "offline") return s.waiting ? `Offline · ${s.waiting} ${s.waiting === 1 ? "version" : "versions"} waiting` : "Offline";
  return "Sync problem";
}

export const connected = () => !!app.get().settings?.github?.connected;

export async function syncNow(): Promise<void> {
  if (!connected()) {
    openDialog({ kind: "settings" });
    return;
  }
  try {
    await flush();
    app.set({ sync: await window.pdoc.sync.now() });
  } catch (e) {
    toast(`Couldn't sync: ${ipcMessage(e)}`, { tone: "error" });
  }
}

export async function loadSync(): Promise<void> {
  app.set({ sync: await window.pdoc.sync.status() });
}

/** A sync finished or moved on: show its state, and bring in what it changed. */
export async function applySync(e: SyncEvent): Promise<void> {
  app.set({ sync: e.status });
  if (!e.changed.length && !e.kept.length) return;
  await refreshList();
  const cur = app.get().current;
  if (cur && e.changed.some((r) => sameRef(r, cur))) {
    if (dirty()) toast(`${cur.title} also changed on GitHub. Your edits stay; the other text is in Version history.`);
    else {
      try {
        reloadDoc(await window.pdoc.library.open(cur));
      } catch (err) {
        // Moved or binned on the other computer, or unreadable here: the page stops taking typing
        // rather than save old text over the new. The list shows where the document is now.
        lockDoc(`${cur.title} changed on another computer and can't be shown here. Open it again from the library.`);
        console.error(err);
      }
    }
  }
  for (const k of e.kept) toast(`Two versions of ${k.title} were edited apart. Both are kept.`);
}

/** Whether a document has versions GitHub doesn't have yet. */
export const unsynced = (s: SyncStatus | null, ref: { space: string; path: string }) => !!s?.pending.some((p) => p.space === ref.space && p.path === ref.path);
