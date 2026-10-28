# P-Doc: parity with Google Docs and Word

What Google Docs and Microsoft Word can do, and what P-Doc does about each. Every row ends in one decision, so the scope has an edge: **Have** (built in stages 1–6), **Add** (a user-can statement and a stage), **Later** (worth doing, past the cut line for this release), **Skip** (won't build, with the reason). The user-can statements (U39–U80) are in the [spec](spec.md) §3; the stages and their evidence are in the [Definitions of Done](definition-of-done.md).

> **TL;DR.**
> - **Sources:** the research knowledge bases (`GD F-###`, 42 Google Docs features observed or documented; `W F-###`, 30 Word features from documentation), widened with Word's and Docs' full menus for the power features the inventories group together.
> - **Result:** 149 capabilities. 43 Have, 82 Add (U39–U80, stages 7–16), 9 Later, 15 Skip. (Three image rows added during stage 7: drag to move, top-and-bottom wrap, and the other wrap modes.)
> - **Cut line:** everything marked Add is in this release, power-user features included; Later waits for the owner's use to show it's needed; Skip conflicts with a promise or a non-goal.
> - **Order:** images beside the document first (A6 failed, so the format changes before anything builds on it), then the daily writing tools, then the layout features with pagination risks (each stage proves its risk first), then review, references, navigation and files. Install moves to last (stage 17).
> - **Audited:** 2026-10-28, after stage 6.

## How to read it

- **Docs** and **Word**: the research ID where there is one, else "yes" from the product's menus, or "—" when the product doesn't have it.
- **P-Doc**: Have, Add, Later or Skip. **U** and **Stage** say where it's built.
- A stage holds 3–6 user-can statements, one end-to-end journey and a "Try it", so each one ends in something the owner can use.

## Writing and formatting

| Capability | Docs | Word | P-Doc | U | Stage | Note |
|---|---|---|---|---|---|---|
| Bold, italic, underline, strikethrough, super/subscript | F-001 | F-001 | Have | U2 | 1 |  |
| Font, size, text colour, highlight | F-001 | F-001 | Have | U2 | 1 |  |
| Clear formatting | F-007 | F-001 | Have | U2 | 1 |  |
| Small caps, all caps, letter spacing | F-001 | yes | Add | U44 | 8 | Exported to .docx and HTML |
| Double strikethrough, underline styles, text effects | — | yes | Skip |  |  | Decorative; clutters P3 |
| Change case (sentence, lower, upper, capitalise each word) | yes | yes | Add | U44 | 8 | Shift+F3 cycles, as Word |
| Paint format, copy and paste formatting | F-006 | yes | Add | U44 | 8 |  |
| Paragraph styles Normal, Title, Subtitle, Heading 1–4, Quote, Code | F-002 | F-002 | Have | U3 | 1 |  |
| Heading 5 and 6 | F-002 | F-002 | Add | U41 | 8 | Outline, TOC and exports follow |
| Update style to match, reset styles | F-002 | F-002 | Have | U4 | 1 |  |
| Modify a style (font, size, colour, emphasis, spacing, indent, next style) | — | F-002 | Add | U41 | 8 |  |
| Create own paragraph styles | — | F-002 | Add | U41 | 8 | Stored in the document; travel to .docx |
| Save styles as my defaults, use my default styles | F-002 | yes | Add | U41 | 8 | Kept in settings, applied to new documents |
| Style sets that restyle the whole document | — | yes | Add | U42 | 8 | A few built-in sets |
| Align left, centre, right, justify | F-004 | F-003 | Have | U5 | 1 |  |
| Line spacing presets, space before and after | F-004 | F-003 | Have | U5 | 1 |  |
| Custom line spacing and exact spacing | F-004 | F-003 | Add | U46 | 9 |  |
| Indent by steps | F-004 | F-003 | Have | U5 | 1 |  |
| First-line and hanging indents, left and right indents | F-004 | F-003 | Add | U46 | 9 |  |
| Tab stops (left, centre, right, decimal) with leaders | F-021 | yes | Add | U46 | 9 |  |
| Ruler with indent, tab and margin handles | F-021 | yes | Add | U46 | 9 | View > Show ruler |
| Keep with next, keep lines together, page break before | F-004 | yes | Add | U47 | 9 | Pagination honours them (A10) |
| Widow and orphan control | — | yes | Add | U47 | 9 | Needs paragraphs to split across pages (A10) |
| Paragraph borders and shading | — | yes | Add | U48 | 9 |  |
| Right-to-left paragraphs | yes | yes | Add | U48 | 9 |  |
| Bulleted, numbered and checklists with nesting | F-003 | F-003 | Have | U6 | 1 |  |
| Number formats (1, a, i, A, I), bullet glyphs, start at, restart, continue | yes | yes | Add | U43 | 8 |  |
| Multilevel lists to nine levels | yes | yes | Add | U43 | 8 |  |
| Show non-printing characters | F-021 | yes | Add | U49 | 9 | Ctrl+Shift+P, as Docs |
| Undo, redo, cut, copy, paste, paste without formatting | F-005 | yes | Have | U1 | 1 |  |
| Copy as Markdown, paste from Markdown | F-005 | — | Add | U45 | 8 |  |
| Markdown autoformat while typing (with a switch) | F-009 | — | Add | U45 | 8 |  |
| Smart quotes | F-038 | yes | Have | U12 | 1 |  |
| Substitutions and AutoCorrect list (own entries) | F-038 | yes | Add | U45 | 8 |  |
| Automatic capitalisation, link detection, list detection | F-038 | yes | Add | U45 | 8 | Each with a switch |
| Sort paragraphs or table rows | — | yes | Add | U50 | 9 |  |
| Find and replace with match case, whole words, regex | F-008 | F-004 | Have | U10 | 1 |  |
| Find by formatting, special characters | — | F-004 | Later |  |  | Regular expressions cover most uses |

## Images, tables, code and equations

| Capability | Docs | Word | P-Doc | U | Stage | Note |
|---|---|---|---|---|---|---|
| Images from a file, paste or drop | F-011 | F-030 | Have | U7 | 1 |  |
| Images stored once beside the document | — | — | Add | U39 | 7 | A6 failed; O4 |
| Large images (over 2 MB) | yes | yes | Add | U39 | 7 | Cap rises to 20 MB once images are beside the document |
| Resize with handles, keep proportions, reset size | F-011 | yes | Add | U40 | 7 |  |
| Align and wrap: in line (break text), wrap left or right | F-011 | yes | Add | U40 | 7 | Wrap paginates with its paragraph (A9) |
| Move an image by dragging it | yes | yes | Add | U40 | 7 | Cut and paste also moves it |
| Wrap top and bottom | — | yes | Have | U40 | 7 | The same as In line with text |
| Wrap tight or through, behind or in front of text, fixed position on the page | yes | yes | Later |  |  | Needs positioning on the page that pagination (A9) doesn't model; square wrap covers most uses |
| Crop and reset crop | F-011 | yes | Add | U40 | 7 | Non-destructive; .docx keeps it |
| Replace image, alt text | F-011 | yes | Add | U40 | 7 | Alt text feeds the accessibility check |
| Images from the web or a URL | F-011 | yes | Skip |  |  | Needs the network (P2); paste covers it |
| Drawings, shapes, text boxes, SmartArt, WordArt, icons | F-013 | F-030 | Skip |  |  | Floating objects break page-true layout (P4); paste an image |
| Charts | F-013 | yes | Skip |  |  | Needs a spreadsheet; paste an image |
| Tables: insert, add and remove rows and columns | F-012 | F-030 | Have | U7 | 1 |  |
| Merge and split cells | F-012 | yes | Add | U60 | 12 |  |
| Column widths, table width and alignment | F-012 | yes | Add | U60 | 12 | Alignment on the page left over from stage 12 (DoD 12.1) |
| Borders, cell shading, vertical alignment, cell padding | F-012 | yes | Add | U60 | 12 |  |
| Header rows that repeat on each page | F-012 | yes | Add | U60 | 12 |  |
| Long tables break between rows across pages | yes | yes | Add | U60 | 12 | Today a tall table overflows its page (A11) |
| Text to table and back, distribute columns | — | yes | Add | U60 | 12 | Text to table and back left over from stage 12 (DoD 12.1) |
| Table styles | — | yes | Later |  |  | Borders and shading cover it |
| Table formulas | — | yes | Skip |  |  | Spreadsheet work |
| Code blocks | F-014 | — | Have | U3 | 1 |  |
| Syntax highlighting with a language | F-014 | — | Add | U61 | 12 |  |
| Equations, inline and on their own line | F-013 | yes | Add | U62 | 12 | LaTeX typed, drawn as maths; Word equations in .docx (O13) |
| Special characters | F-013 | F-030 | Have | U7 | 1 |  |
| Horizontal line, page break | F-010 | yes | Have | U7 | 1 |  |

## References

| Capability | Docs | Word | P-Doc | U | Stage | Note |
|---|---|---|---|---|---|---|
| Table of contents that stays current | F-024 | F-011 | Have | U9 | 1 |  |
| Contents with page numbers and dotted leaders, or links; levels | F-024 | F-011 | Add | U54 | 10 |  |
| Footnotes (Ctrl+Alt+F) with next and previous | F-015 | F-012 | Add | U51 | 10 | Bottom of their page (A8) |
| Endnotes (Ctrl+Alt+D), convert between them | — | F-012 | Add | U51 | 10 |  |
| Bookmarks | F-010 | yes | Add | U52 | 10 |  |
| Links to headings and bookmarks | F-010 | yes | Add | U52 | 10 |  |
| Captions that number themselves (Figure, Table, Equation) | — | yes | Add | U53 | 10 |  |
| Cross-references (text, number or page) that stay current | — | yes | Add | U53 | 10 |  |
| Table of figures | — | yes | Add | U53 | 10 |  |
| Citations and bibliography (APA, MLA, Chicago) | F-039 | yes | Add | U68 | 14 |  |
| Index (mark entries, insert index) | — | yes | Add | U69 | 14 | Page numbers from pagination |
| Table of authorities | — | yes | Skip |  |  | Legal niche |
| Fields: page, page count, date, title, author, own variables | F-039 | yes | Add | U70 | 14 | Docs calls own fields variables |

## Pages and sections

| Capability | Docs | Word | P-Doc | U | Stage | Note |
|---|---|---|---|---|---|---|
| Pages and Pageless, text width | F-016 | F-009 | Have | U13 | 2 |  |
| Paper, orientation, margins, page colour, set as default | F-017 | F-008 | Have | U14 | 2 |  |
| Header and footer, page number and count, different first page | F-018–F-019 | F-007 | Have | U15 | 2 |  |
| Different odd and even pages | F-018 | F-007 | Add | U57 | 11 |  |
| Page number formats (1, i, I, a, A) and start at | yes | yes | Add | U57 | 11 |  |
| Section breaks: next page, continuous, odd page, even page | F-010 | F-006 | Add | U55 | 11 | O3 revisited (A12) |
| Orientation, paper and margins per section | F-017 | F-008 | Add | U55 | 11 |  |
| Headers and footers per section, linked to previous or not | — | F-007 | Add | U57 | 11 |  |
| Columns (1–3, spacing, line between), column break | F-020, F-010 | F-008 | Add | U56 | 11 | Columns per section (A13) |
| Watermark (text or image) | yes | yes | Add | U58 | 11 |  |
| Line numbers | F-039 | yes | Add | U59 | 11 |  |
| Automatic hyphenation | — | yes | Add | U59 | 11 | Must work offline (A14) |
| Drop cap | — | yes | Add | U59 | 11 |  |
| Page borders | — | yes | Later |  |  | Page colour and paragraph borders cover most uses |
| Gutter, mirror margins, booklet | — | yes | Later |  |  | Book binding; outside the documents P-Doc is for |
| Print and PDF matching the screen | F-034 | yes | Have | U16 | 2 |  |
| PDF with the heading outline and working links | — | yes | Add | U80 | 16 |  |

## Review

| Capability | Docs | Word | P-Doc | U | Stage | Note |
|---|---|---|---|---|---|---|
| Editing, Suggesting, Viewing modes | F-029 | F-013 | Have | U21 | 4 |  |
| Commenting mode (comment, don't edit) | F-029 | yes | Add | U64 | 13 |  |
| Insertions and deletions as suggestions | F-028 | F-013 | Have | U22 | 4 |  |
| Formatting changes as suggestions | F-028 | F-013 | Add | U63 | 13 | O6 revisited (A4) |
| Keep a document always in Suggesting (lock tracking) | — | F-013 | Add | U64 | 13 |  |
| Markup views | — | F-014 | Have | U23 | 4 |  |
| Accept or reject one, next, previous, all | F-028 | F-015 | Have | U24 | 4 |  |
| Filter, accept and reject by reviewer | — | F-015 | Add | U65 | 13 |  |
| Comments: add, reply, edit, resolve, reopen, delete | F-027 | F-017 | Have | U25 | 4 |  |
| Review panel with filter | F-027 | F-016 | Have | U26 | 4 |  |
| Compare two documents into suggestions | F-030 | F-018 | Add | U66 | 13 | Reuses the version diff |
| Combine several reviewers' copies | — | F-018 | Skip |  |  | Sync keeps both copies; compare covers the rest |
| Word's comments and tracked changes in a .docx, both ways | — | F-013, F-017 | Add | U67 | 13 | Suggestions already export as tracked changes |
| @mentions, assignments, reactions, approvals, sharing | F-040 | F-029 | Skip |  |  | Non-goal: no co-editing or sharing |

## Navigation and view

| Capability | Docs | Word | P-Doc | U | Stage | Note |
|---|---|---|---|---|---|---|
| Outline: jump, collapse, drag a section | F-022 | F-010 | Have | U8 | 1 |  |
| Promote and demote headings from the outline | — | F-009 | Add | U71 | 15 |  |
| Collapse sections in the document | F-023 | F-010 | Add | U71 | 15 |  |
| Go to page, heading, bookmark, comment, footnote (Ctrl+G) | — | F-005 | Add | U71 | 15 |  |
| Page thumbnails | — | F-010 | Later |  |  | Go to and the outline cover long documents |
| Command search, shortcuts dialog | F-025, F-041 | F-025 | Have | U11 | 1 |  |
| Access keys (Alt then a letter) | yes | F-026 | Have | U11 | 1 | Menus open with Alt |
| Zoom, full screen, compact mode, focus view | F-026 | F-024 | Have | U19 | 1 |  |
| Zoom to page width, whole page, two pages side by side | — | F-009 | Add | U72 | 15 |  |
| New window, two documents side by side | — | yes | Add | U73 | 15 |  |
| Split one document into two panes | — | yes | Later |  |  | New window covers most uses |
| Read aloud | — | F-028 | Add | U74 | 15 | Windows voices, offline |
| Immersive reader (line focus, syllables) | — | F-028 | Skip |  |  | Focus view and zoom cover reading |
| Customise the toolbar or shortcuts | — | yes | Skip |  |  | One calm toolbar (P3); command search reaches everything |
| Document tabs | yes | — | Later |  |  | Headings and the outline cover it; tabs don't map to .docx or PDF (O12) |

## Files, library and tools

| Capability | Docs | Word | P-Doc | U | Stage | Note |
|---|---|---|---|---|---|---|
| Autosave with a save state | F-036 | F-019 | Have | U1 | 1 |  |
| Recovery after a crash | — | F-022 | Have | U1 | 1 |  |
| Version history: list, compare, restore, name, copy | F-031 | F-021 | Have | U28–U32 | 3 |  |
| Library: Private and Public, search, rename, copy, bin | F-032 | F-023 | Have | U33 | 1 |  |
| Offline and sync | F-035 | F-019 | Have | U34–U36 | 5 |  |
| Open recent | yes | F-023 | Add | U75 | 16 |  |
| Star documents, sort the library | yes | yes | Add | U75 | 16 |  |
| Folders in the library | yes | yes | Add | U75 | 16 | Folders inside each repository |
| Document details: author, subject, keywords | F-032 | F-023 | Add | U76 | 16 | Carried into .docx, PDF and HTML |
| Templates: start from one, save as one | yes | yes | Add | U77 | 16 |  |
| Insert menu at the cursor (@), date chips | F-014 | — | Add | U70 | 14 |  |
| Dropdown chips, people, file and event chips | F-014 | — | Skip |  |  | Google services or forms; a single writer has no use for them |
| Import .docx, .md, .html, .txt | — | F-023 | Have | U18 | 6 |  |
| Export .docx, PDF, .md, .html, .txt | F-033 | F-023 | Have | U16, U17 | 6 |  |
| Export EPUB, OpenDocument (.odt), Rich Text (.rtf) | F-033 | yes | Add | U80 | 16 |  |
| Import .odt and .rtf | yes | yes | Later |  |  | Rare in this audience; Word converts them |
| Command line for scripts and agents | — | — | Have | U38 | 6 |  |
| Word count, with the selection | F-037 | F-027 | Have | U12 | 1 |  |
| Spelling suggestions | F-037 | yes | Have | U12 | 1 |  |
| Spelling language, add to dictionary, ignore | F-037 | yes | Add | U78 | 16 |  |
| Grammar, thesaurus, dictionary, translate | F-037 | yes | Skip |  |  | Online services (P2) |
| Voice typing | F-037 | yes | Skip |  |  | Windows dictation (Win+H) already types into P-Doc |
| Accessibility check | F-042 | yes | Add | U79 | 16 | Headings in order, alt text, table headers, contrast |
| Macros, add-ins, mail merge, envelopes | — | yes | Skip |  |  | Non-goals |
| Passwords, restrict editing, digital signatures | — | yes | Skip |  |  | Plain files in your own repositories (P2); privacy is per repository |

## Counts

| Decision | Rows |
|---|---|
| Have | 42 |
| Add | 81 |
| Later | 8 |
| Skip | 15 |

Rows are capabilities, so one user-can statement often covers several rows. Later rows go back to the owner after the release; any of them can come in by adding a user-can statement and a DoD row.
