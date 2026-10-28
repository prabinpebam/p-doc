# P-Doc: work plan

How this work is carried out: the mode, the bounds, the increments and their evidence. What's worth building and what proves it comes from the [spec](../product/spec.md) and the [Definitions of Done](../product/definition-of-done.md); this plan cites them.

> **TL;DR.**
> - **Intent:** [spec](../product/spec.md) P1–P6, U1–U80; [Definitions of Done](../product/definition-of-done.md) PD1–PD9 and stages 1–17; [parity audit](../product/parity.md) (U39–U80).
> - **Mode:** make this production-ready · keep going unattended
> - **Status:** see §6.

## 1. Intent

The spec and its Definitions of Done. Assumptions are tracked there (A1–A17). The parity audit (2026-10-28) added stages 7–16 between Import and export and Install, at the owner's request: "add all features that make sense, even the power-user ones".

## 2. Mode and bounds

| | |
|---|---|
| Goal mode | Make this production-ready: every stage built with tests as its evidence, packaged |
| Attention | Keep going unattended |
| Time | Until stages 1–17 are done or blocked on the owner; a handoff at every stage boundary so another session can resume |
| Scope | Stages 1–17 in order (§3). The cut line is the parity audit: Add rows are in; Later and Skip rows are out unless the owner moves them |
| Never touch | The owner's real GitHub account and repositories, real documents (`Documents\P-Doc`), real app settings; third-party documents (research) |
| May merge, push, deploy | Local commits only. No push, no remote creation, no release |
| Escalate when | A credential, a licence choice, deleting the owner's files, anything public |
| Review interval | About every 30 minutes of running work and at each stage boundary (`throughput-reviewer`); a verdict line in the progress log |

## 3. Increments

| # | Produces | Serves | Checks (tier) | State |
|---|---|---|---|---|
| I0 | Research KBs, spec, DoD, this plan, docs site | spec, DoD | `res.mjs check-kb`; Slate runtime check | Done |
| I1 | Monorepo scaffold, tokens, app shell; stage 1 Write offline | 1.1–1.11 | vitest; typecheck; Playwright-Electron e2e | Done |
| I2 | Stage 2 Pages and print | 2.1–2.6 | vitest; e2e; `pnpm perf` | Done |
| I3 | Stage 3 Versions | 3.1–3.6 | vitest with temp repos; e2e; `pnpm perf` | Done |
| I4 | Stage 4 Review | 4.1–4.6 | vitest; e2e; `pnpm perf` | Done |
| I5 | Stage 5 GitHub and first run | 5.1–5.6 | vitest with fake API and bare repos; e2e | Done |
| I6 | Stage 6 Import and export, CLI | 6.1–6.5 | vitest; e2e; `pnpm perf` | Done |
| IA | Parity audit: parity table, U39–U80, flows, A8–A17, O12–O19, DoD stages 7–16, this plan | spec, DoD | Slate runtime check; `grounding-critic` | Done |
| IP | Packaging check (early, before the parity stages) | 17.1 risk | `pnpm --filter @p-doc/desktop package:dir` then `package:smoke` | Done |
| I7 | Stage 7 Images beside the document | 7.1–7.7 | integrity unit test first (temp repos, fake GitHub); vitest; e2e; `pnpm perf`; `a6-measure` | Not started |
| I8 | Stage 8 Styles and lists | 8.1–8.6 | vitest; e2e | Not started |
| I9 | Stage 9 Paragraph layout | 9.1–9.7 | A10 spike first; vitest; e2e; `pnpm perf` | Not started |
| I10 | Stage 10 References | 10.1–10.5 | A8 spike first; vitest; e2e; `pnpm perf` | Not started |
| I11 | Stage 11 Sections and page layout | 11.1–11.7 | A12 and A13 spikes first; vitest; e2e; `pnpm perf` | Not started |
| I12 | Stage 12 Tables, code and equations | 12.1–12.5 | vitest; e2e; licence check for new dependencies | Not started |
| I13 | Stage 13 Review power | 13.1–13.6 | vitest; e2e; `pnpm perf` | Not started |
| I14 | Stage 14 Citations, index and fields | 14.1–14.3 | vitest; e2e | Not started |
| I15 | Stage 15 Navigation and windows | 15.1–15.5 | vitest; e2e | Not started |
| I16 | Stage 16 Library, files and proofing | 16.1–16.6 | vitest; e2e | Not started |
| I17 | Stage 17 Install | 17.1–17.3 | `pnpm package`; packaged smoke e2e | Not started |
| IZ | Against the promise (DoD §4), PD9, final `pnpm perf` | PD1–PD9 | review; `pnpm perf` | Not started |

**Try it:** each stage's "Try it" in the Definitions of Done.

**How each parity stage runs** (from the stage 6 review): the risky part first (an integrity test for stage 7; a pagination spike for 9–12, taking the register's fallback if it fails, and logging it), then the build, one e2e journey per stage plus unit tests, the DoD rows filled, the spec's "As built", a commit, and a handoff. A stage that grows past its user-can statements is cut to them and the rest queued as Later in the parity audit.

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

- **Shortcuts:** none yet. Stage 6 ran the CLI from source (`pnpm pdoc`); the installed `pdoc` is part of Install (17.3) because the packaged app's run-as-node fuse is off. `pnpm perf` (PD8 budgets) runs from stage 2; the version waits joined in stage 3; the sync and .docx waits join in stages 5 and 6.
- **Found on the way:** RES `check-kb.mjs` builds file keys with `path.relative`, so on Windows no file-based ID is found — worked around (W6), queued upstream.

## 6. Status

| Increment | State | Evidence |
|---|---|---|
| I0 | Done | `node research/rig/res.mjs check-kb research/re-google-docs` OK; same for `re-microsoft-word`; REPORT.html built |
| I1 | Done 2026-10-28 | 12 e2e journeys (`apps/desktop/e2e`) pass with `--repeat-each=2`; 73 unit tests (`pnpm test`); `pnpm typecheck`; `pnpm lint:design` clean. DoD 1.1–1.11 Pass |
| I2 | Done 2026-10-28 | 17 e2e journeys pass with `--repeat-each=2` (stage-2 journeys also 5 of 5); 75 unit tests; `pnpm typecheck`; `pnpm lint:design` clean; `pnpm perf` within every budget. DoD 2.1–2.6, PD3, PD4 Pass; A1 Confirmed |
| I3 | Done 2026-10-28 | 20 e2e journeys pass with `--repeat-each=2` (`versions` also 3 of 3); 93 unit tests; `pnpm typecheck`; `pnpm lint:design` clean; `pnpm perf` within every budget, including version commit (p95 0.44 s) and a 500-version history (p95 0.2 s). DoD 3.1–3.6 and PD1 Pass; screenshots of the comparison at 1280 and 800 px reviewed |
| I4 | Done 2026-10-28 | 24 e2e journeys pass (`review`, `comments`, `layout` also 2 of 2; `toc` 5 of 5 after hardening its caret clicks); 99 unit tests; `pnpm typecheck`; `pnpm lint:design` clean; `pnpm perf` within every budget, including the review list on 50 pages (p95 0.2 ms). DoD 4.1–4.6 and PD5 Pass; review panel and Original markup screenshots reviewed |
| I5 | Done 2026-10-28 | 27 e2e journeys pass (`github` and `first-run` also 2 of 2); 118 unit tests (`github`: 19 against a fake GitHub with smart-HTTP bare repositories and a fake credential helper); `pnpm typecheck`; `pnpm lint:design` clean; `pnpm perf` within every budget, including typing during a sync (p95 0.8 ms). DoD 5.1–5.6 and PD6 Pass; 5.7 needs the owner. Screens in `docs/product/screens` reviewed. Found and fixed on review: "Saved · synced" was missing from the title bar; Welcome focused Use offline; Settings said "Finish connecting" after Sign out; an open File menu kept Sync now disabled; a status answer could undo a sync's final event |
| I6 | Done 2026-10-28 | 28 e2e journeys pass (`import-export` new: Download in every format, Open from file of the downloaded .docx, a dropped .md, a refused .zip, then the built `pdoc list --json`); 126 unit tests (`cli`: 8); `pnpm typecheck`; `pnpm perf` within every budget, including a 50-page .docx export (p95 34 ms). DoD 6.1–6.5 Pass. A6 measured and disproved (54 MB file, 454 MB of Git objects after 11 versions at the 2 MB cap): images move beside the document. Found and fixed: "Importing…" and "Making PDF…" stayed beside their result; the CLI couldn't have found the library when Documents is redirected (the app now records it) |
| IA | Done 2026-10-28 | `docs/product/parity.md`: 146 capabilities from the GD and W knowledge bases (42 Have, 81 Add, 8 Later, 15 Skip; counted by script). Spec J13–J18, U39–U80, flows §4.9–§4.18, V11–V18, A8–A20, O12–O19; DoD stages 7–17. `grounding-critic` review: 12 findings, all folded in (the newer-format read-only rule A18, O2 reopened with A19 and A20, repository-relative image paths, the folder-to-Public confirmation, testable rows 15.3, 15.5, 16.1, 16.4, 16.5) |
| IP | Done 2026-10-28 | `package:dir` builds `release/win-unpacked` (asar 41.8 MB: the built `out/` only, no node_modules; main and preload import only Node built-ins and Electron). `package:smoke` launches it with its own folders: window loaded 1.4 s after launch, no renderer errors, Git 2.56 found. Playwright can't attach to a packaged build (the inspect fuse is off, as intended), so the smoke reads the app's log; main now logs window loaded, load failures, renderer errors and a gone renderer. For stage 17: no app icon yet, source maps ship in the asar, signtool runs with no certificate |

**Not checked:** live Word UI and signed-in Google Docs surfaces (no test accounts).
