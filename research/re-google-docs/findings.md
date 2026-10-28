# Findings

## Problems

| ID | Finding | Severity | Where | Evidence |
|---|---|---|---|---|
| B-001 | No separate file you own: documents live only in Google's store; offline needs a per-browser opt-in | high | F-036 | [doc SRC-009] |
| B-002 | Table of contents does not refresh itself | low | F-024 | [doc SRC-007] |
| B-003 | Pageless hides headers and footers, so the same document prints differently by mode | medium | F-016 | [doc SRC-005] |

## Strengths

- Autosave with no Save step and a visible save state. [doc SRC-001] [obs EV-001]
- Suggesting mode is a single mode switch, not a separate review feature. [doc SRC-003]
- Outline built from headings with no setup. [doc SRC-008]
- Toolbar names include shortcuts, which teaches them. [obs EV-002]
- Menu search (Alt+/) reaches every command. [obs EV-003]

