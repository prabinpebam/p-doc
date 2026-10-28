# S-001 Document window
Features: F-001 to F-030 · URL: desktop app window · Status: draft (documentation only)

## Purpose

Author long, print-true documents with every command reachable from the ribbon, the keyboard or search.

## Entry points

- Open a file, File > New, recent list in Backstage. [doc SRC-001]

## Anatomy

| # | Region | Contents | Component | Evidence |
|---|---|---|---|---|
| 1 | Title bar | AutoSave toggle, Quick Access, file name (opens version history and rename), Search (Alt+Q), account | C-001 | [doc SRC-008] [doc SRC-001] |
| 2 | Ribbon | Tabs File, Home, Insert, Draw, Design, Layout, References, Mailings, Review, View; groups of commands; display options | C-002 | [doc SRC-001] [doc SRC-012] |
| 3 | Navigation pane | Headings, Pages, Results tabs; search box | C-003 | [doc SRC-007] |
| 4 | Document | Pages in Print Layout with rulers | C-004 | [doc SRC-001] |
| 5 | Comments | Contextual cards in the margin or list view | C-005 | [doc SRC-010] |
| 6 | Status bar | Page x of y, words, proofing, views, zoom | C-006 | [inf Q-001] |

## Data shown

| Element | Entity.field | Evidence |
|---|---|---|
| File name | Document.name | [doc SRC-008] |
| Save state | Document.saveState (AutoSave on/off, Saved) | [doc SRC-008] |
| Page x of y | Document.pageCount | [inf Q-001] |
| Word count | Document.wordCount | [inf Q-001] |

## States

| State | How to reach it | What it shows | Evidence |
|---|---|---|---|
| Empty | Blank document | One page, Normal style | [inf Q-002] |
| Local file | Open a file not in the cloud | AutoSave off; Save needed; AutoRecover protects | [doc SRC-008] |
| Cloud file | Open a OneDrive file | AutoSave on | [doc SRC-008] |
| Tracking | Ctrl+Shift+E | Edits shown as markup per the markup view | [doc SRC-002] |

## Backstage view (S-002)

- Full-window File menu: New, Open, Info, Save a Copy (Save As when AutoSave is off), Print with preview, Export, Share, Close. [doc SRC-001] [doc SRC-008]

## Navigation pane (S-003)

- Ctrl+F opens it on Results. Headings tab lists headings; drag a heading to move it with its content; right-click to promote, demote, insert, delete or select a section; collapse levels. Pages tab shows thumbnails. [doc SRC-007]

## Version history pane (S-004)

- Opened from the file name. Lists versions with time and author; Open version shows it read-only in a separate window with Restore. [doc SRC-008]

## Reviewing pane (S-005)

- Lists every revision and comment with a summary count; vertical or horizontal. [doc SRC-002]

## Immersive Reader (S-006)

- Column width, page colour, line focus (1, 3 or 5 lines), text spacing, syllables, read aloud with speed and voice. [doc SRC-013]

## Not tested

- Everything visual: no live observation of Word (needs a test Microsoft account for Word for the web).
