/** GitHub in Settings (spec V10), the Connect GitHub dialog, and the details behind "Sync problem". */
import { useState } from "react";
import { closeDialog, app, openDialog, updateSettings } from "../../state.ts";
import { ipcMessage } from "../../session.ts";
import { loadSync, syncLabel, syncNow } from "../../sync.ts";
import { Dialog } from "../components/Dialog.tsx";
import { GitHubSetup, type SetupStep } from "./GitHubSetup.tsx";

export function GitHubSection() {
  const link = app.use((s) => s.settings?.github ?? null);
  // A setup left part-way (offline, or closed) rather than signed out of.
  const unfinished = app.use((s) => !!s.settings?.github && s.settings.firstRunStep !== "done");
  const sync = app.use((s) => s.sync);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const signOut = async () => {
    setBusy(true);
    setError(null);
    try {
      await window.pdoc.github.signOut();
      app.set({ settings: await window.pdoc.settings.get() });
      await loadSync();
    } catch (e) {
      setError(ipcMessage(e));
    } finally {
      setBusy(false);
    }
  };

  if (!link?.connected)
    return (
      <>
        <p className="muted">{unfinished ? "Setup isn't finished. Your documents are saved on this computer." : "Not connected. Your documents are saved on this computer."}</p>
        <button type="button" className="btn primary" onClick={() => openDialog({ kind: "connect" })}>
          {unfinished ? "Finish connecting" : "Connect GitHub"}
        </button>
      </>
    );

  return (
    <>
      <p data-testid="github-account">Signed in as @{link.login}</p>
      <ul className="repo-list">
        <li>
          <span className="space-badge">Private</span> {link.login}/{link.names.private}
        </li>
        <li>
          <span className="space-badge public">Public</span> {link.login}/{link.names.public}
        </li>
      </ul>
      <label className="check">
        <input type="checkbox" checked={link.auto} onChange={(e) => void updateSettings({ github: { ...link, auto: e.target.checked } })} />
        Sync automatically (after each version and every 5 minutes)
      </label>
      <p className="muted" role="status">
        {syncLabel(sync?.state)}
        {sync?.state.kind === "problem" ? `: ${sync.state.reason}` : ""}
      </p>
      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
      <div className="step-actions start">
        <button type="button" className="btn" disabled={busy || sync?.state.kind === "syncing"} onClick={() => void syncNow()}>
          Sync now
        </button>
        <button type="button" className="btn" disabled={busy} onClick={() => void signOut()}>
          Sign out
        </button>
      </div>
      <p className="muted small">Signing out stops syncing. Documents stay on this computer and on GitHub.</p>
    </>
  );
}

export function ConnectDialog() {
  const saved = app.use((s) => s.settings?.firstRunStep);
  const linked = app.use((s) => !!s.settings?.github);
  // An unfinished setup picks up at Repositories; a fresh one starts with Git.
  const [start] = useState<SetupStep>(linked && (saved === "repos" || saved === "identity") ? saved : "git");
  return (
    <Dialog title="Connect GitHub" wide className="connect-dialog" onClose={closeDialog}>
      <GitHubSetup start={start} onOffline={closeDialog} onDone={() => openDialog({ kind: "settings" })} doneLabel="Done" />
    </Dialog>
  );
}

export function SyncProblemDialog() {
  const sync = app.use((s) => s.sync);
  const state = sync?.state;
  const problem = state?.kind === "problem" ? state : null;
  return (
    <Dialog
      title="Sync problem"
      onClose={closeDialog}
      actions={
        <>
          <button type="button" className="btn" onClick={closeDialog}>
            Close
          </button>
          {problem?.signIn ? (
            <button type="button" className="btn" onClick={() => openDialog({ kind: "connect" })}>
              Sign in again
            </button>
          ) : null}
          <button type="button" className="btn primary" data-autofocus onClick={() => void syncNow()}>
            Sync now
          </button>
        </>
      }
    >
      <p>{problem ? problem.reason : syncLabel(state)}</p>
      {sync?.pending.length ? <p className="muted">{sync.pending.length === 1 ? "1 document has" : `${sync.pending.length} documents have`} versions GitHub doesn't have yet. They're safe on this computer.</p> : null}
    </Dialog>
  );
}
