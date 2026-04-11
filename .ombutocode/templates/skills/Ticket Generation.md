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
- **Do not create separate test tickets** — Ombuto Code has a built-in test and validation step that runs automatically for every ticket
- **Size tickets appropriately** — aim for 3-8 tickets per epic, each completable in one agent session
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

**Database Query Tool** (`.ombutocode/tools/db-query.js`):
Use this tool to inspect the database — do NOT use Python or sqlite3. It uses the bundled sql.js package.

Key commands for ticket generation:
```bash
# Check existing tickets to avoid ID collisions
node .ombutocode/tools/db-query.js tickets

# Check ticket counts by status
node .ombutocode/tools/db-query.js stats

# List epics and their statuses
node .ombutocode/tools/db-query.js epics

# Get the current max sort_order before inserting
node .ombutocode/tools/db-query.js query "SELECT MAX(sort_order) FROM backlog_tickets"

# Verify inserted tickets after creation
node .ombutocode/tools/db-query.js tickets --status backlog

# Inspect a specific ticket
node .ombutocode/tools/db-query.js ticket SCAFF-001
```

## Workflow

1. **Read** the epic specification completely
2. **Check existing tickets** — run `node .ombutocode/tools/db-query.js tickets` to see current backlog and avoid ID collisions
3. **Identify** the logical work units
4. **Order** them by dependency (setup → core → integration → UI)
5. **Detect** project documents for references (PRD, Architecture, Style Guide) and check the epic's References section for any linked mockups
6. **Propose** a summary table with: ID, Title, Type, Dependencies — and confirm the chosen epic-derived prefix
7. **Wait** for user confirmation
8. **Insert** the tickets directly into the canonical backlog database — `backlog_tickets` table in `.ombutocode/data/ombutocode.db`. Do NOT write to `.ombutocode/planning/backlog.yml`; that file is legacy and the database is the source of truth (per `CLAUDE.md` §"Source of Truth").
9. **Verify** — run `node .ombutocode/tools/db-query.js tickets --status backlog` to confirm the tickets were inserted correctly
10. **Update** the epic status from `NEW` to `TICKETS`

## Writing Tickets to the Database

The `backlog_tickets` table has a 3-column JSON-in-SQLite schema:

| Column | Type | Notes |
|---|---|---|
| `id` | TEXT PRIMARY KEY | Ticket id, e.g. `SCAFF-001` |
| `sort_order` | INTEGER | Display order; new tickets append after `MAX(sort_order)` |
| `data` | TEXT | JSON blob containing every other ticket field (`title`, `status`, `epic_ref`, `dependencies`, `acceptance_criteria`, `references`, `notes`, `description`, `assignee`, etc.) — the `id` field is NOT duplicated inside the JSON |

After inserting tickets, also bump the `backlog:updated_at` key in the `metadata` table to today's date so the Ombuto Code UI shows a fresh timestamp.

### Insertion approach

Write a small one-shot Node script under `.ombutocode/src/scripts/` that uses `sql.js` (already a dependency in `.ombutocode/src/node_modules`) to:

1. Open `.ombutocode/data/ombutocode.db`
2. Read `MAX(sort_order)` from `backlog_tickets`
3. For each new ticket, `INSERT OR REPLACE INTO backlog_tickets (id, sort_order, data) VALUES (?, ?, ?)` — strip the `id` field out of the JSON before storing
4. `INSERT OR REPLACE INTO metadata (key, value) VALUES ('backlog:updated_at', '<today>')`
5. Persist with `fs.writeFileSync(dbPath, Buffer.from(db.export()))`

**Always back up the database first** (`cp ombutocode.db ombutocode.db.before-<change>`) before running the insert script, and remove the backup after verifying the inserts. Delete the one-shot script after a successful run — it is single-use throwaway code, not a reusable utility.

After running the script, verify the inserts using the db-query tool:
```bash
# List all newly created tickets
node .ombutocode/tools/db-query.js tickets --status backlog

# Inspect a specific ticket to verify all fields
node .ombutocode/tools/db-query.js ticket <TICKET-ID>

# Confirm counts
node .ombutocode/tools/db-query.js stats
```
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

### Example Ticket Object

This is the JavaScript object you build in the insert script. Everything except `id` becomes the `data` JSON column; `id` is stored in its own column.

```js
const ticket = {
  id: 'AUTH-002',
  title: 'Implement authentication service with JWT',
  status: 'backlog',
  assignee: null,
  epic_ref: 'docs/Epics/epic_USER_AUTH.md',
  references: {
    prd: 'docs/Product Requirements Document/PRD.md',
    architecture: 'docs/Architecture/Architecture.md',
    style_guide: 'docs/Style Guide/StyleGuide.md',
    mockups: ['docs/Mockups/LoginPage.png'],
  },
  acceptance_criteria: [
    '[ ] Accepts email and password, returns signed JWT',
    '[ ] Validates password against bcrypt hash',
    '[ ] Token includes user ID and role in payload',
    '[ ] Token expires after 24 hours',
  ],
  dependencies: ['AUTH-001'],
  last_updated: '2026-04-11',
  notes: 'Use jsonwebtoken package. See Architecture §6 for auth approach.',
};

// Stored as:
//   id         = 'AUTH-002'
//   sort_order = <next>
//   data       = JSON.stringify({ ...ticket, id: undefined })  // id stripped
```

## References

- `.ombutocode/OMBUTOCODE_ENGINEERING_GUIDE.md` — ticket workflow and conventions
- `.ombutocode/data/ombutocode.db` — canonical backlog database (`backlog_tickets` table)
- `.ombutocode/src/src/main/backlogDb.js` — canonical reader/writer; defines the field shape the UI and scheduler consume
- `.ombutocode/templates/backlog.yml` — legacy field-name reference; do not write new tickets here
