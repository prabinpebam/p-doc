# Clone requirements: Google Docs
Updated: 2026-10-28 · Status: draft

This KB feeds P-Doc, a desktop hybrid of Google Docs and Word (docs/product/spec.md). It is not a full clone: P-Doc keeps what Docs does best and drops what depends on Google's cloud.

## Problem and users

A single writer (and occasional reviewer) wants Docs' calm, always-saved editing and review modes, but with files they own, offline by default, and versions they can see and restore.

## Launch blockers

| Barrier | Severity | Owner | Start by |
|---|---|---|---|
| none | - | - | - |

BR-001 and BR-002 cut features; they do not block launch.

## Core loop

Open or create a document, write with styles, see it save, review with comments or suggestions, restore or name a version.

## Scope by priority

| Priority | Feature | Rules | Screens | Notes |
|---|---|---|---|---|
| P2 | F-001 Rich text: bold, italic, underline, strikethrough, super/subscript, small caps, text and highlight colour, font and size | - | S-001 | |
| P2 | F-002 Paragraph styles (Normal, Title, Subtitle, Heading 1-6) with update-to-match and save/use/reset default styles | - | S-001 | |
| P2 | F-003 Lists: bulleted, numbered, checklist; indent and outdent | - | S-001 | |
| P2 | F-004 Align and indent; line and paragraph spacing (single, 1.15, 1.5, double, custom; space before/after; keep with next; keep lines together; page break before) | - | S-001 | |
| P2 | F-005 Undo, redo, cut, copy, paste, paste without formatting, copy as Markdown, paste from Markdown | - | S-001 | |
| P2 | F-006 Paint format and copy/paste text formatting | - | S-001 | |
| P2 | F-007 Clear formatting (Ctrl+\) | - | S-001 | |
| P2 | F-008 Find, find and replace, find next/previous | - | S-001 | |
| P2 | F-009 Markdown autoformat while typing and Markdown copy/paste | - | S-001 | |
| P2 | F-010 Links (Ctrl+K), bookmarks, horizontal line, page break, section break, column break | - | S-001 | |
| P2 | F-011 Images from computer, web, URL; image options, crop, replace, reset | - | S-001 | |
| P2 | F-012 Tables: insert grid, table properties, borders, cell background | - | S-001 | |
| P3 | F-013 Special characters, equations, drawings, charts | - | S-001 | |
| P3 | F-014 Smart chips and building blocks via @ menu | - | S-001 | |
| P2 | F-015 Footnotes (Ctrl+Alt+F) with next/previous navigation | - | S-001 | |
| P1 | F-016 Pages vs pageless format; pageless text width narrow/medium/wide | R-003 | S-001 | |
| P1 | F-017 Page setup: orientation, paper size, margins, page colour; set as default; per-section orientation | R-004 | S-001 | |
| P1 | F-018 Headers and footers: different first page, different odd and even, margins | - | S-001 | |
| P1 | F-019 Page numbers and page count | - | S-001 | |
| P2 | F-020 Columns | - | S-001 | |
| P2 | F-021 Ruler with indent and margin handles; print layout toggle; non-printing characters | - | S-001 | |
| P1 | F-022 Tabs and outline sidebar: outline from headings, click to jump, remove from outline, collapse sidebar | R-002 | S-001 | |
| P3 | F-023 Collapsible headings in the document | - | S-001 | |
| P1 | F-024 Table of contents with links or page numbers, refresh | R-009 | S-001 | |
| P2 | F-025 Tool finder / search the menus (Alt+/) | - | S-001 | |
| P2 | F-026 Zoom, full screen, compact mode (hide menus) | - | S-001 | |
| P1 | F-027 Comments: add, reply, edit, delete, resolve, reopen; comment panel; filter open/resolved | R-008 | S-001 | |
| P1 | F-028 Suggesting mode: edits become suggestions; accept/reject; review suggested edits; navigate next/previous suggestion | R-005 | S-001 | |
| P1 | F-029 Editing / Suggesting / Commenting / Viewing modes with shortcuts | - | S-001 | |
| P3 | F-030 Compare documents | - | S-001 | |
| P1 | F-031 Version history panel: last edit, list of versions, restore, make a copy, named versions (max 40), only named | R-006, R-007 | S-001 | |
| P2 | F-032 New, open, make a copy, rename, move, move to bin, details | - | S-001 | |
| P2 | F-033 Download as docx, odt, rtf, pdf, txt, html, epub, md | - | S-001 | |
| P2 | F-034 Print and print preview (Ctrl+P) | - | S-001 | |
| P1 | F-035 Offline: make available offline, document status, sync when online | - | S-001 | |
| P1 | F-036 Autosave with cloud status next to the title | R-001 | S-001 | |
| P2 | F-037 Spelling and grammar, word count (Ctrl+Shift+C), dictionary, voice typing, translate | - | S-001 | |
| P3 | F-039 Line numbers, citations, variables | - | S-001 | |
| P2 | F-041 Keyboard shortcuts dialog (Ctrl+/), help, updates | R-010 | S-001 | |
| P3 | F-042 Screen reader verbalise menu: edits, comments, headings, tables, formatting | - | S-001 | |

## Non-goals

- Real-time multi-user editing, sharing roles, publish to web, approvals (BR-001).
- Explore, voice typing, translate and other Google-cloud services (BR-002).

## Data model

See `data-model/erd.mmd` and `data-model/types.ts`.

## Build order

1. Data model and local persistence with autosave (F-036, R-001).
2. Editor with styles and outline (F-001 to F-004, F-022).
3. Pages vs pageless and page setup (F-016 to F-019).
4. Version history (F-031).
5. Comments and suggesting (F-027 to F-029).
6. Files and export (F-032 to F-034).

## Open questions

See `questions.md`.
