# P-Doc: Definitions of Done

What success means for the [spec](spec.md): the project's Definition of Done, made from its promises, and one for each stage a person can try, made from the user-can statements it delivers. Each row names the evidence that would prove it; the result is recorded beside it once known.

> **TL;DR.**
> - **Success is:** a writer installs P-Doc, writes a structured document that never loses a keystroke, prints it as seen, reviews it, goes back to any version, and keeps it private or public on their own GitHub, online or offline.
> - **Stages:** 1 Write offline; 2 Pages and print; 3 Versions; 4 Review; 5 GitHub and first run; 6 Import and export; 7 Install.
> - **Against the promise:** see §4.

## 1. Project Definition of Done

| # | Promise | Done when | Evidence | Result |
|---|---|---|---|---|
| PD1 | P1 | Typing is on disk within 1 s of a pause, survives a forced quit (recovery), and every committed state is listed and restorable | e2e `autosave`, `recovery`, `versions`; unit `library` | Partial 2026-10-28: `autosave`, `recovery` and unit `library` pass; `versions` is stage 3 |
| PD2 | P2 | Every feature works with the network off and no account; documents are readable JSON in plain Git repositories | e2e suites run offline with no GitHub; unit `format` | Partial 2026-10-28: stage 1 runs offline with no account (`offline`); readable JSON (unit `format`) |
| PD3 | P3 | Outline and table of contents follow heading changes with no manual step; every command is reachable by command search | e2e `outline`, `toc`, `command-search` | Pass 2026-10-28: `outline`, `command-search` and `toc` pass |
| PD4 | P4 | A multi-page fixture has the same page count on screen and in the exported PDF (A1) | e2e `pagination` | Pass 2026-10-28: the 16-page fixture has the same page count on screen, in the print layout and in the PDF (A1 confirmed) |
| PD5 | P5 | Accepting all gives the suggested text; rejecting all gives the original, exactly | unit `suggestions`; e2e `review` | |
| PD6 | P6 | Nothing reaches the public repository without the Move to Public confirmation; new documents are private | e2e `privacy`; unit `library` | |
| PD7 | The outcome is valuable | A fresh install reaches a first saved document in under a minute, offline or signed in | e2e `first-run` timing; owner try-it | |
| PD8 | Nothing live breaks | No real GitHub, documents or settings of the owner are touched by tests; budgets in spec §7 hold | test isolation (W7); `pnpm perf` against `perf-baseline.json` | Partial 2026-10-28: every e2e run has its own data, library and empty Git config; unit `library` uses an empty Git config. `pnpm perf` within budget (keystroke p95 1.3 ms, repagination 2.7 ms, save 10 ms, open 100 pages 90 ms, cold start 0.55 s, 50-page PDF 0.3 s; [baseline](perf-baseline.json)); waits of stages 3, 5 and 6 are measured there |
| PD9 | Docs | The spec's "As built" records what was built | Review | |

## 2. Stages

### Stage 1: Write offline

A person can open P-Doc with no account, write a structured, formatted document that saves itself, and find their documents again.

- **Delivers:** U1–U8, U10–U12, U19 (zoom, compact, focus, full screen), U20, U33 (local), U34 (local)
- **Settles:** nothing risky; it is the core loop.
- **Try it:** start P-Doc → **Use offline** → type a title and some paragraphs, make a Heading 1 and two Heading 2s, bold a word, make a list, insert a table → watch "Saving…" become "Saved to this computer" → drag a Heading 2 above the other in the Outline → quit and start again: the document is in the Library with everything in place.

| # | Done when | Evidence | Result |
|---|---|---|---|
| 1.1 | A person can create a document and type; it is written to `private/docs/*.pdoc.json` within 1 s of a pause and the save state says "Saved to this computer" (U1) | e2e `autosave` | Pass 2026-10-28: e2e `autosave` (file in `private/docs` within the poll after a pause; "Saved to this computer"; text survives a restart) |
| 1.2 | Character formatting, styles, alignment, spacing, lists, links, images, tables, horizontal lines and page breaks apply from the toolbar, menus and shortcuts, and survive reopening (U2, U3, U5–U7) | e2e `formatting`; unit `format` | Pass 2026-10-28: e2e `formatting` (keys, toolbar and menus; bold, italic, lists, page break, table, rule, link in the file and after restart); unit `format`. Found and fixed: keys after a toolbar popover went nowhere; a document ending in a table lost the cursor (a paragraph now always follows) |
| 1.3 | "Update Heading 1 to match" changes every Heading 1, and reset restores defaults (U4) | e2e `styles` | Pass 2026-10-28: e2e `styles`, 6 of 6 repeats. Fixed: a key straight after Shift+End acted on the old selection |
| 1.4 | The outline lists headings, jumps, collapses, and dragging a heading moves its section (U8) | e2e `outline`; unit `outline` | Pass 2026-10-28: e2e `outline`; unit `outline` |
| 1.5 | Find and replace finds with match case, whole word and regex, replaces one and all (U10) | e2e `find-replace`; unit `find` | Pass 2026-10-28: e2e `find-replace`; unit `find` |
| 1.6 | Command search runs any menu command; Ctrl+/ lists shortcuts; Ctrl+Shift+C shows counts (U11, U12) | e2e `command-search` | Pass 2026-10-28: e2e `command-search` (Alt+/, Ctrl+/, Ctrl+Shift+C). Fixed: focus taken back from the command search a frame later |
| 1.7 | The library lists Private and Public documents, searches, renames, copies, deletes to Bin and restores (U33) | e2e `library`; unit `library` | Pass 2026-10-28: e2e `library`; unit `library` (11 cases with real Git in a temp folder) |
| 1.8 | Light and dark render with no hard-coded colours (U20) | `pnpm lint:design`; e2e `theme` screenshots | Pass 2026-10-28: `pnpm lint:design` "tokens only"; e2e `theme` light and dark screenshots reviewed |
| 1.9 | A forced quit with unsaved typing loses nothing: the next start restores it (negative case for P1) | e2e `recovery` | Pass 2026-10-28: e2e `recovery` (forced quit, and a save failing at close). Fixed: Windows `EPERM` on rename (retried; unit `write-atomic`); no recovery copy when the last save failed |
| 1.10 | No network request is made in stage 1 flows (negative case for P2) | e2e `offline` request log | Pass 2026-10-28: e2e `offline` request log is empty |
| 1.11 | Every control is reachable in windows down to 800×600: toolbar groups move into More, the left panel collapses under 1000 px and opens over the page (spec §5 "Complete by definition") | e2e `layout` | Pass 2026-10-28: e2e `layout` at 1600, 1280, 1000 and 800 px; screenshots reviewed. Found and fixed: the toolbar was cut off at 1280 px |

**Depends on:** nothing outside the product.

### Stage 2: Pages and print

A person can lay a document out on real pages, or write pageless, and print or export a PDF that matches the screen.

- **Delivers:** U9, U13–U16
- **Settles:** A1
- **Try it:** paste or write about five pages → File > Page setup → A4, landscape, 2 cm margins → Insert > Header and footer, page number in the footer, different first page → Insert > Table of contents → File > Download > PDF: same number of pages, same first lines per page, footer numbers from 2 → View > Pageless: no headers, wide text.

| # | Done when | Evidence | Result |
|---|---|---|---|
| 2.1 | Pages mode shows page sheets of the chosen size and margins with blocks moved to the next page when they don't fit (U13, U14) | e2e `pagination`; unit `paginate` | Pass 2026-10-28: e2e `pagination` (every block inside its sheet on a 16-page fixture; a page break starts a sheet; a code block taller than a page starts a sheet and runs on; "Page *n* of *count*"; zoom 150% keeps the layout; screenshots reviewed); unit `paginate`. Fixed: code blocks looked selected (new token `color.page-code`) |
| 2.2 | Pageless hides page edges, headers and footers without deleting them; text width applies (U13, GD R-003) | e2e `pageless` | Pass 2026-10-28: e2e `pageless` (no breaks, headers or page indicator; Narrow and Medium widths measured, Full width fills; print and PDF without headers; back to Pages restores them). Fixed: Esc did nothing with a submenu open and focus on its parent; "Full" renamed "Full width" |
| 2.3 | Header and footer repeat with page number and count; different first page works (U15) | e2e `header-footer` | Pass 2026-10-28: e2e `header-footer` (`{page}` and `{pages}` on every page, alignment, Cancel, double-click to edit, different first page, saved in the file and in the print layout) |
| 2.4 | The PDF has the same page count as the screen for the fixture (U16, A1) | e2e `pagination` (PDF page count) | Pass 2026-10-28: e2e `pagination` (PDF page count equals the screen's; the print layout in a hidden window has the same sheets) |
| 2.5 | The table of contents updates when a heading changes, with no refresh step (U9) | e2e `toc`; unit `toc` | Pass 2026-10-28: e2e `toc`, 7 of 7 runs (renaming, a new heading, text pushing a chapter to a later page and undo, all with no refresh; a click jumps); unit `toc`. Fixed: page numbers vanished after a heading edit and didn't update when they changed |
| 2.6 | Set as default makes new documents use the page setup | e2e `page-setup` | Pass 2026-10-28: e2e `page-setup` (landscape, A4, margins, colour, both validation messages; Set as default, then Ctrl+N has the setup); unit `format` (`cleanPage`) |

**Depends on:** nothing outside the product.

### Stage 3: Versions

A person can see every version of a document, see what changed, name versions and restore one.

- **Delivers:** U28–U32
- **Try it:** write, wait a minute, change a paragraph, wait, close → File > Version history: two or more versions under Today → select the older: the changed paragraph shows green and red → Name it "First draft" → Only named versions shows it → Restore → the old text is current and the newer version is still listed.

| # | Done when | Evidence | Result |
|---|---|---|---|
| 3.1 | A version (commit) is made after a pause, on close and on switching document (U28) | e2e `versions`; unit `cadence` | |
| 3.2 | The history lists versions grouped by day with author and time (U28) | e2e `versions`; unit `group` | |
| 3.3 | Selecting a version shows it read-only with insertions and deletions marked (U29) | e2e `versions`; unit `diff` | |
| 3.4 | Restore makes the old text current as a new version and keeps the rest (U30, GD R-006) | e2e `versions`; unit `library` | |
| 3.5 | Naming a version stores a tag; the named filter shows only named versions (U31) | e2e `versions` | |
| 3.6 | Make a copy of an old version creates a new document (U32) | e2e `versions` | |

**Depends on:** Git on the machine (A2).

### Stage 4: Review

A person can suggest, comment, and accept or reject changes.

- **Delivers:** U21–U27
- **Settles:** A4
- **Try it:** switch to Suggesting → delete a word and type a new one: struck-through and underlined → comment on a sentence → open the Review panel: one change pair and one comment → Accept the insertion, Reject the deletion → Resolve the comment → View > Markup > Original shows the original text → Viewing mode: typing does nothing.

| # | Done when | Evidence | Result |
|---|---|---|---|
| 4.1 | Editing, Suggesting and Viewing switch from the toolbar and shortcuts; Viewing blocks edits (U21, U27) | e2e `review` | |
| 4.2 | In Suggesting, insertions and deletions become suggestion marks with author and time; deleting your own suggestion removes it (U22) | unit `suggestions`; e2e `review` | |
| 4.3 | Markup views show Simple, All, No markup and Original correctly (U23) | e2e `review` | |
| 4.4 | Accept, Reject, Next, Previous, Accept all and Reject all work; accept-all equals the suggested text and reject-all the original (U24, PD5) | unit `suggestions`; e2e `review` | |
| 4.5 | Comments: add, reply, edit, resolve, reopen, delete; persisted in the file (U25) | e2e `comments` | |
| 4.6 | The panel lists changes and comments in document order with Open/Resolved filter (U26) | e2e `review` | |

**Depends on:** nothing outside the product.

### Stage 5: GitHub and first run

A person can connect their GitHub, have two repositories set up, and have documents sync, with public only on purpose.

- **Delivers:** U34–U37
- **Settles:** A7
- **Try it (owner, real GitHub):** start P-Doc with a fresh data folder → Connect GitHub → sign in in the browser → confirm identity → Set up: `p-doc-private` (private) and `p-doc-public` (public) appear on github.com → write a document → status bar "Synced" → move it to Public after the warning → it shows in `p-doc-public` on GitHub.

| # | Done when | Evidence | Result |
|---|---|---|---|
| 5.1 | The first run offers Connect GitHub and Use offline; Use offline makes a working library (U35) | e2e `first-run` | |
| 5.2 | Sign-in finds an existing Git credential or accepts a token, checking it with the API; the token is never written by P-Doc (U35) | unit `account` with fake helper + fake API; grep check: no token in logs or files | |
| 5.3 | Setup creates or reuses the two repositories with the right visibility, initialises, sets remotes and pushes; re-running resumes and changes nothing done (U35) | unit `setup` with fake API + bare repos; e2e `first-run` (fake) | |
| 5.4 | After a version, sync pushes; another clone's change is pulled; offline shows "Offline · n versions waiting" and catches up later (U34, U36) | unit `sync` with bare repos | |
| 5.5 | Conflicting edits keep both versions and say so (U36) | unit `sync` conflict | |
| 5.6 | Move to Public needs the confirmation; Cancel leaves the document private (U37, P6, A7) | e2e `privacy` | |
| 5.7 | Real GitHub connect works end to end | owner try-it | Needs owner |

**Depends on:** a GitHub account (the owner) for 5.7 only; everything else uses fakes (W7).

### Stage 6: Import and export

A person can bring Word, Markdown, HTML and text in, and take .docx, PDF, Markdown, HTML and text out; scripts can do the same.

- **Delivers:** U16 (PDF from File > Download), U17, U18, U38
- **Settles:** A3 (partly), A6
- **Try it:** File > Open from file → a .docx with headings, a list and a table → it opens with the same structure → File > Download > Word → open the result in Word or LibreOffice: headings, list, table, bold and links are there → `pdoc list --json` lists it.

| # | Done when | Evidence | Result |
|---|---|---|---|
| 6.1 | .docx import keeps headings, emphasis, lists, tables, links and images (U18) | unit `import-docx` with a generated fixture | |
| 6.2 | .md, .html and .txt import (U18) | unit `import` | |
| 6.3 | .docx export keeps headings, emphasis, lists, tables, links, page size, margins, header/footer page numbers; re-import gives the same structure (U17) | unit `export-docx` round-trip | |
| 6.4 | .md, .html and .txt export (U17) | unit `export` | |
| 6.5 | `pdoc list|new|export|history --json` work against a library with documented exit codes (U38) | unit `cli` | |

**Depends on:** nothing outside the product.

### Stage 7: Install

A person can install P-Doc on Windows, or run it portable, and it starts and works.

- **Delivers:** all, packaged
- **Try it:** run `release\P-Doc-Setup-<version>.exe` → choose a folder → P-Doc starts at the first run; or run the portable `.exe` directly.

| # | Done when | Evidence | Result |
|---|---|---|---|
| 7.1 | `pnpm package` builds an NSIS installer and a portable exe with the app icon and fuses set | build output; `release/` listing | |
| 7.2 | The packaged app starts, shows the first run, makes a document offline and saves it | e2e `packaged` against the unpacked build | |
| 7.3 | Code signing | owner (certificate) | Needs owner |

**Depends on:** a code-signing certificate for 7.3 (owner).

## 3. Order by value and risk

Stage 1 proves the core promise (P1–P3) soonest and everything else builds on it. Stage 2 settles the riskiest assumption (A1) next. Stage 3 completes P1 (versions) and is the base for sync. Stage 4 (review) is independent of 3 and 5. Stage 5 depends on 3 (commits to push). Stage 6 depends on 1 and 2 (page setup for .docx and PDF). Stage 7 packages the result.

## 4. Against the promise

To be written after the stages run: the gaps, in the order they block a real writer, and who each waits on. Known before building: a real GitHub sign-in (5.7) and code signing (7.3) wait on the owner.
