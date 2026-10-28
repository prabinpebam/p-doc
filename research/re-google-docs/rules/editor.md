# Rules: editing, layout, review and versions

### R-001 Every change is saved automatically; Ctrl+S does nothing harmful
- Given a document open for editing
- When the writer types or presses Ctrl+S
- Then the change is saved without a dialog and the shortcut list notes "Every change is automatically saved"
- Evidence: [doc SRC-001]
- Feature: F-036 · Screen: S-001

### R-002 Headings feed the outline
- Given the outline is shown
- When text gets a Heading style
- Then it appears in the outline at its level; "Remove from outline" hides it without changing the style
- Evidence: [doc SRC-008] [obs EV-002]
- Feature: F-022 · Screen: S-001

### R-003 Pageless hides page-only elements without deleting them
- Given a document with headers, footers or page numbers
- When it switches to pageless
- Then those elements are hidden and come back when it switches back to pages; columns, page numbers, headers and footers cannot be added while pageless
- Evidence: [doc SRC-005]
- Feature: F-016 · Screen: S-001

### R-004 Page setup applies to the whole document, this section, or this section forward
- Given section breaks exist
- When the writer changes orientation in Page setup
- Then "Apply to" decides the scope; "Set as default" makes the setup the default for new documents
- Evidence: [doc SRC-011]
- Feature: F-017 · Screen: S-002

### R-005 In suggesting mode edits become suggestions
- Given the mode is Suggesting
- When the writer inserts or deletes text
- Then insertions show in colour and deletions struck through, each as a suggestion that can be accepted or rejected; accepting applies it, rejecting removes it
- Evidence: [doc SRC-003] [obs EV-003]
- Feature: F-028 · Screen: S-001

### R-006 Restoring a version keeps history
- Given an earlier version is selected in version history
- When the writer chooses "Restore this version"
- Then it becomes the current version and the versions in between stay in history
- Evidence: [doc SRC-002]
- Feature: F-031 · Screen: S-004

### R-007 Named versions are capped and can be filtered
- Given version history is open
- When the writer names a version
- Then it is kept separate from automatic grouping; a document holds up to 40 named versions; "Only show named versions" filters the list
- Evidence: [doc SRC-002]
- Feature: F-031 · Screen: S-004

### R-008 Resolving a comment hides it but keeps it
- Given an open comment
- When the writer resolves it
- Then it leaves the margin and stays in the comments panel under resolved, where it can be reopened
- Evidence: [doc SRC-004]
- Feature: F-027 · Screen: S-003

### R-009 The table of contents does not update itself
- Given a table of contents exists
- When headings change
- Then the table keeps its old entries until the writer chooses Refresh
- Evidence: [doc SRC-007]
- Feature: F-024 · Screen: S-001

### R-010 Toolbar names carry their shortcuts
- Given any toolbar button with a shortcut
- When it is announced or hovered
- Then its name includes the shortcut, for example "Bold (Ctrl+B)"
- Evidence: [obs EV-002]
- Feature: F-041 · Screen: S-001

## Not tested

- R-005 colours per author and R-006 grouping intervals: needs a signed-in session (Needs human).
