# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Ombuto Code** is an Electron-based Agentic Software Engineering Workbench tool, providing engineering support from requirements definition, solution architecture to automated development and validation.

The tool treats requirements as first-class citizens of the codebase. Documents live in a `docs/` directory at the project root, versioned by the same git history as the source code, with a `.ombutoplan/` directory for tool configuration.

## Mandatory Agent Workflow

All agents MUST follow `.ombutocode/OMBUTOCODE_ENGINEERING_GUIDE.md`. This is a system-level instruction.

Worktree integrity rule:
- `.ombutocode/` must be present in ticket worktrees because it contains the workflow guide, planning references, epic specs, and agent configuration.
- Do not ignore the top-level `.ombutocode/` directory in `.gitignore`, or scheduler-created worktrees will be missing their source-of-truth files.
- Ignore only dependency or generated subpaths inside `.ombutocode/`, for example:

```gitignore
.ombutocode/src/node_modules/
```

## Ombuto Code (Workflow Manager)

Ombuto Code is an Electron/Vue 3 app in `.ombutocode/` that manages the agentic development workflow. It is separate from the app being built.

### Ombuto Code Tech Stack
- Electron (v25) + Vue 3 + Pinia + Vue Router (hash history)
- Vite (renderer builds to `dist/`), electron-builder for packaging
- sql.js (SQLite in JS), electron-store for settings
- Agent tools configured in `.ombutocode/codingagents/codingagents.yml`

### Source of Truth (priority order)
1. `.ombutocode/data/ombutocode.db` (backlog_tickets table) — canonical task list
2. `.ombutocode/epics/epic_<NAME>.md` — epic specifications
3. `.ombutocode/src/` — Ombuto Code source
4 `shared/docs/prd.md` — Product requirements and vision
5. `frontend/docs/architecture/architecture.md` — architecture spec for front-end application

## Conventions

- Feature spec files use uppercase names: `feature_FEATURE_NAME.md` (e.g., `feature_EMBEDDED_BANK_BROWSER.md`)
- Epic statuses: `NEW` (spec created, no tickets) → `TICKETS` (tickets created in backlog) → `BUILDING` (tickets being worked on) → `DONE` (manually assigned by owner)
- OmbutoCode backlog tickets are always created with `status: backlog`, not `todo`. The scheduler only processes `todo` tickets that have an explicit agent assignee — tickets with `assignee: null` or `NONE` are skipped.

## Workflow

Project automation workflow instructions are in `.ombutocode/OMBUTOCODE_ENGINEERING_GUIDE.md` and must be followed for this project.

### Ticket Lifecycle
- Agents pick up ONLY tickets with `status: todo` and no unmet dependencies (a dependency in `review` is considered met)
- Re-read the backlog before marking a ticket `in_progress` to confirm it's still `todo`
- When the scheduler launches agents, it handles status transitions automatically — agents in that context should NOT modify status fields directly
- STOP after completing one ticket — do not automatically start another
- "Develop a feature" or "build a feature" means planning only, not implementation

### Database Access Rules
- **Planning mode:** Agents CAN read from and write to `.ombutocode/data/ombutocode.db` to create tickets (INSERT with `status: backlog`) and query existing tickets
- **Execution mode (scheduler-launched):** The scheduler handles status transitions — agents should not modify ticket status directly
- **Manual execution:** Agents invoked manually by a human may update ticket fields directly (see OMBUTOCODE_ENGINEERING_GUIDE.md §2)

### Scope Control
- Never expand a ticket's scope — create a new ticket instead
- Never invent epics not in the backlog
- Never introduce new frameworks without approval
- Never perform broad refactors without a refactor ticket

### Commands
```bash
# Build and launch Ombuto Code UI (Windows)
.ombutocode/buildandrun.bat

# Reset project data to clean state
.ombutocode/initombuto.bat

# Install dependencies
cd .ombutocode/src && npm install

# Run Ombuto Code tests (Node built-in test runner)
cd .ombutocode/src && node --test test/*.test.js

# Run single test
cd .ombutocode/src && node --test test/scheduler.test.js
mo
