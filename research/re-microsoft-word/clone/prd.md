# Clone requirements: Microsoft Word
Updated: 2026-10-28 · Status: draft

Feeds P-Doc (`docs/product/spec.md`): take Word's structure and review power, leave its density.

## Problem and users

Writers of long, structured documents need sections, headers, a navigation pane that restructures, a live table of contents, track changes and strong find and replace, without a cloud dependency for saving.

## Launch blockers

| Barrier | Severity | Owner | Start by |
|---|---|---|---|
| none | - | - | - |

## Core loop

Outline with headings, write, restructure in the navigation pane, set section layout, track and review changes, recover versions.

## Scope by priority

| Priority | Feature | Rules | Screens | Notes |
|---|---|---|---|---|
| P2 | F-001 Character formatting with ribbon Font group and shortcuts (Ctrl+B/I/U, Ctrl+[ and ], Ctrl+Shift+F) | - | S-001 | |
| P1 | F-002 Style gallery; modify style; update style to match selection; create style | - | S-001 | |
| P2 | F-003 Paragraph alignment (Ctrl+L/E/R/J), indent, spacing, lists | - | S-001 | |
| P1 | F-004 Find (Ctrl+F in Navigation pane) and Replace (Ctrl+H) with match case, whole words, wildcards, formatting and special characters | R-010 | S-001 | |
| P2 | F-005 Go To (Ctrl+G) page, section, line, bookmark, comment | - | S-001 | |
| P1 | F-006 Section breaks: next page, continuous, even page, odd page | R-001 | S-001 | |
| P1 | F-007 Headers and footers: different first page, different odd and even, link to previous per section | R-002 | S-001 | |
| P1 | F-008 Page setup: margins, orientation, size, columns per section | - | S-001 | |
| P2 | F-009 Views: Print Layout, Web Layout, Read Mode, Outline, Draft | - | S-001 | |
| P1 | F-010 Navigation pane: Headings, Pages, Results tabs; drag headings to move sections; collapse headings | R-006 | S-001 | |
| P1 | F-011 Automatic table of contents from heading styles; Update Table (page numbers only or entire table) | R-007 | S-001 | |
| P2 | F-012 Footnotes and endnotes (Ctrl+Alt+F, Ctrl+Alt+D) | - | S-001 | |
| P1 | F-013 Track Changes on/off (Ctrl+Shift+E); lock tracking | R-003 | S-001 | |
| P1 | F-014 Markup views: Simple Markup, All Markup, No Markup, Original | R-005 | S-001 | |
| P1 | F-015 Accept or reject changes in sequence, all at once, by reviewer | R-004 | S-001 | |
| P2 | F-016 Reviewing pane listing all changes and comments with counts | - | S-001 | |
| P1 | F-017 Modern comments: post, reply, edit, resolve, reopen, delete; contextual and list view; @mentions | - | S-001 | |
| P2 | F-018 Compare two versions into a new tracked-changes document; combine | - | S-001 | |
| P1 | F-019 AutoSave toggle for cloud files, saves every few seconds | - | S-001 | |
| P2 | F-020 Save a Copy instead of Save As when AutoSave is on | R-008 | S-001 | |
| P1 | F-021 Version history opened from the file name; open or restore a previous version | R-009 | S-001 | |
| P2 | F-022 AutoRecover for unsaved local documents | - | S-001 | |
| P2 | F-023 Backstage view (File tab): New, Open, Info, Save a Copy, Print, Export, Share | - | S-001 | |
| P2 | F-024 Ribbon display options: full ribbon, show tabs only, auto-hide; simplified ribbon | - | S-001 | |
| P2 | F-025 Tell Me / Search box (Alt+Q) to run any command | - | S-001 | |
| P2 | F-026 Ribbon access keys (Alt then a letter: F, H, N, A, S, R, W) | - | S-001 | |
| P2 | F-027 Status bar: page x of y, word count, proofing, view buttons, zoom slider | - | S-001 | |
| P2 | F-028 Immersive Reader: column width, page colour, line focus, text spacing, syllables, read aloud | - | S-001 | |
| P2 | F-030 Tables, pictures, shapes, links (Ctrl+K), symbols, page numbers | - | S-001 | |

## Non-goals

- Co-authoring presence and @mention tasks (BR-001). Mailings. Macros and add-ins.

## Data model

See `data-model/erd.mmd` and `data-model/types.ts`.

## Build order

1. Styles, navigation pane with drag-to-move, live contents.
2. Sections and headers.
3. Track changes with markup views.
4. Version history and AutoSave for local files.

## Open questions

See `questions.md`.
