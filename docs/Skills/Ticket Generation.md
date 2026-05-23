---
system: true
---

# Ticket Generation

## Overview

This skill guides AI coding agents in breaking down epics into well-structured implementation tickets. Each ticket should represent a single, clearly scoped unit of work that one agent can complete in one session.

The output is a set of tickets added to the project backlog, each linked back to the originating epic.

## Guidelines

- **Read the epic thoroughly** before proposing tickets — understand scope, acceptance criteria, and dependencies
- **Read the engineering guide** (`.ombutocode/OMBUTOCODE_ENGINEERING_GUIDE.md`) to understand ticket conventions
- **One ticket = one deliverable** — each ticket should produce a testable, reviewable change
- **Order matters** — infrastructure and setup tickets come before feature tickets
- **Do not create per-criterion unit-test tickets** — Ombuto Code has a built-in test and validation step that runs automatically for every ticket. (The mandatory closeout regression-test ticket described below is a separate, project-level concern — that one IS required.)
- **Size tickets appropriately** — aim for 3-8 tickets per epic, each completable in one agent session
- **Always append the three mandatory closeout tickets** described in the section below — every epic ends with epic-eval, regression-tests, and help-docs. Non-negotiable.
- **Always confirm** with the user before writing to the backlog

## Ticket Structure

Each ticket added to the backlog must include:

### Required Fields
- **id** — Sequential ID using an **informative epic-derived prefix**, not a generic project prefix. The prefix should be a short uppercase mnemonic of the parent epic (typically 4–6 letters drawn from the epic name), followed by a zero-padded sequence number — e.g. `SCAFF-001` for `epic_APP_SCAFFOLD`, `AUTH-001` for `epic_USER_AUTH`, `DBFND-001` for `epic_DATABASE_FOUNDATION`. This makes it immediately obvious which epic a ticket belongs to when scanning the backlog. Confirm the chosen prefix with the user when proposing the summary table. Sequence numbers restart at 001 within each epic prefix.
- **title** — Clear, actionable title in imperative form (e.g. "Create user authentication API endpoint")
- **status** — Always `backlog` for new tickets
- **assignee** — `null` (assigned later by the scheduler or user)
- **epic_ref** — Path to the epic file (e.g. `docs/Epics/epic_USER_AUTH.md`)
- **acceptance_criteria** — List of specific, testable criteria
- **dependencies** — List of ticket IDs this ticket depends on (empty if none)

### Required Context References
Each ticket must include a `references` section so the executing agent has full context:
- **prd** — Path to the PRD (e.g. `docs/Product Requirements Document/PRD.md`)
- **architecture** — Path to the architecture document (e.g. `docs/Architecture/Architecture.md`)
- **style_guide** — Path to the style guide, if it exists (e.g. `docs/Style Guide/StyleGuide.md`)
- **epic_ref** — Already included above — path to the parent epic

These references are passed to the coding agent when it picks up the ticket, giving it the full project context to make informed implementation decisions.

### Optional Fields
- **description** — Additional context if the title is not self-explanatory
- **notes** — Implementation hints, relevant file paths, or technical considerations

## Ticket Types

When breaking down an epic, consider these ticket types:

### 1. Setup / Infrastructure
- Database schema creation or migration
- Project scaffolding or configuration
- Dependency installation
- Environment setup

### 2. Core Implementation
- API endpoints or service methods
- Business logic implementation
- Data access layer
- Core algorithms

### 3. UI / Frontend
- Component creation
- Page layout and routing
- State management integration
- Form validation

**IMPORTANT:** When creating UI/Frontend tickets, check the epic's References section for any linked mockup images (lines starting with `- mockup:`). If mockup references exist, include them in the ticket's `references` section as `mockups` so the coding agent can see the target visual design when implementing the UI. Example:

```yaml
references:
  prd: docs/Product Requirements Document/PRD.md
  architecture: docs/Architecture/Architecture.md
  style_guide: docs/Style Guide/StyleGuide.md
  mockups:
    - docs/Mockups/AppScaffold.png
    - docs/Mockups/Dashboard.png
```

This ensures the agent implements the UI to match the approved mockup designs.

### 4. Integration
- Connecting frontend to backend
- Third-party API integration
- Inter-service communication

### 5. Documentation
- API documentation
- User-facing help content
- Architecture decision records

## Mandatory Closeout Tickets (always end every epic with these three)

Every epic breakdown MUST end with three additional tickets, in this exact order, **after** all feature/setup/UI tickets you have proposed. They are the safety net that turns "feature code shipped" into "feature genuinely complete and discoverable". Skip them and the breakdown is rejected.

Give each closeout ticket the same `<EPIC_PREFIX>-NNN` numbering as the rest of the epic (i.e. continue the sequence — don't use a separate suffix). Each one's `dependencies` MUST include every preceding feature ticket in the epic, plus the previous closeout ticket where applicable. They run last because they verify, lock in, and document the work the earlier tickets did.

### Closeout #1 — Epic-level evaluation (`<PREFIX>-NN`)

```
title: "Evaluate epic and address unmet acceptance criteria"
dependencies: [all preceding feature tickets in this epic]
acceptance_criteria:
  - [ ] Re-read every acceptance criterion across all preceding tickets in this epic and verify each is met by the actual implementation (not just by the per-ticket test phase)
  - [ ] Re-read the epic spec's §9 Acceptance Criteria and verify the epic-level requirements are met holistically
  - [ ] For each unmet criterion, either implement the fix directly (if small) or surface it as a new ticket with rationale
  - [ ] Report which criteria were verified, which were fixed, and which (if any) remain open
notes: "This is the LAST chance to catch gaps before regression tests and docs lock the epic in. Be strict — passing per-ticket tests does NOT prove the epic-level criteria are met."
```

### Closeout #2 — Regression tests (`<PREFIX>-NN`)

```
title: "Add regression tests covering this epic's behaviour to the project test suite"
dependencies: [the closeout-eval ticket above]
acceptance_criteria:
  - [ ] Identify the key user-facing behaviours and integration points introduced by this epic
  - [ ] Add automated tests for those behaviours in the project's existing test suite (matching the language, framework, and conventions of the codebase — do NOT introduce a new test framework)
  - [ ] Tests must run as part of the standard test command for the affected layer (e.g. `node --test test/*.test.js` for .ombutocode/src)
  - [ ] Tests must pass against the current main branch (they're regression tests — not currently failing — they're guards against future regressions)
  - [ ] Use realistic fixtures; avoid mocks for things that have real implementations available
notes: "These are PROJECT-LEVEL regression tests, distinct from the per-ticket automated test phase. The goal is that if a future ticket accidentally breaks this epic's behaviour, the project test suite catches it."
```

### Closeout #3 — Help docs update (`<PREFIX>-NN`)

```
title: "Update help.html with the features delivered by this epic"
dependencies: [the regression-tests ticket above]
acceptance_criteria:
  - [ ] Locate the project's help.html (search the codebase if the path isn't obvious — common locations include `public/help.html`, `docs/help.html`, or the renderer's static assets)
  - [ ] Add or update sections describing each user-facing feature this epic delivers
  - [ ] Match the existing voice, structure, and formatting of the file
  - [ ] Include any new UI controls, settings, keyboard shortcuts, or workflows introduced by the epic
  - [ ] If help.html does not yet exist, create one at the conventional location for the project and seed it with a sensible structure that this epic's content fits into
notes: "Users discover features through help docs. An epic that doesn't update them is half-shipped. Keep entries scoped to user-visible behaviour — internal architecture changes do not belong here."
```

### Why these three (in this order)

- **Eval first** so the breakdown gets a final correctness check before tests lock current behaviour in. If eval finds a gap, the regression tests should cover the *fixed* behaviour, not the broken one.
- **Regression tests second** so the documented behaviour is the verified behaviour. Writing docs against tested code prevents "the docs say X but the code does Y" drift on day one.
- **Help docs last** because at this point the feature is correct (eval passed) and locked in (tests passed) — only then is it safe to tell users about it.

## Acceptance Criteria Guidelines

Good acceptance criteria are:
- **Specific** — "User can log in with email and password" not "Login works"
- **Testable** — Can be verified with a concrete test
- **Independent** — Each criterion can be checked on its own
- **Complete** — Together they fully define "done" for the ticket

Example:
```
- [ ] POST /api/auth/login accepts email and password
- [ ] Returns JWT token on valid credentials
- [ ] Returns 401 with error message on invalid credentials
- [ ] Token expires after 24 hours
- [ ] Rate-limited to 5 attempts per minute per IP
```

## Dependency Rules

- A ticket's dependencies must only reference other tickets in the same epic or already-completed tickets
- Setup tickets should have no dependencies (they come first)
- UI tickets typically depend on their corresponding API tickets

## Available Tools

Before creating tickets, read the tools manifest at `.ombutocode/tools/tools.json` for available CLI tools.

Two CLI tools cover the ticket-generation workflow — do NOT use Python, sqlite3, or hand-written sql.js scripts.

**Database Query Tool** (`.ombutocode/tools/db-query.js`) — read-only:

```bash
# Check existing tickets to avoid ID collisions
node .ombutocode/tools/db-query.js tickets

# Check ticket counts by status
node .ombutocode/tools/db-query.js stats

# List epics and their statuses
node .ombutocode/tools/db-query.js epics

# Verify inserted tickets after creation
node .ombutocode/tools/db-query.js tickets --status backlog

# Inspect a specific ticket
node .ombutocode/tools/db-query.js ticket SCAFF-001
```

**Ticket Write Tool** (`.ombutocode/tools/ticket-write.js`) — the canonical writer for new tickets. Accepts a JSON array file, validates it, runs all inserts in one transaction, auto-backs-up the DB, and bumps `backlog:updated_at`. Use `--dry-run` first to preview.

```bash
# Preview (no writes)
node .ombutocode/tools/ticket-write.js insert /tmp/<epic>-tickets.json --dry-run

# Insert for real
node .ombutocode/tools/ticket-write.js insert /tmp/<epic>-tickets.json
```

Do NOT write one-shot sql.js insert scripts. All ticket writes go through `ticket-write`.

## Workflow

1. **Read** the epic specification completely
2. **Check existing tickets** — run `node .ombutocode/tools/db-query.js tickets` to see current backlog and avoid ID collisions
3. **Identify** the logical work units
4. **Order** them by dependency (setup → core → integration → UI)
5. **Append** the three mandatory closeout tickets (epic-eval → regression-tests → help-docs) at the END of the list, after all feature work. See the "Mandatory Closeout Tickets" section above. Skipping them is a workflow error.
6. **Detect** project documents for references (PRD, Architecture, Style Guide) and check the epic's References section for any linked mockups
7. **Propose** a summary table with: ID, Title, Type, Dependencies — and confirm the chosen epic-derived prefix. The closeout tickets MUST appear in this table as the last three rows.
8. **Wait** for user confirmation
9. **Insert** the tickets into the canonical backlog database using the `ticket-write` tool at `.ombutocode/tools/ticket-write.js` (see "Writing Tickets to the Database" below). Do NOT write to `.ombutocode/planning/backlog.yml`; that file is legacy and the database is the source of truth (per `CLAUDE.md` §"Source of Truth"). Do NOT hand-roll your own sql.js insert script — the `ticket-write` tool is the canonical writer.
10. **Verify** — run `node .ombutocode/tools/db-query.js tickets --status backlog` to confirm the tickets were inserted correctly
11. **Update** the epic status from `NEW` to `TICKETS`

## Writing Tickets to the Database

The `backlog_tickets` table has a 3-column JSON-in-SQLite schema:

| Column | Type | Notes |
|---|---|---|
| `id` | TEXT PRIMARY KEY | Ticket id, e.g. `SCAFF-001` |
| `sort_order` | INTEGER | Display order; new tickets append after `MAX(sort_order)` |
| `data` | TEXT | JSON blob containing every other ticket field (`title`, `status`, `epic_ref`, `dependencies`, `acceptance_criteria`, `references`, `notes`, `description`, `assignee`, etc.) — the `id` field is NOT duplicated inside the JSON |

The `ticket-write` tool handles bumping the `backlog:updated_at` key in the `metadata` table automatically on each insert, so the Ombuto Code UI shows a fresh timestamp.

### Insertion approach

Use the `ticket-write` tool. Do NOT write a one-shot sql.js script — that pattern has been replaced by the tool.

**Step 1 — Build a JSON file containing the ticket array.** Write it to a temp path (for example `/tmp/<epic-prefix>-tickets.json`). The file must be a JSON array of ticket objects. Each object needs at minimum: `id`, `title`, `status`, `epic_ref`. Other common fields: `assignee`, `acceptance_criteria`, `dependencies`, `references`, `notes`, `description`, `last_updated`. See the "Example Ticket Object" section below for the full shape.

**Step 2 — Preview with `--dry-run`** to confirm validation passes and the planned sort_order range looks right:

```bash
node .ombutocode/tools/ticket-write.js insert /tmp/jobs-tickets.json --dry-run
```

**Step 3 — Insert for real:**

```bash
node .ombutocode/tools/ticket-write.js insert /tmp/jobs-tickets.json
```

The tool will:
- Validate each ticket (required fields, id format, status, array shapes)
- Reject id collisions unless `--force` is passed
- Create a pre-insert backup at `.ombutocode/data/ombutocode.db.before-insert-<timestamp>` (skip with `--no-backup`)
- Run all inserts inside a single transaction so the batch is all-or-nothing
- Append new tickets after `MAX(sort_order)`
- Bump `backlog:updated_at` in the `metadata` table
- Print a summary of inserted ids

**Step 4 — Verify** the inserts using the db-query tool:

```bash
# List all newly created tickets
node .ombutocode/tools/db-query.js tickets --status backlog

# Inspect a specific ticket to verify all fields
node .ombutocode/tools/db-query.js ticket <TICKET-ID>

# Confirm counts
node .ombutocode/tools/db-query.js stats
```

**Step 5 — Clean up.** Once verification passes, delete the temp JSON file and the backup file the tool created (`.ombutocode/data/ombutocode.db.before-insert-<timestamp>`).

Confirm the schema round-trips through `backlogDb.deserializeTicket` (in `.ombutocode/src/src/main/backlogDb.js`) — that file is the canonical reader and defines which fields the UI/scheduler expect.

### What still goes in source-controlled docs

- Epic specs in `docs/Epics/` — yes, version-controlled
- Mockups in `docs/Mockups/` — yes, version-controlled
- Tickets — **no**, the database is canonical and is gitignored. Do not maintain a parallel YAML file.

## Example Output

### Proposed Tickets for Epic: User Authentication

| # | ID | Title | Type | Depends On |
|---|-----|-------|------|------------|
| 1 | AUTH-001 | Create users and sessions database tables | Setup | — |
| 2 | AUTH-002 | Implement authentication service with JWT | Core | AUTH-001 |
| 3 | AUTH-003 | Create login and register API endpoints | Core | AUTH-002 |
| 4 | AUTH-004 | Add authentication middleware for protected routes | Core | AUTH-002 |
| 5 | AUTH-005 | Create login and registration UI components | UI | AUTH-003 |
| 6 | AUTH-006 | Evaluate epic and address unmet acceptance criteria | Closeout — Eval | AUTH-001, AUTH-002, AUTH-003, AUTH-004, AUTH-005 |
| 7 | AUTH-007 | Add regression tests covering this epic's behaviour to the project test suite | Closeout — Regression | AUTH-006 |
| 8 | AUTH-008 | Update help.html with the features delivered by this epic | Closeout — Docs | AUTH-007 |

Note: the final three rows are the **mandatory closeout tickets** — they appear at the end of every epic breakdown, regardless of the epic's subject. See the "Mandatory Closeout Tickets" section for full acceptance criteria.

### Example Ticket Object

Each entry in the JSON array you pass to `ticket-write insert` has this shape. The `ticket-write` tool strips the `id` field from the JSON blob before storing it (id lives in its own column).

```json
{
  "id": "AUTH-002",
  "title": "Implement authentication service with JWT",
  "status": "backlog",
  "assignee": null,
  "epic_ref": "docs/Epics/epic_USER_AUTH.md",
  "references": {
    "prd": "docs/Product Requirements Document/PRD.md",
    "architecture": "docs/Architecture/Architecture.md",
    "style_guide": "docs/Style Guide/StyleGuide.md",
    "mockups": ["docs/Mockups/LoginPage.png"]
  },
  "acceptance_criteria": [
    "[ ] Accepts email and password, returns signed JWT",
    "[ ] Validates password against bcrypt hash",
    "[ ] Token includes user ID and role in payload",
    "[ ] Token expires after 24 hours"
  ],
  "dependencies": ["AUTH-001"],
  "last_updated": "2026-04-11",
  "notes": "Use jsonwebtoken package. See Architecture §6 for auth approach."
}
```

A full insert payload is simply an array of these objects wrapped in `[ ... ]`.

## References

- `.ombutocode/OMBUTOCODE_ENGINEERING_GUIDE.md` — ticket workflow and conventions
- `.ombutocode/tools/ticket-write.js` — canonical ticket insert tool (CLI)
- `.ombutocode/tools/db-query.js` — canonical read-only query tool (CLI)
- `.ombutocode/tools/tools.json` — tools manifest; read this first
- `.ombutocode/data/ombutocode.db` — canonical backlog database (`backlog_tickets` table)
- `.ombutocode/src/src/main/backlogDb.js` — canonical in-app reader/writer; defines the field shape the UI and scheduler consume
- `.ombutocode/templates/backlog.yml` — legacy field-name reference; do not write new tickets here
