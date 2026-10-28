# Production barriers: Google Docs

Clone target market: see `00-charter.md`.
Not legal advice. A legal reading without a source is `[inf]` with a question for counsel in `questions.md`.

## Summary

| Barrier | Category | Severity | Market weight | Blocks | Lead time |
|---|---|---|---|---|---|
| BR-001 Real-time sharing needs a hosted service | infrastructure | cuts feature | nice to have | F-040 | months |
| BR-002 Google-only services | permissioned integration | cuts feature | nice to have | F-013, F-014, F-037 | n/a |

### BR-001 Real-time sharing needs a hosted service
- Category: infrastructure
- Blocks: F-040 (share, publish, approvals) and live co-editing
- Gatekeeper: none; it needs a server the clone does not have
- Severity: cuts feature
- Market weight: nice to have for a single-writer desktop app
- What it takes: a sync server with operational transforms or CRDTs, accounts and access control
- Mitigation: share through GitHub (public repository) and review with comments and suggestions in the file
- Evidence: [doc SRC-003] [inf Q-006]

### BR-002 Google-only services
- Category: permissioned integration
- Blocks: smart chips that link to Google people and files, Explore, voice typing, translate
- Gatekeeper: Google
- Severity: cuts feature
- Market weight: nice to have
- What it takes: Google APIs and consent screens
- Mitigation: keep local equivalents (date chip, spelling from the OS)
- Evidence: [obs EV-003]
