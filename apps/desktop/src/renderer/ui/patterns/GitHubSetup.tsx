/**
 * Connecting GitHub (spec §4.1 steps 3–7): Git, Sign in, Identity, Repositories, Done. First run shows it
 * after Welcome; Settings opens it in a dialog. Each step can be left and resumed: the step reached is saved.
 */
import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { Checkmark16Regular } from "@fluentui/react-icons";
import { ipcMessage } from "../../session.ts";
import { app, updateSettings } from "../../state.ts";
import { DEFAULT_REPOS, isRepoName, planProblem, type FirstRunStep, type GitCheck, type GitHubAccount, type RepoPlan, type SetupProgress, type Space } from "../../../shared/api.ts";

export type SetupStep = Exclude<FirstRunStep, "welcome">;

const DOTS: { id: FirstRunStep; label: string }[] = [
  { id: "welcome", label: "Welcome" },
  { id: "git", label: "Git" },
  { id: "signIn", label: "Sign in" },
  { id: "identity", label: "Identity" },
  { id: "repos", label: "Repositories" },
  { id: "done", label: "Done" },
];

const TOKEN_URL = "https://github.com/settings/tokens/new?scopes=repo&description=P-Doc";

/** The six steps as dots (spec V9); the current one is marked for assistive tech too. */
export function StepDots({ at }: { at: FirstRunStep }) {
  const i = DOTS.findIndex((d) => d.id === at);
  return (
    <ol className="step-dots" aria-label="Setup steps">
      {DOTS.map((d, n) => (
        <li key={d.id} className={n < i ? "past" : n === i ? "now" : ""} aria-current={n === i ? "step" : undefined} title={d.label}>
          <span className="visually-hidden">
            {d.label}
            {n < i ? " (done)" : ""}
          </span>
        </li>
      ))}
    </ol>
  );
}

const onEnter = (run: () => void) => (e: KeyboardEvent) => {
  if (e.key !== "Enter") return;
  e.preventDefault();
  run();
};

interface Props {
  start: SetupStep;
  /** Back from the Git step (first run returns to Welcome). */
  onBack?: () => void;
  /** Leave and keep working on this computer. */
  onOffline: () => void;
  /** After Done. */
  onDone: () => void;
  doneLabel: string;
  /** Save the step reached, so the next start resumes there (first run). */
  remember?: boolean;
}

export function GitHubSetup({ start, onBack, onOffline, onDone, doneLabel, remember }: Props) {
  const [step, setStepState] = useState<SetupStep>(start);
  const [check, setCheck] = useState<GitCheck | null>(null);
  const [account, setAccount] = useState<GitHubAccount | null>(null);
  const setStep = (s: SetupStep) => {
    setStepState(s);
    if (remember) void updateSettings({ firstRunStep: s });
  };
  let body: ReactNode;
  if (step === "git") body = <GitStep check={check} setCheck={setCheck} onBack={onBack} onNext={() => setStep("signIn")} />;
  else if (step === "signIn")
    body = <SignInStep check={check} setCheck={setCheck} account={account} setAccount={setAccount} onBack={() => setStep("git")} onNext={() => setStep("identity")} />;
  else if (step === "identity") body = <IdentityStep account={account} setAccount={setAccount} onBack={() => setStep("signIn")} onNext={() => setStep("repos")} />;
  else if (step === "repos") body = <ReposStep onBack={() => setStep("identity")} onOffline={onOffline} onNext={() => setStep("done")} />;
  else
    body = (
      <>
        <h1 className="step-title">You're set</h1>
        <p className="lede">You're set. Documents sync to GitHub when you're online.</p>
        <div className="step-actions">
          <button type="button" className="btn primary large" data-autofocus autoFocus onClick={onDone}>
            {doneLabel}
          </button>
        </div>
      </>
    );
  return (
    <div className="github-setup" data-step={step}>
      <StepDots at={step} />
      {body}
    </div>
  );
}

function GitStep({ check, setCheck, onBack, onNext }: { check: GitCheck | null; setCheck: (c: GitCheck) => void; onBack?: () => void; onNext: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const first = useRef(true);
  const run = async (auto: boolean) => {
    setBusy(true);
    setError(null);
    try {
      const c = await window.pdoc.github.gitCheck();
      setCheck(c);
      // Git that works needs no stop on the way in; coming back to this step shows it.
      if (c.ok && auto) onNext();
    } catch (e) {
      setError(ipcMessage(e));
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    void run(first.current && !check);
    first.current = false;
  }, []);
  return (
    <>
      <h1 className="step-title">Git</h1>
      {!check ? (
        <p className="muted" role="status">
          Checking Git…
        </p>
      ) : check.ok ? (
        <p role="status">Git {check.version} is ready to keep versions.</p>
      ) : check.version ? (
        <p role="alert">P-Doc needs Git 2.40 or later to keep versions. This computer has Git {check.version}.</p>
      ) : (
        <p role="alert">P-Doc needs Git to keep versions.</p>
      )}
      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
      <div className="step-actions">
        {onBack ? (
          <button type="button" className="btn" onClick={onBack}>
            Back
          </button>
        ) : null}
        {check && !check.ok ? (
          <>
            <button type="button" className="btn" onClick={() => void window.pdoc.app.openExternal("https://git-scm.com/downloads")}>
              Get Git
            </button>
            <button type="button" className="btn primary" disabled={busy} onClick={() => void run(true)}>
              {busy ? "Checking…" : "Check again"}
            </button>
          </>
        ) : (
          <button type="button" className="btn primary" disabled={!check?.ok} onClick={onNext}>
            Continue
          </button>
        )}
      </div>
    </>
  );
}

type SignInView = { kind: "checking" } | { kind: "choose"; note?: string } | { kind: "browser"; message: string; code?: string } | { kind: "token" } | { kind: "signedIn"; warning?: string };

function SignInStep(p: {
  check: GitCheck | null;
  setCheck: (c: GitCheck) => void;
  account: GitHubAccount | null;
  setAccount: (a: GitHubAccount | null) => void;
  onBack: () => void;
  onNext: () => void;
}) {
  const [view, setView] = useState<SignInView>(p.account ? { kind: "signedIn" } : { kind: "checking" });
  const [token, setToken] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const look = async () => {
    setView({ kind: "checking" });
    setError(null);
    try {
      if (!p.check) p.setCheck(await window.pdoc.github.gitCheck());
      const s = await window.pdoc.github.status();
      if (s.state === "signedIn") {
        p.setAccount(s.account);
        setView({ kind: "signedIn" });
      } else if (s.state === "offline") setView({ kind: "choose", note: "GitHub can't be reached. Check your connection and try again." });
      else if (s.state === "invalid") setView({ kind: "choose", note: "Your GitHub sign-in no longer works. Sign in again." });
      else setView({ kind: "choose" });
    } catch (e) {
      setView({ kind: "choose" });
      setError(ipcMessage(e));
    }
  };
  useEffect(() => {
    if (!p.account) void look();
  }, []);

  const browser = async () => {
    setError(null);
    setView({ kind: "browser", message: "Waiting for GitHub in your browser…" });
    const off = window.pdoc.github.onSignInProgress((g) => setView({ kind: "browser", message: g.message, code: g.code }));
    try {
      const r = await window.pdoc.github.signInWithBrowser();
      p.setAccount(r.account);
      setView({ kind: "signedIn", warning: r.warning });
    } catch (e) {
      const m = ipcMessage(e);
      setView({ kind: "choose" });
      if (!/cancel/i.test(m)) setError(m);
    } finally {
      off();
    }
  };

  const paste = async () => {
    if (!token.trim()) {
      setError("Paste a token to sign in.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const r = await window.pdoc.github.signInWithToken(token.trim());
      setToken("");
      p.setAccount(r.account);
      setView({ kind: "signedIn", warning: r.warning });
    } catch (e) {
      setError(ipcMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const another = async () => {
    setError(null);
    try {
      await window.pdoc.github.forget();
    } catch (e) {
      setError(ipcMessage(e));
    }
    p.setAccount(null);
    setView({ kind: "choose" });
  };

  const helper = !p.check || p.check.gcm || p.check.gh;
  return (
    <>
      <h1 className="step-title">Sign in to GitHub</h1>
      {view.kind === "checking" ? (
        <p className="muted" role="status">
          Checking for a GitHub sign-in…
        </p>
      ) : null}
      {view.kind === "signedIn" && p.account ? (
        <>
          <p role="status" data-testid="signed-in">
            Signed in as @{p.account.login}
          </p>
          {view.warning ? <p className="note">{view.warning}</p> : null}
        </>
      ) : null}
      {view.kind === "choose" ? (
        <>
          {view.note ? <p className="note">{view.note}</p> : null}
          <p className="muted">P-Doc keeps your documents in two repositories on your GitHub. Git keeps the sign-in, not P-Doc.</p>
          {!helper ? <p className="note">To sign in with your browser, install Git Credential Manager (it comes with Git for Windows) or the GitHub CLI. Or paste a token.</p> : null}
        </>
      ) : null}
      {view.kind === "browser" ? (
        <div className="sign-in-wait" role="status">
          <p>{view.message}</p>
          {view.code ? (
            <p>
              Enter this code on GitHub: <strong className="device-code">{view.code}</strong>
            </p>
          ) : null}
        </div>
      ) : null}
      {view.kind === "token" ? (
        <div className="token-form">
          <label className="form-row">
            <span>Personal access token (needs the repo scope)</span>
            <input
              className="field"
              type="password"
              autoComplete="off"
              spellCheck={false}
              data-autofocus
              autoFocus
              value={token}
              aria-invalid={error ? true : undefined}
              onChange={(e) => setToken(e.target.value)}
              onKeyDown={onEnter(() => void paste())}
            />
          </label>
          <button type="button" className="btn subtle small link-btn" onClick={() => void window.pdoc.app.openExternal(TOKEN_URL)}>
            Create a token on GitHub
          </button>
        </div>
      ) : null}
      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
      <div className="step-actions">
        {view.kind === "browser" ? (
          <button type="button" className="btn" onClick={() => window.pdoc.github.cancelSignIn()}>
            Cancel
          </button>
        ) : view.kind === "token" ? (
          <>
            <button type="button" className="btn" disabled={busy} onClick={() => (setError(null), setView({ kind: "choose" }))}>
              Back
            </button>
            <button type="button" className="btn primary" disabled={busy} onClick={() => void paste()}>
              {busy ? "Checking…" : "Sign in"}
            </button>
          </>
        ) : view.kind === "signedIn" ? (
          <>
            <button type="button" className="btn" onClick={p.onBack}>
              Back
            </button>
            <button type="button" className="btn" onClick={() => void another()}>
              Use another account
            </button>
            <button type="button" className="btn primary" data-autofocus autoFocus onClick={p.onNext}>
              Continue
            </button>
          </>
        ) : view.kind === "choose" ? (
          <>
            <button type="button" className="btn" onClick={p.onBack}>
              Back
            </button>
            <button type="button" className={`btn${helper ? "" : " primary"}`} onClick={() => (setError(null), setView({ kind: "token" }))}>
              Paste a token
            </button>
            {helper ? (
              <button type="button" className="btn primary" data-autofocus autoFocus onClick={() => void browser()}>
                Sign in with browser
              </button>
            ) : null}
          </>
        ) : null}
      </div>
    </>
  );
}

const EMAIL = /^[^\s@]+@[^\s@]+$/;

function IdentityStep(p: { account: GitHubAccount | null; setAccount: (a: GitHubAccount) => void; onBack: () => void; onNext: () => void }) {
  const saved = app.use((s) => s.settings?.identity);
  // An identity with an email was chosen before; without one, the name is only the computer's user name.
  const chosen = !!saved?.email;
  const [name, setName] = useState(chosen ? saved!.name : "");
  const [email, setEmail] = useState(chosen ? saved!.email : "");
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (chosen) return;
    void (async () => {
      let a = p.account;
      if (!a) {
        const s = await window.pdoc.github.status().catch(() => null);
        if (s?.state === "signedIn") p.setAccount((a = s.account));
      }
      const g = await window.pdoc.github.gitIdentity().catch(() => ({ name: "", email: "" }));
      setName((n) => n || g.name || a?.name || a?.login || saved?.name || "");
      setEmail((m) => m || g.email || a?.noreply || "");
    })();
  }, []);
  const next = async () => {
    if (!name.trim()) return setError("Add the name versions show.");
    if (!EMAIL.test(email.trim())) return setError("Add an email address, or use the private GitHub address.");
    await updateSettings({ identity: { name: name.trim(), email: email.trim() } });
    p.onNext();
  };
  const noreply = p.account?.noreply;
  return (
    <>
      <h1 className="step-title">Your name on versions</h1>
      <p className="muted">Each version and suggestion carries this name and email. Anyone who can read a repository sees them.</p>
      <div className="step-form">
        <label className="form-row">
          <span>Name</span>
          <input className="field" data-autofocus autoFocus value={name} onChange={(e) => setName(e.target.value)} onKeyDown={onEnter(() => void next())} />
        </label>
        <label className="form-row">
          <span>Email</span>
          <input className="field" type="email" value={email} onChange={(e) => setEmail(e.target.value)} onKeyDown={onEnter(() => void next())} />
        </label>
        {noreply && email !== noreply ? (
          <button type="button" className="btn subtle small link-btn" onClick={() => setEmail(noreply)}>
            Use my private GitHub address ({noreply})
          </button>
        ) : null}
      </div>
      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
      <div className="step-actions">
        <button type="button" className="btn" onClick={p.onBack}>
          Back
        </button>
        <button type="button" className="btn primary" onClick={() => void next()}>
          Continue
        </button>
      </div>
    </>
  );
}

const STATE_COPY: Record<RepoPlan["state"], string> = {
  create: "Will be created",
  found: "Found, will be used",
  ready: "Ready",
  taken: "Already exists",
  visibility: "Can't be used",
};

const PROGRESS_COPY: Record<SetupProgress["step"], string> = {
  find: "Finding…",
  create: "Creating on GitHub…",
  local: "Setting up on this computer…",
  remote: "Connecting…",
  push: "Sending documents…",
  done: "Done",
};

const SPACE_LABEL: Record<Space, string> = { private: "Private", public: "Public" };

function ReposStep(p: { onBack: () => void; onOffline: () => void; onNext: () => void }) {
  const link = app.use((s) => s.settings?.github);
  const [names, setNames] = useState<Record<Space, string>>(link?.names ?? DEFAULT_REPOS);
  const [plan, setPlan] = useState<RepoPlan[] | null>(null);
  const [useTaken, setUseTaken] = useState<Space[]>([]);
  const [progress, setProgress] = useState<Partial<Record<Space, SetupProgress["step"]>>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputs = { private: useRef<HTMLInputElement>(null), public: useRef<HTMLInputElement>(null) };
  const valid = isRepoName(names.private) && isRepoName(names.public) && names.private !== names.public;

  useEffect(() => {
    setPlan(null);
    if (!valid) return;
    let live = true;
    const t = setTimeout(() => {
      window.pdoc.github
        .plan(names)
        .then((r) => live && (setPlan(r), setError(null)))
        .catch((e) => live && setError(ipcMessage(e)));
    }, 300);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [names.private, names.public]);

  const blocked = plan?.some((r) => r.state === "visibility" || (r.state === "taken" && !useTaken.includes(r.space))) ?? true;
  const offline = !!error && /offline/i.test(error);

  const setUp = async () => {
    setBusy(true);
    setError(null);
    setProgress({});
    const off = window.pdoc.github.onSetupProgress((g) => setProgress((x) => ({ ...x, [g.space]: g.step })));
    try {
      await window.pdoc.github.setup(names, useTaken);
      const settings = await window.pdoc.settings.get();
      app.set({ settings, sync: await window.pdoc.sync.status() });
      p.onNext();
    } catch (e) {
      setError(ipcMessage(e));
    } finally {
      off();
      setBusy(false);
    }
  };

  const rename = (space: Space, v: string) => {
    setUseTaken((u) => u.filter((s) => s !== space));
    setNames((n) => ({ ...n, [space]: v.trim() }));
  };

  return (
    <>
      <h1 className="step-title">Repositories</h1>
      <p className="muted">Your documents live in two repositories on your GitHub.</p>
      <ul className="repo-rows">
        {(["private", "public"] as Space[]).map((space) => {
          const r = plan?.find((x) => x.space === space);
          const problem = r ? planProblem(r) : null;
          const step = progress[space];
          const ok = isRepoName(names[space]);
          return (
            <li key={space} className="repo-row" data-testid={`repo-${space}`}>
              <div className="repo-line">
                <label className="visually-hidden" htmlFor={`repo-${space}`}>
                  {SPACE_LABEL[space]} repository name
                </label>
                <input
                  id={`repo-${space}`}
                  ref={inputs[space]}
                  className="field"
                  value={names[space]}
                  disabled={busy}
                  spellCheck={false}
                  aria-invalid={!ok || problem ? true : undefined}
                  onChange={(e) => rename(space, e.target.value)}
                />
                <span className={`space-badge ${space}`}>{SPACE_LABEL[space]}</span>
                <span className="repo-state" data-testid={`repo-state-${space}`}>
                  {step ? (
                    step === "done" ? (
                      <>
                        <Checkmark16Regular aria-hidden /> Done
                      </>
                    ) : (
                      PROGRESS_COPY[step]
                    )
                  ) : !ok ? (
                    "Letters, numbers, - . _"
                  ) : r ? (
                    r.state === "taken" && useTaken.includes(space) ? "Will be used" : STATE_COPY[r.state]
                  ) : valid ? (
                    "Checking…"
                  ) : (
                    ""
                  )}
                </span>
              </div>
              {problem && !useTaken.includes(space) ? (
                <div className="repo-problem" role="alert">
                  <p className="form-error">{problem}</p>
                  <div className="step-actions start">
                    {r?.state === "taken" ? (
                      <button type="button" className="btn small warning" onClick={() => setUseTaken((u) => [...u, space])}>
                        Use it anyway
                      </button>
                    ) : null}
                    <button
                      type="button"
                      className="btn small"
                      onClick={() => {
                        inputs[space].current?.focus();
                        inputs[space].current?.select();
                      }}
                    >
                      Choose another name
                    </button>
                  </div>
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
      {names.private === names.public && isRepoName(names.private) ? <p className="form-error">The two repositories need different names.</p> : null}
      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
      <div className="step-actions">
        <button type="button" className="btn" disabled={busy} onClick={p.onBack}>
          Back
        </button>
        {offline ? (
          <button type="button" className="btn" onClick={p.onOffline}>
            Use offline
          </button>
        ) : null}
        <button type="button" className="btn primary" disabled={busy || !valid || (blocked && !offline)} onClick={() => void setUp()}>
          {busy ? "Setting up…" : offline ? "Try again" : "Set up"}
        </button>
      </div>
    </>
  );
}
