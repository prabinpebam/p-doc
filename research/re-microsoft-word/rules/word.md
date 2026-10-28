# Rules: layout, review and saving

### R-001 A section break starts a new section with its own page setup
- Given a section break (next page, continuous, even or odd)
- When the writer changes margins, orientation, columns or headers in one section
- Then only that section changes; next page starts it on a new page, continuous on the same page, even/odd on the next even/odd page
- Evidence: [doc SRC-005]
- Feature: F-006 · Screen: S-001

### R-002 Headers link to the previous section by default
- Given a new section
- When the writer edits its header
- Then the previous section's header changes too, unless "Link to Previous" is off; "Different First Page" and "Different Odd & Even Pages" give separate headers
- Evidence: [doc SRC-004]
- Feature: F-007 · Screen: S-001

### R-003 Tracked changes record author and kind
- Given Track Changes is on
- When anyone inserts, deletes or formats text
- Then the change is recorded as a revision with author and time and shown per the markup view
- Evidence: [doc SRC-002]
- Feature: F-013 · Screen: S-001

### R-004 Accept and reject move to the next change
- Given revisions exist
- When the writer accepts or rejects one from the Review tab
- Then Word applies or removes it and selects the next revision; "Accept All" and "Reject All" act on all, or on the shown reviewers only
- Evidence: [doc SRC-002]
- Feature: F-015 · Screen: S-001

### R-005 Markup views change only what is shown
- Given revisions exist
- When the writer picks Simple Markup, All Markup, No Markup or Original
- Then the display changes and the revisions stay; Simple shows a red bar in the margin, All shows inline markup and balloons
- Evidence: [doc SRC-002]
- Feature: F-014 · Screen: S-001

### R-006 Moving a heading in the Navigation pane moves its content
- Given the Headings tab is shown
- When the writer drags a heading to a new place
- Then the heading and everything under it up to the next heading of the same or higher level moves
- Evidence: [doc SRC-007]
- Feature: F-010 · Screen: S-003

### R-007 A table of contents is a field updated on request
- Given a table of contents built from heading styles
- When headings change
- Then the writer chooses Update Table, either page numbers only or the entire table
- Evidence: [doc SRC-006]
- Feature: F-011 · Screen: S-001

### R-008 AutoSave replaces Save As with Save a Copy
- Given AutoSave is on
- When the writer wants a different file
- Then File offers Save a Copy so changes do not go into the original by mistake
- Evidence: [doc SRC-008]
- Feature: F-020 · Screen: S-002

### R-009 Restoring a version makes it current
- Given version history is open
- When the writer opens a version and chooses Restore
- Then that version becomes the current file and the replaced one stays in history
- Evidence: [doc SRC-008]
- Feature: F-021 · Screen: S-004

### R-010 Find and replace can match patterns and formatting
- Given the Replace dialog
- When "Use wildcards" or a format is set
- Then matches follow the pattern or formatting; special characters (paragraph mark ^p, tab ^t) can be searched and replaced
- Evidence: [doc SRC-011]
- Feature: F-004 · Screen: S-001

## Not tested

- All rules come from documentation; none was exercised in Word.
