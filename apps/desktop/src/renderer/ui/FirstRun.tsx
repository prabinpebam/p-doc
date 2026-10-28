/** First run (spec §4.1, V9): Welcome, then connect GitHub step by step, or keep everything on this computer. */
import { useState } from "react";
import { DocumentText24Regular } from "@fluentui/react-icons";
import { ipcMessage, newDoc, refreshList } from "../session.ts";
import { app, updateSettings } from "../state.ts";
import { GitHubSetup, StepDots, type SetupStep } from "./GitHubSetup.tsx";

export function FirstRun() {
  const saved = app.use((s) => s.settings?.firstRunStep ?? "welcome");
  // Quitting half-way resumes at the step that stopped.
  const [step, setStep] = useState<SetupStep | null>(saved === "welcome" || saved === "done" ? null : saved);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const finish = async (offline: boolean) => {
    setBusy(true);
    setError(null);
    try {
      const info = offline ? await window.pdoc.library.setupOffline() : await window.pdoc.library.info();
      await updateSettings(offline ? { firstRun: "done" } : { firstRun: "done", firstRunStep: "done" });
      app.set({ info, phase: "ready" });
      if (!offline) app.set({ sync: await window.pdoc.sync.status() });
      await refreshList();
      await newDoc({ title: "Untitled document" });
    } catch (e) {
      setError(`Couldn't set up the library: ${ipcMessage(e)}`);
      setBusy(false);
    }
  };

  const connect = () => {
    setStep("git");
    void updateSettings({ firstRunStep: "git" });
  };

  return (
    <main className="first-run">
      <section className="welcome" aria-labelledby={step ? undefined : "welcome-title"} aria-label={step ? "Connect GitHub" : undefined}>
        {step ? (
          <GitHubSetup
            start={step}
            remember
            onBack={() => {
              setStep(null);
              void updateSettings({ firstRunStep: "welcome" });
            }}
            onOffline={() => void finish(true)}
            onDone={() => void finish(false)}
            doneLabel={busy ? "Opening…" : "Start writing"}
          />
        ) : (
          <>
            <StepDots at="welcome" />
            <span className="welcome-mark" aria-hidden>
              <DocumentText24Regular />
            </span>
            <h1 id="welcome-title">Welcome to P-Doc</h1>
            <p className="lede">Write documents you own. Every version kept, online or not.</p>
            <div className="welcome-actions">
              <button type="button" className="btn primary large" disabled={busy} autoFocus onClick={connect}>
                Connect GitHub
              </button>
              <button type="button" className="btn large" disabled={busy} onClick={() => void finish(true)}>
                {busy ? "Setting up…" : "Use offline"}
              </button>
            </div>
            <p className="muted small">Documents live in a private and a public folder on this computer. Each keeps its own history.</p>
          </>
        )}
        {error ? (
          <p className="form-error" role="alert">
            {error}
          </p>
        ) : null}
      </section>
    </main>
  );
}
