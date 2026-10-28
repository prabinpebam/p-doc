# S-001 Document editor
Features: F-001 to F-042 · URL: `/document/d/:id/edit` · Status: draft

## Purpose

Write and format one document with the whole toolset one click away, while the document saves itself.

## Entry points

- A document link or Drive. [obs EV-001]
- File > New, File > Open (Ctrl+O). [obs EV-003]

## Anatomy

![Editor](../evidence/EV-001-editor-view-anonymous.png)

| # | Region | Contents | Component | Evidence |
|---|---|---|---|---|
| 1 | Title bar | App icon, editable document title, save-state cloud icon, comment history, Share (split button), account | C-001 | [obs EV-001] |
| 2 | Menu bar | File, Edit, View, Insert, Format, Tools, Extensions, Help, Accessibility | C-002 | [obs EV-001] [obs EV-003] |
| 3 | Toolbar | Search menus, undo, redo, print, spelling, paint format, zoom, style, font, size stepper, B/I/U, text colour, highlight, link, comment, image, align, spacing, checklist, bullets, numbering, indent, clear formatting, mode switch, collapse | C-003 | [obs EV-002] |
| 4 | Ruler | Horizontal ruler with indent markers and margins; vertical ruler on the left | C-004 | [obs EV-001] |
| 5 | Tabs and outline sidebar | "Document tabs" with add (+), tab options, outline items indented by heading level, back arrow to collapse | C-005 | [obs EV-001] [obs EV-002] |
| 6 | Canvas | Grey workspace, white page with margins; text starts at the top margin | C-006 | [obs EV-001] |
| 7 | Mode badge | "You're suggesting" chip at the cursor when in suggesting mode | C-007 | [obs EV-001] |

## Data shown

| Element | Entity.field | Evidence |
|---|---|---|
| Title | Document.title | [obs EV-001] |
| Save state | Document.saveState | [obs EV-001] |
| Outline items | Heading text and level | [obs EV-002] |
| Style picker value | Style of the paragraph at the cursor | [obs EV-002] |
| Font size value | Size at the cursor | [obs EV-002] |

## States

| State | How to reach it | What it shows | Evidence |
|---|---|---|---|
| Empty | New document | Blank page, cursor at top margin, Normal text | [inf Q-002] |
| Loading | Open a large document | Chrome first, then page content | [obs EV-001] |
| Typical | Open a document | As in the anatomy | [obs EV-001] |
| Many items | 20+ headings | Outline scrolls inside the sidebar; titles truncated with ellipsis | [obs EV-001] |
| Long text | Long heading | Truncated in outline with ellipsis | [obs EV-001] |
| Error | Offline without offline access | Banner and save state change | [doc SRC-009] |
| No permission | View-only link | Mode menu offers "Ask to edit"; editing commands disabled | [obs EV-003] |

## Menus

Read from the DOM without opening them. [obs EV-003]

| Menu | Items (in order; `>` opens a submenu) |
|---|---|
| File | New >, Open (Ctrl+O), Make a copy, Share >, Email >, Download >, Approvals, Rename, Move, Add a shortcut, Move to bin, Version history >, Make available offline, Details, Language >, Page setup, Print preview, Print (Ctrl+P) |
| Edit | Undo, Redo, Cut, Copy, Copy as Markdown, Paste, Paste without formatting, Paste from Markdown, Select all, Delete, Find and replace (Ctrl+H) |
| View | Mode >, Comments >, Expand/collapse tabs and outlines sidebar (Ctrl+Alt+A Ctrl+Alt+H), Text width >, Show print layout, Show ruler, Show equation toolbar, Show non-printing characters (Ctrl+Shift+P), Show increased menu spacing, Show markups, Zoom >, Full screen |
| Insert | Image >, Cover image >, Table >, Building blocks >, Smart chips >, Link (Ctrl+K), Drawing >, Chart >, Symbols >, Equation, Tab (Shift+F11), Horizontal line, Break >, Bookmark, Page elements >, Comment (Ctrl+Alt+M) |
| Format | Left-to-right, Right-to-left, Text >, Paragraph styles >, Align and indent >, Line and paragraph spacing >, Columns >, Bullets and numbering >, Headers and footers >, Page numbers, Page orientation, Switch to pages / pageless format, Table >, Image >, Borders and lines >, Clear formatting (Ctrl+\) |
| Tools | Spelling and grammar >, Word count (Ctrl+Shift+C), Review suggested edits, Compare documents, Citations, Variables, Line numbers, Explore, Linked objects, Dictionary (Ctrl+Shift+Y), Translate document, Voice typing (Ctrl+Shift+S), Notification settings, Preferences, Accessibility, Activity dashboard |
| Help | Search the menus (Alt+/), Docs Help, Training, Updates, Help Docs improve, Report abuse, Privacy Policy, Terms of Service, Keyboard shortcuts (Ctrl+/) |
| Mode | Editing (edit document directly), Suggesting (edits become suggestions), Commenting, Viewing (read or print final document) |
| Line spacing | Single, 1.15, 1.5, Double, Custom; remove/add space before and after; custom spacing; keep with next; keep lines together; prevent single lines; add page break before |

## Dialogs

- Page setup: Pages or Pageless at the top; orientation, paper size, margins, page colour; Apply to (whole document, this section, this section forward); Set as default; OK. [doc SRC-005] [doc SRC-011]

## Side panels

- Comments: all comments for the document, filter by type (open, resolved) and by "for you"; click to jump to the anchor. [doc SRC-004]

## Version history

- Opened from the last-edit indicator or File > Version history. A right panel lists versions grouped by time with expand; selecting one shows that version with changes highlighted by author; "Restore this version"; "More > Name this version / Make a copy"; toggle "Only show named versions"; "Back" returns to the current version. [doc SRC-002]

## Not tested

- Menu opening animations and hover states: synthetic menu clicks hang headless Chrome; menus were read from the DOM instead (Q-003).
- Signed-in-only surfaces (comment threads, version history UI, suggestion review) were not observed live: no account (Needs human).
