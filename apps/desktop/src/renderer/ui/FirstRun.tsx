/** First run (spec §4.1): connect GitHub or keep everything on this computer. */
import { useState } from "react";
import { DocumentText24Regular } from "@fluentui/react-icons";
import { ipcMessage, newDoc, refreshList } from "../session.ts";
import { app, updateSettings } from "../state.ts";

export function FirstRun() {
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const offline = async () => {
    setBusy(true);
    setError(null);
    try {
      const info = await window.pdoc.library.setupOffline();
      await updateSettings({ firstRun: "done" });
      app.set({ info, phase: "ready" });
      await refreshList();
      await newDoc({ title: "Untitled document" });
    } catch (e) {
      setError(`Couldn't set up the library: ${ipcMessage(e)}`);
      setBusy(false);
    }
  };

  return (
    <main className="first-run">
      <section className="welcome" aria-labelledby="welcome-title">
        <span className="welcome-mark" aria-hidden>
          <DocumentText24Regular />
        </span>
        <h1 id="welcome-title">Welcome to P-Doc</h1>
        <p className="lede">Write documents you own. Every version kept, online or not.</p>
        <div className="welcome-actions">
          <button type="button" className="btn primary large" disabled={busy} onClick={() => setNote("Connecting to GitHub isn't in this build yet. Use offline now; you can connect later in Settings.")}>
            Connect GitHub
          </button>
          <button type="button" className="btn large" disabled={busy} autoFocus onClick={() => void offline()}>
            {busy ? "Setting up…" : "Use offline"}
          </button>
        </div>
        {note ? (
          <p className="note" role="status">
            {note}
          </p>
        ) : null}
        {error ? (
          <p className="form-error" role="alert">
            {error}
          </p>
        ) : null}
        <p className="muted small">Documents live in a private and a public folder on this computer. Each keeps its own history.</p>
      </section>
    </main>
  );
}
