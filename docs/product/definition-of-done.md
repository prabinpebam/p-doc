# P-Doc: Definitions of Done

What success means for the [spec](spec.md): the project's Definition of Done, made from its promises, and one for each stage a person can try, made from the user-can statements it delivers. Each row names the evidence that would prove it; the result is recorded beside it once known.

> **TL;DR.**
> - **Success is:** a writer installs P-Doc, writes a structured document with the tools of Docs and Word they reach for (power ones included) that never loses a keystroke, prints it as seen, reviews it, goes back to any version, and keeps it private or public on their own GitHub, online or offline.
> - **Stages:** 1 Write offline; 2 Pages and print; 3 Versions; 4 Review; 5 GitHub and first run; 6 Import and export; then the [parity](parity.md) stages 7 Images beside the document; 8 Styles and lists; 9 Paragraph layout; 10 References; 11 Sections and page layout; 12 Tables, code and equations; 13 Review power; 14 Citations, index and fields; 15 Navigation and windows; 16 Library, files and proofing; and last 17 Install.
> - **Against the promise:** see §4.

## 1. Project Definition of Done

| # | Promise | Done when | Evidence | Result |
|---|---|---|---|---|
| PD1 | P1 | Typing is on disk within 1 s of a pause, survives a forced quit (recovery), and every committed state is listed and restorable | e2e `autosave`, `recovery`, `versions`; unit `library` | Pass 2026-10-28: `autosave`, `recovery`, `versions` and unit `library` pass. Every committed state is listed in the history and restorable; text saved before a forced quit becomes a version on the next start |
| PD2 | P2 | Every feature works with the network off and no account; documents are readable JSON in plain Git repositories | e2e suites run offline with no GitHub; unit `format` | Partial 2026-10-28: stages 1–5 run with no account (`offline`, Use offline in `first-run`); GitHub only ever through the fake, and Settings, versions and every editing feature work when not connected; readable JSON (unit `format`). Stage 6: import and export run in the main process and the `pdoc` CLI with no network (e2e `import-export`, unit `cli`). Stays Partial until stages 7–17 are done |
| PD3 | P3 | Outline and table of contents follow heading changes with no manual step; every command is reachable by command search | e2e `outline`, `toc`, `command-search` | Pass 2026-10-28: `outline`, `command-search` and `toc` pass |
| PD4 | P4 | A multi-page fixture has the same page count on screen and in the exported PDF (A1); from the parity stages, the same page sizes (11.1), notes on each page (10.1), columns (11.2) and split points (9.3, 12.2) | e2e `pagination` | Pass 2026-10-28: the 16-page fixture has the same page count on screen, in the print layout and in the PDF (A1 confirmed) |
| PD5 | P5 | Accepting all gives the suggested text; rejecting all gives the original, exactly | unit `suggestions`; e2e `review` | Pass 2026-10-28: unit `suggestions` "accept-all gives the suggested text and reject-all the original, exactly"; e2e `review` checks the page text after Accept all and after Reject all |
| PD6 | P6 | Nothing reaches the public repository without the Move to Public confirmation; new documents are private | e2e `privacy`; unit `library` | Pass 2026-10-28: e2e `github` "5.6" (Cancel keeps the public repository empty after a sync; only the confirmed move reaches it); e2e `first-run`, `autosave` and `github` find new documents in `private/docs`; unit `library` moves both ways |
| PD7 | The outcome is valuable | A fresh install reaches a first saved document in under a minute, offline or signed in | e2e `first-run` timing; owner try-it | Partial 2026-10-28: e2e `github` reaches a first saved document, signed in with both repositories set up, in under 60 s from launch (checked in the test); offline it is one click (`first-run`). Owner try-it on the installed app with real GitHub waits for Install (stage 17) |
| PD8 | Nothing live breaks | No real GitHub, documents or settings of the owner are touched by tests; budgets in spec §7 hold | test isolation (W7); `pnpm perf` against `perf-baseline.json` | Partial 2026-10-28: every e2e run has its own data, library and empty Git config; unit `library` uses an empty Git config. `pnpm perf` within budget (keystroke p95 1.3 ms, repagination 2.7 ms, save 10 ms, open 100 pages 90 ms, cold start 0.55 s, 50-page PDF 0.3 s; [baseline](perf-baseline.json)); stage 3: version commit of 50 pages p95 0.44 s (budget 1 s), history of 500 versions p95 0.2 s (budget 0.3 s); stage 4: review list on 50 pages p95 0.2 ms (budget 16 ms); stage 5: typing in a 50-page document during 4 syncs p95 0.8 ms (budget 16 ms: sync never blocks typing); stage 6: 50-page .docx export p95 34 ms (budget 3 s) |
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
| 3.1 | A version (commit) is made after a pause, on close and on switching document (U28) | e2e `versions`; unit `cadence` | Pass 2026-10-28: e2e `versions` (a version after the pause, none while the text is unchanged, one on close, and one on the next start after a forced quit); unit `cadence`, `versions` (pause, maximum wait, switching, close, drop, only-when-waiting) and `library` (none when unchanged; finds unversioned documents). Found and fixed: typing straight after a start could land at the top of the document (the start-up focus moved a cursor the person had already placed) |
| 3.2 | The history lists versions grouped by day with author and time (U28) | e2e `versions`; unit `group` | Pass 2026-10-28: e2e `versions` (opened from the save state and Ctrl+Alt+Shift+H; "Current version" on top; Today group; author; focus on Close; without Git "Install Git to keep versions."); unit `group`. History of 500 versions opens in 0.2 s (`pnpm perf`). Found and fixed: the first open ran four Git processes in a row (now the log and tags run together and no commit is made when nothing is waiting) |
| 3.3 | Selecting a version shows it read-only with insertions and deletions marked (U29) | e2e `versions`; unit `diff` | Pass 2026-10-28: e2e `versions` (read-only, "Since then: 2 words added, 1 removed.", green insertion and red deletion, Esc back to current then closes the panel; at 800 × 600 the banner stays clear of the panel; screenshots reviewed); unit `diff`. Found and fixed: the banner squeezed its text at 1280 px and was covered by the panel at 800 px; showing a version set off a needless save |
| 3.4 | Restore makes the old text current as a new version and keeps the rest (U30, GD R-006) | e2e `versions`; unit `library` | Pass 2026-10-28: e2e `versions` (confirm dialog, old text current, one more row, "Restore *date time*" commit, earlier versions kept, typing continues); unit `library` (edits not yet a version are kept first; id kept) |
| 3.5 | Naming a version stores a tag; the named filter shows only named versions (U31) | e2e `versions` | Pass 2026-10-28: e2e `versions` (inline field, "First draft" shown, one `pdoc/*` tag, Only named versions shows just it); unit `library` (rename and remove the name) |
| 3.6 | Make a copy of an old version creates a new document (U32) | e2e `versions` | Pass 2026-10-28: e2e `versions` ("Copy of Plan" in the library, toast **Open** opens it, original untouched); unit `library` |

**Depends on:** Git on the machine (A2).

### Stage 4: Review

A person can suggest, comment, and accept or reject changes.

- **Delivers:** U21–U27
- **Settles:** A4
- **Try it:** switch to Suggesting → delete a word and type a new one: struck-through and underlined → comment on a sentence → open the Review panel: one change pair and one comment → Accept the insertion, Reject the deletion → Resolve the comment → View > Markup > Original shows the original text → Viewing mode: typing does nothing.

| # | Done when | Evidence | Result |
|---|---|---|---|
| 4.1 | Editing, Suggesting and Viewing switch from the toolbar and shortcuts; Viewing blocks edits (U21, U27) | e2e `review` | Pass 2026-10-28: e2e `review` (switcher, View > Mode and the three shortcuts; badge; in Viewing typing changes nothing and the toolbar's editing controls are disabled, comments still allowed) |
| 4.2 | In Suggesting, insertions and deletions become suggestion marks with author and time; deleting your own suggestion removes it (U22) | unit `suggestions`; e2e `review` | Pass 2026-10-28: unit `suggestions` (9 tests) and e2e `review`. Found and fixed: each typed character was its own change because its time differed; a new character now joins its neighbour's change, dated when it began |
| 4.3 | Markup views show Simple, All, No markup and Original correctly (U23) | e2e `review` | Pass 2026-10-28: e2e `review` checks the text shown in each view and that No markup and Original are read-only; screenshots reviewed. Known limit: Original can't show a suggested paragraph split re-joined |
| 4.4 | Accept, Reject, Next, Previous, Accept all and Reject all work; accept-all equals the suggested text and reject-all the original (U24, PD5) | unit `suggestions`; e2e `review` | Pass 2026-10-28: unit `suggestions` (accept-all and reject-all exact, by id); e2e `review` (one by one moving to the next, Next/Previous, all, undo) |
| 4.5 | Comments: add, reply, edit, resolve, reopen, delete; persisted in the file (U25) | e2e `comments` | Pass 2026-10-28: e2e `comments` (add, Esc drops the draft, reply, edit, resolve, reopen, delete a reply, comment in Viewing, "Text deleted.", saved and back after a restart, delete a thread); unit `comments` |
| 4.6 | The panel lists changes and comments in document order with Open/Resolved filter (U26) | e2e `review` | Pass 2026-10-28: e2e `review` (order, counts, filter); `pnpm perf` "Review list after an edit" on 50 pages with 100 suggestions p95 0.2 ms (budget 16 ms) |

**Depends on:** nothing outside the product.

### Stage 5: GitHub and first run

A person can connect their GitHub, have two repositories set up, and have documents sync, with public only on purpose.

- **Delivers:** U34–U37
- **Settles:** A7
- **Try it (owner, real GitHub):** start P-Doc with a fresh data folder → Connect GitHub → sign in in the browser → confirm identity → Set up: `p-doc-private` (private) and `p-doc-public` (public) appear on github.com → write a document → status bar "Synced" → move it to Public after the warning → it shows in `p-doc-public` on GitHub.

| # | Done when | Evidence | Result |
|---|---|---|---|
| 5.1 | The first run offers Connect GitHub and Use offline; Use offline makes a working library (U35) | e2e `first-run` | Pass 2026-10-28: e2e `first-run` (Welcome with six step dots, Connect GitHub focused; Connect → Sign in → Back → Git → Back → Welcome; Use offline → typing saved) and e2e `github` (Connect GitHub to a first synced document) |
| 5.2 | Sign-in finds an existing Git credential or accepts a token, checking it with the API; the token is never written by P-Doc (U35) | unit `account` with fake helper + fake API; grep check: no token in logs or files | Pass 2026-10-28: unit `github` › account (9 tests: helper credential, pasted token handed to the helper, bad and no-scope tokens, offline, expired, no helper = session only, Use another account, browser path without GCM or gh). e2e `github` signs in with a bad, a no-scope, then a good token and finds the token in none of P-Doc's data folder, the library (Git remotes included) or its log |
| 5.3 | Setup creates or reuses the two repositories with the right visibility, initialises, sets remotes and pushes; re-running resumes and changes nothing done (U35) | unit `setup` with fake API + bare repos; e2e `first-run` (fake) | Pass 2026-10-28: unit `github` › setup (4 tests: create both with the right visibility and push; refuse wrong visibility; a repository with other files is used only when told and keeps them; a second computer finds the library). e2e `github`: both repositories created private/public with `.p-doc`; quitting at You resumes there; a taken name shows the problem, Choose another name focuses the field, Use it anyway keeps its README |
| 5.4 | After a version, sync pushes; another clone's change is pulled; offline shows "Offline · n versions waiting" and catches up later (U34, U36) | unit `sync` with bare repos | Pass 2026-10-28: unit `github` › sync (edits, new documents, moves and version names between computers; offline versions wait then go up; a deleted repository is named; saved edits become versions before merging). e2e `github`: Ctrl+Alt+S pushes, "Saved · synced" then "Saved to this computer" after an edit; a rename pushed from another clone reaches the open page via File > Sync now; a restart syncs with no first run; Sign out returns Settings to Connect GitHub. Found and fixed: an open File menu kept Sync now disabled after a sync ended; a status answer could land after a run's last event |
| 5.5 | Conflicting edits keep both versions and say so (U36) | unit `sync` conflict | Pass 2026-10-28: unit `github` › sync "keeps both when a document was edited on two computers apart" (this computer's text stays; GitHub's is "*title* (from GitHub *date*)"); the window says "Two versions of *title* were edited apart. Both are kept." |
| 5.6 | Move to Public needs the confirmation; Cancel leaves the document private (U37, P6, A7) | e2e `privacy` | Pass 2026-10-28: e2e `github` "5.6": Cancel then a sync leaves the public repository with no documents; confirming and syncing puts it in public and removes it from private's `main`. A7 settled: privacy is per repository, so nothing private is in the public one's history |
| 5.7 | Real GitHub connect works end to end | owner try-it | Needs owner |

**Depends on:** a GitHub account (the owner) for 5.7 only; everything else uses fakes (W7).

### Stage 6: Import and export

A person can bring Word, Markdown, HTML and text in, and take .docx, PDF, Markdown, HTML and text out; scripts can do the same.

- **Delivers:** U16 (PDF from File > Download), U17, U18, U38
- **Settles:** A3 (partly), A6 (measured: it fails at the 2 MB cap; see the spec's register)
- **Try it:** File > Open from file → a .docx with headings, a list and a table → it opens with the same structure → File > Download > Word → open the result in Word or LibreOffice: headings, list, table, bold and links are there → `pdoc list --json` lists it.

| # | Done when | Evidence | Result |
|---|---|---|---|
| 6.1 | .docx import keeps headings, emphasis, lists, tables, links and images (U18) | unit `import-docx` with a generated fixture | Pass 2026-10-28: unit `import-docx` (headings, bold and italic, lists, a table, a link and an image from a generated Word file). e2e `import-export`: File > Open from file (Ctrl+Shift+O) opens a .docx as a new private document with heading, bold, link, list and table; "Importing…" gives way to "Opened *title*"; parts Word has that P-Doc can't keep are named ("Some parts (text boxes) were left out") |
| 6.2 | .md, .html and .txt import (U18) | unit `import` | Pass 2026-10-28: unit `import` (Markdown to the same structure and back, HTML with scripts and unsafe links dropped, text line by line, file kinds and titles). e2e `import-export`: a .md dropped on the window opens as a new document titled from the file name; a .zip is refused with what P-Doc can open and nothing is made |
| 6.3 | .docx export keeps headings, emphasis, lists, tables, links, page size, margins, header/footer page numbers; re-import gives the same structure (U17) | unit `export-docx` round-trip | Pass 2026-10-28: unit `export-docx` (page size, margins, header/footer page numbers, suggestions as Word tracked changes; re-import gives the same structure). e2e `import-export`: File > Download > Microsoft Word, then Open from file of that .docx gives back heading, bold, link, two list items and the table. `pnpm perf`: 50-page .docx p95 34 ms (budget 3 s) |
| 6.4 | .md, .html and .txt export (U17) | unit `export` | Pass 2026-10-28: unit `export` (Markdown, a standalone web page and plain text, suggestions applied). e2e `import-export`: File > Download > Markdown, Web page and Plain text each write the file and say "Saved *name*" with Show in folder |
| 6.5 | `pdoc list|new|export|history --json` work against a library with documented exit codes (U38) | unit `cli` | Pass 2026-10-28: unit `cli` (8 tests: help and version; `setup` exits 3 with `{"needs":"sign-in"}` and `--offline` makes the library; `--library` is recorded for later commands and the app; `new`, `list`, `history`; `export` of the current text or any version to stdout or a file; `import` of .docx, .md and .pdoc.json; exit codes 0 done, 1 usage, 2 no such document, 3 a person must act, 4 failed). e2e `import-export` ends with the built `pdoc list --json` listing the window's documents |

**Depends on:** nothing outside the product.

### Stage 7: Images beside the document

A person can use big pictures freely: each is stored once beside its document, laid out the way they want, and never lost through a version, a move or a sync.

- **Delivers:** U39, U40
- **Settles:** A6 (its fallback), A9
- **Try it:** paste a large photo and a screenshot into a document → resize one by its corner, wrap text around it, crop it, give it alt text → make a few versions, restore the first, move the document to Public and back → the pictures are there each time; the document file is a few KB, and the pictures are files in `assets/`.

| # | Done when | Evidence | Result |
|---|---|---|---|
| 7.1 | An inserted, pasted or dropped image is written once to `assets/<sha256>.<ext>`, and the document refers to it by path; the same image in two documents is one file; images up to 20 MB are accepted, larger refused with the words in §8 (U39) | unit `assets-integrity`, `image`; e2e `images` | Pass 2026-10-28: e2e `images` (Insert > Image…, a paste and a drop: 3 images, 2 files in `assets/` named by SHA-256, the file byte-for-byte the picture, no `data:` left in the document; a file over 20 MB refused with the §8 words); unit `assets-integrity` (one file for the same picture in two documents; over 20 MB refused in main as well) |
| 7.2 | Integrity: a version 1 document with embedded images moves to version 2 on open with every image intact; then 5 versions, an image deleted, the oldest version restored, a sync to the fake GitHub and a fresh clone, a .docx export and re-import, a copy, a Move to Public and back, and `pdoc export` and `import` all keep every image; a crash between writing an image and writing the document loses nothing; P-Doc never deletes an asset any version refers to; a build that knows only version 1 opens a version 2 file read-only and leaves it byte-for-byte unchanged after closing and syncing (U39, P1, A18) | unit `assets-integrity` (temp repositories, fake GitHub) | Pass 2026-10-28: unit `assets-integrity`, 4 tests: a version 1 file with embedded pictures moves to version 2 with every picture's bytes intact, then versions, a deletion, a restore of the oldest, a sync and a fresh clone of the fake GitHub, a .docx round trip, a copy, Move to Public and back, `pdoc export` and `import` (every picture checked by hash each time); a stop between picture and document loses nothing; no asset is ever deleted; a version 2 file is byte-for-byte the same after saves, library operations and a sync by a build that treats it as newer. e2e `images`: a newer file synced in opens locked with "Made with a newer P-Doc. Update to edit it.", shows the parts this build knows, ignores typing, and is byte-for-byte the same after closing. Found and fixed: such a file showed an empty page (the editor refused the whole document over one node it didn't know) |
| 7.3 | Size: the A6 fixture (100 pages, 20 images at 2 MB) is a document file under 1 MB, and 10 more text-only versions add under 1 MB to the repository (U39, A6) | `PDOC_MEASURE=1` unit `a6-measure` | Pass 2026-10-28: 100 pages with 20 pictures of 2 MB: the document file is 0.7 MB (54 MB before), the pictures 40 MB once; 10 text-only versions add 0.2 MB to `.git` (before: 454 MB for 11 versions). With 300 KB pictures: 0.7 MB and 0.2 MB |
| 7.4 | Resize (proportions kept, Shift frees them), align, wrap left or right, crop and reset, replace and alt text work by mouse and keyboard and survive save, reopen and .docx and HTML export (U40) | e2e `images`; unit `image` | Pass 2026-10-28: e2e `images`: a corner drag keeps the proportions, with Shift frees them; wrap left, in line, align right, reset size from the bar; crop by dragging an edge (Enter keeps, Esc puts back), Reset crop, Alt text and Image options by command search and keyboard; Replace keeps size, alignment and alt text; a picture dragged by the mouse moves with its settings; all after a restart; the .docx carries the pictures and the HTML export has them inline with their alt text and no editing handles. Unit `image`: HTML round trip of size, alignment, wrap and crop; Word output with width, alignment, square wrap and crop. Found and fixed: the picture on the page didn't carry its size and crop for print and export clones |
| 7.5 | Wrapped images paginate the same on screen and in the PDF (A9) | e2e `pagination` with wrapped images | Pass 2026-10-28: e2e `pagination` 7.5: 14 pictures, 12 wrapped (tall ones where they don't fit their page): text runs beside them, no picture crosses a sheet, and the PDF has the same pages with each picture on the same page. Unit `paginate`: a float needs its height on the page and pushes later blocks. Found and fixed: wrapping did nothing on the page (floats are ignored in a flex column; the page content is now block layout, and space before is padding so spacing still adds up); blocks are measured by position so text beside a float counts once |
| 7.6 | A missing image file shows "Image missing" and nothing else breaks; Move to Public says how many images become public (P6) | e2e `images` | Pass 2026-10-28: e2e `images`: with a picture's file deleted, the page shows a dashed "Image missing" box (no broken-image icon, no alt text) and typing and saving carry on; a web page exported then has the text and no picture; Move to Public says "Its 2 images become public too." Found and fixed: the browser's broken-image icon and alt text showed through the box |
| 7.7 | Opening a 100-page document with 20 images is editable in ≤ 500 ms; inserting a 20 MB image ≤ 300 ms (§7) | `pnpm perf` | Pass 2026-10-28: opening 100 pages with 20 pictures of about 2 MB stored beside it: p95 87 ms (budget 500); inserting a 20 MB picture, from paste to decoded on the page: p95 143 ms (budget 300). Pictures fade in after the page is editable |

**Depends on:** nothing outside the product.

### Stage 8: Styles and lists

A person can make the document look their way once and reuse it: their own styles, style sets, list formats, finer character formatting, and Markdown typing.

- **Delivers:** U41–U45
- **Settles:** A16 (first check)
- **Try it:** Format > Paragraph styles > Edit styles → make Heading 1 dark blue 20 pt → New style "Note" from Normal, italic → Save as my default styles → a new document has them → a numbered list in a, b, c, restart at 1 → small caps on a word, Shift+F3 to uppercase → paint format onto another word → type `## Plan` and `**done**` → they format → Edit > Copy as Markdown and paste into Notepad.

| # | Done when | Evidence | Result |
|---|---|---|---|
| 8.1 | Heading 5 and 6, editing any style, own styles (new, rename, delete) and default styles work, and the outline, contents and .docx and HTML exports follow (U41) | unit `styles`; e2e `styles` | In progress: Heading 5/6 distinct in editor, menus, shortcuts, outline, contents, HTML, Markdown and Word; focused core 37/37, styles/contents e2e 4/4. Editable/custom/default styles remain |
| 8.2 | Each style set restyles the document and Undo returns (U42) | e2e `styles` | |
| 8.3 | List formats, bullets, start at, restart and continue, and nine levels show on the page, print and survive .docx and Markdown export (U43) | unit `lists`; e2e `lists` | |
| 8.4 | Small caps, all caps, letter spacing, change case and paint format (once and kept) work and export to .docx (U44) | unit `format`; e2e `formatting` | |
| 8.5 | Markdown while typing, with Undo turning it back; Copy as Markdown and Paste from Markdown; substitutions list edited in Settings; each switch off stops its behaviour (U45) | e2e `markdown`; unit `markdown` | |
| 8.6 | The toolbar keeps its groups at 1280 px and every new command is found by command search (A16) | e2e `command-search` sweep | |

### Stage 9: Paragraph layout

A person can lay paragraphs out like in Word: indents, tabs, a ruler, spacing, page-break control, borders, right-to-left text, sorting, and the marks that show it all.

- **Delivers:** U46–U50
- **Settles:** A10 and A20 were settled early, by the layout spike (IL); this stage adds the paragraph controls on top
- **Try it:** View > Show ruler → drag the first-line indent → add a right tab with dot leaders and type a name, Tab, a page number → Format > Paragraph → Keep with next on a heading at a page foot → it moves with its paragraph → long paragraphs break across pages with no big gaps → Ctrl+Shift+P shows ¶ and → → select five lines, Format > Sort.

| # | Done when | Evidence | Result |
|---|---|---|---|
| 9.1 | Custom line spacing, left, right, first-line and hanging indents, and tab stops with leaders show on screen, in the PDF and in .docx (U46) | unit `paragraph`; e2e `paragraph` | Pass 2026-10-28: e2e `paragraph` sets 1.5 spacing, left, right, first-line and hanging indents and a right tab with dot leaders through Format > Paragraph; the page, the PDF and the .docx (`w:ind`, `w:spacing`, `w:tabs` with leader) all carry them; unit `paragraph` (Word's Left semantics both ways) |
| 9.2 | The ruler shows margins, indents and tabs and dragging changes them; clicking adds a tab (U46) | e2e `ruler` | Pass 2026-10-28: e2e `ruler`: margins shaded and the text area aligned with the paragraph; first-line, hanging and left markers dragged, right indent by keyboard, each one Undo step; click adds a left tab, the type button cycles to Right; Tab reaches the new stop; a tab dragged off is removed; double-click opens Paragraph on Tabs |
| 9.3 | Paragraphs split across pages at lines, the same on screen and in the PDF, with widow and orphan control; keep with next, keep lines together and page break before hold (U47, A10, A20). A10 and A20 hold (IL), so the fallback is not needed | e2e `pagination` split fixture; unit `paginate` | Pass 2026-10-28: e2e `pagination` split fixture (a paragraph splits at a line, PDF text read page by page) and keep test (keep with next, keep lines together and page break before move whole blocks on screen and in the PDF); unit `paginate` widow and orphan cases |
| 9.4 | Borders, shading and right-to-left paragraphs show, print and export to .docx (U48) | e2e `paragraph`; unit `export-docx` | Pass 2026-10-28: e2e `paragraph` borders, shading and a right-to-left paragraph show on the page and in the PDF; unit `export-docx` writes `w:pBdr`, `w:shd`, `w:bidi` |
| 9.5 | Non-printing characters show and never print (U49) | e2e `paragraph` (PDF text has no ¶) | Pass 2026-10-28: e2e `paragraph`: Ctrl+Shift+P shows ¶, · and →; the printed HTML body and the PDF text have none of them |
| 9.6 | Sort orders paragraphs, list items and table rows, numbers in number order; Undo returns (U50) | unit `sort`; e2e `paragraph` | Pass 2026-10-28: unit `sort` (paragraphs, list items, table rows; numbers in number order, descending, case); e2e `paragraph` sorts five lines with Format > Sort and one Undo returns them |
| 9.7 | Repagination stays ≤ 16 ms on 50 pages with split paragraphs (§7) | `pnpm perf` | Pass 2026-10-28: repagination after an edit p95 6.9 ms (budget 16) on 50 pages with split paragraphs; keystroke p95 1 ms; all 10 budgets pass |

### Stage 10: References

A person can write with notes, bookmarks, numbered captions and cross-references that keep themselves right, and contents with page numbers.

- **Delivers:** U51–U54
- **Settles:** A8, O19
- **Try it:** Ctrl+Alt+F twice on page 3 → two numbered notes at the foot of page 3 → delete the first → the second becomes 1 → Insert > Bookmark… → Ctrl+K links to it → contents with page numbers, Insert > Contents options… levels 1–4 → Download PDF: notes, numbers and links match the screen. With 10.3 (increment I10b): caption two images → Insert > Cross-reference to Figure 2 as "page" → move Figure 2 before Figure 1 → numbers and the reference follow.

| # | Done when | Evidence | Result |
|---|---|---|---|
| 10.1 | Footnotes number themselves, sit at the foot of their page (continuing on the next page when long; without A10, a long note moves whole), the same on screen and in the PDF; endnotes at the end; convert both ways; .docx exports and imports them (U51, A8) | unit `notes`; e2e `notes`; e2e `pagination` notes fixture | Pass 2026-10-28: unit `notes` (labels, order, sync, convert, formats; placement and continuation in `paginate`), `convert` (HTML links, Markdown `[^1]`, text `[1]`) and `docx` (Word's own footnotes and endnotes out and back); e2e `notes` numbers, renumbers on delete, converts, formats in one Undo step, and a 900-word note goes on at the foot of the next page on screen and in the PDF; e2e `pagination` puts 24 notes on the page of their number on 12 pages and each PDF page prints the same notes, once |
| 10.2 | Bookmarks, and links to headings and bookmarks, work in the page, the PDF, HTML and .docx (U52) | e2e `notes`; unit `export-docx` | Pass 2026-10-28: e2e "10.2 bookmarks and links…" inserts a bookmark named from the next words and renames it in one Undo step, shows its flag only with non-printing characters, lists headings then bookmarks in Ctrl+K, and Ctrl+click goes to both; the PDF has 2 internal links to page 2, the HTML keeps the ids, and Word gets `w:bookmarkStart` plus `w:hyperlink w:anchor` (headings as hidden `_pd_` bookmarks). Unit `export-docx bookmarks (10.2)` covers unique Word names and re-import; `toc` covers fresh ids for pasted bookmarks |
| 10.3 | Captions number by kind in document order; cross-references show text, number or page and follow moves; a deleted target reads "Reference missing"; a table of figures lists captions with pages (U53) | unit `references`; e2e `references` | Deferred 2026-10-28 to increment I10b (before stage 14, which builds on the same field atoms): stage 10 reached its cut line. Builds on the anchor resolver of 10.2 and the digit reservation of 10.6 |
| 10.4 | Contents with page numbers and dotted leaders or links, levels 1–6, matching the PDF's pages (U54) | e2e `toc` | Pass 2026-10-28: e2e "10.4 contents options…" (Insert > Contents options…: levels 1–6 indent in order and save as `"levels":6`, dotted leaders, the PDF's page text and link destinations match each entry's number, Links shows no dots or numbers, Levels 1 lists only H1s, clicking an entry goes to its page); unit `toc` levels per contents, `docx` each entry links to its heading (no PAGEREF fields, so Word never asks to update fields) |
| 10.5 | Repagination with 40 notes stays ≤ 16 ms on 50 pages (§7) | `pnpm perf` | Pass 2026-10-28: repagination with 40 footnotes (every fifth one long) p95 10.3 ms, median 7.6 ms (budget 16) on 50 pages; in the baseline as `repaginate50Notes` |
| 10.6 | Page numbers settle: a 50-page fixture with contents and page references reaches a stable layout within 2 passes (A19) | unit `paginate` | Pass 2026-10-28: unit `paginate` "page numbers settle (A19, 10.6)": 50+ pages, contents and modelled page references sized to wrap at the edge, stable in exactly 2 passes; gives up after the pass limit; every number reserves the widest one's digits (`digitsFor`, mirrored live in `--pd-toc-digits`). Live page references arrive with 10.3 (I10b) and must reserve the same way |

### Stage 11: Sections and page layout

A person can make demanding layouts: sections with their own page setup, columns, headers per section, odd and even pages, numbering formats, a watermark, line numbers, hyphenation and drop caps.

- **Delivers:** U55–U59
- **Settles:** A12, A13, A14, O3
- **Try it:** a report → a next-page section break before the appendix → Page setup > This section > Landscape → the appendix pages are landscape → a continuous section with two columns → front matter numbered i, ii, the body from 1 → different odd and even footers → a "Draft" watermark → Download PDF: the same pages, sizes, columns and numbers.

| # | Done when | Evidence | Result |
|---|---|---|---|
| 11.1 | Section breaks of every kind start where they say; orientation, paper and margins per section show on screen and in the PDF (U55, A12) | e2e `sections`; unit `paginate` | **Pass** 2026-10-28: e2e `sections` 11.1 (Insert > Break ▸ next page, even page and continuous; Page setup Apply to This section, one Undo step; sheets 816 and 1056 px; a blank page before the even section; PDF pages 612×792, 792×612 ×3, page 3 blank, text from 72 pt and 36 pt, past 700 pt on the landscape page); unit `paginate` 6 section tests (odd and even blanks, continuous, each section's page height) |
| 11.2 | Columns (1–3, spacing, line between, column break) fill and balance the same on screen and in the PDF (U56, A13; balancing needs A10) | e2e `sections` columns fixture | **Partial** 2026-10-29: e2e `sections` 11.2 (Ctrl+Shift+Enter and Insert > Break ▸ Column break; on one column it starts the next page, as in Word); unit `export-docx` (a section's columns write `w:cols` with count and spacing, a column break `w:br w:type="column"`); unit `paginate` (columns and the column break round-trip through HTML; each section's columns). Open, moved to I11b: columns laid out on screen and in the PDF, balancing, Format > Columns…, line between |
| 11.3 | Odd and even headers, per-section headers with Link to previous, number formats and start at, on screen, in the PDF and in .docx (U57) | e2e `sections`; unit `export-docx` | **Pass** 2026-10-28: e2e `sections` 11.3 (Different odd and even pages: Report 1, Even 2, Report 3…; section 2 linked shows the text read-only, unlinked has its own headers and numbers i, ii starting at 1; footers "ii of 5"; one Undo step back to linked, Redo; the PDF's pages 2, 4 and 5 carry the same headers and footers); unit `export-docx` sections (one `w:sectPr` per section with start type, landscape, `pgNumType` format and start, header references only for unlinked sections, `w:evenAndOddHeaders`, even headers written); unit `paginate` page faces (1, i, I, a, A; first and even pages; numbering on and from a start). Later: reading sections from an imported .docx |
| 11.4 | Text and picture watermarks show behind every page and print (U58) | e2e `sections` | **Pass** for text 2026-10-29: e2e `sections` 11.4 (Insert > Watermark…: empty text refused with a message; CONFIDENTIAL in Red, diagonal, on all four pages including the blank one before an even section, behind the text; saved to disk; in the PDF on every page, turned; Pageless shows none and keeps it; Remove watermark takes it off); unit `format` (watermark and columns cleaned). Later: picture watermarks; watermarks in .docx |
| 11.5 | Line numbers, offline hyphenation and drop caps show and print (U59, A14) | e2e `sections` with the network off | **Later** 2026-10-29: moved at the stage 11 review (the plan's rule: hyphenation and drop caps go first when a stage runs over; line numbers with them, as one layout feature) |
| 11.6 | Pageless keeps every section setting and shows one flow (U13) | e2e `sections` | **Pass** 2026-10-28: e2e `sections` (Pageless: no sheets, the three breaks still marked, one width; back to Pages the landscape section and Page 4 of 4 return) |
| 11.7 | Repagination with sections and columns stays ≤ 16 ms on 50 pages (§7) | `pnpm perf` | **Pass** for sections 2026-10-29: `pnpm perf` "Repagination with sections" p95 9.1 ms, median 7.2 ms (budget 16) over 13 sections of every kind with landscape pages, own headers and numbers, 57 pages (baseline `repaginate50Sections`). Columns are measured again when I11b lays them out |

### Stage 12: Tables, code and equations

A person can build real tables, write highlighted code and typeset maths.

- **Delivers:** U60–U62
- **Settles:** A11, A17, O13, O16
- **Try it:** a 4×6 table → merge the top row → widen a column by dragging → shade the header and repeat it → add rows until it runs over a page → it breaks between rows with the header repeated → a JavaScript code block highlights → Alt+= and `\frac{a}{b}` → Download Word: the table and the equation are there.

| # | Done when | Evidence | Result |
|---|---|---|---|
| 12.1 | Merge, split, widths (drag and dialog), alignment, borders, shading, padding, vertical alignment, text to table and back, distribute, sort; all in .docx and HTML (U60) | unit `tables`; e2e `tables` | **Partial** 2026-10-29: e2e `tables` (Insert > Table > 4 × 4; drag across two cells and Format > Table > Merge cells joins them with both texts, Split cell parts them, and Undo returns each; Header row makes the top row a header, shown checked; Cell shading > Light blue on the dragged header cells; Vertical alignment > Middle; dragging a column edge 80 px wider widens it and saves `colwidth`; Distribute columns makes every column equal, one Undo step; Format > Table > Table properties on two dragged cells refuses a 40 in width with a message, then sets their columns to 1.5 in (144 px), 6 pt padding and a 1½ pt blue border on just those cells, one Undo step; Word has the grid with those two columns at 2160 twips, the cells' `w:top` 1½ pt blue borders and `w:tcMar` 6 pt, `w:shd` fills, `w:vAlign` and `w:tblHeader`; the web page has the `col` widths, shading and alignment; screenshot reviewed); unit `tables` (HTML keeps and reads back widths, shading, alignment and merges; shading pasted as `rgb()` or `#rgb`; Word's grid, `w:tcW`, `w:gridSpan`, `w:shd`, `w:vAlign`; no widths fill the line; cell borders, no border and padding in HTML and Word); sorting rows is 9.6. Later: table alignment on the page, text to table and back |
| 12.2 | Long tables break between rows with header rows repeated, the same on screen and in the PDF; a row taller than a page breaks inside it when A10 holds, and overflows otherwise (U60, A11) | e2e `pagination` table fixture | **Pass** for rows 2026-10-29: e2e `pagination` 12.2 (a 111-row table over 13 pages breaks only between rows, never through the cell spanning rows 40 and 41, with no more room left at a page foot than the tallest row; the break spans the page; the header row is repeated at the top of every page it continues on and can't be edited there; editing the header changes every copy; the PDF has the same pages with the same rows and the header on each; Word marks it `w:tblHeader`); unit `paginate` long tables (the rest starts below the repeated header; a row taller than the room under it overflows without looping). Later: a row taller than a page breaking inside it (it overflows the page now, as before) |
| 12.3 | Code blocks highlight by language, and keep the language in Markdown export (U61) | e2e `code`; unit `export` | **Pass** 2026-10-29: e2e `code` (```` ```js ```` and a space starts a JavaScript block coloured as typed, keywords, numbers, strings and comments in the `color.code-*` tokens; the picker at the top right changes the language and colours again, as one Undo step; Plain text has no colours and Automatic lets highlight.js guess; typing in the block is unchanged by the colours; Markdown has ```` ```typescript ````, the web page `class="language-typescript"`, the PDF the code without the picker; in Viewing the picker is off); unit `code` (Markdown and HTML keep the language, ```` ```ts ```` stays `ts`; text export). Fixed: a Markdown import added a blank line to the end of every code block. lowlight MIT, highlight.js BSD-3. Later: colours in Word (it has the code in Consolas, uncoloured) |
| 12.4 | Inline and display equations from LaTeX draw as typed, show a readable error for bad input, and export as OMML (.docx), MathML (HTML) and `$…$` (Markdown) (U62, A17) | unit `equations`; e2e `equations` | **Pass** 2026-10-29: e2e `equations` (Insert > Equation… or Alt+= with a live preview; `\frac{a}{` shows "Can't read this: …" and Insert stays off; on an empty line the equation sits on its own line, centred; typing `$e^x$` makes an equation while "costs $5 or $6." stays text; a click opens it again and Apply changes it; saved to disk as LaTeX; Word has 3 `m:oMath`, the web page 3 `<math>`, Markdown `$…$` and `$$…$$`, the PDF draws ∑); unit `equations` (ten common equations to OMML with fractions, roots, sums, powers and matrices; bad LaTeX falls back to Cambria Math text; HTML and Markdown round trips, dollar signs kept). KaTeX MIT; OMML from docx's own `latexToMath` |
| 12.5 | A .docx with equations opens in Word with editable equations (A17) | owner try-it | Needs owner: open `docs/product/try-it/equations.docx` (ten equations, written by `PDOC_TRY_IT=<folder> pnpm vitest run packages/core/test/equations.test.ts`) in Word and click one: it should open in Word's equation editor |

### Stage 13: Review power

A person can review like in Word: formatting suggestions, Commenting mode, a document that always suggests, changes by reviewer, comparing documents, and Word's comments and tracked changes both ways.

- **Delivers:** U63–U67
- **Settles:** A4, A15, O6
- **Try it:** Suggesting → bold a word → a "Formatted: Bold" suggestion → reject → plain again → Always suggest in this document → reopen → it's in Suggesting → Tools > Compare documents against an older copy → a new document of suggestions → open a .docx from Word with comments and tracked changes → they're comments and suggestions.

| # | Done when | Evidence | Result |
|---|---|---|---|
| 13.1 | Formatting changes in Suggesting are suggestions; accept all gives the suggested formatting and reject all the original, exactly (U63, A15) | unit `suggestions`; e2e `review` | **Pass** 2026-10-29: e2e `review` (in Suggesting, Bold and Ctrl+Alt+1 make two cards, "Formatted: Bold on …" and "Formatted: Heading 1 on …"; the text shows a dotted outline in All markup and a margin bar in Simple; Reject puts the old formatting back and Ctrl+Z brings the suggestion back, one step per decision; accept all equals the same edits made in Editing and reject all the original, exactly); unit `suggestions` (accept and reject by id; formatting undone by hand is no change; comment and link marks are not formatting; labels such as "Not bold", "Size: 14pt", "Align centre"). Inserted and deleted text just takes the formatting |
| 13.2 | Commenting mode blocks typing but not comments; Always suggest holds after reopening (U64) | e2e `review` | **Pass** 2026-10-29: e2e `review` (Commenting in the toolbar blocks text, Enter, Backspace, Bold and Undo while allowing a new anchored comment; Tools > Review > Always suggest in this document switches to Suggesting and survives quitting and reopening; Editing asks to turn it off, Cancel keeps it on, Turn off preserves existing suggestions and persists). Unit `format` checks persistence and older documents defaulting off; typecheck and design lint clean; screenshots reviewed |
| 13.3 | Reviewer filter shows only the ticked reviewers, and accept and reject all act on what's shown (U65) | unit `suggestions`; e2e `review` | **Pass** 2026-10-29: Everyone menu in the panel lists checked reviewers; unticking both shows no suggestions and disables bulk decisions, selecting Ann shows only hers, Accept 1 shown preserves Bob's pending suggestion, Everyone restores it, and Reject all then removes only Bob's text. Resolved comments disable bulk decisions. Unit `suggestions` checks exact reviewer names, Everyone, none, unknown and multiple reviewers; resolving filtered ids leaves hidden changes untouched. Comments stay visible; screenshots reviewed |
| 13.4 | Compare makes a new private document whose accept all gives the revised text and reject all the original, exactly (U66) | unit `compare`; e2e `compare` | **Pass** 2026-10-29: core `compare` exact JSON round trips through accept and reject, including block additions/deletions and formatting. e2e `compare` 2/2: Tools > Compare documents from the library or an external file creates a private comparison in All markup, never imports the external file into the library, refuses the same document twice, and accepts/rejects exactly with Undo. Word export refuses unresolved whole-block comparisons with an actionable message; unit `review-docx` checks refusal, nested changes and export after accept/reject |
| 13.5 | Word comments (with replies and resolved state) and tracked changes (author and time) come in from .docx; a fixture's moves and table and property changes come in as comments with "*n* changes kept as comments"; comments, suggestions and formatting suggestions go out as Word comments and tracked changes and come back (U67) | unit `review-docx`, `cli` | **Pass** 2026-10-29: unit `review-docx` (a Word fixture's comments with replies and resolved state, and insertions and deletions with author and time, come in as threads and suggestions; accept all gives Word's accepted text and reject all its original; a move and a table row come in as 2 comments, applied as Word shows them; Word's run and paragraph formatting changes come in as formatting suggestions: "Bold", "Not italic", "Heading 1"; comments, replies, resolved state, suggestions and formatting suggestions go out as Word comments, `w:ins`, `w:del`, `w:rPrChange` and `w:pPrChange` and come back with the same author, time, accept and reject); unit `cli` (import says "2 changes kept as comments", JSON `kept`). Only bold, italic, strike, superscript and subscript and the paragraph style and alignment are read from Word's old formatting; changes to anything else show as no change |
| 13.6 | Comparing two 50-page documents ≤ 1 s (§7) | `pnpm perf` | **Pass** 2026-10-29: comparison of two 51-page documents (every fourth paragraph revised), from request through saving and drawing the new private document, p95 844.3 ms, median 518.5 ms over 5 runs (budget 1 s). Long-table repagination (111 rows, repeated header, row-spanning cell, 13 pages) p95 2.3 ms over 40 edits (budget 16 ms); baseline records both |

### Stage 14: Citations, index and fields

A person can cite sources in a recognised style, index a long document, and insert live fields and dates from a menu at the cursor.

- **Delivers:** U68–U70
- **Settles:** O14
- **Try it:** Insert > Citation → add a book and an article → cite both → Insert > Bibliography → switch APA to MLA → both change → mark three index entries → Insert > Index with page numbers → type @ → Date → today's date chip → @Page count in the footer.

| # | Done when | Evidence | Result |
|---|---|---|---|
| 14.1 | Citations and the bibliography format correctly in APA 7, MLA 9 and Chicago author-date for each source type, and change together with the style (U68) | unit `citations` against reference examples; e2e `citations` | |
| 14.2 | Index entries and subentries give an alphabetical index with the PDF's page numbers (U69); the 10.6 settling check passes again with index fields added to its fixture | unit `index`; unit `paginate`; e2e `references` | |
| 14.3 | The @ menu filters as you type and inserts each item; date chips, fields and variables stay current and export as text (U70) | e2e `insert-menu`; unit `fields` | |

### Stage 15: Navigation and windows

A person can move around a long document fast, see pages their way, use two windows, and listen to the text.

- **Delivers:** U71–U74
- **Try it:** Ctrl+G → Page 12 → there → collapse a long section by its chevron → promote a Heading 3 in the outline → View > Zoom > Two pages → File > New window → open another document there → Tools > Read aloud → it reads from the cursor.

| # | Done when | Evidence | Result |
|---|---|---|---|
| 15.1 | Go to reaches pages, headings, bookmarks, comments, notes and sections (U71) | e2e `navigate` | |
| 15.2 | Collapsing hides a section on screen only; print and export keep it; promote and demote move subheadings too (U71) | e2e `navigate`; e2e `outline` | |
| 15.3 | Page width fits the page to the window's width; Whole page shows one whole page; Two pages shows pages *n* and *n+1* side by side at the same scale (U72) | e2e `navigate` | |
| 15.4 | A second window opens; the same document is never open in two windows; both save safely (U73, P1) | e2e `windows` | |
| 15.5 | Read aloud starts, pauses and stops, highlighting the sentence; with no voice it says so (U74) | e2e `read-aloud` (speech stubbed in tests); owner check with the network off | |

### Stage 16: Library, files and proofing

A person can find and organise documents, start from templates, describe documents, spell in their language, check accessibility, and export to every format Docs offers.

- **Delivers:** U75–U80
- **Try it:** star a document → it's under Starred → New folder "Clients", drag two documents in → File > New from template > Report → File > Details: add keywords → Download EPUB and .odt → open them in a reader and LibreOffice → Tools > Accessibility check → add the missing alt text it finds.

| # | Done when | Evidence | Result |
|---|---|---|---|
| 16.1 | Open recent, star, sort and folders work; folders sync; a document moved into a folder keeps its history, named versions and images; moving a folder to Public asks first with the document and image counts, and Cancel leaves the public repository unchanged (U75, P6) | unit `library`; e2e `library`; e2e `privacy` | |
| 16.2 | Details are saved in the document and appear in .docx, PDF, EPUB and HTML metadata (U76) | unit `export`; e2e `files` | |
| 16.3 | Templates: the built-ins and own templates (saved in the private repository) start new documents (U77) | e2e `templates`; unit `library` | |
| 16.4 | A chosen spelling language marks words in that language; an added word stays unmarked after a restart; Ignore applies only in this document (U78) | e2e `spelling` | |
| 16.5 | The accessibility check finds each listed problem in a fixture and Go to reaches it; the fixes work: Alt text opens the field, a skipped level becomes the next level down, a table's first row becomes its header row, and Add a title focuses the title (U79) | unit `a11y`; e2e `a11y` | |
| 16.6 | EPUB, .odt and .rtf exports open in their readers with headings, lists, tables and images; PDFs have the heading outline and links (U80) | unit `export` (EPUB and ODT validated, RTF parsed); e2e `import-export` | |

### Stage 17: Install

A person can install P-Doc on Windows, or run it portable, and it starts and works.

- **Delivers:** all, packaged
- **Try it:** run `release\P-Doc-Setup-<version>.exe` → choose a folder → P-Doc starts at the first run; or run the portable `.exe` directly.

| # | Done when | Evidence | Result |
|---|---|---|---|
| 17.1 | `pnpm package` builds an NSIS installer and a portable exe with the app icon and fuses set | build output; `release/` listing | |
| 17.2 | The packaged app starts, shows the first run, makes a document offline and saves it | e2e `packaged` against the unpacked build | |
| 17.3 | The installed `pdoc` command works from a terminal (U38) | e2e `packaged` runs `pdoc list --json` | |
| 17.4 | Code signing | owner (certificate) | Needs owner |

**Depends on:** a code-signing certificate for 17.4 (owner).

## 3. Order by value and risk

Stage 1 proves the core promise (P1–P3) soonest and everything else builds on it. Stage 2 settles the riskiest assumption (A1) next. Stage 3 completes P1 (versions) and is the base for sync. Stage 4 (review) is independent of 3 and 5. Stage 5 depends on 3 (commits to push). Stage 6 depends on 1 and 2 (page setup for .docx and PDF).

The parity stages (7–16, from the [parity audit](parity.md)) come after stage 6 and before Install, because packaging is cheap to redo and every parity stage changes what gets packaged:

- **7, Images** comes first: A6 failed, so the document format changes, and every later image feature (wrap, captions, templates) builds on it. Its integrity row (7.2) is written before the code.
- **8, Styles and lists** and **9, Paragraph layout** are the tools a writer uses daily (J15); 9 settles A10 (split paragraphs), which 10–12 also need.
- **10, References**, **11, Sections and page layout** and **12, Tables, code and equations** carry the pagination risks (A8, A12, A13, A11); each starts with a spike that proves its risk, or takes the fallback in the register.
- **13, Review power** finishes P5 and the exchange with Word users (J16).
- **14–16** are the long tail: scholarly tools, navigation, the library and files.
- Every stage from 8 to 16 re-runs the 8.6 sweep (toolbar at 1280 px, every new command in command search; A16) and a round-trip test proving unknown attributes survive (A18).
- **17, Install** packages all of it. A packaging check runs early (after stage 6) so surprises show before then.

## 4. Against the promise

To be written after the stages run: the gaps, in the order they block a real writer, and who each waits on. Known before building: a real GitHub sign-in (5.7), code signing (17.4) and opening exported equations in Word (12.5) wait on the owner.
