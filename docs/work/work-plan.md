# P-Doc: work plan

How this work is carried out: the mode, the bounds, the increments and their evidence. What's worth building and what proves it comes from the [spec](../product/spec.md) and the [Definitions of Done](../product/definition-of-done.md); this plan cites them.

> **TL;DR.**
> - **Intent:** [spec](../product/spec.md) P1–P6, U1–U38; [Definitions of Done](../product/definition-of-done.md) PD1–PD9 and stages 1–7.
> - **Mode:** make this production-ready · keep going unattended
> - **Status:** see §6.

## 1. Intent

The spec and its Definitions of Done. Assumptions are tracked there (A1–A7).

## 2. Mode and bounds

| | |
|---|---|
| Goal mode | Make this production-ready: every stage built with tests as its evidence, packaged |
| Attention | Keep going unattended |
| Time | Until stages 1–7 are done or blocked on the owner |
| Scope | Stages 1–7 in order (§3) |
| Never touch | The owner's real GitHub account and repositories, real documents (`Documents\P-Doc`), real app settings; third-party documents (research) |
| May merge, push, deploy | Local commits only. No push, no remote creation, no release |
| Escalate when | A credential, a licence choice, deleting the owner's files, anything public |
| Review interval | Each stage boundary |

## 3. Increments

| # | Produces | Serves | Checks (tier) | State |
|---|---|---|---|---|
| I0 | Research KBs, spec, DoD, this plan, docs site | spec, DoD | `res.mjs check-kb`; Slate runtime check | Done |
| I1 | Monorepo scaffold, tokens, app shell; stage 1 Write offline | 1.1–1.11 | vitest; typecheck; Playwright-Electron e2e | Done |
| I2 | Stage 2 Pages and print | 2.1–2.6 | vitest; e2e | In progress |
| I3 | Stage 3 Versions | 3.1–3.6 | vitest with temp repos; e2e | Not started |
| I4 | Stage 4 Review | 4.1–4.6 | vitest; e2e | Not started |
| I5 | Stage 5 GitHub and first run | 5.1–5.6 | vitest with fake API and bare repos; e2e | Not started |
| I6 | Stage 6 Import and export, CLI | 6.1–6.5 | vitest | Not started |
| I7 | Stage 7 Install | 7.1–7.2 | `pnpm package`; packaged smoke e2e | Not started |

**Try it:** each stage's "Try it" in the Definitions of Done.

## 4. Decisions taken as working defaults

| # | Question | Chosen | Why | Owner to confirm? |
|---|---|---|---|---|
| W1 | Stagehand model | None: deterministic page API only | No model key; reproducible captures | No |
| W2 | Stagehand browser | Connect to a Chrome the rig launches (CDP) | `localBrowser.launch` hangs on this machine | No |
| W3 | Page scripts | Raw CDP `Runtime.evaluate` | Stagehand's evaluate is too slow on Docs | No |
| W4 | Third-party documents | Never type or click in them; read menus from the DOM | Spec A5; synthetic clicks hang the page | No |
| W5 | Word research | Documentation only | No test Microsoft account | Yes: provide a test account for live capture |
| W6 | RES scripts on Windows | Run through `research/rig/res.mjs` (path fix) | Upstream keys use `/` | No (worth an upstream fix) |
| W7 | Test isolation | Fake GitHub API server, `file://` bare repos, temp library and user-data dirs via `PDOC_LIBRARY` / `PDOC_USER_DATA` | Never touch the owner's GitHub or files | No |
| W8 | Electron version | 42.4.1 (cached; same as Focus Notes) | Avoids a download; known-good with electron-builder 26.15.3 | No |

## 5. Shortcuts and found on the way

- **Shortcuts:** none yet. `pnpm perf` (PD8 budgets) is deferred to stage 2, where pagination makes the budgets meaningful.
- **Found on the way:** RES `check-kb.mjs` builds file keys with `path.relative`, so on Windows no file-based ID is found — worked around (W6), queued upstream.

## 6. Status

| Increment | State | Evidence |
|---|---|---|
| I0 | Done | `node research/rig/res.mjs check-kb research/re-google-docs` OK; same for `re-microsoft-word`; REPORT.html built |
| I1 | Done 2026-10-28 | 12 e2e journeys (`apps/desktop/e2e`) pass with `--repeat-each=2`; 73 unit tests (`pnpm test`); `pnpm typecheck`; `pnpm lint:design` clean. DoD 1.1–1.11 Pass |

**Not checked:** live Word UI and signed-in Google Docs surfaces (no test accounts).
