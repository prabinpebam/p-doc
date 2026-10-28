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
| Scope | Stages 1–17 in the order of §3 (after stage 7: the layout spike, then 9–12, 13, 8, 10b, 14, 15, 16a, 16b). The cut line is the parity audit: Add rows are in; Later and Skip rows are out unless the owner moves them |
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
| I7 | Stage 7 Images beside the document | 7.1–7.7 | integrity unit test first (temp repos, fake GitHub); vitest; e2e; `pnpm perf`; `a6-measure` | Done |
| IL | Layout spike, before the pagination stages, 60 minutes at most: paragraphs split at lines on screen and in the PDF (A10), its repagination cost (A20), per-section paper in print (A12), columns on screen and in print (A13); notes and settling page numbers (A8, A19) decided by design and tested in stage 10. Each failing assumption takes its register fallback, logged | 9.3, 9.7, 10.1, 10.6, 11.1, 11.2, 12.2 | unit `paginate`; e2e `pagination` split fixture; probe PDFs | Done |
| I9 | Stage 9 Paragraph layout | 9.1–9.7 | A10 built in IL; vitest; e2e; `pnpm perf` | Done |
| I10 | Stage 10 References | 10.1, 10.2, 10.4–10.6 | A8 spike first; vitest; e2e; `pnpm perf` | Done |
| I11 | Stage 11 Sections and page layout | 11.1–11.7 | A12 and A13 spikes first; vitest; e2e; `pnpm perf` | Done (11.2 part) |
| I12 | Stage 12 Tables, code and equations | 12.1–12.5 | Order from the stage 11 review: licence check, then 12.4 equations with a unit test on the Word equation XML and a 10-equation .docx for the owner (12.5) first; then 12.2 with an e2e 3-page table fixture first (the same break rows on screen and in the PDF, header row repeated), placing blocks by page and column (column 0 until I11b); then 12.3; then the gaps in 12.1. vitest; e2e | Done (12.1 part; 12.5 owner) |
| I13 | Stage 13 Review power | 13.1–13.6 | 13.1, 13.4 and 13.5 validated. Resume: 13.6 (end-to-end comparison of two at-least-50-page documents, saved and laid out within 1 s; long-table repagination within 16 ms), 13.2, then 13.3 if it fits. Close this session with full unit/e2e, command search and perf; 13.3 goes to Later first if the close slips. Never cut: exact accept and reject, an import that never turns a Word deletion into text or drops a comment, 13.6 measured | In progress |
| I8 | Stage 8 Styles and lists (moved after 13: no layout risk) | 8.1–8.6 | vitest; e2e | Not started |
| I10b | Stage 10, rest: captions, cross-references, table of figures (cut from I10 at its cut line). Placed here because it builds on the same field atoms as 14 and needs the tables and equations of 12 to caption. Also, boxed at 15 minutes, the two 12.1 leftovers (table alignment on the page, text to table and back), since captions already work in the table code | 10.3, 12.1 rest | e2e `references` first; vitest; page references reserve the widest number's digits as 10.6 does, re-checked by unit `paginate` settling | Not started |
| I11b | Stage 11, rest: columns laid out on screen and in the PDF, balanced on a section's last page, Format > Columns… (cut from I11 at its 30-minute review: a column run needs its own placement and measuring in the live editor, beyond the cut line). Placed after I10b because it reuses the line splitting of A10 across columns | 11.2 | e2e `sections` columns fixture first (screen and PDF x positions); unit `paginate` columns; `pnpm perf` | Not started |
| I14 | Stage 14 Citations, index and fields | 14.1–14.3 | vitest; e2e | Not started |
| I15 | Stage 15 Navigation and windows | 15.1–15.5 | vitest; e2e | Not started |
| I16a | Stage 16, first half: library, folders, details, templates | 16.1–16.3 | vitest; e2e | Not started |
| I16b | Stage 16, second half: spelling, accessibility check, EPUB, .odt and .rtf | 16.4–16.6 | vitest; e2e; export validators | Not started |
| I17 | Stage 17 Install | 17.1–17.3 | `pnpm package`; packaged smoke e2e | Not started |
| IZ | Against the promise (DoD §4), PD9, final `pnpm perf` | PD1–PD9 | review; `pnpm perf` | Not started |

**Try it:** each stage's "Try it" in the Definitions of Done.

**How each parity stage runs** (from the stage 6 review): the risky part first (an integrity test for stage 7; a pagination spike for 9–12, taking the register's fallback if it fails, and logging it), then the build, one e2e journey per stage plus unit tests, the DoD rows filled, the spec's "As built", a commit, and a handoff. A stage that grows past its user-can statements is cut to them and the rest queued as Later in the parity audit.

**Cadence (progress review after stage 7):**
- **Checks by tier.** Each change: `pnpm typecheck`, the touched package's unit tests, and the stage's own e2e spec. Each stage: full unit, full e2e and the command-search sweep (8.6's check, run every stage). `pnpm perf` only for stages with a performance row (9, 10, 11, 13) and at IZ.
- **Commits** per group of DoD rows, so no more than about an hour of work is ever uncommitted.
- **A stage runs 90 minutes at most** before a review. If it runs over, these go to Later first: read aloud (15.5), hyphenation and drop caps (11.5), and citation styles beyond APA, MLA and Chicago (14.1).
- **Write-ups** are kept to the DoD rows, the spec's "As built" and the landing row.
- **Scope each row at T0** (from the stage 11 review): five minutes per row to size it against the cut line, so a row too big for the stage is cut before work starts, not halfway through.

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
| IA | Done 2026-10-28 | `docs/product/parity.md`: 146 capabilities from the GD and W knowledge bases (42 Have, 81 Add, 8 Later, 15 Skip; counted by script; 149 after stage 7 added three image rows: 43 Have, 82 Add, 9 Later, 15 Skip). Spec J13–J18, U39–U80, flows §4.9–§4.18, V11–V18, A8–A20, O12–O19; DoD stages 7–17. `grounding-critic` review: 12 findings, all folded in (the newer-format read-only rule A18, O2 reopened with A19 and A20, repository-relative image paths, the folder-to-Public confirmation, testable rows 15.3, 15.5, 16.1, 16.4, 16.5) |
| IP | Done 2026-10-28 | `package:dir` builds `release/win-unpacked` (asar 41.8 MB: the built `out/` only, no node_modules; main and preload import only Node built-ins and Electron). `package:smoke` launches it with its own folders: window loaded 1.4 s after launch, no renderer errors, Git 2.56 found. Playwright can't attach to a packaged build (the inspect fuse is off, as intended), so the smoke reads the app's log; main now logs window loaded, load failures, renderer errors and a gone renderer. For stage 17: no app icon yet, source maps ship in the asar, signtool runs with no certificate |
| I7 | Done 2026-10-29 | 30 e2e journeys pass (`images` new: insert by paste, drop and file; resize, align, wrap, crop, replace, alt text, drag to move; a missing image shows "Image missing" and is left out of a web page; a newer-format file opens read-only, shows the parts it knows and is unchanged after quitting; pagination 7.5 with floats); 143 unit tests (`assets-integrity` against temp repos and a fake GitHub; `image` 11, including `knownContent`); `pnpm typecheck`; `pnpm lint:design` clean; `pnpm perf` within every budget, including opening a 100-page document with 20 large pictures (p95 90 ms, budget 500) and showing a 20 MB picture (p95 143 ms, budget 300). `a6-measure`: the fixture is a 0.7 MB file with 40 MB of pictures beside it; 10 more versions add 0.2 MB. DoD 7.1–7.7 Pass; A9 Validated. Cold start re-recorded at p95 552 ms (stage 6 at HEAD measured the same on this machine). Found and fixed: a missing image showed the broken-image icon; a newer document showed an empty page (unknown parts are now dropped from the read-only view) |
| IL | Done 2026-10-29 | A10 holds: the paginator splits a paragraph at a line start, with widow and orphan control (two lines each side; on an empty page the rule gives way; a paragraph taller than a page splits more than once); line boxes are measured only for a paragraph that crosses a page end. e2e `9.3 A10` (new, 24-paragraph fixture, one of 900 words): every page foot has less than two lines of space, and each PDF page read with pdfjs starts and ends with the same words as on screen; `2.1` and `7.5` updated for sheets that start inside a paragraph. Unit `paginate` 14 (6 new). A20 holds: `pnpm perf` repagination p95 7.7 ms (budget 16), all budgets met. A12 and A13 hold in print (Electron probe: portrait, landscape, portrait pages; two balanced columns). A8 and A19 designed in the register. Found and fixed: line grouping merged neighbouring lines whose glyph boxes overlap, so no paragraph split. Dev dependency `pdfjs-dist` 6.4.299 (Apache-2.0) |
| I10 | Done 2026-10-28 (10.3 moved to I10b) | 40 e2e journeys pass, 3 skipped (`notes` 10.1 and 10.2, `toc` 10.4 new); 192 unit tests (`notes`, `docx` bookmarks and contents links, `toc` levels and bookmark ids, `paginate` settling); `pnpm typecheck`; `pnpm lint:design` clean; `pnpm perf` 11 of 11 within budget (repagination p95 6.6 ms, with 40 notes 11.2 ms, keystroke 1.3 ms, cold start 546 ms). DoD 10.1, 10.2, 10.4, 10.5, 10.6 Pass; 10.3 Deferred to I10b. A8 and A19 hold. Ran about 85 minutes against a 90-minute cap; the throughput review at 22:43 set a 23:30 cut line, and 10.3 did not fit it. Found and fixed: a note's number read as plain superscript, a clipped note printed twice in the PDF, a ruler key race, and dialogs that put the caret at the start on close |
| I11 | Done 2026-10-29 (11.2 in part; the rest in I11b) | 44 e2e journeys pass, 3 skipped (`sections` new: 11.1 sections with their own paper in the PDF, 11.3 odd and even headers and numbering, 11.2 column break, 11.4 watermark on every sheet and PDF page); 204 unit tests (`sections`, `docx` sections and columns, `format` watermark and columns); `pnpm typecheck`; `pnpm lint:design` clean; perf repagination with 13 sections on 57 pages p95 9.1 ms (budget 16). DoD 11.1, 11.3, 11.6, 11.7 Pass; 11.4 Pass for text watermarks (picture and .docx watermark Later); 11.2 Partial (column break, columns in the model and .docx; laying columns out moved to I11b); 11.5 Later by the 90-minute rule. Ran about 46 minutes. Found and fixed: a continuous section break's label overlapped the text after it |
| I12 | Done 2026-10-29 (12.1 in part; 12.5 waits on the owner) | 48 e2e journeys pass, 3 skipped (`equations`, `code`, `tables` new; `pagination` 12.2 long tables); 219 unit tests, 3 skipped (`equations`, `code`, `tables`, `paginate` long tables); `pnpm typecheck`; `pnpm lint:design` clean; `pnpm perf` 12 of 12 within budget (repagination p95 8.6 ms, with 40 notes 14 ms, with sections 7.7 ms). DoD 12.2 (rows), 12.3, 12.4 Pass; 12.1 Partial (table alignment and text to table go to I10b); 12.5 Needs owner. A11 Confirmed for rows; A17 waits on the owner. Ran about 56 minutes against a 90-minute cap. Found and fixed: the code language change merged into the typing's Undo step, the code picker stayed on in Viewing, a Markdown import added a blank line to every code block, selects inside their label took the chosen option into their name |

**Not checked:** live Word UI and signed-in Google Docs surfaces (no test accounts).
