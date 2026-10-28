# P-Doc: spec

P-Doc is a desktop word processor (Electron, Windows first) for people who write documents that matter: proposals, reports, specs, papers. It takes the calm, always-saved editing and review modes of Google Docs and the structure of Microsoft Word (styles, navigation pane, track changes, real print layout), and stores every document as a plain file in the writer's own Git repositories: one private and one public on their GitHub, and fully usable offline. First run, sign-in, repository setup and packaging follow Focus Notes' proven patterns.

> **TL;DR.**
> - **The promise:** Write and review real documents with Docs' ease and Word's structure, in files you own, with every version kept, online or not.
> - **Who:** a single writer (sometimes reviewing others' text) on Windows; agents and scripts through the `pdoc` CLI.
> - **What a person can do:** write with styles and see it save (U1–U12); lay out true pages or go pageless and print or export (U13–U20); suggest, comment and review changes (U21–U27); see, compare, name and restore any version, and keep documents private or public on GitHub (U28–U38).
> - **How:** Electron shell + React/TipTap editor; documents are `*.pdoc.json` files in two local Git repositories (`private/`, `public/`) that sync to `<login>/p-doc-private` and `<login>/p-doc-public`.
> - **Riskiest assumption:** A1, that block-level pagination in a live editor is accurate enough that print/PDF output matches what the writer saw. Confirmed when a 20-page fixture prints with the same page count and page-start blocks as the screen.
> - **Success:** PD1 nothing is ever lost (autosave + versions + offline); PD2 a document round-trips through .docx; PD3 a fresh install reaches a first saved document in under a minute, signed in or not.
> - **Open:** O3 per-section orientation (working default: whole-document only); O9 real-time co-editing (non-goal).

Research behind this spec: [Google Docs KB](../research/index.md) (observed with Stagehand: EV-001 to EV-003; 42 features, 10 rules) and [Microsoft Word KB](../research/index.md) (documentation: 30 features, 10 rules). References use `GD F-###` / `W F-###` for features and `GD R-###` / `W R-###` for rules.

## 1. The customer promise

Write and review real documents with the ease of Google Docs and the structure of Word, in files you own, with every version kept, online or not.

| # | Promise | What breaks it |
|---|---|---|
| P1 | **Nothing is lost.** Every change is saved within seconds without a Save step, and every earlier state can be found again. | A crash or close loses typing; a version can't be found; a sync overwrites newer work. |
| P2 | **Yours, offline first.** Documents are plain files in your Git repositories on your computer and on your own GitHub; P-Doc works fully without a network or an account. | A feature needs the network or a P-Doc server; files can't be read without P-Doc. |
| P3 | **Structure without clutter.** Styles, outline, page layout, headers, page numbers and a live table of contents, behind one calm toolbar and menus you can search. | A common task needs a hunt through panels; the outline or contents are stale. |
| P4 | **What you see is what prints.** Pages mode shows the same pages that print and export. | Printed or PDF page breaks differ from the screen. |
| P5 | **Review without losing the original.** Suggest edits, comment, and accept or reject changes one by one or all at once. | A suggestion can't be told from the original; accepting changes the wrong text. |
| P6 | **Private by default, public on purpose.** A document is public only when the writer moves it there, and P-Doc says so before it happens. | A private document ends up in the public repository or public on GitHub. |

**Not promised (non-goals):** real-time co-editing, sharing permissions and presence (GD BR-001, W BR-001); Google- or Microsoft-only services (smart chips to Drive people, Explore, translate, voice typing; GD BR-002); mail merge; macros and add-ins; mobile and web versions; Mac and Linux packages in this release (the code stays portable).

## 2. Scenarios and jobs to be done

| # | When I… | I want to… | So I can… | Serves |
|---|---|---|---|---|
| J1 | have something to write | open the app and start typing at once | keep the thought | P1, P3 |
| J2 | am writing a long document | give it structure with headings and jump or move sections | stay oriented and reorganise fast | P3 |
| J3 | need a deliverable | set paper, margins, headers and page numbers and get a PDF or .docx | hand it over looking right | P3, P4 |
| J4 | am drafting freely | hide pages and write on a wide, continuous canvas | focus on words, not layout | P3 |
| J5 | review my own or someone's text | propose edits and notes without destroying the original | decide later, change by change | P5 |
| J6 | changed something by mistake, or want an older take | see past versions, compare them and restore one | undo a bad day | P1 |
| J7 | finish a milestone | name the version | find it again quickly | P1 |
| J8 | am on a plane or offline | keep working with everything, and have it sync later | not depend on the network | P2 |
| J9 | want to publish or share a document | put it in my public repository on purpose | link to it on GitHub | P2, P6 |
| J10 | receive or must send Word files | import and export .docx (and Markdown, HTML, text, PDF) | work with others' tools | P2, P4 |
| J11 | use more than one computer | get the same documents on each, signed in to GitHub | carry on where I left off | P1, P2 |
| J12 | automate (scripts, agents) | list, export, import and read history from the command line | build on my documents | P2 |

## 3. What a person can do

**Writing and structure**

| # | A person can… | Jobs | From |
|---|---|---|---|
| U1 | create a document and type at once; it saves itself and the save state says so | J1 | GD F-036, GD R-001 |
| U2 | format characters: bold, italic, underline, strikethrough, superscript, subscript, font, size, text colour, highlight, clear formatting | J1 | GD F-001, W F-001 |
| U3 | apply paragraph styles (Normal, Title, Subtitle, Heading 1–4, Quote, Code) from the toolbar or with shortcuts | J2 | GD F-002, W F-002 |
| U4 | change a style for the whole document by "Update to match" the selection, and reset styles | J2 | GD F-002, W F-002 |
| U5 | align, indent, set line spacing (single, 1.15, 1.5, double) and space before/after | J1 | GD F-004, W F-003 |
| U6 | make bulleted, numbered and checklist lists, with nesting | J1 | GD F-003 |
| U7 | insert links, images (file, paste, drop), tables (grid picker; add/remove rows and columns), horizontal lines, page breaks, special characters | J1 | GD F-010–F-013, W F-030 |
| U8 | see an outline of headings, jump to one, collapse levels, and drag a heading to move its whole section | J2 | GD F-022, W F-010, W R-006 |
| U9 | insert a table of contents that stays current by itself | J2 | GD F-024, W F-011 (improves GD R-009, W R-007) |
| U10 | find (Ctrl+F) and find and replace (Ctrl+H) with match case, whole words and regular expressions | J1 | GD F-008, W F-004, W R-010 |
| U11 | find any command by name (Alt+/), and see every shortcut (Ctrl+/) | J1 | GD F-025, GD F-041, W F-025 |
| U12 | see word and character count (Ctrl+Shift+C) and spelling suggestions | J1 | GD F-037, W F-027 |

**Layout, print and files**

| # | A person can… | Jobs | From |
|---|---|---|---|
| U13 | switch between Pages and Pageless, and choose text width in pageless | J3, J4 | GD F-016, GD R-003 |
| U14 | set paper size, orientation, margins and page colour, and make them the default | J3 | GD F-017, GD R-004, W F-008 |
| U15 | add a header and footer with page numbers and page count, with a different first page | J3 | GD F-018–F-019, W F-007 |
| U16 | print, and export a PDF that matches the pages on screen | J3 | GD F-034, P4 |
| U17 | export to .docx, Markdown, HTML and plain text | J10 | GD F-033 |
| U18 | import .docx, Markdown, HTML and text as a new document | J10 | W F-023 |
| U19 | zoom, go full screen, hide the menus (compact), and use a focus view with only the page | J4 | GD F-026, W F-028 |
| U20 | choose light, dark or system appearance | J1 | craft rule 5 |

**Review**

| # | A person can… | Jobs | From |
|---|---|---|---|
| U21 | switch between Editing, Suggesting and Viewing modes | J5 | GD F-029 |
| U22 | in Suggesting, have insertions and deletions recorded as suggestions with author and time | J5 | GD R-005, W R-003 |
| U23 | choose how changes show: Simple markup, All markup, No markup, Original | J5 | W F-014, W R-005 |
| U24 | accept or reject a change, step to the next or previous, or accept/reject all | J5 | GD F-028, W R-004 |
| U25 | comment on a selection, reply, edit, resolve, reopen and delete | J5 | GD F-027, W F-017, GD R-008 |
| U26 | see all comments and changes in one panel, filtered by open or resolved, and jump to each | J5 | W F-016 |
| U27 | read the document in Viewing mode without changing it | J5 | GD F-029 |

**Versions, storage and GitHub**

| # | A person can… | Jobs | From |
|---|---|---|---|
| U28 | open version history and see versions grouped by day | J6 | GD F-031, W F-021 |
| U29 | open a version and see what changed compared with the current text | J6 | GD F-031 |
| U30 | restore a version, keeping everything in between | J6 | GD R-006, W R-009 |
| U31 | name the current or an earlier version, and filter to named versions | J7 | GD R-007 |
| U32 | make a copy of a document or of an old version | J6 | GD F-032 |
| U33 | browse the library: Private and Public documents, recent first, with search; rename, copy, delete to a recoverable bin | J1 | GD F-032 |
| U34 | work fully offline, with a status that says what is waiting to sync | J8 | GD F-035, P2 |
| U35 | connect GitHub in the first run or later: sign in, set identity, create or reuse the two repositories | J11 | Focus Notes first run |
| U36 | have documents sync to GitHub on their own, and sync now on demand | J11 | Focus Notes sync |
| U37 | move a document between Private and Public, with a clear warning before it becomes public | J9 | P6 |
| U38 | list, import, export and read history from the `pdoc` command line with JSON output | J12 | craft agent path |

## 4. Task flows

Waits name their class from the perceived-performance skill: *instant* (< 100 ms), *responsive* (< 300 ms), *in-flow* (< 1 s with a sign in place), *background* (any length, never blocks).

### 4.1 First run (U35)

1. **Welcome.** The window opens on one card: "P-Doc", "Write documents you own. Every version kept, online or not.", and two buttons: **Connect GitHub** (primary) and **Use offline**. *(instant)*
2. **Use offline** creates the library (`Documents\P-Doc\private` and `Documents\P-Doc\public`, each a Git repository on `main`) and opens a new blank document. *(in-flow; "Setting up your library…")*
3. **Connect GitHub** goes to the **Git** step: checks Git (≥ 2.40). Missing: "P-Doc needs Git to keep versions." with **Get Git** (opens git-scm.com) and **Check again**. *(responsive)*
4. **Sign in** step: if Git's helper already has a GitHub credential, "Signed in as @login" with **Continue** and **Use another account**. Otherwise **Sign in with browser** (Git Credential Manager or the GitHub CLI) and **Paste a token** (needs the `repo` scope). Progress says "Waiting for GitHub in your browser…" and shows the device code when the helper gives one. *(background with a sign; Cancel always shown)*
5. **Identity** step: name and email for versions, prefilled from Git or the GitHub account (the noreply address is suggested). *(instant)*
6. **Repositories** step: "Your documents live in two repositories on your GitHub." Rows: `p-doc-private` **Private** and `p-doc-public` **Public**, each with its state: "Will be created", "Found, will be used", "Ready". **Set up** runs the steps (find or create the repository, clone or init locally, set the remote, first push); each step is idempotent and resumes after quitting. *(background; a tick per step)*
7. **Done**: "You're set. Documents sync to GitHub when you're online." opens the library with a new document ready.

**Branches:** offline during setup → "You're offline. Setup continues when you're back, or use P-Doc offline now." with **Use offline** and **Try again** (the library works at once; **Settings > GitHub > Finish connecting** picks setup up at the step that stopped); a repository with that name exists but isn't a P-Doc library → "A repository named *name* already exists and isn't a P-Doc library." with **Use it anyway** and **Choose another name**; token without the scope → "This token can't create repositories. It needs the repo scope."; quit half-way → the next start resumes at the step that stopped.

**Defaults:** library folder `Documents\P-Doc` (Settings > Storage); repository names `p-doc-private` and `p-doc-public` (editable in the Repositories step); new documents go to Private.

**Agent path:** `pdoc setup --offline [--library <dir>] --json`; exit 0 done; exit 3 "a person must act" with `{"needs":"sign-in"}` when GitHub is requested.

### 4.2 Write a document (U1–U12)

1. **New document** (Ctrl+N, File > New, or **New** in the library) opens in Private with the title "Untitled document" and the cursor in the page. *(instant)*
2. Typing shows at once; 800 ms after the last change the document is written to disk and the save state goes "Saving…" → "Saved to this computer" (or "Saved · synced" once its last version is pushed). *(responsive)*
3. Editing the title field renames the document; Enter returns to the page.
4. Styles from the style picker or Ctrl+Alt+0 (Normal) and Ctrl+Alt+1–4 (Heading 1–4); the outline follows. *(instant)*
5. Closing the window or switching documents writes at once and makes a version if anything changed since the last one. *(responsive)*

**Branches:** the disk is full or the folder is gone → save state "Couldn't save. Retrying…" in the error colour and a banner "P-Doc can't write to *folder*. Your text is kept; free space or choose another folder." with **Choose folder**; P-Doc keeps a recovery copy of unsaved text in its data folder and restores it on the next start with "Recovered unsaved changes to *title*."

**Defaults:** Normal style: system sans (Aptos, Calibri, Segoe UI) 11 pt, line spacing 1.15, 8 pt after; Letter paper in en-US, A4 elsewhere; 1 in (25.4 mm) margins; Pages mode.

**Agent path:** `pdoc new "Title" [--public] --json` → `{"id","path"}`; `pdoc list --json`.

### 4.3 Structure and navigate (U8, U9)

1. The left panel's **Outline** lists headings indented by level; the heading containing the cursor is marked. A click jumps there. *(instant)*
2. A heading with children has a chevron to collapse them in the outline.
3. Dragging a heading row onto another heading's place moves the heading and everything up to the next heading of the same or higher level. Ctrl+Z restores. *(instant)*
4. **Insert > Table of contents** adds a block listing Heading 1–3 as links; it rebuilds whenever headings change. A click on an entry jumps there.

### 4.4 Lay out pages, print and export (U13–U17)

1. **View > Pages / Pageless**. Pageless has no page edges and a text width from **View > Text width** (Narrow 640 px, Medium 800 px, Wide 960 px, Full width), with half an inch of space either side of the text. Text width is greyed out in Pages, where the paper sets the width. Headers, footers and page numbers are hidden, not deleted (GD R-003), and printing or a PDF from Pageless has none.
2. **File > Page setup** dialog: Pages or Pageless; Orientation (Portrait, Landscape); Paper size (Letter, Legal, A4, A5, Tabloid); Margins top, bottom, left, right (inches or cm by locale); Page colour; **Set as default**, **Cancel**, **Apply**. *(instant; pages reflow in-flow)*
3. **Insert > Header and footer**: header and footer text fields with "Different first page", and the tokens "Page number" and "Page count". They repeat on every page.
4. **File > Print** (Ctrl+P) prints the pages as shown. **File > Download > PDF** writes a PDF with the same paper, margins, header, footer and breaks. *(in-flow; "Making PDF…")*
5. **File > Download > Microsoft Word (.docx), Markdown (.md), Web page (.html), Plain text (.txt)** → save dialog → file written → toast "Saved *name*" with **Show in folder**.

**Branches:** export fails → toast "Couldn't export: *reason*." with **Try again**.

### 4.5 Suggest and review (U21–U27)

1. The mode switcher at the right of the toolbar (it never moves into **More**), also View > Mode: **Editing** (Ctrl+Alt+Shift+Z), **Suggesting** (Ctrl+Alt+Shift+X), **Viewing** (Ctrl+Alt+Shift+C). Suggesting and Viewing show a badge in the title bar.
2. In Suggesting, typed text is underlined in the insertion colour; deleted text stays visible and struck through in the deletion colour. One colour pair for every author; the author is on the card. Formatting changes apply directly (O6).
3. **View > Markup**: Simple (changes shown applied, a bar in the margin), All (inline insertions and strikethroughs), No markup (as if all accepted), Original (as if all rejected). No markup and Original are read-only; the status bar says which is on with a link back to All. *(instant)*
4. **Review panel** (Tools > Review changes, or the review button in the title bar, which shows the open count): a right panel listing changes and comment threads in document order with author, time and excerpt; **Accept** / **Reject** on changes; **Reply** and **Resolve** on comments. Header: counts, **Previous**, **Next**, **Accept all**, **Reject all**, filter **Open / Resolved**. Selecting an item selects its text. Accept or reject moves to the next (W R-004). The Review and Version history panels replace each other. *(instant)*
5. **Comment**: select text, Ctrl+Alt+M, Insert > Comment or the toolbar comment button → a card in the panel with a text box, **Comment** and **Cancel** (Ctrl+Enter posts, Esc cancels). The text is highlighted while you write. **Resolve** removes the highlight and keeps the thread under Resolved (GD R-008); **Reopen** brings it back. A thread's menu has **Edit** (your own comments) and **Delete** (asks first); a reply's menu the same.

**Branches:** no selection → the comment anchors to the word at the cursor, or "Select some text to comment on." between words; the commented text is deleted → the thread stays, marked "Text deleted." and listed last; Viewing → typing, accept and reject do nothing and the badge says "Viewing", but comments still work.

**Defaults:** author is the Git identity name; markup All; mode Editing for each document opened.

### 4.6 Versions (U28–U32)

1. P-Doc commits a document when the writer pauses 60 s after a change, when the window closes or switches document, and at least every 10 minutes while typing. Message: "Edit *title*". Nothing is committed when the text is unchanged. *(background)*
2. **File > Version history** (Ctrl+Alt+Shift+H), **View > Version history**, or a click on the save state in the title bar opens the history panel at the right (an overlay at narrow widths). Opening it commits the current text first, so the top row is always "**Current version** · *time*". Versions are grouped by Today, Yesterday, then dates; each row shows time, author and name if named. Toggle **Only named versions**. Focus starts on **Close version history**. *(responsive; skeleton rows)*
3. Selecting a version shows it read-only over the page with differences **since that version**: text added since is highlighted green, text removed since is struck through red (decision: compare the old version to the current text, as Google Docs does). A banner: "Viewing the version from *time* (*name*)." with "Since then: *n* words added, *m* removed.", a legend, and **Restore this version**, **Make a copy** and **Back to current**. Selecting the top row, or Esc, goes back to the current text; Esc again closes the panel. *(in-flow)*
4. **Restore this version** (banner or row menu) → confirm "Restore the version from *time*? The current version stays in history." → edits not yet in a version are committed first; the old text becomes current as a new version "Restore *YYYY-MM-DD HH:MM*", keeping the document's id and created date (GD R-006).
5. **Name this version** (row menu, or File > Version history > Name current version) → an inline field (Enter saves, Esc cancels); saved as an annotated Git tag `pdoc/<file>/<sha>`; named versions show the name first. **Rename this version** and **Remove name** in the row menu.
6. **Make a copy** (banner or row menu) → a new Private document "Copy of *title*" with that version's text, committed as "Copy *title* from *time*"; a toast offers **Open**.

**Branches:** no versions yet → "No earlier versions yet. Versions are made as you write."; Only named with none named → "No named versions yet. Name one from its menu."; Git missing → "Install Git to keep versions."; the history can't be read → the error with the panel still usable.

**Agent path:** `pdoc history <doc> --json`; `pdoc export <doc> --version <sha> --to md`.

### 4.7 Library, privacy and sync (U33, U34, U36, U37)

1. **Library** (left panel tab, Ctrl+O): **Private** and **Public** sections listing documents by last edited, with search. A row shows title, edited time and sync state. Row menu: Open, Rename, Make a copy, Move to Public / Move to Private, Show in folder, Delete.
2. **Delete** moves the file to the repository's `.bin/` (committed), recoverable from **Bin** at the end of the library.
3. **Move to Public** → dialog: "Make *title* public? Anyone can read it and its history on GitHub from the next sync." with **Move to Public** (warning style) and **Cancel**. The file is moved to `public/` and removed from `private/`, a version in each. Moving back says "Copies already synced stay in the public repository's history."
4. Sync runs after each version when online and every 5 minutes; **File > Sync now** (Ctrl+Alt+S) makes a version of any unsaved edits and runs it at once. The status bar says "Synced", "Syncing…", "Offline · *n* versions waiting", "Not connected to GitHub" or "Sync problem" (click for details); a click on "Not connected to GitHub" opens Settings, on the others it syncs now. A library row whose latest text isn't on GitHub yet says "Not synced yet".
5. When the same document changed on two computers, P-Doc keeps this computer's version and saves the other beside it as "*title* (from GitHub *date*)", and says "Two versions of *title* were edited apart. Both are kept." Nothing is overwritten silently.

### 4.8 Import (U18)

1. **File > Open from file** (Ctrl+Shift+O) accepts .docx, .md, .html, .txt and .pdoc.json, or drop a file on the window → a new Private document with the content and the file name as its title. *(in-flow; "Importing…")* Unsupported .docx parts give "Imported. Some parts (text boxes, embedded objects) were left out."

## 5. Views

| View | Layout | Serves | Regions and data |
|---|---|---|---|
| V1 Editor window | Title bar 44 px; menu bar 30 px; toolbar 40 px pill; left panel 280 px (collapsible); page area; right panel 340 px when open; status bar 28 px | U1–U32 | Title bar: app mark, title field, save state, mode badge, review and history buttons, account. Menu bar: File, Edit, View, Insert, Format, Tools, Help. Status bar: page *n* of *m*, words, mode, sync status, zoom. |
| V2 Toolbar | One row of groups with separators; overflow menu "More" at narrow widths | U2–U7, U10, U21 | Command search · undo, redo, print · zoom · style picker · font · size − value + · B I U S · text colour · highlight · link · image · table · align · line spacing · checklist · bullets · numbering · indent − + · clear formatting · comment ·· mode switch. Each button's name includes its shortcut (GD R-010). |
| V3 Left panel | Tabs **Library** and **Outline** | U8, U33 | Library: search, New, Private and Public sections, Bin. Outline: heading tree with chevrons and drag. |
| V4 Page area | Grey canvas; pages centred with a 16 px gap and shadow (Pages), or one sheet (Pageless) | U1, U13–U15 | Header and footer with page numbers; page breaks; comment and change highlights. |
| V5 Review panel | Right panel | U23–U26 | Counts, Previous/Next, Accept/Reject all, filter, cards. |
| V6 Version history panel | Right panel | U28–U32 | Grouped list, named filter; viewing banner over the page. |
| V7 Dialogs | Modal, 420–640 px | U4, U10–U14, U37 | Page setup; Find and replace; Word count; Keyboard shortcuts; Insert link; Settings; Move to Public; Restore version. |
| V8 Command search | Popover under the menu bar (Alt+/) | U11 | Field and list: command, menu path, shortcut. |
| V9 First run | Centred card 560 px | U35 | Welcome, Git, Sign in, Identity, Repositories, Done; step dots. |
| V10 Settings | Dialog with sections | U14, U20, U35 | Appearance; Editing (spelling, smart quotes); Storage (library folder, Show in folder); GitHub (account, repositories, sync on/off, Sync now, Sign out); About (version, licences). |

**Complete by definition:** light and dark; rest, hover, active, focus-visible, disabled, error, empty and loading states; full keyboard use (menus with arrow keys, toolbar with roving focus, F6 cycles regions, Esc closes panels); screen-reader names and a live region for the save state and toasts; windows down to 800×600 (toolbar groups move into More, from the end, as the window narrows; under 1000 px the left panel collapses, and View > Show outline or Show library opens it over the page until Esc or a press on the page).

### 5.1 Menus

| Menu | Items |
|---|---|
| File | New (Ctrl+N) · Open library (Ctrl+O) · Open from file… (Ctrl+Shift+O) · Make a copy · Rename · Move to Public/Private · Delete · — · Version history ▸ (See version history Ctrl+Alt+Shift+H, Name current version) · Sync now (Ctrl+Alt+S) · — · Download ▸ (Word .docx, PDF, Markdown, Web page, Plain text) · Page setup… · Print (Ctrl+P) · — · Settings |
| Edit | Undo (Ctrl+Z) · Redo (Ctrl+Y) · — · Cut · Copy · Paste · Paste without formatting (Ctrl+Shift+V) · — · Select all (Ctrl+A) · — · Find (Ctrl+F) · Find and replace (Ctrl+H) |
| View | Mode ▸ · Markup ▸ · — · Pages / Pageless · Text width ▸ · Show outline (Ctrl+Alt+A) · Show library · Review panel · Version history · — · Zoom ▸ (Ctrl+= / Ctrl+- / Ctrl+0) · Focus view (Ctrl+Alt+Shift+F) · Compact mode (Ctrl+Shift+F) · Full screen (F11) · — · Appearance ▸ (Light, Dark, System) |
| Insert | Image… · Table ▸ · Link (Ctrl+K) · Horizontal line · Page break (Ctrl+Enter) · Table of contents · Header and footer · Special characters… · Comment (Ctrl+Alt+M) |
| Format | Text ▸ (Bold, Italic, Underline, Strikethrough, Superscript Ctrl+., Subscript Ctrl+,) · Paragraph styles ▸ (Apply each; Update *style* to match; Reset styles) · Align ▸ (Left Ctrl+Shift+L, Centre Ctrl+Shift+E, Right Ctrl+Shift+R, Justify Ctrl+Shift+J) · Indent ▸ · Line spacing ▸ · Lists ▸ · Table ▸ (rows and columns, delete) · Clear formatting (Ctrl+\) |
| Tools | Word count (Ctrl+Shift+C) · Spelling (on/off) · Review changes ▸ (Next, Previous, Accept, Reject, Accept all, Reject all) · Command search (Alt+/) |
| Help | Keyboard shortcuts (Ctrl+/) · About P-Doc · Open logs folder |

Shortcuts follow Google Docs where Docs and Word differ, plus Word's Ctrl+E/L/R/J alignment and Ctrl+[ / Ctrl+] font size (W SRC-001). Ctrl+S is accepted and shows "Saved" (GD R-001). Where two chords would collide, the formatting one wins: Ctrl+Shift+J is Justify, so Focus view is Ctrl+Alt+Shift+F; Ctrl+, is Subscript, so Settings has no chord (it is in File and command search). Cut, Copy and Paste show their chords as hints; the keys themselves are the system's.

## 6. Architecture

```
apps/desktop          Electron app
  src/main            windows, IPC, library + Git + GitHub, export/print, first run, menus
  src/preload         contextBridge API (typed); no Node in the renderer
  src/renderer        React 19 UI; TipTap 3 editor; ui/{primitives,components,patterns}
packages/core         pure TypeScript: document format, outline, TOC, diff, conversions (docx, md, html, txt), suggestions, version grouping
packages/tokens       DTCG design tokens → CSS variables (light and dark)
apps/desktop/src/cli  `pdoc` command line over core and the library (shares main's Electron-free modules)
```

- **Document format** (`*.pdoc.json`, UTF-8, pretty-printed so Git diffs read well): `{ format: "p-doc", version: 1, id, title, created, page: { mode, size, orientation, margins, color, textWidth, header, footer, differentFirstPage }, styles: { normal, title, subtitle, heading1..4 }, content: <ProseMirror JSON>, comments: [ { id, author, created, body, resolved, replies[] } ] }`. Suggestions are marks in `content` (`insertion`, `deletion`, with id, author, time); comment anchors are `comment` marks with the thread id. Images are embedded data URLs up to 2 MB each (O4).
- **Library**: `<root>/private` and `<root>/public`, each a Git repository on `main` with documents at `docs/<slug>-<id8>.pdoc.json`, a `.bin/` folder and a `README.md`. App state (recent, settings, setup progress) lives in the app data folder, never in the repositories.
- **Saving**: the renderer debounces 800 ms and sends the document to main; main writes atomically (temp file + rename, retried for up to about 2 s while Windows reports the file busy). A recovery copy of unsaved state goes to the app data folder 300 ms after each change while dirty, and once more on close if the last save failed.
- **Versions**: one commit queue per repository; history from `git log --follow`; content from `git show`; named versions as annotated tags `pdoc/<id8>/<n>`; restore writes old content and commits "Restore …"; diff is a word diff per block in core.
- **GitHub**: the credential lives only in Git's helper (Focus Notes SEC-03), read with `git credential fill` when needed, kept in memory, never written, logged or put in an argument. API calls go only to `https://api.github.com` (user, get repository, create repository). Sync: `git fetch`, merge `origin/main` keeping local versions of conflicting documents and writing the remote ones as copies, `git push`. Network failures leave everything local and show "Offline".
- **Security**: `contextIsolation`, `sandbox`, no `nodeIntegration`, a CSP with no remote scripts, navigation blocked, links opened in the browser only on click and only for `https:`; Electron fuses as Focus Notes; IPC arguments validated in main; file access limited to the library and files the person picked.
- **Print/PDF**: a hidden window renders the document with `@page` size and margins and the same page breaks as the screen, then `print` or `printToPDF` with header and footer templates.
- **Spelling**: Electron's spellchecker with suggestions in the context menu.

## 7. Performance and waits

| Wait | Class | Pattern | Target |
|---|---|---|---|
| Keystroke to glyph, 50-page document | instant | none | p95 ≤ 16 ms |
| Cold start to editable page | in-flow | window skeleton | ≤ 2.0 s |
| Open a 100-page document from the library | responsive | page skeleton | ≤ 500 ms |
| Save to disk after the debounce | responsive | save state | ≤ 300 ms |
| Version commit | background | none | ≤ 1 s |
| Version history list | responsive | skeleton rows | ≤ 300 ms for 500 versions |
| Export .docx or PDF, 50 pages | in-flow | toast with spinner | ≤ 3 s |
| Sync | background | status bar | never blocks typing |
| Repagination after an edit | instant | none | ≤ 16 ms |

Baselines: `docs/product/perf-baseline.json` (`pnpm perf`).

## 8. Copy

Glossary: [copy-glossary.md](../design/copy-glossary.md). Voice: plain, calm and specific; say what happened and what to do next; sentence case; no exclamation marks; "you" for the person, "P-Doc" for the app.

Failure words: "Couldn't save. Retrying…"; "P-Doc can't write to *folder*. Your text is kept; free space or choose another folder."; "You're offline. Changes are saved on this computer and sync when you're back."; "Sync problem: *reason*. Your documents are safe on this computer."; "This token can't create repositories. It needs the repo scope."; "Two versions of *title* were edited apart. Both are kept."; "Couldn't export: *reason*."; "Install Git to keep versions."; "This image is larger than 2 MB. Make it smaller and try again."

## 9. Assumptions and risks

| # | Assumption or risk | Kind | Impact if wrong | Evidence today | Criterion | Cheapest check | Changes | Status |
|---|---|---|---|---|---|---|---|---|
| A1 | Block-level pagination in the live editor matches print/PDF closely enough | Feasibility | High (P4) | e2e `pagination` 2026-10-28: a 16-page fixture with a manual break, table, quote and a code block taller than a page has the same pages on screen, in the print layout and in the PDF | A multi-page fixture has the same page count on screen and in the PDF | Stage 2 e2e comparing screen pages with PDF pages | O2 | Confirmed |
| A2 | Git is present or installable on writers' machines | Feasibility | High (P1) | Focus Notes has the same requirement | First run finds Git ≥ 2.40 or the writer installs it | First-run Git check | Bundle Git | Open |
| A3 | Writers accept documents stored as JSON rather than .docx | Desirability | Medium (P2) | Focus Notes uses plain files; JSON diffs well. Stage 6: a .docx round-trips (export then Open from file keeps headings, emphasis, links, lists and tables; unit `export-docx`, e2e `import-export`), so a Word file is one command away | Writers use export when they need .docx | Ask the owner after a week of use | Native .docx storage | Partly settled: the technical half holds; the owner's use settles the rest |
| A4 | Insert/delete suggestions cover review needs without formatting tracking | Usability | Medium (P5) | Docs and Word track formatting (W R-003) | Reviewing a fixture with text edits feels complete | Try-it in stage 4 | Add format suggestions | Open: e2e `review` and `comments` review a fixture of text edits end to end; the owner's try-it settles it |
| A5 | Research never alters third-party documents | Ethics | High | Anonymous visitors to the public doc are in Suggesting | The rig never types or clicks in the page | Review `research/rig` | — | Held |
| A6 | Embedded images up to 2 MB keep files workable in Git | Viability | Medium (P1, P2) | Measured 2026-10-28 (`PDOC_MEASURE=1` unit `a6-measure`): 100 pages with 20 images at the 2 MB cap make a 54 MB file (over GitHub's 50 MB warning) and 454 MB of Git objects after 11 versions (40 MB once packed); 20 typical 300 KB images make 8.5 MB and 67 MB. Every version stores the whole file again | A 100-page fixture with 20 images stays under 20 MB | Measure in stage 6 | Store images beside the file | Disproved: images move beside the document, each stored once (O4, stage P0) |
| A7 | A clear warning before Move to Public prevents accidental publishing | Usability | High (P6) | None | No move without the confirmation; tests prove it | e2e | Two-step confirmation | Open |

## 10. Decisions

| # | Question | Options | Recommendation | Decided |
|---|---|---|---|---|
| O1 | Editor engine | TipTap/ProseMirror · Lexical · own contenteditable | TipTap 3 (Focus Notes uses it; transactions fit suggestions) | TipTap 3.31.4 |
| O2 | Pagination | Block-level page breaks with spacers · CSS paged media engine | Block-level spacers (one editable surface); a block taller than a page overflows its page | Block-level (A1 confirmed in stage 2) |
| O3 | Per-section orientation and headers (W R-001, W R-002) | Sections in v1 · whole-document page setup | Whole-document in v1 | Working default: whole-document |
| O4 | Images | Embedded data URLs · files beside the document | Files beside the document, stored once by content (A6 disproved embedding) | Beside the document (stage P0) |
| O5 | Two repositories or one with a private submodule (Focus Notes) | Two sibling repositories · submodule | Two sibling repositories (simpler moves, no submodule state) | Two repositories |
| O6 | Formatting changes in Suggesting | Track · apply directly | Apply directly in v1 (A4) | Apply directly |
| O7 | Storage format | JSON · .docx · Markdown | JSON (lossless, diffable) with exports | JSON |
| O8 | Version cadence | Every save · on pause and close · manual | 60 s pause, close/switch, at least every 10 min | As stated |
| O9 | Real-time co-editing | Yes · no | No (non-goal) | No |
| O10 | Platforms | Windows · all three | Windows packages now (NSIS + portable) | Windows |
| O11 | GitHub sign-in | Own OAuth app · Git's helper (GCM/gh) · token | Git's helper or a pasted token, as Focus Notes (no client secret in the app) | Git's helper + token |

Execution choices (research rig, test isolation) are working defaults W1–W8 in the [work plan](../work/work-plan.md).

## 11. As built

Updated with each stage; evidence in the [Definitions of Done](definition-of-done.md).

### Stage 1: Write offline (built)

What a person meets, beyond the flows above:

- **Window.** Title bar, menu bar, toolbar pill, left panel (Library, Outline), page and status bar as V1. The toolbar shows every group in one row at 1600 px; as the window narrows, groups at the end move into **More** (⋯), which opens a panel with the same controls (arrow keys move among them; a command closes it). Under 1000 px the left panel collapses; View > Show outline or Show library opens it over the page, and Esc or a press on the page puts it away. Wider again, it is back beside the page.
- **Typing and saving.** Saves 800 ms after a pause; "Saving…" then "Saved to this computer". A save that fails at close leaves a recovery copy, restored on the next start with "Recovered unsaved changes to *title*."
- **Structure after blocks.** A page break, table of contents, table, horizontal line, image or code block is never the last thing in a document: a paragraph always follows, as in Word and Google Docs, so there is somewhere to type after it and Ctrl+End lands there. After **Insert > Page break** or **Table of contents** the cursor is in the paragraph after it.
- **Moving sections.** Dragging a heading in the outline moves it with everything up to the next heading of the same or higher level, including trailing empty paragraphs.
- **Dialogs.** One Esc closes any dialog, even from a search field with text in it. The field the dialog is for has the cursor when it opens (Link when the text is selected; Text when there is none).
- **Links.** Bare domains get `https://`; email addresses become `mailto:`; `#id` links stay in the document.
- **Shortcuts.** As §5.1, with Focus view on Ctrl+Alt+Shift+F and no chord for Settings (see the note under §5.1).

Engineering notes (for whoever builds the next stage):

- Keys and clicks act on the selection the person sees: before a command runs, the editor reads any caret move the browser hasn't reported yet (`syncSelection`), and focusing the editor is immediate (`focusEditor`, and a `focus` command that doesn't wait a frame), so a key pressed straight after a toolbar click or a closing popover lands in the page.
- Library writes are atomic and retried on Windows' transient `EPERM`/`EACCES`/`EBUSY`; unit `write-atomic`.
- The library runs one commit queue per repository; unit `library` covers create, save without a version, rename, copy, Bin and restore (including a name taken meanwhile), move both ways, refusal of paths outside the library, unreadable files, the queue, and Git missing.
- Tests never touch the owner's Git, GitHub, documents or settings: each run has its own data and library folders and an empty Git config.

### Stage 2: Pages and print (built)

What a person meets, beyond the flows above:

- **Pages.** Each page is a sheet of the chosen paper (Letter, Legal, A4, A5, Tabloid; portrait or landscape) with its margins and page colour, on a grey canvas with a gap between sheets. A block that doesn't fit on the rest of a page starts the next one; a block taller than a whole page (a long code block or table) starts at the top of a page and runs on, as in Word. A page break always starts a new sheet. The status bar shows "Page *n* of *count*" for the page in view. Zooming scales the sheets but keeps the layout.
- **Pageless.** One long sheet, no page edges, with the text width from View > Text width. Text width is greyed out in Pages. Headers, footers and page breaks stay in the document and come back with View > Pages.
- **Page setup** (File > Page setup). Pages or Pageless, orientation, paper size, margins in inches or centimetres by locale, and page colour. A negative margin says "Enter a margin of 0 or more."; margins wider than the page say "The margins leave no room for text. Make them smaller." and Apply waits until they're fixed. **Set as default** makes new documents (Ctrl+N) use this setup and says "New documents will use this page setup."
- **Header and footer** (Insert > Header and footer, or a double-click on a header or footer). Text for each, alignment left, centre or right, **Page number** and **Page count** buttons that insert `{page}` and `{pages}`, and **Different first page** with its own header and footer. Cancel leaves the document as it was.
- **Table of contents.** Lists Heading 1–3 with the page each starts on. Entries and page numbers follow as headings are typed, added or pushed onto another page, with no refresh step. A click on an entry puts the cursor at that heading.
- **Print and PDF.** File > Print (Ctrl+P) and File > Download > PDF lay out exactly what is on screen: same sheets, breaks, headers and footers. The PDF shows "Making PDF…", then "Saved *name*.pdf · *n* pages" with **Show in folder**; failures say "Couldn't make the PDF: *reason*." or "Couldn't print: *reason*." Pageless prints as flowing text with no headers or footers.
- **Moving around.** Ctrl+Home and Ctrl+End go to the start and end of the document across page breaks (Shift extends the selection).
- **Code.** Code blocks and inline code sit on a light grey of their own (`color.page-code`), so they no longer look selected.

Engineering notes:

- Pagination (`editor/pages.ts`) measures each top-level block after drawing, feeds the heights to `paginate` and `sheetsOf` in core, and draws sheet breaks as widgets between blocks (footer, gap, next header). It settles within half a pixel, so drawing the breaks never sets off another layout.
- ProseMirror's `Decoration.eq` ignores a decoration's spec. The table of contents' page numbers therefore travel in the decoration's attributes, and its decorations are rebuilt on every change, because a node decoration is lost when the node is replaced.
- Print and PDF render the print HTML (`editor/print.ts`) in a hidden window with the same CSS, so screen and paper share one layout. e2e `pagination` checks screen, print and PDF page counts on a 16-page fixture.
- Stored page setups go through `cleanPage` (unit `format`), so a hand-edited or older file falls back to defaults field by field.
- Menus: Esc and the arrow keys work while a submenu is open but focus is still on its parent (opened by a click, or holding only disabled items).
- `pnpm perf` measures spec §7's waits in the built app with isolated data and fails over budget. Baseline: [perf-baseline.json](perf-baseline.json).
### Stage 3: Versions (built)

What a person meets, beyond the flows above:

- **Versions as you write.** A document becomes a version 60 s after the last change, when another document is opened or made, when the window closes, and at least every 10 minutes during long typing. A pause with no change makes nothing. Closing the window waits for its versions.
- **History panel.** File > Version history, View > Version history, Ctrl+Alt+Shift+H, or a click on the save state. The top row is the text now ("Current version · *time*"); older rows are grouped Today, Yesterday, then by date, with the author. Each row's menu: Name (or Rename) this version, Remove name, Restore this version, Make a copy. **Only named versions** filters the list.
- **Comparing.** Selecting an older row shows that version, read-only, over the page: green for text added since, red strikethrough for text removed since, a word count of both, and a legend. Esc or **Back to current** returns to the text; the editor can't be typed in while a version is shown.
- **Restore.** Asks first. Unsaved edits become a version, then the old text comes back as a new version "Restore *date time*". Nothing in history is lost, and typing carries on in the restored text.
- **Copy.** A new document "Copy of *title*" from that version; the toast's **Open** goes to it.
- **No Git.** The panel says "Install Git to keep versions." and the document still saves.

Engineering notes:

- `main/versions.ts` (`Versions`) schedules commits per document with core's `VersionCadence` (unit `cadence`): a pause timer reset by each save, a maximum wait from the first unsaved change, `commitExcept` on switching, `commitAll` on close and new documents, `drop` on delete, move and restore. Unit `versions` uses fake timers. `PDOC_VERSION_PAUSE_MS` and `PDOC_VERSION_MAX_MS` shorten the cadence for tests.
- `Library.history` uses `git log --follow`, so a document's history survives Bin and restore; names are annotated tags `refs/tags/pdoc/<file stem>/<sha12>` read with `for-each-ref`. Every sha from the renderer is checked to be 40 hex digits and in that document's history. Unit `library` covers commit-on-change only, history order, names, restore and copy.
- The diff (`diffContent` in core) marks the old version's text with `pd-insertion`/`pd-deletion` marks tagged `data-id="diff"`, coloured with `color.diff-added` and `color.diff-removed` (contrast checked in `pnpm tokens`). `groupVersions` (unit `group`) makes the Today/Yesterday/date groups.
- While a version is shown, the live editor stays mounted (hidden) so pagination keeps measuring, and is set read-only without an update event (`setEditable(false, false)`), so showing a version never saves.
- Opening history commits only when the scheduler has changes waiting (`commitIfWaiting`), and reads the log and the tags in parallel: each Git process costs about 90 ms on Windows. At start, `Library.unversioned` (`git status`) hands documents saved but never committed (a crash) to the scheduler.
- The start-up focus ("ready for typing") leaves the cursor alone if the person already focused the page.
- e2e `versions` covers 3.1–3.6, including closing with unsaved text and running without Git.

### Stage 4: Suggest and review (built)

What a person meets, beyond the flows above:

- **Modes.** Editing, Suggesting and Viewing from the switcher at the right end of the toolbar, View > Mode or their shortcuts. The title bar shows a badge in Suggesting and Viewing. In Viewing the toolbar's editing controls are greyed and typing does nothing, but comments still work. Each document opens in Editing.
- **Suggesting.** Typing is underlined green; deleting leaves the text struck through red, and deleting your own suggestion simply removes it. A word typed over a few seconds is one change, dated when it began. Typing over a selection makes a deletion and an insertion side by side. Undo takes back suggestions like any edit.
- **Markup.** All shows changes inline; Simple shows the text as if accepted with a bar in the margin beside changed lines; No markup and Original show the text as if all were accepted or rejected, read-only. Any view but All shows its name in the status bar ("No markup · read only"); a click there goes back to All. A suggested split of a paragraph can't be shown re-joined in Original.
- **Review panel.** Opened by Tools > Review changes, the title bar's review button (with the open count) or by starting a comment; it replaces Version history and the other way round. Cards for changes (author, time, "Added" / "Deleted" and the text) and threads, in document order; selecting one selects its text in the page. Accept or reject moves to the next. **Accept all** and **Reject all** ask nothing and can be undone. **Open / Resolved** filters; with nothing open the panel says how to suggest or comment, and "No resolved comments." under Resolved.
- **Comments.** On a selection, or the word at the cursor. While writing, the text has a draft highlight; Esc or Cancel drops it. Posted threads show their highlight in the page; Reply, Resolve, Reopen, Edit (your own) and Delete (asks first) from the card and its menu. Comments, replies and resolved state are saved with the document and come back after a restart. Text whose comment was deleted loses its highlight.

Engineering notes:

- Core `suggestions.ts` turns edits into `pd-insertion`/`pd-deletion` marks in an `appendTransaction` while suggesting is on; a new character joins the neighbouring suggestion's mark (same id, author and start time) so contiguous typing stays one change. `resolveChanges` accepts or rejects one id or all. Unit `suggestions` (9 tests).
- Core `comments.ts` holds threads in `doc.comments` (id, quote, author, time, body, replies, resolved) with pure add, reply, edit, resolve, delete; the `pd-comment` mark carries the thread id. `finalContent` drops comment marks and resolves suggestions for export. Unit `comments`.
- Renderer `review.ts` keeps mode, markup and panel state, lists items (`reviewItems`) from one document walk, cached per editor state, and does navigation and decisions. Mode is applied to each new editor in `applyMode` (which keeps a shown version read-only). Markup is a class on the page (`markup-simple` etc.) plus editability.
- Comment marks are added on **Comment** without an undo step, so Ctrl+Z after posting doesn't strip the highlight.
- `pnpm perf` adds "Review list after an edit" on a 50-page document with 100 suggestions (budget 16 ms; p95 0.2 ms).
- e2e `review` covers 4.1–4.4 and 4.6 and the toolbar in Viewing; e2e `comments` covers 4.5 end to end, including a restart.
- Known small gap: Word count counts suggested deletions as words.

### Stage 5: GitHub and first run (built)

What a person meets, beyond the flows above:

- **Welcome.** One card with six step dots (Welcome, Git, Sign in, You, Repositories, Done); **Connect GitHub** has the focus. **Back** on any step returns to the one before without setting anything up. Quitting part-way reopens at the step that stopped.

  ![Welcome](screens/v9-1-welcome.png)

- **Git.** Skipped on its own when Git ≥ 2.40 is there; otherwise **Get Git** and **Check again**.
- **Sign in.** "Signed in as @login" straight away when Git's helper already has a GitHub sign-in. Otherwise **Sign in with browser** (shown only when Git Credential Manager or the GitHub CLI is installed; the CLI's one-time code is shown with **Cancel**) or **Paste a token**, a password field that checks the token with GitHub: "GitHub didn't accept this token. Check it and try again.", "This token can't create repositories. It needs the repo scope." With no credential helper at all, P-Doc keeps the sign-in until it closes and says so.

  ![Paste a token](screens/v9-2-sign-in-token.png) ![Signed in](screens/v9-3-signed-in.png)

- **You.** Name and email for versions: Git's own name if set, else the GitHub account's; **Use my private GitHub address** fills the noreply address.

  ![Identity](screens/v9-4-identity.png)

- **Repositories.** Both names editable, each with its Private/Public badge and state ("Will be created", "Found, will be used", "Already exists", "Ready"). A name taken by something that isn't a P-Doc library shows the problem with **Use it anyway** (its files are kept; P-Doc adds its `.p-doc` marker) and **Choose another name** (focuses the field). **Set up** shows each step as it runs.

  ![A taken name](screens/v9-5-repositories-taken.png) ![Done](screens/v9-6-done.png)

- **Syncing.** After each version (2 s later, so a burst syncs once), every 5 minutes, at start, and on **Sync now**. The title bar says "Saved · synced" when the open document's latest text is on GitHub, and "Saved to this computer" again after the next edit. When a sync brings in a change to the open document, the page shows it; if there are unsaved edits, they stay and the toast says the other text is in Version history.

  ![Synced](screens/v1-synced.png)

- **Settings > GitHub.** Account, both repositories (`login/name` with their badges), **Sync automatically**, the last sync, **Sync now** and **Sign out** (P-Doc stops syncing and forgets the session's sign-in; Git's helper, the repositories and the documents are untouched, and Settings offers **Connect GitHub** again). Not connected: **Connect GitHub**, or **Finish connecting** after a setup that stopped. **Sync problem** in the status bar opens a dialog with the reason, **Sign in again** when GitHub refused the sign-in, and the number of documents waiting.

  ![Settings](screens/v10-settings-github.png)

- **Privacy.** A Private document never reaches the public repository. **Move to Public** asks first; on the next sync it is in the public repository and gone from the private one's `main` (its earlier private history stays private).

Engineering notes:

- Main: `github.ts` (REST client: user, repo get and create, with offline, 401 and 404 told apart), `account.ts` (sign-in through Git's credential helper: `git credential fill/approve/reject`; GCM's window or `gh auth login --web` for the browser path; P-Doc stores no token), `setup.ts` (idempotent steps, `planProblem` shared with the renderer), `sync.ts` (`Sync`: fetch, merge `origin/main`, and when both sides edited a document keep this computer's file and add GitHub's as "*title* (from GitHub *date*)"; push; `pending` = versions not pushed plus saved edits not yet a version).
- `status()` reads the running state after its Git calls, so a status answer can't land after a run's final event and leave the window on "Syncing…". The menu bar re-renders on the sync state, so an open File menu enables **Sync now** when a sync ends.
- The renderer marks the open document pending on its first edit (main only reports at the next version or sync); that drives "Saved · synced" and the library's "Not synced yet".
- `PDOC_GITHUB_API` and `PDOC_GITHUB_REMOTE` point P-Doc at a fake GitHub (`test/fakes/fake-github.ts`: REST plus smart-HTTP Git over bare repositories, and a fake credential helper). Unit `github` (19 tests) covers account, setup and sync, including conflicts, auth failure and offline; e2e `github` covers 5.1–5.3 and 5.6 and checks the token is in none of P-Doc's data, the library or the log.
- Docs screenshots: `PDOC_CAPTURE=1 npx playwright test screens` (in `apps/desktop`) writes `docs/product/screens/`.
- `pnpm perf` adds "Sync (typing while it runs)": a key per frame in a 50-page document during 4 syncs to the fake GitHub, each pushing a version (budget 16 ms; p95 0.8 ms).
- Known limitations: offline during setup doesn't retry by itself (Settings > Finish connecting does); a version's name syncs, but removing one doesn't reach the other computer; a dirty open document keeps its edits over a change from GitHub (the change is in Version history).

### Stage 6: Import and export (built)

What a person meets, beyond the flows above:

- **File > Download.** Microsoft Word (.docx), PDF document (.pdf), Markdown (.md), Web page (.html) and Plain text (.txt). Each asks where to save (Downloads first) and says "Saved *name*" with **Show in folder**; a failure says "Couldn't export: *reason*" with **Try again**. Word keeps suggestions as Word's tracked changes; the other formats carry the text as it reads with every suggestion accepted.

  ![Download](screens/v11-download.png)

- **File > Open from file… (Ctrl+Shift+O)** and **a file dropped on the window.** A .docx, .md, .html, .txt or .pdoc.json becomes a new Private document titled from the file name, and opens: "Importing…" then "Opened *title*". Word parts P-Doc can't keep are named: "Imported. Some parts (text boxes, embedded objects) were left out." A .pdoc.json comes in whole with a new id, so it never replaces the document it was copied from. Images dropped on the page still go into the page; anything else is refused with "P-Doc can open .docx, .md, .html, .txt and .pdoc.json files." Files over 50 MB are refused before they are read.

  ![Opened from file](screens/v12-opened-from-file.png)

- **The `pdoc` command line** (U38), for scripts and agents, over the same library as the window: `pdoc setup --offline [--library <dir>]`, `new "Title" [--public]`, `list [--bin]`, `history <doc>`, `export <doc> --to docx|md|html|txt [--version <sha>] [--out <file>]` (text formats print when `--out` is left out), `import <file>`. A document is named by its id, its first 8 characters, its path or its title. `--json` prints one JSON value, errors included. Exit codes: 0 done, 1 usage, 2 no such document (or more than one: the matches are listed), 3 a person must act (`{"needs":"sign-in"}` from `setup` without `--offline`), 4 failed. In development it runs as `pnpm pdoc …`; the installed command comes with Install.

Engineering notes:

- `apps/desktop/src/main/files.ts` is Electron-free and shared by the window and the CLI: `exportBytes`, `readFile` (kind by extension, BOM stripped, 50 MB cap, mammoth warnings turned into the parts left out), and `importInto` (a new private document, or `Library.adopt` for a whole .pdoc.json).
- A dropped file's bytes travel to main (`output:importData`); its path never does. Open from file reads the path main itself chose in the dialog. `PDOC_OPEN_FILE` stands in for the dialog in tests (only with `PDOC_E2E`).
- Settings gained `library`: the library folder. The app records its default (Documents\P-Doc, wherever Documents points) on start, so the CLI finds the same folder when Documents is redirected; only `pdoc setup --library` changes it. The app's data folder is pinned to `%APPDATA%\P-Doc` (`PDOC_USER_DATA` for tests), the same in development and installed.
- Progress toasts ("Making PDF…", "Importing…") give way to their result instead of standing beside it.
- `pnpm perf` adds "Export .docx, 50 pages" (budget 3 s; p95 34 ms).
- A6 measured: embedded images make files and history too big (§9). Images move beside the document before the image features of the parity stages build on them.
- Known limitations: the packaged app has Electron's run-as-node fuse off, so the installed `pdoc` command is part of Install; the CLI and the window each queue their own commits, so a CLI command during a version commit can meet Git's index lock and fail with exit 4 (run it again).
