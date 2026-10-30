# AGENTS.md

Instructions for AI coding agents working in this repository.

## Project context

- **P-Doc** (working name, O1) is a desktop writing app that takes the best of Google Docs and Microsoft Word: Docs' calm, always-saved, comment-and-suggest flow and Word's page-true layout, styles and references. Documents live as files in the owner's own Git repositories: a **private** repository by default, a **public** one for what they choose to publish, and fully offline on the computer until they connect GitHub.
- The desktop app is Electron, modelled on [focus-notes](https://github.com/prabinpebam/focus-notes) (first run, sign-in through Git's own credential helper, setup and packaging).
- A one-person hobby project. Move fast; what still matters: the owner's documents are never lost or overwritten, private documents never become public, no secrets are committed, and the owner's computer and accounts are never taken over by tests.

## Agent kits

Three kits, pinned as Git submodules at the root. Never edit them or their installed copies in `.github/skills` and `.github/agents`; project specifics go in the facts sections below.

| Kit | Owns | Start with |
| --- | --- | --- |
| [agentic-craft](https://github.com/prabinpebam/agentic-craft) (`agentic-craft/`) | What is worth building and what success means: the spec, assumptions, Definitions of Done, design system, copy, waits, performance | the `craft` skill |
| [agent-orchestration](https://github.com/prabinpebam/agent-orchestration) (`agent-orchestration/`) | How the work runs: modes, bounds, validation tiers, progress reviews, logs and handoffs | the `orchestrate` skill |
| [Slate](https://github.com/prabinpebam/slate) (`slate/`) | The documentation site in `docs/` | the `slate` skill |

Research into the reference products follows [RES](https://github.com/alextnetto/res) (reverse engineering SaaS, its knowledge-base format and safety model), driven through [Stagehand](https://github.com/browserbase/stagehand) by the rig in `research/rig/`. The knowledge bases are in `research/re-*/` and feed the spec; RES and Stagehand are references, not submodules (cloned into the ignored `.refs/` when needed).

## Layout

- `apps/desktop/`: the Electron app (`src/main` shell and Git storage, `src/preload`, `src/renderer` React + TipTap editor, `src/shared` the contracts) and its journeys (`e2e/`).
- `packages/core/`: the document format, versions and library logic, with no Electron or DOM.
- `packages/tokens/`: the design tokens (W3C DTCG), built by agentic-craft's `build-tokens.mjs`.
- `research/`: the Stagehand rig and the RES knowledge bases.
- `docs/`: the Slate site: spec, Definitions of Done, work plan, research summaries.

## Rules

1. Follow the chain: promise (P) → job (J) → user-can (U) → flow → view. Change the spec first, then the code. Every requirement traces to a user-can statement.
2. Every value in the UI is a token; components live in `apps/desktop/src/renderer/ui/` by tier; copy follows `docs/design/copy-glossary.md`.
3. No wait is silent: every save, sync or load has a sign where it happens, and "Saved" means written to disk.
4. The GitHub token lives only in Git's credential helper; it is never written, logged, put in a URL or a process argument.
5. Tests never touch the owner's real GitHub, documents or settings: they use temporary folders, local bare repositories and a fake GitHub API.
6. Licences: MIT app; permissive dependencies only.
7. Package sources: npm goes through the registry in `.npmrc`. Never commit secrets.
<!-- agentic-craft:start -->
## Craft (agentic-craft harness)

This project uses the [agentic-craft](https://github.com/prabinpebam/agentic-craft) skills for product reasoning: what is worth building and what success means. Start with the `craft` skill; it routes to the rest: `ground` (promise → jobs → user-can → flows → UI), `assumptions`, `definition-of-done`, `design-system`, `ui-copy`, `perceived-performance`, `performance`. Agents: `grounding-critic`, `design-system-auditor`. These skills define product intent and success criteria; they don't prescribe how the work is carried out.

### Project facts (fill in; the skills read these)

- **Product artifacts:** `docs/product/spec.md` (assumptions register in its "Assumptions" section) · `docs/product/definition-of-done.md`
- **Design system:** tokens `packages/tokens/src/` (DTCG JSON), built with `pnpm tokens` (agentic-craft `tools/build-tokens.mjs` → `packages/tokens/dist/tokens.css`) · checks `pnpm lint:design` (check-tokens, lint-styles, lint-copy) · components by tier `apps/desktop/src/renderer/ui/{primitives,components,patterns}` · library at the in-app "Design system" view (`Ctrl+Alt+Shift+D` in dev) · glossary `docs/design/copy-glossary.md`
- **Performance:** benchmark `pnpm perf` (opens, types into and saves a 50-page document in the built app) · baseline `docs/product/perf-baseline.json` · budgets in the spec's "Waits" section
<!-- agentic-craft:end -->

<!-- agent-orchestration:start -->
## Orchestration (agent-orchestration harness)

This project uses the [agent-orchestration](https://github.com/prabinpebam/agent-orchestration) skills to carry out work. Start with the `orchestrate` skill: it picks the mode (show me the UX sooner, prove the risky assumption, make this production-ready; work with me or keep going unattended) and routes to `execution-modes`, `stage-validation`, `progress-review` and `coordinate`. Agent: `throughput-reviewer` (about every 30 minutes of running work). The session clock (Copilot hooks in `.github/hooks/orchestration-clock.json`) is **mandatory**: it says when a review is due and when to roll over to a new session. Act on every reminder before the next increment, and never disable it or loosen its limits without the owner. Where the tool has no hooks, keep time by hand on the same limits. A **review build** is always running for the owner to try: built from the last validated commit, isolated from development (its own checkout, port or user-data folder, and demo data), refreshed at each validated increment or stage close, and named in every status report and handoff. These skills decide how work is run, not what to build; product intent comes from the files named below when there are any.

**Keep the main chat free.** The main chat is for triage only; everything else is delegated, and a main chat that isn't ready for the owner's next input is a failure. For every owner prompt it reads live state (unread messages, completion records, the live worker list and the durable registry/queue), classifies the input (a new item, a change of direction, a priority change, a rule change or a question), finds the affected tracks, steers, queues or launches, updates the execution plan, and ends with a one- to three-line reply. Long or multi-track work runs as main chat (triage only) → one delivery coordinator (registry, dependency map, routing, verification) → bounded workers; the main chat routes new direction to the current coordinator from the registry, never creates a second one, and doesn't re-verify routine deliveries. Workers do implementation, builds, test suites and long commands. Keep coordinator turns short and end them; no sleeps, polling loops, blocking waits or watchers that hold a turn open. One writer per working copy; check for an existing worker or successor before any launch.

**A quiet main chat.** Sub-chats message the main chat only for a decision only the owner can make, something new ready to try, or a safety blocker: at most 3 plain lines, no IDs or jargon. Acknowledgements, milestones, dispatch and transfer notes go to the coordinator and the records. The main chat ignores stale and routine notes (one short line when a reply can't be avoided) and anything from a retired coordinator. Every worker assignment and handoff carries this rule.

**Parallel tracks.** Independent items don't wait in one queue: the coordinator keeps a dependency map in the registry and dispatches every ready item, each with its own worktree and branch, worker and completion record. Build an uncertain piece as an isolated proof of concept first. Integrate tracks one at a time and run the checks again on the combined result; when two touch the same files, rebase the second onto the first. Before deleting a worktree, remove shared dependency links in it (such as a `node_modules` junction) non-recursively.

**Decide, don't ask.** Settle how something should behave from the reference products or prior decisions named below, and record the source. Ask the owner only for decisions that are theirs: irreversible actions, licences, publishing, real accounts, deleting their data.

**Yielding is not finishing.** Completion is event-driven, and ending a coordinator turn is not completing the owner's task: never mark it complete to silence keep-working reminders while dispatched or queued work remains; answer each reminder in one line; where the host can't idle with work pending, say so and use its supported continuation. At the same session limits, hand the registry to one fresh coordinator without restarting workers or resetting their clocks; explicitly mark the old clock's roll-over after transfer. Use `--session <id>` for clock commands when sessions share a folder. This was learned in VS Code agent sessions; other tools differ. Without parallel chats or notifications, keep a file queue, use short turns and start-of-turn status checks, and ask the owner to re-prompt (`orchestrate`).

### Project facts (fill in; the skills read these)

- **Product intent:** `docs/product/spec.md` and `docs/product/definition-of-done.md`
- **Work plan:** `docs/work/work-plan.md`
- **Commands by validation tier:** unit, related files `pnpm vitest run <files>` · types `pnpm typecheck` · one end-to-end test `pnpm e2e -g "<title>"` · full suites `pnpm test && pnpm e2e` · production build with budgets `pnpm build && pnpm perf` · installers `pnpm package`
- **Progress log:** `.agent-orchestration/progress.log` (ignored)
- **Branches and merges:** work on `main` in this local repository · commit locally with the Copilot co-author trailer · the agent may: commit; never push, create remote repositories or publish releases (the owner does) · must never break: documents in the owner's library
- **Review build:** the built app at the last validated commit, in its own git worktree `../p-doc-review` with its own data `../p-doc-review-data` (user-data folder, a demo library seeded on first start, an empty Git config, GitHub pointed at nothing on this computer); never the owner's library, settings or GitHub, never this folder · refresh after each validated increment or stage close: `node tools/review-build.mjs refresh <commit>` (installs, builds, restarts behind the owner's windows; never while it's the window in front unless `--force` with the owner's agreement) · `node tools/review-build.mjs status | start | stop` · open it: the P-Doc window on the taskbar (title shows the open document)
- **Coordinator registry:** the coordinator session's `files/coordinator-registry.json`, outside the repository; carry its exact absolute path in every handoff so the successor adopts the same registry. Record task, owner worker, working copy, state, trigger and completion signal, including message routes and completion-record paths. Workers write their own completion records; only the coordinator updates the registry. One writer per working copy; no blocking completion-file polls.
- **Reference products:** <the products whose current behaviour settles how something should work, in order of preference, and where decisions are recorded with their sources; or "none">
- **Reviews and escalation:** review every 30 minutes of running work · roll over to a new session after 90 minutes, 300 tool calls or 2 compactions (the session clock, `.github/hooks/orchestration-clock.json`; `node .github/hooks/orchestration-clock.mjs status`) · always escalate: anything that signs in to, writes to or creates repositories on the owner's real GitHub; licence questions; deleting the owner's files
<!-- agent-orchestration:end -->
