# FL-001 Write and format a document
User goal: get words onto a page and give them structure · Features: F-001, F-002, F-003, F-022, F-036 · Status: draft

## Steps

| # | Screen | User action | System response | Evidence |
|---|---|---|---|---|
| 1 | S-001 | Open a new document | Blank page, cursor at top margin, style "Normal text" | [inf Q-002] |
| 2 | S-001 | Type a title, choose Heading 1 (Ctrl+Alt+1) | Style picker shows Heading 1; outline gains an entry | [doc SRC-001] [doc SRC-008] |
| 3 | S-001 | Type paragraphs, Ctrl+B / Ctrl+I, lists with Ctrl+Shift+7/8 | Formatting applies at once; toolbar reflects state | [doc SRC-001] [obs EV-002] |
| 4 | S-001 | Pause | Save state next to the title shows saving then saved | [obs EV-001] |

## Branches and errors

| At step | Condition | What happens | Evidence |
|---|---|---|---|
| 4 | Offline without offline access | Edits cannot be saved; status explains | [doc SRC-009] |

## Not tested

- The exact wording of the save states: anonymous view does not save.
